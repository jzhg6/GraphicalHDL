import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DesignDocument } from "@graphicalhdl/ir";
import { beforeAll, describe, expect, it } from "vitest";
import { editorReducer } from "../../apps/web/src/model/editor-reducer";
import { projectGraph } from "../../apps/web/src/model/graph-adapter";

let base: DesignDocument;

beforeAll(async () => {
  base = JSON.parse(
    await readFile(
      path.resolve(import.meta.dirname, "../../examples/mac-accumulator/design.json"),
      "utf8",
    ),
  ) as DesignDocument;
});

describe("Web editor model", () => {
  it("投影三层 graph", () => {
    const level1 = projectGraph(base, { level: 1, ownerId: base.design.top.id });
    const level2 = projectGraph(base, { level: 2, ownerId: "module_mac_core" });
    const level3 = projectGraph(base, { level: 3, ownerId: "module_mac_core" });
    expect(level1.nodes.some((node) => node.id === "instance:inst_mac_core")).toBe(true);
    expect(level1.edges).toHaveLength(9);
    expect(level2.nodes).toHaveLength(6);
    expect(level3.nodes.some((node) => node.id === "primitive:mac_mul")).toBe(true);
    expect(level3.edges.length).toBeGreaterThan(8);
  });

  it("拖动只更新 layout", () => {
    const beforeDesign = structuredClone(base.design);
    const moved = editorReducer(base, {
      type: "move-node",
      view: { level: 3, ownerId: "module_mac_core" },
      elementId: "mac_mul",
      position: { x: 999, y: 777 },
    });
    expect(moved.design).toEqual(beforeDesign);
    expect(
      moved.layout?.views
        .find((view) => view.level === 3 && view.ownerId === "module_mac_core")
        ?.nodes.find((node) => node.elementId === "mac_mul"),
    ).toMatchObject({ x: 999, y: 777 });
  });

  it("添加 primitive 使用稳定且唯一的默认 ID", () => {
    const first = editorReducer(base, {
      type: "add-primitive",
      moduleId: "module_mac_core",
      kind: "add",
    });
    const second = editorReducer(first, {
      type: "add-primitive",
      moduleId: "module_mac_core",
      kind: "add",
    });
    const ids = second.design.modules
      .find((module) => module.id === "module_mac_core")
      ?.implementation.primitives.map((primitive) => primitive.id);
    expect(ids).toContain("mac_core_add");
    expect(ids).toContain("mac_core_add_2");
  });

  it("从同一 source 新连线时复用 net 形成 fanout", () => {
    const connected = editorReducer(base, {
      type: "connect",
      view: { level: 3, ownerId: "module_mac_core" },
      connection: {
        source: "mac_mul",
        target: "mac_reg",
        sourceHandle: "primitivePin|mac_mul|y",
        targetHandle: "primitivePin|mac_reg|d",
      },
    });
    const product = connected.design.modules
      .find((module) => module.id === "module_mac_core")
      ?.implementation.nets.find((net) => net.id === "mac_net_product");
    expect(product?.sinks).toContainEqual({
      kind: "primitivePin",
      primitiveId: "mac_reg",
      pin: "d",
    });
  });

  it("不同图元类型复用 stable ID 时仍产生唯一 React Flow node ID", () => {
    const document = structuredClone(base);
    const port = document.design.top.ports.find((candidate) => candidate.id === "top_a")!;
    port.id = "inst_mac_core";
    document.design.top.nets.find((net) => net.id === "top_net_a")!.driver = {
      kind: "topPort",
      portId: "inst_mac_core",
    };
    const graph = projectGraph(document, { level: 1, ownerId: document.design.top.id });
    expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(graph.nodes.length);
    expect(graph.nodes.map((node) => node.id)).toContain("top-port:inst_mac_core");
    expect(graph.nodes.map((node) => node.id)).toContain("instance:inst_mac_core");
  });

  it("Level 1 可重命名 top port", () => {
    const changed = editorReducer(base, {
      type: "rename-element",
      view: { level: 1, ownerId: base.design.top.id },
      selection: { id: "top_clk", kind: "port" },
      name: "renamed_clk",
    });
    expect(changed.design.top.ports.find((port) => port.id === "top_clk")?.name).toBe(
      "renamed_clk",
    );
  });

  it("批量删除同一 net 的 edge 不受 sink index 位移影响", () => {
    const changed = editorReducer(base, {
      type: "delete-edges",
      view: { level: 1, ownerId: base.design.top.id },
      edgeIds: ["top_net_clk::0", "top_net_clk::1"],
    });
    expect(changed.design.top.nets.some((net) => net.id === "top_net_clk")).toBe(false);
  });

  it("删除 instance 同时清理关联 top nets 和 layout", () => {
    const changed = editorReducer(base, {
      type: "delete-element",
      view: { level: 1, ownerId: base.design.top.id },
      selection: { id: "inst_output_stage", kind: "instance" },
    });
    expect(
      changed.design.top.instances.some((instance) => instance.id === "inst_output_stage"),
    ).toBe(false);
    expect(
      changed.design.top.nets.some(
        (net) =>
          (net.driver.kind === "instancePort" && net.driver.instanceId === "inst_output_stage") ||
          net.sinks.some(
            (sink) => sink.kind === "instancePort" && sink.instanceId === "inst_output_stage",
          ),
      ),
    ).toBe(false);
    expect(
      changed.layout?.views
        .find((view) => view.level === 1 && view.ownerId === base.design.top.id)
        ?.nodes.some((node) => node.elementId === "inst_output_stage"),
    ).toBe(false);
  });
});
