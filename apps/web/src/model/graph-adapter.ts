import type {
  DesignDocument,
  ModuleDefinition,
  ModuleEndpoint,
  ModuleNet,
  Port,
  Primitive,
  PrimitivePin,
  TopEndpoint,
  TopNet,
} from "@graphicalhdl/ir";
import { getPrimitivePins } from "@graphicalhdl/ir";
import type { Edge, Node, XYPosition } from "@xyflow/react";

export type EditorLevel = 1 | 2 | 3;

export interface EditorView {
  level: EditorLevel;
  ownerId: string;
}

export interface NodePortView {
  id: string;
  label: string;
  width: number;
  role: Port["role"] | PrimitivePin["role"];
  handleType: "source" | "target";
}

export interface HardwareNodeData extends Record<string, unknown> {
  label: string;
  subtitle: string;
  kind: "top-port" | "instance" | "interface-port" | "primitive";
  elementId: string;
  ports: NodePortView[];
  fixed?: boolean;
  onOpen?: (() => void) | undefined;
}

export interface GraphProjection {
  nodes: Node<HardwareNodeData>[];
  edges: Edge[];
}

const HANDLE_SEPARATOR = "|";

function endpointHandle(endpoint: TopEndpoint | ModuleEndpoint): string {
  if (endpoint.kind === "topPort" || endpoint.kind === "modulePort") {
    return `${endpoint.kind}${HANDLE_SEPARATOR}${endpoint.portId}`;
  }
  if (endpoint.kind === "instancePort") {
    return `${endpoint.kind}${HANDLE_SEPARATOR}${endpoint.instanceId}${HANDLE_SEPARATOR}${endpoint.portId}`;
  }
  return `${endpoint.kind}${HANDLE_SEPARATOR}${endpoint.primitiveId}${HANDLE_SEPARATOR}${endpoint.pin}`;
}

export function decodeTopEndpoint(handle: string): TopEndpoint | undefined {
  const [kind, first, second] = handle.split(HANDLE_SEPARATOR);
  if (kind === "topPort" && first) {
    return { kind, portId: first };
  }
  if (kind === "instancePort" && first && second) {
    return { kind, instanceId: first, portId: second };
  }
  return undefined;
}

export function decodeModuleEndpoint(handle: string): ModuleEndpoint | undefined {
  const [kind, first, second] = handle.split(HANDLE_SEPARATOR);
  if (kind === "modulePort" && first) {
    return { kind, portId: first };
  }
  if (kind === "primitivePin" && first && second) {
    return { kind, primitiveId: first, pin: second };
  }
  return undefined;
}

function layoutPosition(
  document: DesignDocument,
  view: EditorView,
  elementId: string,
  fallback: XYPosition,
): XYPosition {
  const node = document.layout?.views
    .find((candidate) => candidate.level === view.level && candidate.ownerId === view.ownerId)
    ?.nodes.find((candidate) => candidate.elementId === elementId);
  return node ? { x: node.x, y: node.y } : fallback;
}

function edgeId(netId: string, sinkIndex: number): string {
  return `${netId}::${sinkIndex}`;
}

export function decodeEdgeId(id: string): { netId: string; sinkIndex: number } | undefined {
  const separator = id.lastIndexOf("::");
  if (separator < 0) return undefined;
  const sinkIndex = Number(id.slice(separator + 2));
  return Number.isInteger(sinkIndex) ? { netId: id.slice(0, separator), sinkIndex } : undefined;
}

function graphEdges(nets: readonly (TopNet | ModuleNet)[]): Edge[] {
  return nets.flatMap((net) =>
    net.sinks.map((sink, sinkIndex) => ({
      id: edgeId(net.id, sinkIndex),
      source: endpointNodeId(net.driver),
      target: endpointNodeId(sink),
      sourceHandle: endpointHandle(net.driver),
      targetHandle: endpointHandle(sink),
      label: net.name,
      type: "smoothstep",
      animated: false,
      style: { strokeWidth: 2 },
    })),
  );
}

function endpointNodeId(endpoint: TopEndpoint | ModuleEndpoint): string {
  if (endpoint.kind === "topPort") return `top-port:${endpoint.portId}`;
  if (endpoint.kind === "instancePort") return `instance:${endpoint.instanceId}`;
  if (endpoint.kind === "modulePort") return `module-port:${endpoint.portId}`;
  return `primitive:${endpoint.primitiveId}`;
}

