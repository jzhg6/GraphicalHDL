import type { Diagnostic, SourceLocation } from "@graphicalhdl/ir";
import { parse as parseWithSourceMap, type JsonSourceMapping } from "json-source-map";

export type PointerMap = Record<string, JsonSourceMapping>;

export interface ParseSuccess {
  ok: true;
  document: unknown;
  pointers: PointerMap;
}

export interface ParseFailure {
  ok: false;
  diagnostics: Diagnostic[];
  pointers: PointerMap;
}

export type ParseResult = ParseSuccess | ParseFailure;

function locationFromOffset(source: string, offset: number): SourceLocation {
  const before = source.slice(0, Math.max(0, offset));
  const lines = before.split("\n");
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}

function syntaxErrorLocation(source: string, error: unknown): SourceLocation {
  const message = error instanceof Error ? error.message : String(error);
  const offsetMatch = /(?:position|at)\s+(\d+)/i.exec(message);
  if (offsetMatch?.[1]) {
    return locationFromOffset(source, Number(offsetMatch[1]));
  }
  return { line: 1, column: 1 };
}

export function parseJson(source: string): ParseResult {
  try {
    const result = parseWithSourceMap(source);
    return { ok: true, document: result.data, pointers: result.pointers };
  } catch (error) {
    return {
      ok: false,
      pointers: {},
      diagnostics: [
        {
          code: "GHDL-E1001",
          severity: "error",
          stage: "parse",
          message: `JSON 语法错误：${error instanceof Error ? error.message : String(error)}`,
          hint: "请修正 JSON 语法后重新编译。",
          jsonPointer: "",
          location: syntaxErrorLocation(source, error),
        },
      ],
    };
  }
}

export function pointerLocation(pointers: PointerMap, pointer: string): SourceLocation | undefined {
  let current = pointer;
  while (true) {
    const mapping = pointers[current];
    if (mapping) {
      const position = mapping.value ?? mapping.key;
      return { line: position.line + 1, column: position.column + 1 };
    }
    const slash = current.lastIndexOf("/");
    if (slash < 0) {
      return undefined;
    }
    current = current.slice(0, slash);
  }
}
