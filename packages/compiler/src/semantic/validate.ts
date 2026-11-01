import type {
  DesignDocument,
  Diagnostic,
  DiagnosticTarget,
  ModuleDefinition,
  ModuleEndpoint,
  Port,
  Primitive,
  PrimitivePin,
  TopEndpoint,
} from "@graphicalhdl/ir";
import { getPrimitivePins, literalFitsWidth } from "@graphicalhdl/ir";
import type { DesignIndex, ModuleIndex } from "./context";

interface ResolvedEndpoint {
  key: string;
  kind: TopEndpoint["kind"] | ModuleEndpoint["kind"];
  width: number;
  direction: "input" | "output";
  role: Port["role"];
  target: DiagnosticTarget;
  label: string;
}

function connectionKey(...parts: string[]): string {
  return JSON.stringify(parts);
}

function semanticError(
  code: string,
  stage: Diagnostic["stage"],
  message: string,
  hint: string,
  jsonPointer: string,
  target: DiagnosticTarget,
): Diagnostic {
  return { code, severity: "error", stage, message, hint, jsonPointer, target };
}

function topTarget(index: DesignIndex, elementId: string, pinOrPort?: string): DiagnosticTarget {
  const base: DiagnosticTarget = { level: 1, ownerId: index.top.id, elementId };
  return pinOrPort ? { ...base, pinOrPort } : base;
}

function moduleTarget(
  module: ModuleDefinition,
  level: 2 | 3,
  elementId: string,
  pinOrPort?: string,
): DiagnosticTarget {
  const base: DiagnosticTarget = { level, ownerId: module.id, elementId };
  return pinOrPort ? { ...base, pinOrPort } : base;
}

function primitivePin(primitive: Primitive, pinName: string): PrimitivePin | undefined {
  return getPrimitivePins(primitive).find((pin) => pin.name === pinName);
}

function resolveTopEndpoint(
  index: DesignIndex,
  endpoint: TopEndpoint,
  pointer: string,
  diagnostics: Diagnostic[],
): ResolvedEndpoint | undefined {
  if (endpoint.kind === "topPort") {
    const indexedPort = index.topPorts.get(endpoint.portId);
    if (!indexedPort) {
      diagnostics.push(
        semanticError(
          "GHDL-E3001",
          "resolve",
          `找不到 top port ID "${endpoint.portId}"。`,
          "请连接到当前 top 中存在的 port。",
          `${pointer}/portId`,
          topTarget(index, endpoint.portId),
        ),
      );
      return undefined;
    }
    const port = indexedPort.value;
    return {
      key: connectionKey("topPort", port.id),
      kind: "topPort",
      width: port.width,
      direction: port.direction,
      role: port.role,
      target: topTarget(index, port.id, port.id),
      label: `top.${port.name}`,
    };
  }

  const indexedInstance = index.instances.get(endpoint.instanceId);
  if (!indexedInstance) {
    diagnostics.push(
      semanticError(
        "GHDL-E3002",
        "resolve",
        `找不到 instance ID "${endpoint.instanceId}"。`,
        "请连接到当前 top 中存在的 instance。",
        `${pointer}/instanceId`,
        topTarget(index, endpoint.instanceId),
      ),
    );
    return undefined;
  }
  const moduleIndex = index.modules.get(indexedInstance.value.moduleId);
  if (!moduleIndex) {
    diagnostics.push(
      semanticError(
        "GHDL-E3003",
        "resolve",
        `Instance "${indexedInstance.value.name}" 引用了不存在的 module。`,
        "请修正 instance.moduleId。",
        `${indexedInstance.pointer}/moduleId`,
        topTarget(index, indexedInstance.value.id),
      ),
    );
    return undefined;
  }
  const indexedPort = moduleIndex.ports.get(endpoint.portId);
  if (!indexedPort) {
    diagnostics.push(
      semanticError(
        "GHDL-E3004",
        "resolve",
        `Module "${moduleIndex.module.name}" 中不存在 port ID "${endpoint.portId}"。`,
        "请选择该 module interface 中存在的 port。",
        `${pointer}/portId`,
        topTarget(index, indexedInstance.value.id, endpoint.portId),
      ),
    );
    return undefined;
  }
  const port = indexedPort.value;
  return {
    key: connectionKey("instancePort", indexedInstance.value.id, port.id),
    kind: "instancePort",
    width: port.width,
    direction: port.direction,
    role: port.role,
    target: topTarget(index, indexedInstance.value.id, port.id),
    label: `${indexedInstance.value.name}.${port.name}`,
  };
}

