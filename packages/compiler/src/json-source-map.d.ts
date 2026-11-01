declare module "json-source-map" {
  export interface JsonSourcePosition {
    line: number;
    column: number;
    pos: number;
  }

  export interface JsonSourceMapping {
    key?: JsonSourcePosition;
    keyEnd?: JsonSourcePosition;
    value: JsonSourcePosition;
    valueEnd: JsonSourcePosition;
  }

  export interface JsonSourceResult {
    data: unknown;
    pointers: Record<string, JsonSourceMapping>;
  }

  export function parse(source: string): JsonSourceResult;
}
