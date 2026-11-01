import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { assertSchemaIsValid, compileJson } from "@graphicalhdl/compiler";
import schema from "../../schemas/graphicalhdl-design.schema.json";

const root = path.resolve(import.meta.dirname, "../..");
const examplePath = path.join(root, "examples/mac-accumulator/design.json");

async function exampleSource(): Promise<string> {
  return readFile(examplePath, "utf8");
}

describe("GraphicalHDL JSON Schema", () => {
  it("本身是有效的 Draft 2020-12 Schema", () => {
    expect(() => assertSchemaIsValid()).not.toThrow();
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toBe("https://graphicalhdl.dev/schemas/graphicalhdl-design.schema.json");
  });

  it("接受完整 MAC 示例", async () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
    const document = JSON.parse(await exampleSource()) as unknown;
    expect(validate(document), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it("拒绝未知字段", async () => {
    const document = JSON.parse(await exampleSource()) as Record<string, unknown>;
    document.unknown = true;
    const result = compileJson(JSON.stringify(document));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "GHDL-E1102")).toBe(true);
  });

  it("拒绝不支持的版本", async () => {
    const document = JSON.parse(await exampleSource()) as { schemaVersion: string };
    document.schemaVersion = "9.9";
    const result = compileJson(JSON.stringify(document));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "GHDL-E1103")).toBe(true);
  });

  it("为 malformed JSON 返回位置", () => {
    const result = compileJson('{\n  "schemaVersion": "0.1",\n  broken\n}');
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("GHDL-E1001");
    expect(result.diagnostics[0]?.location?.line).toBeGreaterThan(1);
  });
});