function resolveModuleEndpoint(
  moduleIndex: ModuleIndex,
  endpoint: ModuleEndpoint,
  pointer: string,
  diagnostics: Diagnostic[],
): ResolvedEndpoint | undefined {
  const module = moduleIndex.module;
  if (endpoint.kind === "modulePort") {
    const indexedPort = moduleIndex.ports.get(endpoint.portId);
    if (!indexedPort) {
      diagnostics.push(
        semanticError(
          "GHDL-E3005",
          "resolve",
          `找不到 module port ID "${endpoint.portId}"。`,
          "请连接到当前 module interface 中存在的 port。",
          `${pointer}/portId`,
          moduleTarget(module, 2, endpoint.portId),
        ),
      );
      return undefined;
    }
    const port = indexedPort.value;
    return {
      key: connectionKey("modulePort", module.id, port.id),
      kind: "modulePort",
      width: port.width,
      direction: port.direction,
      role: port.role,
      target: moduleTarget(module, 2, port.id, port.id),
      label: `${module.name}.${port.name}`,
    };
  }

  const indexedPrimitive = moduleIndex.primitives.get(endpoint.primitiveId);
  if (!indexedPrimitive) {
    diagnostics.push(
      semanticError(
        "GHDL-E3006",
        "resolve",
        `找不到 primitive ID "${endpoint.primitiveId}"。`,
        "请连接到当前 module implementation 中存在的 primitive。",
        `${pointer}/primitiveId`,
        moduleTarget(module, 3, endpoint.primitiveId),
      ),
    );
    return undefined;
  }
  const pin = primitivePin(indexedPrimitive.value, endpoint.pin);
  if (!pin) {
    diagnostics.push(
      semanticError(
        "GHDL-E3007",
        "resolve",
        `Primitive "${indexedPrimitive.value.name}" 不存在 pin "${endpoint.pin}"。`,
        "请使用 primitive catalog 定义的 pin。",
        `${pointer}/pin`,
        moduleTarget(module, 3, indexedPrimitive.value.id, endpoint.pin),
      ),
    );
    return undefined;
  }
  return {
    key: connectionKey("primitivePin", module.id, indexedPrimitive.value.id, pin.name),
    kind: "primitivePin",
    width: pin.width,
    direction: pin.direction,
    role: pin.role,
    target: moduleTarget(module, 3, indexedPrimitive.value.id, pin.name),
    label: `${indexedPrimitive.value.name}.${pin.name}`,
  };
}

function validateDirection(
  endpoint: ResolvedEndpoint,
  expected: "driver" | "sink",
  pointer: string,
  diagnostics: Diagnostic[],
  isTop: boolean,
): void {
  const allowedDirection = expected === "driver" ? "output" : "input";
  const actualDirection =
    isTop && endpoint.kind === "topPort"
      ? endpoint.direction === "input"
        ? "output"
        : "input"
      : !isTop && endpoint.kind === "modulePort"
        ? endpoint.direction === "input"
          ? "output"
          : "input"
        : endpoint.direction;

  if (actualDirection !== allowedDirection) {
    diagnostics.push(
      semanticError(
        "GHDL-E4001",
        "type",
        `${endpoint.label} 不能作为 net 的 ${expected}。`,
        expected === "driver" ? "Driver 必须是数据源。" : "Sink 必须是数据接收端。",
        pointer,
        endpoint.target,
      ),
    );
  }
}

