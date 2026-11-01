export type DiagnosticSeverity = "error" | "warning";
export type CompilerStage =
  | "parse"
  | "schema"
  | "index"
  | "resolve"
  | "type"
  | "clock-reset"
  | "graph"
  | "codegen"
  | "output";

export interface SourceLocation {
  line: number;
  column: number;
}

export interface DiagnosticTarget {
  level: 1 | 2 | 3;
  ownerId: string;
  elementId: string;
  pinOrPort?: string;
}

export interface RelatedDiagnosticLocation {
  message: string;
  jsonPointer: string;
  location?: SourceLocation;
  target?: DiagnosticTarget;
}

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  stage: CompilerStage;
  message: string;
  hint?: string;
  jsonPointer: string;
  location?: SourceLocation;
  target?: DiagnosticTarget;
  related?: RelatedDiagnosticLocation[];
}
