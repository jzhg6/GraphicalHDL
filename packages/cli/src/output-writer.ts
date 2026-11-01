import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ArtifactManifest, GeneratedArtifact } from "@graphicalhdl/ir";

interface ScannedEntry {
  path: string;
  kind: "file" | "directory" | "symlink" | "special";
}

interface OwnedOutput {
  files: Set<string>;
  directories: Set<string>;
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const OWNED_ARTIFACT_PATTERN =
  /^(graphicalhdl\.f|report\/(diagnostics|source-map)\.json|rtl\/[A-Za-z_][A-Za-z0-9_]*\.sv)$/;

function validateArtifactPath(artifactPath: string): void {
  if (
    path.isAbsolute(artifactPath) ||
    artifactPath.split("/").some((segment) => segment === ".." || segment === "")
  ) {
    throw new Error(`非法 artifact path: ${artifactPath}`);
  }
}

function ownedDirectories(files: Iterable<string>): Set<string> {
  const directories = new Set<string>();
  for (const file of files) {
    let directory = path.posix.dirname(file);
    while (directory !== ".") {
      directories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }
  return directories;
}

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch {
    return false;
  }
}

async function scanEntries(root: string, relative = ""): Promise<ScannedEntry[]> {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const scanned: ScannedEntry[] = [];
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      scanned.push({ path: child, kind: "directory" });
      scanned.push(...(await scanEntries(root, child)));
    } else if (entry.isFile()) {
      scanned.push({ path: child, kind: "file" });
    } else if (entry.isSymbolicLink()) {
      scanned.push({ path: child, kind: "symlink" });
    } else {
      scanned.push({ path: child, kind: "special" });
    }
  }
  return scanned.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
}

function isManifest(value: unknown): value is ArtifactManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const topLevelKeys = new Set([
    "formatVersion",
    "compilerVersion",
    "semanticHash",
    "topModule",
    "files",
  ]);
  if (
    Object.keys(record).length !== topLevelKeys.size ||
    Object.keys(record).some((key) => !topLevelKeys.has(key)) ||
    record.formatVersion !== "0.1" ||
    record.compilerVersion !== "0.1.0" ||
    typeof record.semanticHash !== "string" ||
    !HASH_PATTERN.test(record.semanticHash) ||
    typeof record.topModule !== "string" ||
    !Array.isArray(record.files)
  ) {
    return false;
  }
  return record.files.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const fields = entry as Record<string, unknown>;
    return (
      Object.keys(fields).length === 2 &&
      typeof fields.path === "string" &&
      OWNED_ARTIFACT_PATTERN.test(fields.path) &&
      typeof fields.sha256 === "string" &&
      HASH_PATTERN.test(fields.sha256)
    );
  });
}