function validateWidth(
  driver: ResolvedEndpoint,
  sink: ResolvedEndpoint,
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  if (driver.width === sink.width) {
    return;
  }
  diagnostics.push({
    ...semanticError(
      "GHDL-E4002",
      "type",
      `位宽不匹配：${driver.label} 为 ${driver.width} bit，${sink.label} 为 ${sink.width} bit。`,
      "GraphicalHDL 不执行隐式 resize；请修改位宽或显式插入转换组件。",
      pointer,
      sink.target,
    ),
    related: [
      {
        message: `Driver ${driver.label} 的位宽为 ${driver.width} bit。`,
        jsonPointer: pointer.replace(/\/sinks\/\d+$/, "/driver"),
        target: driver.target,
      },
    ],
  });
}

function addConnection(
  connections: Map<string, string>,
  endpoint: ResolvedEndpoint,
  pointer: string,
  diagnostics: Diagnostic[],
  code: string,
  message: string,
): void {
  const previous = connections.get(endpoint.key);
  if (previous) {
    diagnostics.push({
      ...semanticError(
        code,
        "type",
        message,
        "同一 endpoint 只能属于一条 net；需要 fanout 时请在一条 net 中添加多个 sink。",
        pointer,
        endpoint.target,
      ),
      related: [{ message: "第一次连接位于此处。", jsonPointer: previous }],
    });
  } else {
    connections.set(endpoint.key, pointer);
  }
}

function validateTop(index: DesignIndex, diagnostics: Diagnostic[]): void {
  const driverConnections = new Map<string, string>();
  const sinkConnections = new Map<string, string>();
  const instanceEdges = new Map<string, Set<string>>();

  index.top.instances.forEach((instance, instancePosition) => {
    if (!index.modules.has(instance.moduleId)) {
      diagnostics.push(
        semanticError(
          "GHDL-E3003",
          "resolve",
          `Instance "${instance.name}" 引用了不存在的 module ID "${instance.moduleId}"。`,
          "请将 moduleId 指向 design.modules 中存在的定义。",
          `/design/top/instances/${instancePosition}/moduleId`,
          topTarget(index, instance.id),
        ),
      );
    }
    instanceEdges.set(instance.id, new Set());
  });

  index.top.nets.forEach((net, netIndex) => {
    const netPointer = `/design/top/nets/${netIndex}`;
    const driver = resolveTopEndpoint(index, net.driver, `${netPointer}/driver`, diagnostics);
    if (driver) {
      validateDirection(driver, "driver", `${netPointer}/driver`, diagnostics, true);
      addConnection(
        driverConnections,
        driver,
        `${netPointer}/driver`,
        diagnostics,
        "GHDL-E4003",
        `${driver.label} 驱动了多条 net。`,
      );
    }

    net.sinks.forEach((sinkEndpoint, sinkIndex) => {
      const sinkPointer = `${netPointer}/sinks/${sinkIndex}`;
      const sink = resolveTopEndpoint(index, sinkEndpoint, sinkPointer, diagnostics);
      if (!sink) {
        return;
      }
      validateDirection(sink, "sink", sinkPointer, diagnostics, true);
      addConnection(
        sinkConnections,
        sink,
        sinkPointer,
        diagnostics,
        "GHDL-E4004",
        `${sink.label} 被多条 net 驱动。`,
      );
      if (driver) {
        validateWidth(driver, sink, sinkPointer, diagnostics);
      }

      if (
        sinkEndpoint.kind === "instancePort" &&
        driver &&
        (sink.role === "clock" || sink.role === "reset")
      ) {
        const requiredTopPort =
          sink.role === "clock"
            ? index.document.design.clockDomain.clockPortId
            : index.document.design.clockDomain.resetPortId;
        if (net.driver.kind !== "topPort" || net.driver.portId !== requiredTopPort) {
          diagnostics.push(
            semanticError(
              "GHDL-E5001",
              "clock-reset",
              `${sink.label} 必须直接连接到 top ${sink.role} port。`,
              "v0.1 不允许 gated Clock、derived Clock 或 derived reset。",
              sinkPointer,
              sink.target,
            ),
          );
        }
      }

      if (net.driver.kind === "instancePort" && sinkEndpoint.kind === "instancePort") {
        instanceEdges.get(net.driver.instanceId)?.add(sinkEndpoint.instanceId);
      }
    });
  });

  for (const [portId, indexedPort] of index.topPorts) {
    if (
      indexedPort.value.direction === "output" &&
      !sinkConnections.has(connectionKey("topPort", portId))
    ) {
      diagnostics.push(
        semanticError(
          "GHDL-E4005",
          "type",
          `Top output "${indexedPort.value.name}" 未被驱动。`,
          "每个 top output 必须恰好作为一条 net 的 sink。",
          `${indexedPort.pointer}/id`,
          topTarget(index, portId),
        ),
      );
    }
  }

  for (const [instanceId, indexedInstance] of index.instances) {
    const moduleIndex = index.modules.get(indexedInstance.value.moduleId);
    if (!moduleIndex) {
      continue;
    }
    for (const port of moduleIndex.module.ports) {
      if (
        port.direction === "input" &&
        !sinkConnections.has(connectionKey("instancePort", instanceId, port.id))
      ) {
        diagnostics.push(
          semanticError(
            "GHDL-E4006",
            "type",
            `Instance "${indexedInstance.value.name}" 的 input "${port.name}" 未连接。`,
            "每个 instance input 必须恰好作为一条 top net 的 sink。",
            indexedInstance.pointer,
            topTarget(index, instanceId, port.id),
          ),
        );
      }
    }
  }

  const clockPort = index.topPorts.get(index.document.design.clockDomain.clockPortId)?.value;
  const resetPort = index.topPorts.get(index.document.design.clockDomain.resetPortId)?.value;
  validateTopDomainPort(index, clockPort, "clock", "/design/clockDomain/clockPortId", diagnostics);
  validateTopDomainPort(index, resetPort, "reset", "/design/clockDomain/resetPortId", diagnostics);
  detectCycle(instanceEdges, (cycle) => {
    diagnostics.push(
      semanticError(
        "GHDL-E6001",
        "graph",
        `Top instance graph 存在反馈环：${cycle.join(" -> ")}。`,
        "v0.1 禁止跨 module 的反馈环。",
        "/design/top/nets",
        topTarget(index, cycle[0] ?? index.top.id),
      ),
    );
  });
}

