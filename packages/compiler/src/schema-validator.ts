import type { Diagnostic } from "@graphicalhdl/ir";
import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import schema from "../../../schemas/graphicalhdl-design.schema.json";

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

function escapePointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function errorPointer(error: ErrorObject): string {
  if (error.keyword === "additionalProperties") {
    const property = String(error.params.additionalProperty);
    return `${error.instancePath}/${escapePointerSegment(property)}`;
  }
  if (error.keyword === "required") {
    const property = String(error.params.missingProperty);
    return `${error.instancePath}/${escapePointerSegment(property)}`;
  }
  return error.instancePath;
}

function errorCode(error: ErrorObject): string {
  if (error.instancePath === "/schemaVersion" && error.keyword === "const") {
    return "GHDL-E1103";
  }
  switch (error.keyword) {
    case "required":
      return "GHDL-E1101";
    case "additionalProperties":
      return "GHDL-E1102";
    case "pattern":
      return "GHDL-E1104";
    case "oneOf":
      return "GHDL-E1105";
    case "type":
      return "GHDL-E1106";
    case "minimum":
    case "maximum":
    case "exclusiveMinimum":
      return "GHDL-E1107";
    default:
      return "GHDL-E1199";
  }
}

function errorMessage(error: ErrorObject): string {
  if (error.instancePath === "/schemaVersion" && error.keyword === "const") {
    return '不支持该 schemaVersion，v0.1 仅接受 "0.1"。';
  }
  switch (error.keyword) {
    case "required":
      return `缺少必需字段 "${String(error.params.missingProperty)}"。`;
    case "additionalProperties":
      return `存在未知字段 "${String(error.params.additionalProperty)}"。`;
    case "pattern":
      return "字段内容不符合命名或 literal 格式约束。";
    case "oneOf":
      return "对象不符合任何一种允许的结构。";
    case "type":
      return `字段类型错误，期望 ${String(error.params.type)}。`;
    default:
      return `Schema 校验失败：${error.message ?? error.keyword}。`;
  }
}

export function validateSchema(document: unknown): Diagnostic[] {
  if (validate(document)) {
    return [];
  }

  return (validate.errors ?? [])
    .filter((error, _index, errors) => {
      if (error.keyword !== "oneOf") {
        return true;
      }
      return !errors.some(
        (candidate) => candidate !== error && candidate.instancePath.startsWith(error.instancePath),
      );
    })
    .map((error) => ({
      code: errorCode(error),
      severity: "error" as const,
      stage: "schema" as const,
      message: errorMessage(error),
      hint: "请按照 GraphicalHDL v0.1 JSON Schema 修正该字段。",
      jsonPointer: errorPointer(error),
    }));
}

export function assertSchemaIsValid(): void {
  const schemaAjv = new Ajv2020({ strict: true });
  schemaAjv.compile(schema);
}
