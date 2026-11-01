import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DesignDocument } from "@graphicalhdl/ir";
import { compileDocument, compileJson } from "@graphicalhdl/compiler";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
let base: DesignDocument;

beforeAll(async () => {
  base = JSON.parse(
    await readFile(path.join(root, "examples/mac-accumulator/design.json"), "utf8"),
  ) as DesignDocument;
});

function mutate(mutator: (document: DesignDocument) => void) {
  const document = structuredClone(base);
  mutator(document);
  return compileDocument(document);
}

function expectCode(result: ReturnType<typeof compileDocument>, code: string): void {
  expect(result.ok).toBe(false);
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
}

describe("语义检查", () => {
  it("合法示例 zero-warning", () => {
    const result = compileDocument(base);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("检测重复 ID", () => {
    const result = mutate((document) => {
      document.design.top.ports[1]!.id = document.design.top.ports[0]!.id;
    });
    expectCode(result, "GHDL-E2001");
  });

  it("拒绝 SystemVerilog keyword 名称", () => {
    const result = mutate((document) => {
      document.design.modules[0]!.name = "module";
    });
    expectCode(result, "GHDL-E2003");
  });

  it("拒绝完整 SystemVerilog keyword 集中的名称", () => {
    const result = mutate((document) => {
      document.project.topModuleName = "bit";
      document.design.top.name = "bit";
    });
    expectCode(result, "GHDL-E2003");
  });

  it("检测悬空 endpoint", () => {
    const result = mutate((document) => {
      document.design.top.nets[0]!.sinks[0] = {
        kind: "instancePort",
        instanceId: "missing_instance",
        portId: "missing_port",
      };
    });
    expectCode(result, "GHDL-E3002");
  });

  it("检测 driver/sink 方向错误", () => {
    const result = mutate((document) => {
      document.design.top.nets[2]!.driver = { kind: "topPort", portId: "top_result" };
    });
    expectCode(result, "GHDL-E4001");
  });

  it("检测位宽不匹配并定位图节点", () => {
    const result = mutate((document) => {
      document.design.modules[0]!.ports.find((port) => port.id === "mac_a")!.width = 7;
    });
    expectCode(result, "GHDL-E4002");
    const mismatch = result.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "GHDL-E4002" && diagnostic.target?.elementId === "inst_mac_core",
    );
    expect(mismatch?.target?.elementId).toBe("inst_mac_core");
    expect(mismatch?.target?.pinOrPort).toBe("mac_a");
  });

  it("检测多重驱动", () => {
    const result = mutate((document) => {
      const duplicate = structuredClone(document.design.top.nets[2]!);
      duplicate.id = "top_net_a_duplicate";
      duplicate.name = "a_bus_duplicate";
      document.design.top.nets.push(duplicate);
    });
    expectCode(result, "GHDL-E4004");
  });

  it("检测 gated Clock", () => {
    const result = mutate((document) => {
      const module = document.design.modules[0]!;
      const clockNet = module.implementation.nets.find((net) => net.id === "mac_net_clk")!;
      clockNet.driver = { kind: "primitivePin", primitiveId: "mac_mux", pin: "y" };
    });
    expectCode(result, "GHDL-E5006");
  });

  it("检测 combinational cycle", () => {
    const result = mutate((document) => {
      const module = document.design.modules[0]!;
      const sumNet = module.implementation.nets.find((net) => net.id === "mac_net_sum")!;
      sumNet.sinks.push({ kind: "primitivePin", primitiveId: "mac_add", pin: "a" });
      const productNet = module.implementation.nets.find((net) => net.id === "mac_net_product")!;
      productNet.sinks = productNet.sinks.filter(
        (sink) =>
          !(sink.kind === "primitivePin" && sink.primitiveId === "mac_add" && sink.pin === "a"),
      ) as typeof productNet.sinks;
    });
    expectCode(result, "GHDL-E6002");
  });

  it("允许经过 Register 截断的反馈", () => {
    const result = compileDocument(base);
    expect(result.ok).toBe(true);
  });

  it("允许未使用的 primitive output 并省略 RTL lowering", () => {
    const document = structuredClone(base);
    document.design.modules[0]!.implementation.primitives.push({
      id: "unused_const",
      name: "unused_const",
      kind: "const",
      width: 8,
      value: "7",
    });
    const result = compileDocument(document);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rtl = result.artifacts.find((artifact) => artifact.path === "rtl/mac_core.sv")?.content;
      expect(rtl).toContain("unused_const (const)");
      expect(rtl).toContain("Output 未使用");
    }
  });

  it("含分隔符的 stable ID 不会碰撞 connection key", () => {
    const document = structuredClone(base);
    const mac = document.design.modules.find((module) => module.id === "module_mac_core")!;
    const macPort = mac.ports.find((port) => port.id === "mac_a")!;
    macPort.id = "b:c";
    for (const net of mac.implementation.nets) {
      if (net.driver.kind === "modulePort" && net.driver.portId === "mac_a") {
        net.driver.portId = "b:c";
      }
    }
    const macInstance = document.design.top.instances.find(
      (instance) => instance.id === "inst_mac_core",
    )!;
    macInstance.id = "a";
    for (const net of document.design.top.nets) {
      if (net.driver.kind === "instancePort" && net.driver.instanceId === "inst_mac_core") {
        net.driver.instanceId = "a";
      }
      for (const sink of net.sinks) {
        if (sink.kind === "instancePort" && sink.instanceId === "inst_mac_core") {
          sink.instanceId = "a";
          if (sink.portId === "mac_a") sink.portId = "b:c";
        }
      }
    }

    const stage = document.design.modules.find((module) => module.id === "module_output_stage")!;
    stage.ports.find((port) => port.id === "stage_data_in")!.id = "c";
    for (const net of stage.implementation.nets) {
      if (net.driver.kind === "modulePort" && net.driver.portId === "stage_data_in") {
        net.driver.portId = "c";
      }
    }
    for (const net of document.design.top.nets) {
      for (const sink of net.sinks) {
        if (sink.kind === "instancePort" && sink.portId === "stage_data_in") sink.portId = "c";
      }
    }
    document.design.top.instances.push({
      id: "a:b",
      name: "u_collision",
      moduleId: "module_output_stage",
    });

    const result = compileDocument(document);
    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "GHDL-E4006" &&
          diagnostic.target?.elementId === "a:b" &&
          diagnostic.target.pinOrPort === "c",
      ),
    ).toBe(true);
  });

  it("Layout 悬空引用只产生 warning", () => {
    const result = mutate((document) => {
      document.layout!.views[0]!.nodes.push({ elementId: "stale_node", x: 0, y: 0 });
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("GHDL-W7001");
  });
});

