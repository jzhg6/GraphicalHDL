import type {
  DesignDocument,
  GeneratedArtifact,
  GeneratedSourceRange,
  ModuleDefinition,
  ModuleEndpoint,
  ModuleNet,
  NormalizedDesign,
  Port,
  Primitive,
  TopEndpoint,
  TopNet,
} from "@graphicalhdl/ir";
import { canonicalLiteral, getPrimitivePins } from "@graphicalhdl/ir";
import { compareText } from "../canonical";
import { InternalCompilerError } from "../errors";
import { CodeWriter, type SourceOrigin } from "./source-map";

interface EmittedFile {
  artifact: GeneratedArtifact;
  ranges: GeneratedSourceRange[];
}

function svRange(width: number): string {
  return width === 1 ? "" : `[${width - 1}:0] `;
}

function svLiteral(width: number, value: string): string {
  return `${width}'d${canonicalLiteral(value)}`;
}

function endpointPinKey(primitiveId: string, pin: string): string {
  return `${primitiveId}:${pin}`;
}

function findModule(
  document: DesignDocument,
  moduleId: string,
): {
  module: ModuleDefinition;
  index: number;
} {
  const index = document.design.modules.findIndex((module) => module.id === moduleId);
  const module = document.design.modules[index];
  if (!module || index < 0) {
    throw new InternalCompilerError(`无法定位 module ${moduleId} 的原始定义`);
  }
  return { module, index };
}

function moduleOrigin(
  original: DesignDocument,
  moduleId: string,
  level: 2 | 3,
  elementId: string,
  kind: "module" | "port" | "primitive" | "net",
  pinOrNetId?: string,
): SourceOrigin {
  const { module, index: moduleIndex } = findModule(original, moduleId);
  let jsonPointer = `/design/modules/${moduleIndex}`;
  if (kind === "port") {
    const index = module.ports.findIndex((port) => port.id === elementId);
    jsonPointer += `/ports/${index}`;
  } else if (kind === "primitive") {
    const index = module.implementation.primitives.findIndex(
      (primitive) => primitive.id === elementId,
    );
    jsonPointer += `/implementation/primitives/${index}`;
  } else if (kind === "net") {
    const index = module.implementation.nets.findIndex((net) => net.id === elementId);
    jsonPointer += `/implementation/nets/${index}`;
  }
  const base: SourceOrigin = {
    jsonPointer,
    level,
    ownerId: moduleId,
    elementId,
  };
  return pinOrNetId ? { ...base, pinOrNetId } : base;
}

function topOrigin(
  original: DesignDocument,
  elementId: string,
  kind: "top" | "port" | "instance" | "net",
  pinOrNetId?: string,
): SourceOrigin {
  let jsonPointer = "/design/top";
  if (kind === "port") {
    jsonPointer += `/ports/${original.design.top.ports.findIndex((port) => port.id === elementId)}`;
  } else if (kind === "instance") {
    jsonPointer += `/instances/${original.design.top.instances.findIndex(
      (instance) => instance.id === elementId,
    )}`;
  } else if (kind === "net") {
    jsonPointer += `/nets/${original.design.top.nets.findIndex((net) => net.id === elementId)}`;
  }
  const base: SourceOrigin = {
    jsonPointer,
    level: 1,
    ownerId: original.design.top.id,
    elementId,
  };
  return pinOrNetId ? { ...base, pinOrNetId } : base;
}

function primitivePinWidth(primitive: Primitive, pinName: string): number {
  const pin = getPrimitivePins(primitive).find((candidate) => candidate.name === pinName);
  if (!pin) {
    throw new InternalCompilerError(`primitive ${primitive.id} 不存在 pin ${pinName}`);
  }
  return pin.width;
}

