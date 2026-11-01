import type {
  DesignDocument,
  ModuleEndpoint,
  ModuleNet,
  Port,
  Primitive,
  TopEndpoint,
  TopNet,
} from "@graphicalhdl/ir";
import type { Connection, XYPosition } from "@xyflow/react";
import {
  decodeEdgeId,
  decodeModuleEndpoint,
  decodeTopEndpoint,
  type EditorView,
} from "./graph-adapter";

export type SelectedElement = { id: string; kind: "port" | "instance" | "primitive" };

export type EditorAction =
  | { type: "replace-document"; document: DesignDocument }
  | { type: "move-node"; view: EditorView; elementId: string; position: XYPosition }
  | { type: "rename-element"; view: EditorView; selection: SelectedElement; name: string }
  | { type: "update-port"; view: EditorView; portId: string; patch: Partial<Port> }
  | {
      type: "update-primitive";
      moduleId: string;
      primitiveId: string;
      patch: Record<string, unknown>;
    }
  | { type: "add-primitive"; moduleId: string; kind: Primitive["kind"] }
  | { type: "add-port"; moduleId: string; direction: Port["direction"] }
  | { type: "add-instance"; moduleId: string }
  | { type: "delete-element"; view: EditorView; selection: SelectedElement }
  | { type: "connect"; view: EditorView; connection: Connection }
  | { type: "delete-edge"; view: EditorView; edgeId: string }
  | { type: "delete-edges"; view: EditorView; edgeIds: string[] };

function nextId(existing: readonly string[], base: string): string {
  const used = new Set(existing);
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function updateLayout(
  document: DesignDocument,
  view: EditorView,
  elementId: string,
  position: XYPosition,
): void {
  document.layout ??= { views: [] };
  let layoutView = document.layout.views.find(
    (candidate) => candidate.level === view.level && candidate.ownerId === view.ownerId,
  );
  if (!layoutView) {
    layoutView = { level: view.level, ownerId: view.ownerId, nodes: [] };
    document.layout.views.push(layoutView);
  }
  const node = layoutView.nodes.find((candidate) => candidate.elementId === elementId);
  if (node) {
    node.x = position.x;
    node.y = position.y;
  } else {
    layoutView.nodes.push({ elementId, x: position.x, y: position.y });
  }
}

function removeLayoutNode(document: DesignDocument, view: EditorView, elementId: string): void {
  const layoutView = document.layout?.views.find(
    (candidate) => candidate.level === view.level && candidate.ownerId === view.ownerId,
  );
  if (layoutView) {
    layoutView.nodes = layoutView.nodes.filter((candidate) => candidate.elementId !== elementId);
  }
}

function topEndpointEqual(left: TopEndpoint, right: TopEndpoint): boolean {
  return (
    left.kind === right.kind &&
    left.portId === right.portId &&
    (left.kind !== "instancePort" ||
      (right.kind === "instancePort" && left.instanceId === right.instanceId))
  );
}

function moduleEndpointEqual(left: ModuleEndpoint, right: ModuleEndpoint): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "modulePort" && right.kind === "modulePort") {
    return left.portId === right.portId;
  }
  return (
    left.kind === "primitivePin" &&
    right.kind === "primitivePin" &&
    left.primitiveId === right.primitiveId &&
    left.pin === right.pin
  );
}

function connectTop(document: DesignDocument, source: TopEndpoint, target: TopEndpoint): void {
  const net = document.design.top.nets.find((candidate) =>
    topEndpointEqual(candidate.driver, source),
  );
  if (net) {
    if (!net.sinks.some((sink) => topEndpointEqual(sink, target))) {
      net.sinks.push(target);
    }
    return;
  }
  const id = nextId(
    document.design.top.nets.map((candidate) => candidate.id),
    "top_net_new",
  );
  const newNet: TopNet = { id, name: id, driver: source, sinks: [target] };
  document.design.top.nets.push(newNet);
}

function connectModule(
  document: DesignDocument,
  moduleId: string,
  source: ModuleEndpoint,
  target: ModuleEndpoint,
): void {
  const module = document.design.modules.find((candidate) => candidate.id === moduleId);
  if (!module) return;
  const net = module.implementation.nets.find((candidate) =>
    moduleEndpointEqual(candidate.driver, source),
  );
  if (net) {
    if (!net.sinks.some((sink) => moduleEndpointEqual(sink, target))) {
      net.sinks.push(target);
    }
    return;
  }
  const id = nextId(
    module.implementation.nets.map((candidate) => candidate.id),
    `${module.name}_net_new`,
  );
  const newNet: ModuleNet = { id, name: id, driver: source, sinks: [target] };
  module.implementation.nets.push(newNet);
}

