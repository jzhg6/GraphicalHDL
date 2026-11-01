import type { Primitive } from "./generated/design-document";

export type PinDirection = "input" | "output";
export type PinRole = "data" | "control" | "clock" | "reset";

export interface PrimitivePin {
  name: string;
  direction: PinDirection;
  width: number;
  role: PinRole;
}

export interface PrimitiveCatalogEntry {
  kind: Primitive["kind"];
  label: string;
  description: string;
  stateful: boolean;
  inputPins: readonly string[];
  outputPins: readonly string[];
}

export const PRIMITIVE_CATALOG: readonly PrimitiveCatalogEntry[] = [
  {
    kind: "const",
    label: "Constant",
    description: "输出固定无符号值。",
    stateful: false,
    inputPins: [],
    outputPins: ["y"],
  },
  {
    kind: "add",
    label: "Adder",
    description: "同位宽无符号加法，溢出按模截断。",
    stateful: false,
    inputPins: ["a", "b"],
    outputPins: ["y"],
  },
  {
    kind: "mul",
    label: "Multiplier",
    description: "无符号全宽乘法。",
    stateful: false,
    inputPins: ["a", "b"],
    outputPins: ["y"],
  },
  {
    kind: "mux2",
    label: "2:1 Mux",
    description: "sel=0 选择 a，sel=1 选择 b。",
    stateful: false,
    inputPins: ["a", "b", "sel"],
    outputPins: ["y"],
  },
  {
    kind: "reg",
    label: "Register",
    description: "posedge Clock、同步高有效 reset 的 Register。",
    stateful: true,
    inputPins: ["d", "clk", "rst"],
    outputPins: ["q"],
  },
] as const;

export function getPrimitiveCatalogEntry(kind: Primitive["kind"]): PrimitiveCatalogEntry {
  const entry = PRIMITIVE_CATALOG.find((candidate) => candidate.kind === kind);
  if (!entry) {
    throw new Error(`未知 primitive: ${kind}`);
  }
  return entry;
}

export function getPrimitivePins(primitive: Primitive): readonly PrimitivePin[] {
  switch (primitive.kind) {
    case "const":
      return [{ name: "y", direction: "output", width: primitive.width, role: "data" }];
    case "add":
      return [
        { name: "a", direction: "input", width: primitive.width, role: "data" },
        { name: "b", direction: "input", width: primitive.width, role: "data" },
        { name: "y", direction: "output", width: primitive.width, role: "data" },
      ];
    case "mul":
      return [
        { name: "a", direction: "input", width: primitive.aWidth, role: "data" },
        { name: "b", direction: "input", width: primitive.bWidth, role: "data" },
        {
          name: "y",
          direction: "output",
          width: primitive.aWidth + primitive.bWidth,
          role: "data",
        },
      ];
    case "mux2":
      return [
        { name: "a", direction: "input", width: primitive.width, role: "data" },
        { name: "b", direction: "input", width: primitive.width, role: "data" },
        { name: "sel", direction: "input", width: 1, role: "control" },
        { name: "y", direction: "output", width: primitive.width, role: "data" },
      ];
    case "reg":
      return [
        { name: "d", direction: "input", width: primitive.width, role: "data" },
        { name: "clk", direction: "input", width: 1, role: "clock" },
        { name: "rst", direction: "input", width: 1, role: "reset" },
        { name: "q", direction: "output", width: primitive.width, role: "data" },
      ];
  }
}
