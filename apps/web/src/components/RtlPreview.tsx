import type { GeneratedArtifact } from "@graphicalhdl/ir";

interface RtlPreviewProps {
  artifacts: readonly GeneratedArtifact[];
  selectedPath?: string | undefined;
  onSelectPath: (path: string) => void;
}

export function RtlPreview({ artifacts, selectedPath, onSelectPath }: RtlPreviewProps) {
  const rtlArtifacts = artifacts.filter((artifact) => artifact.path.endsWith(".sv"));
  const active = rtlArtifacts.find((artifact) => artifact.path === selectedPath) ?? rtlArtifacts[0];
  return (
    <section className="bottom-panel rtl-panel">
      <div className="bottom-panel__header">
        <strong>Generated SystemVerilog</strong>
        <select
          value={active?.path ?? ""}
          onChange={(event) => onSelectPath(event.target.value)}
          disabled={rtlArtifacts.length === 0}
        >
          {rtlArtifacts.map((artifact) => (
            <option key={artifact.path} value={artifact.path}>
              {artifact.path}
            </option>
          ))}
        </select>
      </div>
      <pre className="rtl-code">{active?.content ?? "设计存在错误，修复后才能生成 RTL。"}</pre>
    </section>
  );
}