function removeTopEndpoint(
  document: DesignDocument,
  predicate: (endpoint: TopEndpoint) => boolean,
): void {
  document.design.top.nets = document.design.top.nets.flatMap((net) => {
    if (predicate(net.driver)) return [];
    const sinks = net.sinks.filter((sink) => !predicate(sink));
    return sinks.length > 0 ? [{ ...net, sinks: sinks as TopNet["sinks"] }] : [];
  });
}

function removeModuleEndpoint(
  document: DesignDocument,
  moduleId: string,
  predicate: (endpoint: ModuleEndpoint) => boolean,
): void {
  const module = document.design.modules.find((candidate) => candidate.id === moduleId);
  if (!module) return;
  module.implementation.nets = module.implementation.nets.flatMap((net) => {
    if (predicate(net.driver)) return [];
    const sinks = net.sinks.filter((sink) => !predicate(sink));
    return sinks.length > 0 ? [{ ...net, sinks: sinks as ModuleNet["sinks"] }] : [];
  });
}

function addPrimitive(document: DesignDocument, moduleId: string, kind: Primitive["kind"]): void {
  const module = document.design.modules.find((candidate) => candidate.id === moduleId);
  if (!module) return;
  const ids = module.implementation.primitives.map((candidate) => candidate.id);
  const names = module.implementation.primitives.map((candidate) => candidate.name);
  const id = nextId(ids, `${module.name}_${kind}`);
  const name = nextId(names, kind);
  let primitive: Primitive;
  switch (kind) {
    case "const":
      primitive = { id, name, kind, width: 8, value: "0" };
      break;
    case "mul":
      primitive = { id, name, kind, aWidth: 8, bWidth: 8 };
      break;
    case "reg":
      primitive = { id, name, kind, width: 8, resetValue: "0" };
      break;
    case "add":
    case "mux2":
      primitive = { id, name, kind, width: 8 };
      break;
  }
  module.implementation.primitives.push(primitive);
  updateLayout(document, { level: 3, ownerId: moduleId }, id, {
    x: 320 + (module.implementation.primitives.length % 3) * 220,
    y: 160 + Math.floor(module.implementation.primitives.length / 3) * 180,
  });
}

function addPort(document: DesignDocument, moduleId: string, direction: Port["direction"]): void {
  const module = document.design.modules.find((candidate) => candidate.id === moduleId);
  if (!module) return;
  const id = nextId(
    module.ports.map((candidate) => candidate.id),
    `${module.name}_${direction}`,
  );
  const name = nextId(
    module.ports.map((candidate) => candidate.name),
    direction === "input" ? "new_input" : "new_output",
  );
  module.ports.push({ id, name, direction, width: 8, role: "data" });
  updateLayout(document, { level: 2, ownerId: moduleId }, id, {
    x: direction === "input" ? 120 : 720,
    y: 80 + module.ports.length * 70,
  });
}

