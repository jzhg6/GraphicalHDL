import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { compileDocument } from "@graphicalhdl/compiler";
import type { DesignDocument } from "@graphicalhdl/ir";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { checkArtifacts, writeArtifacts } from "../../packages/cli/src/output-writer";

const temporaryDirectories: string[] = [];
let document: DesignDocument;

beforeAll(async () => {
  document = JSON.parse(
    await readFile(
      path.resolve(import.meta.dirname, "../../examples/mac-accumulator/design.json"),
      "utf8",
    ),
  ) as DesignDocument;
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "graphicalhdl-output-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("安全 output writer", () => {
  it("写入并检查完整 artifact 集合", async () => {
    const result = compileDocument(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parent = await temporaryDirectory();
    const output = path.join(parent, "generated");
    await writeArtifacts(output, result.artifacts);
    expect(await checkArtifacts(output, result.artifacts)).toEqual([]);
  });

  it("检测内容漂移且 check 不写文件", async () => {
    const result = compileDocument(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parent = await temporaryDirectory();
    const output = path.join(parent, "generated");
    await writeArtifacts(output, result.artifacts);
    const target = path.join(output, "rtl/mac_core.sv");
    await writeFile(target, "drift\n", "utf8");
    expect(await checkArtifacts(output, result.artifacts)).toContain("内容漂移：rtl/mac_core.sv");
    expect(await readFile(target, "utf8")).toBe("drift\n");
  });

  it("拒绝覆盖未知非空目录", async () => {
    const result = compileDocument(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = await temporaryDirectory();
    await writeFile(path.join(output, "user.txt"), "do not delete", "utf8");
    await expect(writeArtifacts(output, result.artifacts)).rejects.toThrow("拒绝覆盖未知非空目录");
    expect(await readFile(path.join(output, "user.txt"), "utf8")).toBe("do not delete");
  });

  it("拒绝 foreign manifest 冒充文件所有权", async () => {
    const result = compileDocument(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = await temporaryDirectory();
    await writeFile(path.join(output, "user.txt"), "do not delete", "utf8");
    await writeFile(
      path.join(output, "manifest.json"),
      JSON.stringify({
        formatVersion: "0.1",
        compilerVersion: "0.1.0",
        semanticHash: "0".repeat(64),
        topModule: "foreign",
        files: [{ path: "user.txt", sha256: "0".repeat(64) }],
      }),
      "utf8",
    );
    await expect(writeArtifacts(output, result.artifacts)).rejects.toThrow(
      "无法验证旧 manifest.json",
    );
    expect(await readFile(path.join(output, "user.txt"), "utf8")).toBe("do not delete");
  });

  it("拒绝删除 manifest 未拥有的 symlink", async () => {
    const result = compileDocument(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parent = await temporaryDirectory();
    const output = path.join(parent, "generated");
    await writeArtifacts(output, result.artifacts);
    const link = path.join(output, "user-link");
    await symlink("rtl/mac_core.sv", link);
    await expect(writeArtifacts(output, result.artifacts)).rejects.toThrow("不拥有的条目");
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await checkArtifacts(output, result.artifacts)).toContain(
      "多余条目：user-link (symlink)",
    );
  });

  it("旧 artifact 漂移时拒绝覆盖", async () => {
    const result = compileDocument(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parent = await temporaryDirectory();
    const output = path.join(parent, "generated");
    await writeArtifacts(output, result.artifacts);
    await writeFile(path.join(output, "rtl/mac_core.sv"), "user changed\n", "utf8");
    await expect(writeArtifacts(output, result.artifacts)).rejects.toThrow("SHA-256");
    expect(await readFile(path.join(output, "rtl/mac_core.sv"), "utf8")).toBe("user changed\n");
  });
});