function moduleEndpointWidth(module: ModuleDefinition, endpoint: ModuleEndpoint): number {
  if (endpoint.kind === "modulePort") {
    const port = module.ports.find((candidate) => candidate.id === endpoint.portId);
    if (!port) {
      throw new InternalCompilerError(`module ${module.id} 不存在 port ${endpoint.portId}`);
    }
    return port.width;
  }
  const primitive = module.implementation.primitives.find(
    (candidate) => candidate.id === endpoint.primitiveId,
  );
  if (!primitive) {
    throw new InternalCompilerError(`module ${module.id} 不存在 primitive ${endpoint.primitiveId}`);
  }
  return primitivePinWidth(primitive, endpoint.pin);
}

function topEndpointWidth(design: NormalizedDesign, endpoint: TopEndpoint): number {
  if (endpoint.kind === "topPort") {
    const port = design.design.top.ports.find((candidate) => candidate.id === endpoint.portId);
    if (!port) {
      throw new InternalCompilerError(`top 不存在 port ${endpoint.portId}`);
    }
    return port.width;
  }
  const instance = design.design.top.instances.find(
    (candidate) => candidate.id === endpoint.instanceId,
  );
  if (!instance) {
    throw new InternalCompilerError(`top 不存在 instance ${endpoint.instanceId}`);
  }
  const module = design.design.modules.find((candidate) => candidate.id === instance.moduleId);
  const port = module?.ports.find((candidate) => candidate.id === endpoint.portId);
  if (!module || !port) {
    throw new InternalCompilerError(`instance ${instance.id} 的 port ${endpoint.portId} 不存在`);
  }
  return port.width;
}

function emitPortList(
  writer: CodeWriter,
  ports: readonly Port[],
  origin: (port: Port) => SourceOrigin,
): void {
  ports.forEach((port, index) => {
    const comma = index === ports.length - 1 ? "" : ",";
    writer.line(
      `    ${port.direction} logic ${svRange(port.width)}${port.name}${comma}`,
      origin(port),
    );
  });
}

function buildModulePinMaps(module: ModuleDefinition): {
  inputNet: Map<string, ModuleNet>;
  outputNet: Map<string, ModuleNet>;
} {
  const inputNet = new Map<string, ModuleNet>();
  const outputNet = new Map<string, ModuleNet>();
  for (const net of module.implementation.nets) {
    if (net.driver.kind === "primitivePin") {
      outputNet.set(endpointPinKey(net.driver.primitiveId, net.driver.pin), net);
    }
    for (const sink of net.sinks) {
      if (sink.kind === "primitivePin") {
        inputNet.set(endpointPinKey(sink.primitiveId, sink.pin), net);
      }
    }
  }
  return { inputNet, outputNet };
}

function requiredNet(map: Map<string, ModuleNet>, primitive: Primitive, pin: string): ModuleNet {
  const net = map.get(endpointPinKey(primitive.id, pin));
  if (!net) {
    throw new InternalCompilerError(`primitive ${primitive.id}.${pin} 缺少已验证 net`);
  }
  return net;
}