export function editorReducer(document: DesignDocument, action: EditorAction): DesignDocument {
  if (action.type === "replace-document") return action.document;
  const next = structuredClone(document);

  switch (action.type) {
    case "move-node":
      updateLayout(next, action.view, action.elementId, action.position);
      break;
    case "rename-element": {
      if (action.view.level === 1) {
        const element =
          action.selection.kind === "port"
            ? next.design.top.ports.find((candidate) => candidate.id === action.selection.id)
            : next.design.top.instances.find((candidate) => candidate.id === action.selection.id);
        if (element) element.name = action.name;
      } else {
        const module = next.design.modules.find(
          (candidate) => candidate.id === action.view.ownerId,
        );
        const element =
          action.selection.kind === "port"
            ? module?.ports.find((candidate) => candidate.id === action.selection.id)
            : module?.implementation.primitives.find(
                (candidate) => candidate.id === action.selection.id,
              );
        if (element) element.name = action.name;
      }
      break;
    }
    case "update-port": {
      const ports =
        action.view.level === 1
          ? next.design.top.ports
          : next.design.modules.find((candidate) => candidate.id === action.view.ownerId)?.ports;
      const port = ports?.find((candidate) => candidate.id === action.portId);
      if (port) Object.assign(port, action.patch);
      break;
    }
    case "update-primitive": {
      const primitive = next.design.modules
        .find((candidate) => candidate.id === action.moduleId)
        ?.implementation.primitives.find((candidate) => candidate.id === action.primitiveId);
      if (primitive) Object.assign(primitive, action.patch);
      break;
    }
    case "add-primitive":
      addPrimitive(next, action.moduleId, action.kind);
      break;
    case "add-port":
      addPort(next, action.moduleId, action.direction);
      break;
    case "add-instance": {
      const module = next.design.modules.find((candidate) => candidate.id === action.moduleId);
      if (!module) break;
      const id = nextId(
        next.design.top.instances.map((candidate) => candidate.id),
        `inst_${module.name}`,
      );
      const name = nextId(
        next.design.top.instances.map((candidate) => candidate.name),
        `u_${module.name}`,
      );
      next.design.top.instances.push({ id, name, moduleId: module.id });
      updateLayout(next, { level: 1, ownerId: next.design.top.id }, id, {
        x: 380,
        y: 260 + next.design.top.instances.length * 70,
      });
      break;
    }
    case "delete-element": {
      if (action.view.level === 1 && action.selection.kind === "instance") {
        next.design.top.instances = next.design.top.instances.filter(
          (candidate) => candidate.id !== action.selection.id,
        );
        removeLayoutNode(next, { level: 1, ownerId: next.design.top.id }, action.selection.id);
        removeTopEndpoint(
          next,
          (endpoint) =>
            endpoint.kind === "instancePort" && endpoint.instanceId === action.selection.id,
        );
      } else if (action.selection.kind === "port") {
        const module = next.design.modules.find(
          (candidate) => candidate.id === action.view.ownerId,
        );
        if (!module) break;
        module.ports = module.ports.filter((candidate) => candidate.id !== action.selection.id);
        removeLayoutNode(next, { level: 2, ownerId: module.id }, action.selection.id);
        removeModuleEndpoint(
          next,
          module.id,
          (endpoint) => endpoint.kind === "modulePort" && endpoint.portId === action.selection.id,
        );
        for (const instance of next.design.top.instances.filter(
          (candidate) => candidate.moduleId === module.id,
        )) {
          removeTopEndpoint(
            next,
            (endpoint) =>
              endpoint.kind === "instancePort" &&
              endpoint.instanceId === instance.id &&
              endpoint.portId === action.selection.id,
          );
        }
      } else if (action.selection.kind === "primitive") {
        const module = next.design.modules.find(
          (candidate) => candidate.id === action.view.ownerId,
        );
        if (!module) break;
        module.implementation.primitives = module.implementation.primitives.filter(
          (candidate) => candidate.id !== action.selection.id,
        );
        removeLayoutNode(next, { level: 3, ownerId: module.id }, action.selection.id);
        removeModuleEndpoint(
          next,
          module.id,
          (endpoint) =>
            endpoint.kind === "primitivePin" && endpoint.primitiveId === action.selection.id,
        );
      }
      break;
    }
    case "connect": {
      if (!action.connection.sourceHandle || !action.connection.targetHandle) break;
      if (action.view.level === 1) {
        const source = decodeTopEndpoint(action.connection.sourceHandle);
        const target = decodeTopEndpoint(action.connection.targetHandle);
        if (source && target) connectTop(next, source, target);
      } else if (action.view.level === 3) {
        const source = decodeModuleEndpoint(action.connection.sourceHandle);
        const target = decodeModuleEndpoint(action.connection.targetHandle);
        if (source && target) connectModule(next, action.view.ownerId, source, target);
      }
      break;
    }
    case "delete-edge":
    case "delete-edges": {
      const edgeIds = action.type === "delete-edge" ? [action.edgeId] : action.edgeIds;
      const indicesByNet = new Map<string, number[]>();
      for (const edgeId of edgeIds) {
        const decoded = decodeEdgeId(edgeId);
        if (!decoded) continue;
        const indices = indicesByNet.get(decoded.netId) ?? [];
        indices.push(decoded.sinkIndex);
        indicesByNet.set(decoded.netId, indices);
      }
      const nets =
        action.view.level === 1
          ? next.design.top.nets
          : next.design.modules.find((candidate) => candidate.id === action.view.ownerId)
              ?.implementation.nets;
      if (!nets) break;
      for (const [netId, indices] of indicesByNet) {
        const net = nets.find((candidate) => candidate.id === netId);
        if (!net) continue;
        for (const index of [...new Set(indices)].sort((left, right) => right - left)) {
          net.sinks.splice(index, 1);
        }
      }
      for (let index = nets.length - 1; index >= 0; index -= 1) {
        if (nets[index]?.sinks.length === 0) nets.splice(index, 1);
      }
      break;
    }
  }

  return next;
}
