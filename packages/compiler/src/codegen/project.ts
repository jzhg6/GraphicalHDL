import type {
  ArtifactManifest,
  DesignDocument,
  Diagnostic,
  GeneratedArtifact,
  GeneratedSourceRange,
  NormalizedDesign,
} from "@graphicalhdl/ir";
import { compareText, sha256Text } from "../canonical";
import { emitSystemVerilog } from "./systemverilog";

export interface EmittedProject {
  artifacts: GeneratedArtifact[];
  sourceMap: GeneratedSourceRange[];
  manifest: ArtifactManifest;
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function emitProject(
  design: NormalizedDesign,
  original: DesignDocument,
  diagnostics: readonly Diagnostic[],
): EmittedProject {
  const emitted = emitSystemVerilog(design, original);
  const rtlPaths = emitted.artifacts.map((artifact) => artifact.path).sort();
  const artifacts: GeneratedArtifact[] = [
    ...emitted.artifacts,
    {
      path: "graphicalhdl.f",
      content: `${rtlPaths.join("\n")}\n`,
    },
    {
      path: "report/diagnostics.json",
      content: prettyJson({
        formatVersion: "0.1",
        semanticHash: design.semanticHash,
        diagnostics,
      }),
    },
    {
      path: "report/source-map.json",
      content: prettyJson({
        formatVersion: "0.1",
        semanticHash: design.semanticHash,
        mappings: emitted.sourceMap,
      }),
    },
  ].sort((left, right) => compareText(left.path, right.path));

  const manifest: ArtifactManifest = {
    formatVersion: "0.1",
    compilerVersion: "0.1.0",
    semanticHash: design.semanticHash,
    topModule: design.project.topModuleName,
    files: artifacts.map((artifact) => ({
      path: artifact.path,
      sha256: sha256Text(artifact.content),
    })),
  };
  artifacts.push({ path: "manifest.json", content: prettyJson(manifest) });

  return { artifacts, sourceMap: emitted.sourceMap, manifest };
}
