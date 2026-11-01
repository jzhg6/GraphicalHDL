import type { GraphicalHDLDesignDocumentV01 } from "./generated/design-document";

export interface GeneratedArtifact {
  path: string;
  content: string;
}

export interface GeneratedSourceRange {
  artifactPath: string;
  startLine: number;
  endLine: number;
  jsonPointer: string;
  level: 1 | 2 | 3;
  ownerId: string;
  elementId: string;
  pinOrNetId?: string;
}

export type SemanticDocument = Omit<GraphicalHDLDesignDocumentV01, "layout">;

export interface NormalizedDesign extends SemanticDocument {
  semanticHash: string;
}

export interface ArtifactManifestEntry {
  path: string;
  sha256: string;
}

export interface ArtifactManifest {
  formatVersion: "0.1";
  compilerVersion: "0.1.0";
  semanticHash: string;
  topModule: string;
  files: ArtifactManifestEntry[];
}