function validateTopDomainPort(
  index: DesignIndex,
  port: Port | undefined,
  role: "clock" | "reset",
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  if (!port) {
    diagnostics.push(
      semanticError(
        "GHDL-E5002",
        "clock-reset",
        `clockDomain 引用了不存在的 ${role} port。`,
        `请选择 top 中存在的 1-bit ${role} input。`,
        pointer,
        topTarget(index, role),
      ),
    );
    return;
  }
  if (port.direction !== "input" || port.width !== 1 || port.role !== role) {
    diagnostics.push(
      semanticError(
        "GHDL-E5003",
        "clock-reset",
        `Top ${role} port 必须是 role=${role} 的 1-bit input。`,
        "请修正 port direction、width 和 role。",
        pointer,
        topTarget(index, port.id),
      ),
    );
  }
}

function validatePrimitiveLiterals(
  module: ModuleDefinition,
  primitive: Primitive,
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  if (primitive.kind === "const" && !literalFitsWidth(primitive.value, primitive.width)) {
    diagnostics.push(
      semanticError(
        "GHDL-E4007",
        "type",
        `Constant "${primitive.name}" 的值无法由 ${primitive.width} bit 表示。`,
        "请增大 width 或减小 value。",
        `${pointer}/value`,
        moduleTarget(module, 3, primitive.id),
      ),
    );
  }
  if (primitive.kind === "reg" && !literalFitsWidth(primitive.resetValue, primitive.width)) {
    diagnostics.push(
      semanticError(
        "GHDL-E4008",
        "type",
        `Register "${primitive.name}" 的 resetValue 无法由 ${primitive.width} bit 表示。`,
        "请增大 width 或减小 resetValue。",
        `${pointer}/resetValue`,
        moduleTarget(module, 3, primitive.id),
      ),
    );
  }
}