function topPortNode(port: Port, index: number): Node<HardwareNodeData> {
  const isInput = port.direction === "input";
  const x = isInput ? 20 : 900;
  return {
    id: `top-port:${port.id}`,
    type: "hardware",
    position: { x, y: 40 + index * 92 },
    draggable: false,
    selectable: true,
    data: {
      label: port.name,
      subtitle: `top ${port.direction} · ${port.width} bit`,
      kind: "top-port",
      elementId: port.id,
      fixed: true,
      ports: [
        {
          id: endpointHandle({ kind: "topPort", portId: port.id }),
          label: port.name,
          width: port.width,
          role: port.role,
          handleType: isInput ? "source" : "target",
        },
      ],
    },
  };
}

function instanceNode(
  document: DesignDocument,
  instance: DesignDocument["design"]["top"]["instances"][number],
  index: number,
): Node<HardwareNodeData> {
  const module = document.design.modules.find((candidate) => candidate.id === instance.moduleId);
  const view = { level: 1 as const, ownerId: document.design.top.id };
  return {
    id: `instance:${instance.id}`,
    type: "hardware",
    position: layoutPosition(document, view, instance.id, { x: 300 + index * 320, y: 180 }),
    data: {
      label: instance.name,
      subtitle: module?.name ?? `missing: ${instance.moduleId}`,
      kind: "instance",
      elementId: instance.id,
      ports: (module?.ports ?? []).map((port) => ({
        id: endpointHandle({ kind: "instancePort", instanceId: instance.id, portId: port.id }),
        label: port.name,
        width: port.width,
        role: port.role,
        handleType: port.direction === "input" ? "target" : "source",
      })),
    },
  };
}

function interfacePortNode(
  document: DesignDocument,
  module: ModuleDefinition,
  port: Port,
  index: number,
): Node<HardwareNodeData> {
  const isInput = port.direction === "input";
  const view = { level: 2 as const, ownerId: module.id };
  return {
    id: `interface-port:${port.id}`,
    type: "hardware",
    position: layoutPosition(document, view, port.id, {
      x: isInput ? 120 : 720,
      y: 70 + index * 90,
    }),
    data: {
      label: port.name,
      subtitle: `${port.direction} · ${port.width} bit · ${port.role}`,
      kind: "interface-port",
      elementId: port.id,
      ports: [],
    },
  };
}

function modulePortNode(port: Port, index: number): Node<HardwareNodeData> {
  const isInput = port.direction === "input";
  return {
    id: `module-port:${port.id}`,
    type: "hardware",
    position: { x: isInput ? 20 : 900, y: 35 + index * 90 },
    draggable: false,
    selectable: true,
    data: {
      label: port.name,
      subtitle: `module ${port.direction} · ${port.width} bit`,
      kind: "interface-port",
      elementId: port.id,
      fixed: true,
      ports: [
        {
          id: endpointHandle({ kind: "modulePort", portId: port.id }),
          label: port.name,
          width: port.width,
          role: port.role,
          handleType: isInput ? "source" : "target",
        },
      ],
    },
  };
}

function primitiveNode(
  document: DesignDocument,
  module: ModuleDefinition,
  primitive: Primitive,
  index: number,
): Node<HardwareNodeData> {
  const view = { level: 3 as const, ownerId: module.id };
  return {
    id: `primitive:${primitive.id}`,
    type: "hardware",
    position: layoutPosition(document, view, primitive.id, {
      x: 300 + (index % 3) * 250,
      y: 100 + Math.floor(index / 3) * 240,
    }),
    data: {
      label: primitive.name,
      subtitle: primitive.kind,
      kind: "primitive",
      elementId: primitive.id,
      ports: getPrimitivePins(primitive).map((pin) => ({
        id: endpointHandle({ kind: "primitivePin", primitiveId: primitive.id, pin: pin.name }),
        label: pin.name,
        width: pin.width,
        role: pin.role,
        handleType: pin.direction === "input" ? "target" : "source",
      })),
    },
  };
}

export function projectGraph(document: DesignDocument, view: EditorView): GraphProjection {
  if (view.level === 1) {
    return {
      nodes: [
        ...document.design.top.ports.map((port, index) => topPortNode(port, index)),
        ...document.design.top.instances.map((instance, index) =>
          instanceNode(document, instance, index),
        ),
      ],
      edges: graphEdges(document.design.top.nets),
    };
  }

  const module = document.design.modules.find((candidate) => candidate.id === view.ownerId);
  if (!module) return { nodes: [], edges: [] };
  if (view.level === 2) {
    return {
      nodes: module.ports.map((port, index) => interfacePortNode(document, module, port, index)),
      edges: [],
    };
  }
  return {
    nodes: [
      ...module.ports.map((port, index) => modulePortNode(port, index)),
      ...module.implementation.primitives.map((primitive, index) =>
        primitiveNode(document, module, primitive, index),
      ),
    ],
    edges: graphEdges(module.implementation.nets),
  };
}