function emitPrimitive(
  writer: CodeWriter,
  module: ModuleDefinition,
  primitive: Primitive,
  inputNet: Map<string, ModuleNet>,
  outputNet: Map<string, ModuleNet>,
  original: DesignDocument,
): void {
  const startLine = writer.nextLine;
  const origin = moduleOrigin(original, module.id, 3, primitive.id, "primitive");
  writer.line(`  // ${primitive.name} (${primitive.kind})`);
  const outputPin = primitive.kind === "reg" ? "q" : "y";
  const output = outputNet.get(endpointPinKey(primitive.id, outputPin));
  if (!output) {
    writer.line("  // Output 未使用，省略该 primitive 的 RTL lowering。");
    writer.markRange(startLine, origin);
    return;
  }
  switch (primitive.kind) {
    case "const": {
      writer.line(`  assign ${output.name} = ${svLiteral(primitive.width, primitive.value)};`);
      break;
    }
    case "add": {
      const a = requiredNet(inputNet, primitive, "a");
      const b = requiredNet(inputNet, primitive, "b");
      writer.line(`  assign ${output.name} = ${a.name} + ${b.name};`);
      break;
    }
    case "mul": {
      const a = requiredNet(inputNet, primitive, "a");
      const b = requiredNet(inputNet, primitive, "b");
      const resultWidth = primitive.aWidth + primitive.bWidth;
      writer.line(
        `  assign ${output.name} = {{${primitive.bWidth}{1'b0}}, ${a.name}} * ` +
          `{{${primitive.aWidth}{1'b0}}, ${b.name}};`,
      );
      if (
        moduleEndpointWidth(module, {
          kind: "primitivePin",
          primitiveId: primitive.id,
          pin: "y",
        }) !== resultWidth
      ) {
        throw new InternalCompilerError(`mul ${primitive.id} 的输出位宽 invariant 失效`);
      }
      break;
    }
    case "mux2": {
      const a = requiredNet(inputNet, primitive, "a");
      const b = requiredNet(inputNet, primitive, "b");
      const sel = requiredNet(inputNet, primitive, "sel");
      writer.line(`  assign ${output.name} = ${sel.name} ? ${b.name} : ${a.name};`);
      break;
    }
    case "reg": {
      const d = requiredNet(inputNet, primitive, "d");
      const clk = requiredNet(inputNet, primitive, "clk");
      const rst = requiredNet(inputNet, primitive, "rst");
      writer.line(`  always_ff @(posedge ${clk.name}) begin`);
      writer.line(`    if (${rst.name}) begin`);
      writer.line(`      ${output.name} <= ${svLiteral(primitive.width, primitive.resetValue)};`);
      writer.line("    end else begin");
      writer.line(`      ${output.name} <= ${d.name};`);
      writer.line("    end");
      writer.line("  end");
      break;
    }
  }
  writer.markRange(startLine, origin);
}

function emitModule(
  design: NormalizedDesign,
  module: ModuleDefinition,
  original: DesignDocument,
): EmittedFile {
  const artifactPath = `rtl/${module.name}.sv`;
  const writer = new CodeWriter(artifactPath);
  writer.line("// 由 GraphicalHDL v0.1 生成，禁止手工修改。");
  writer.line("`default_nettype none");
  writer.line();
  writer.line(`module ${module.name} (`, moduleOrigin(original, module.id, 2, module.id, "module"));
  emitPortList(writer, module.ports, (port) =>
    moduleOrigin(original, module.id, 2, port.id, "port"),
  );
  writer.line(");");
  writer.line();

  for (const net of module.implementation.nets) {
    const width = moduleEndpointWidth(module, net.driver);
    writer.line(
      `  logic ${svRange(width)}${net.name};`,
      moduleOrigin(original, module.id, 3, net.id, "net", net.id),
    );
  }
  writer.line();

  for (const net of module.implementation.nets) {
    if (net.driver.kind === "modulePort") {
      const portId = net.driver.portId;
      const port = module.ports.find((candidate) => candidate.id === portId);
      if (!port) {
        throw new InternalCompilerError(`module input ${portId} 不存在`);
      }
      writer.line(
        `  assign ${net.name} = ${port.name};`,
        moduleOrigin(original, module.id, 3, net.id, "net", net.id),
      );
    }
  }
  writer.line();

  const { inputNet, outputNet } = buildModulePinMaps(module);
  for (const primitive of module.implementation.primitives) {
    emitPrimitive(writer, module, primitive, inputNet, outputNet, original);
    writer.line();
  }

  for (const net of module.implementation.nets) {
    for (const sink of net.sinks) {
      if (sink.kind !== "modulePort") {
        continue;
      }
      const port = module.ports.find((candidate) => candidate.id === sink.portId);
      if (!port) {
        throw new InternalCompilerError(`module output ${sink.portId} 不存在`);
      }
      writer.line(
        `  assign ${port.name} = ${net.name};`,
        moduleOrigin(original, module.id, 2, port.id, "port", net.id),
      );
    }
  }
  writer.line("endmodule");
  writer.line();
  writer.line("`default_nettype wire");

  const result = writer.finish();
  void design;
  return { artifact: { path: artifactPath, content: result.content }, ranges: result.ranges };
}