function validateModule(moduleIndex: ModuleIndex, diagnostics: Diagnostic[]): void {
  const module = moduleIndex.module;
  const driverConnections = new Map<string, string>();
  const sinkConnections = new Map<string, string>();
  const combinationalEdges = new Map<string, Set<string>>();
  const primitivePointers = new Map<string, string>();
  const registers = module.implementation.primitives.filter(
    (primitive) => primitive.kind === "reg",
  );

  module.implementation.primitives.forEach((primitive, primitiveIndex) => {
    const pointer = `${moduleIndex.pointer}/implementation/primitives/${primitiveIndex}`;
    primitivePointers.set(primitive.id, pointer);
    validatePrimitiveLiterals(module, primitive, pointer, diagnostics);
    if (primitive.kind !== "reg") {
      combinationalEdges.set(primitive.id, new Set());
    }
  });

  if (registers.length > 0) {
    const clocks = module.ports.filter((port) => port.role === "clock");
    const resets = module.ports.filter((port) => port.role === "reset");
    if (clocks.length !== 1 || clocks[0]?.direction !== "input" || clocks[0].width !== 1) {
      diagnostics.push(
        semanticError(
          "GHDL-E5004",
          "clock-reset",
          `Module "${module.name}" 必须恰好定义一个 1-bit clock input。`,
          "含 Register 的 v0.1 module 只能使用一个 Clock domain。",
          `${moduleIndex.pointer}/ports`,
          moduleTarget(module, 2, clocks[0]?.id ?? module.id),
        ),
      );
    }
    if (resets.length !== 1 || resets[0]?.direction !== "input" || resets[0].width !== 1) {
      diagnostics.push(
        semanticError(
          "GHDL-E5005",
          "clock-reset",
          `Module "${module.name}" 必须恰好定义一个 1-bit reset input。`,
          "含 Register 的 v0.1 module 必须使用同步高有效 reset。",
          `${moduleIndex.pointer}/ports`,
          moduleTarget(module, 2, resets[0]?.id ?? module.id),
        ),
      );
    }
  }

  module.implementation.nets.forEach((net, netIndex) => {
    const netPointer = `${moduleIndex.pointer}/implementation/nets/${netIndex}`;
    const driver = resolveModuleEndpoint(
      moduleIndex,
      net.driver,
      `${netPointer}/driver`,
      diagnostics,
    );
    if (driver) {
      validateDirection(driver, "driver", `${netPointer}/driver`, diagnostics, false);
      addConnection(
        driverConnections,
        driver,
        `${netPointer}/driver`,
        diagnostics,
        "GHDL-E4003",
        `${driver.label} 驱动了多条 net。`,
      );
    }

    net.sinks.forEach((sinkEndpoint, sinkIndex) => {
      const sinkPointer = `${netPointer}/sinks/${sinkIndex}`;
      const sink = resolveModuleEndpoint(moduleIndex, sinkEndpoint, sinkPointer, diagnostics);
      if (!sink) {
        return;
      }
      validateDirection(sink, "sink", sinkPointer, diagnostics, false);
      addConnection(
        sinkConnections,
        sink,
        sinkPointer,
        diagnostics,
        "GHDL-E4004",
        `${sink.label} 被多条 net 驱动。`,
      );
      if (driver) {
        validateWidth(driver, sink, sinkPointer, diagnostics);
      }

      if (
        sinkEndpoint.kind === "primitivePin" &&
        (sink.role === "clock" || sink.role === "reset")
      ) {
        if (
          net.driver.kind !== "modulePort" ||
          moduleIndex.ports.get(net.driver.portId)?.value.role !== sink.role
        ) {
          diagnostics.push(
            semanticError(
              "GHDL-E5006",
              "clock-reset",
              `Register ${sink.role} pin 必须直接连接到同 role 的 module input。`,
              "v0.1 不允许 gated Clock 或 derived reset。",
              sinkPointer,
              sink.target,
            ),
          );
        }
      }

      if (
        net.driver.kind === "primitivePin" &&
        sinkEndpoint.kind === "primitivePin" &&
        combinationalEdges.has(net.driver.primitiveId) &&
        combinationalEdges.has(sinkEndpoint.primitiveId)
      ) {
        combinationalEdges.get(net.driver.primitiveId)?.add(sinkEndpoint.primitiveId);
      }
    });
  });

  for (const port of module.ports) {
    if (
      port.direction === "output" &&
      !sinkConnections.has(connectionKey("modulePort", module.id, port.id))
    ) {
      diagnostics.push(
        semanticError(
          "GHDL-E4005",
          "type",
          `Module output "${port.name}" 未被驱动。`,
          "每个 module output 必须恰好作为一条 internal net 的 sink。",
          `${moduleIndex.pointer}/ports/${module.ports.indexOf(port)}`,
          moduleTarget(module, 2, port.id),
        ),
      );
    }
  }

  for (const primitive of module.implementation.primitives) {
    for (const pin of getPrimitivePins(primitive)) {
      const key = connectionKey("primitivePin", module.id, primitive.id, pin.name);
      if (pin.direction === "input" && !sinkConnections.has(key)) {
        diagnostics.push(
          semanticError(
            "GHDL-E4006",
            "type",
            `Primitive "${primitive.name}" 的 input pin "${pin.name}" 未连接。`,
            "每个 primitive input 必须恰好作为一条 internal net 的 sink。",
            primitivePointers.get(primitive.id) ?? moduleIndex.pointer,
            moduleTarget(module, 3, primitive.id, pin.name),
          ),
        );
      }
    }
  }

  detectCycle(combinationalEdges, (cycle) => {
    diagnostics.push(
      semanticError(
        "GHDL-E6002",
        "graph",
        `Module "${module.name}" 存在 combinational cycle：${cycle.join(" -> ")}。`,
        "请插入 Register 以打断组合环。",
        `${moduleIndex.pointer}/implementation/nets`,
        moduleTarget(module, 3, cycle[0] ?? module.id),
      ),
    );
  });
}

