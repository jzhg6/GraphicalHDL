import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { compileDocument } from "@graphicalhdl/compiler";
import type { DesignDocument } from "@graphicalhdl/ir";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { writeArtifacts } from "../../packages/cli/src/output-writer";

const root = path.resolve(import.meta.dirname, "../..");
const temporaryDirectories: string[] = [];
let document: DesignDocument;

beforeAll(async () => {
  document = JSON.parse(
    await readFile(path.join(root, "examples/mac-accumulator/design.json"), "utf8"),
  ) as DesignDocument;
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("CLI machine-readable output", () => {
  it("check --format json 只输出一个 JSON document", async () => {
    const result = compileDocument(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parent = await mkdtemp(path.join(tmpdir(), "graphicalhdl-cli-test-"));
    temporaryDirectories.push(parent);
    const output = path.join(parent, "generated");
    await writeArtifacts(output, result.artifacts);

    const command = spawnSync(
      path.join(root, "node_modules/.bin/tsx"),
      [
        path.join(root, "packages/cli/src/main.ts"),
        "check",
        path.join(root, "examples/mac-accumulator/design.json"),
        "--out",
        output,
        "--format",
        "json",
      ],
      { cwd: root, encoding: "utf8" },
    );
    expect(command.status, command.stderr).toBe(0);
    const payload = JSON.parse(command.stdout) as {
      ok: boolean;
      inSync: boolean;
      mismatches: string[];
    };
    expect(payload).toMatchObject({ ok: true, inSync: true, mismatches: [] });
  });
});
