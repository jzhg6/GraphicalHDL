import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { compile, type JSONSchema } from "json-schema-to-typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "schemas/graphicalhdl-design.schema.json");
const typesPath = path.join(root, "packages/ir/src/generated/design-document.ts");
const docsPath = path.join(root, "docs/schema-reference.md");
const checkOnly = process.argv.includes("--check");

async function generatedTypes(schema: JSONSchema): Promise<string> {
  const body = await compile(schema, "DesignDocument", {
    bannerComment: "/* 由 schemas/graphicalhdl-design.schema.json 生成，禁止手工修改。 */",
    enableConstEnums: false,
    format: true,
    strictIndexSignatures: true,
    unreachableDefinitions: true,
  });
  const withoutGeneratedProse = body.replace(/\/\*\*[\s\S]*?\*\/\s*/g, "");
  return `${withoutGeneratedProse.trim()}\n`;
}

function schemaReference(schema: JSONSchema): string {
  const definitions = (schema.$defs ?? {}) as Record<string, JSONSchema>;
  const rows = Object.entries(definitions)
    .map(([name, definition]) => {
      const type = Array.isArray(definition.type)
        ? definition.type.join(" | ")
        : (definition.type ?? (definition.oneOf ? "union" : "constraint"));
      const required = Array.isArray(definition.required) ? definition.required.join(", ") : "-";
      return `| \`${name}\` | ${type} | ${required || "-"} |`;
    })
    .join("\n");

  return (
    `# GraphicalHDL JSON Schema 参考\n\n` +
    `> 本文件由 \`schemas/graphicalhdl-design.schema.json\` 生成，禁止手工修改。\n\n` +
    `- Schema ID：\`${schema.$id}\`\n` +
    `- Draft：2020-12\n` +
    `- 当前版本：\`0.1\`\n\n` +
    `| 定义 | 类型 | 必需字段 |\n` +
    `|---|---|---|\n${rows}\n`
  );
}

async function updateOrCheck(filePath: string, expected: string): Promise<boolean> {
  let current: string | undefined;
  try {
    current = await readFile(filePath, "utf8");
  } catch {
    current = undefined;
  }

  if (current === expected) {
    return true;
  }
  if (checkOnly) {
    console.error(`生成物漂移：${path.relative(root, filePath)}`);
    return false;
  }
  await writeFile(filePath, expected, "utf8");
  console.log(`已生成 ${path.relative(root, filePath)}`);
  return true;
}

async function main(): Promise<void> {
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as JSONSchema;
  const outputs = [
    [typesPath, await generatedTypes(schema)],
    [docsPath, schemaReference(schema)],
  ] as const;

  const results = await Promise.all(
    outputs.map(([filePath, content]) => updateOrCheck(filePath, content)),
  );
  if (results.some((result) => !result)) {
    process.exitCode = 1;
  } else if (checkOnly) {
    console.log("Schema 生成物校验通过");
  }
}

await main();
