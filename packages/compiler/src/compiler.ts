import type {
  ArtifactManifest,
  DesignDocument,
  Diagnostic,
  GeneratedArtifact,
  GeneratedSourceRange,
  NormalizedDesign,
  PrimitiveCatalogEntry,
} from "@graphicalhdl/ir";
import { PRIMITIVE_CATALOG } from "@graphicalhdl/ir";
import { compareText } from "./canonical";
import { emitProject } from "./codegen/project";
import { type PointerMap, parseJson, pointerLocation } from "./parse";
import { validateSchema } from "./schema-validator";
import { buildDesignIndex } from "./semantic/context";
import { validateSemantics } from "./semantic/validate";
import { normalizeDesign } from "./normalize";

export interface CompileOptions {
  emitArtifacts?: boolean;
}

export interface CompileSuccess {
  ok: true;
  diagnostics: Diagnostic[];
  normalizedIr: NormalizedDesign;
  artifacts: GeneratedArtifact[];
  sourceMap: GeneratedSourceRange[];
  manifest: ArtifactManifest;
}

export interface CompileFailure {
  ok: false;
  diagnostics: Diagnostic[];
}

export type CompileResult = CompileSuccess | CompileFailure;

function attachLocations(diagnostics: Diagnostic[], pointers: PointerMap): Diagnostic[] {
  return diagnostics.map((diagnostic) => {
    const location = diagnostic.location ?? pointerLocation(pointers, diagnostic.jsonPointer);
    const related = diagnostic.related?.map((item) => {
      const relatedLocation = item.location ?? pointerLocation(pointers, item.jsonPointer);
      return relatedLocation ? { ...item, location: relatedLocation } : item;
    });
    return {
      ...diagnostic,
      ...(location ? { location } : {}),
      ...(related ? { related } : {}),
    };
  });
}

function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const severityOrder = left.severity === right.severity ? 0 : left.severity === "error" ? -1 : 1;
    if (severityOrder !== 0) {
      return severityOrder;
    }
    const pointerOrder = compareText(left.jsonPointer, right.jsonPointer);
    return pointerOrder !== 0 ? pointerOrder : compareText(left.code, right.code);
  });
}

function compileValidatedDocument(
  document: DesignDocument,
  pointers: PointerMap,
  options: CompileOptions,
): CompileResult {
  const indexed = buildDesignIndex(document);
  const diagnostics = sortDiagnostics(
    attachLocations([...indexed.diagnostics, ...validateSemantics(indexed.index)], pointers),
  );
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { ok: false, diagnostics };
  }

  const normalizedIr = normalizeDesign(document);
  const project = emitProject(normalizedIr, document, diagnostics);
  return {
    ok: true,
    diagnostics,
    normalizedIr,
    artifacts: options.emitArtifacts === false ? [] : project.artifacts,
    sourceMap: project.sourceMap,
    manifest: project.manifest,
  };
}

export function compileJson(source: string, options: CompileOptions = {}): CompileResult {
  const parsed = parseJson(source);
  if (!parsed.ok) {
    return parsed;
  }
  const schemaDiagnostics = validateSchema(parsed.document);
  if (schemaDiagnostics.length > 0) {
    return {
      ok: false,
      diagnostics: sortDiagnostics(attachLocations(schemaDiagnostics, parsed.pointers)),
    };
  }
  return compileValidatedDocument(parsed.document as DesignDocument, parsed.pointers, options);
}

export function compileDocument(document: unknown, options: CompileOptions = {}): CompileResult {
  const schemaDiagnostics = validateSchema(document);
  if (schemaDiagnostics.length > 0) {
    return { ok: false, diagnostics: sortDiagnostics(schemaDiagnostics) };
  }
  return compileValidatedDocument(document as DesignDocument, {}, options);
}

export function getPrimitiveCatalog(): readonly PrimitiveCatalogEntry[] {
  return PRIMITIVE_CATALOG;
}