async function readOwnedOutput(outputDir: string): Promise<OwnedOutput | undefined> {
  const manifestPath = path.join(outputDir, "manifest.json");
  if (!(await pathExists(manifestPath))) return undefined;
  const manifestStat = await lstat(manifestPath);
  if (!manifestStat.isFile()) {
    throw new Error("旧 manifest.json 不是普通文件，拒绝覆盖输出目录");
  }

  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
    if (!isManifest(parsed)) {
      throw new Error("格式或版本不是 GraphicalHDL v0.1 manifest");
    }
    const paths = parsed.files.map((entry) => entry.path);
    if (new Set(paths).size !== paths.length) {
      throw new Error("manifest 包含重复 artifact path");
    }
    for (const entry of parsed.files) {
      validateArtifactPath(entry.path);
      const artifactPath = path.join(outputDir, entry.path);
      const artifactStat = await lstat(artifactPath);
      if (!artifactStat.isFile()) {
        throw new Error(`${entry.path} 不是普通文件`);
      }
      const actualHash = sha256(await readFile(artifactPath));
      if (actualHash !== entry.sha256) {
        throw new Error(`${entry.path} 的 SHA-256 与 manifest 不一致`);
      }
    }
    const files = new Set(["manifest.json", ...paths]);
    return { files, directories: ownedDirectories(files) };
  } catch (error) {
    throw new Error(
      `无法验证旧 manifest.json：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function assertSafeToReplace(outputDir: string): Promise<void> {
  if (!(await pathExists(outputDir))) return;
  const rootStat = await lstat(outputDir);
  if (!rootStat.isDirectory()) {
    throw new Error(`输出路径不是普通目录：${outputDir}`);
  }
  const entries = await scanEntries(outputDir);
  if (entries.length === 0) return;
  const owned = await readOwnedOutput(outputDir);
  if (!owned) {
    throw new Error(`拒绝覆盖未知非空目录：${outputDir}`);
  }
  const unknown = entries.filter((entry) =>
    entry.kind === "file"
      ? !owned.files.has(entry.path)
      : entry.kind === "directory"
        ? !owned.directories.has(entry.path)
        : true,
  );
  if (unknown.length > 0) {
    throw new Error(
      `输出目录包含 Compiler 不拥有的条目：${unknown.map((entry) => `${entry.path} (${entry.kind})`).join(", ")}`,
    );
  }
}

async function writeStaging(
  stagingDir: string,
  artifacts: readonly GeneratedArtifact[],
): Promise<void> {
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });
  const paths = new Set<string>();
  for (const artifact of artifacts) {
    validateArtifactPath(artifact.path);
    if (paths.has(artifact.path)) throw new Error(`重复 artifact path: ${artifact.path}`);
    paths.add(artifact.path);
    const destination = path.join(stagingDir, artifact.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, artifact.content, "utf8");
  }
}

export async function writeArtifacts(
  outputDir: string,
  artifacts: readonly GeneratedArtifact[],
): Promise<void> {
  const resolved = path.resolve(outputDir);
  await assertSafeToReplace(resolved);
  const parent = path.dirname(resolved);
  const base = path.basename(resolved);
  const staging = path.join(parent, `.${base}.graphicalhdl-stage-${process.pid}`);
  const backup = path.join(parent, `.${base}.graphicalhdl-backup-${process.pid}`);
  await mkdir(parent, { recursive: true });
  await writeStaging(staging, artifacts);

  const hadOutput = await pathExists(resolved);
  await rm(backup, { recursive: true, force: true });
  try {
    if (hadOutput) await rename(resolved, backup);
    await rename(staging, resolved);
    await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (!(await pathExists(resolved)) && (await pathExists(backup))) {
      await rename(backup, resolved);
    }
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function checkArtifacts(
  outputDir: string,
  artifacts: readonly GeneratedArtifact[],
): Promise<string[]> {
  const resolved = path.resolve(outputDir);
  if (!(await pathExists(resolved))) return [`输出目录不存在：${resolved}`];
  const rootStat = await lstat(resolved);
  if (!rootStat.isDirectory()) return [`输出路径不是普通目录：${resolved}`];

  const expected = new Map(artifacts.map((artifact) => [artifact.path, artifact.content]));
  const expectedDirectories = ownedDirectories(expected.keys());
  const mismatches: string[] = [];
  for (const [artifactPath, content] of expected) {
    validateArtifactPath(artifactPath);
    try {
      const artifactStat = await lstat(path.join(resolved, artifactPath));
      if (!artifactStat.isFile()) {
        mismatches.push(`不是普通文件：${artifactPath}`);
        continue;
      }
      const actual = await readFile(path.join(resolved, artifactPath), "utf8");
      if (actual !== content) mismatches.push(`内容漂移：${artifactPath}`);
    } catch {
      mismatches.push(`缺少文件：${artifactPath}`);
    }
  }
  for (const entry of await scanEntries(resolved)) {
    const expectedEntry =
      entry.kind === "file"
        ? expected.has(entry.path)
        : entry.kind === "directory"
          ? expectedDirectories.has(entry.path)
          : false;
    if (!expectedEntry) mismatches.push(`多余条目：${entry.path} (${entry.kind})`);
  }
  return mismatches.sort();
}