function topConnectionNet(
  nets: readonly TopNet[],
  instanceId: string,
  portId: string,
): TopNet | undefined {
  return nets.find(
    (net) =>
      (net.driver.kind === "instancePort" &&
        net.driver.instanceId === instanceId &&
        net.driver.portId === portId) ||
      net.sinks.some(
        (sink) =>
          sink.kind === "instancePort" && sink.instanceId === instanceId && sink.portId === portId,
      ),
  );
}

function emitTop(design: NormalizedDesign, original: DesignDocument): EmittedFile {
  const top = design.design.top;
  const artifactPath = `rtl/${top.name}.sv`;
  const writer = new CodeWriter(artifactPath);
  writer.line("// 由 GraphicalHDL v0.1 生成，禁止手工修改。");
  writer.line("`default_nettype none");
  writer.line();
  writer.line(`module ${top.name} (`, topOrigin(original, top.id, "top"));
  emitPortList(writer, top.ports, (port) => topOrigin(original, port.id, "port"));
  writer.line(");");
  writer.line();

  for (const net of top.nets) {
    writer.line(
      `  logic ${svRange(topEndpointWidth(design, net.driver))}${net.name};`,
      topOrigin(original, net.id, "net", net.id),
    );
  }
  writer.line();

  for (const net of top.nets) {
    if (net.driver.kind === "topPort") {
      const port = top.ports.find((candidate) => candidate.id === net.driver.portId);
      if (!port) {
        throw new InternalCompilerError(`top input ${net.driver.portId} 不存在`);
      }
      writer.line(`  assign ${net.name} = ${port.name};`, topOrigin(original, net.id, "net"));
    }
  }
  writer.line();

  for (const instance of top.instances) {
    const module = design.design.modules.find((candidate) => candidate.id === instance.moduleId);
    if (!module) {
      throw new InternalCompilerError(`instance ${instance.id} 的 module 不存在`);
    }
    const startLine = writer.nextLine;
    writer.line(`  ${module.name} ${instance.name} (`);
    module.ports.forEach((port, portIndex) => {
      const net = topConnectionNet(top.nets, instance.id, port.id);
      const comma = portIndex === module.ports.length - 1 ? "" : ",";
      writer.line(`    .${port.name}(${net?.name ?? ""})${comma}`);
    });
    writer.line("  );");
    writer.markRange(startLine, topOrigin(original, instance.id, "instance"));
    writer.line();
  }

  for (const net of top.nets) {
    for (const sink of net.sinks) {
      if (sink.kind !== "topPort") {
        continue;
      }
      const port = top.ports.find((candidate) => candidate.id === sink.portId);
      if (!port) {
        throw new InternalCompilerError(`top output ${sink.portId} 不存在`);
      }
      writer.line(`  assign ${port.name} = ${net.name};`, topOrigin(original, port.id, "port"));
    }
  }
  writer.line("endmodule");
  writer.line();
  writer.line("`default_nettype wire");

  const result = writer.finish();
  return { artifact: { path: artifactPath, content: result.content }, ranges: result.ranges };
}

export function emitSystemVerilog(
  design: NormalizedDesign,
  _original: DesignDocument,
): { artifacts: GeneratedArtifact[]; sourceMap: GeneratedSourceRange[] } {
  // Source-map JSON Pointer 指向 normalized IR，避免仅调整输入 array 顺序导致生成物漂移。
  const canonicalDocument: DesignDocument = design;
  const files = design.design.modules.map((module) =>
    emitModule(design, module, canonicalDocument),
  );
  files.push(emitTop(design, canonicalDocument));
  return {
    artifacts: files
      .map((file) => file.artifact)
      .sort((left, right) => compareText(left.path, right.path)),
    sourceMap: files
      .flatMap((file) => file.ranges)
      .sort((left, right) => {
        const pathOrder = compareText(left.artifactPath, right.artifactPath);
        return pathOrder !== 0 ? pathOrder : left.startLine - right.startLine;
      }),
  };
}