function detectCycle(graph: Map<string, Set<string>>, onCycle: (cycle: string[]) => void): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  let reported = false;

  function visit(node: string): void {
    if (reported || visited.has(node)) {
      return;
    }
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      onCycle([...stack.slice(start), node]);
      reported = true;
      return;
    }
    visiting.add(node);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      visit(next);
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of graph.keys()) {
    visit(node);
  }
}

function validateLayout(
  document: DesignDocument,
  index: DesignIndex,
  diagnostics: Diagnostic[],
): void {
  document.layout?.views.forEach((view, viewIndex) => {
    let allowed = new Set<string>();
    if (view.level === 1 && view.ownerId === index.top.id) {
      allowed = new Set(index.top.instances.map((instance) => instance.id));
    } else if (view.level === 2) {
      const module = index.modules.get(view.ownerId)?.module;
      if (module) {
        allowed = new Set(module.ports.map((port) => port.id));
      }
    } else if (view.level === 3) {
      const module = index.modules.get(view.ownerId)?.module;
      if (module) {
        allowed = new Set(module.implementation.primitives.map((primitive) => primitive.id));
      }
    }

    view.nodes.forEach((node, nodeIndex) => {
      if (!allowed.has(node.elementId)) {
        diagnostics.push({
          code: "GHDL-W7001",
          severity: "warning",
          stage: "resolve",
          message: `Layout 引用了当前 view 中不存在的 element "${node.elementId}"。`,
          hint: "该 layout node 会被 UI 忽略；可安全删除或修正 elementId。",
          jsonPointer: `/layout/views/${viewIndex}/nodes/${nodeIndex}/elementId`,
          target: {
            level: view.level,
            ownerId: view.ownerId,
            elementId: node.elementId,
          },
        });
      }
    });
  });
}

export function validateSemantics(index: DesignIndex): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  validateTop(index, diagnostics);
  for (const moduleIndex of index.modules.values()) {
    validateModule(moduleIndex, diagnostics);
  }
  validateLayout(index.document, index, diagnostics);
  return diagnostics;
}