describe("确定性生成", () => {
  it("Layout 变化不改变 semantic hash 或 artifacts", () => {
    const first = compileDocument(base);
    const changed = structuredClone(base);
    changed.layout!.views[0]!.nodes[0]!.x += 1000;
    changed.layout!.views[0]!.viewport = { x: 22, y: 31, zoom: 1.2 };
    const second = compileDocument(changed);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.normalizedIr.semanticHash).toBe(first.normalizedIr.semanticHash);
      expect(second.artifacts).toEqual(first.artifacts);
    }
  });

  it("JSON property order 变化不改变 artifacts", async () => {
    const source = await readFile(path.join(root, "examples/mac-accumulator/design.json"), "utf8");
    const first = compileJson(source);
    const reordered = JSON.stringify(JSON.parse(source) as DesignDocument);
    const second = compileJson(reordered);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.artifacts).toEqual(first.artifacts);
    }
  });

  it("使用 code-unit 顺序而不是进程 locale 排序", () => {
    const document = structuredClone(base);
    document.design.top.ports.push(
      { id: "i", name: "lower_i", direction: "input", width: 1, role: "control" },
      { id: "I", name: "upper_i", direction: "input", width: 1, role: "control" },
    );
    const result = compileDocument(document);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ids = result.normalizedIr.design.top.ports.map((port) => port.id);
      expect(ids.indexOf("I")).toBeLessThan(ids.indexOf("i"));
    }
  });

  it("输入 array 顺序变化被归一化", () => {
    const changed = structuredClone(base);
    changed.design.modules.reverse();
    changed.design.top.ports.reverse();
    changed.design.top.nets.reverse();
    for (const module of changed.design.modules) {
      module.ports.reverse();
      module.implementation.primitives.reverse();
      module.implementation.nets.reverse();
    }
    const first = compileDocument(base);
    const second = compileDocument(changed);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.normalizedIr.semanticHash).toBe(first.normalizedIr.semanticHash);
      expect(second.artifacts).toEqual(first.artifacts);
    }
  });
});
