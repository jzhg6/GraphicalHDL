#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileJson, type CompileResult } from "@graphicalhdl/compiler";
import type { Diagnostic } from "@graphicalhdl/ir";
import { Command } from "commander";
import { checkArtifacts, writeArtifacts } from "./output-writer";

interface CommonOptions {
  format: "pretty" | "json";
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  const location = diagnostic.location
    ? `${diagnostic.location.line}:${diagnostic.location.column}`
    : diagnostic.jsonPointer || "/";
  const severity = diagnostic.severity === "error" ? "错误" : "警告";
  const lines = [`${severity} ${diagnostic.code} ${location} ${diagnostic.message}`];
  if (diagnostic.hint) {
    lines.push(`  建议：${diagnostic.hint}`);
  }
  return lines.join("\n");
}

function resultSummary(result: CompileResult): Record<string, unknown> {
  return {
    ok: result.ok,
    diagnostics: result.diagnostics,
    ...(result.ok
      ? {
          semanticHash: result.normalizedIr.semanticHash,
          artifactPaths: result.artifacts.map((artifact) => artifact.path),
        }
      : {}),
  };
}

function printResult(result: CompileResult, format: CommonOptions["format"]): void {
  if (format === "json") {
    console.log(JSON.stringify(resultSummary(result), null, 2));
    return;
  }
  if (result.diagnostics.length === 0) {
    console.log("校验通过：0 个错误，0 个警告");
  } else {
    for (const diagnostic of result.diagnostics) {
      console.log(formatDiagnostic(diagnostic));
    }
  }
  if (result.ok) {
    console.log(`Semantic hash：${result.normalizedIr.semanticHash}`);
  }
}

async function compileInput(input: string): Promise<CompileResult> {
  const source = await readFile(resolve(input), "utf8");
  return compileJson(source);
}

function addFormatOption(command: Command): Command {
  return command.option("--format <format>", "输出格式：pretty 或 json", "pretty");
}

const program = new Command();
program
  .name("graphicalhdl")
  .description("将 GraphicalHDL JSON 编译为可综合 SystemVerilog")
  .version("0.1.0")
  .showHelpAfterError();

addFormatOption(program.command("validate <input>").description("校验设计但不写入生成物")).action(
  async (input: string, options: CommonOptions) => {
    const result = await compileInput(input);
    printResult(result, options.format);
    if (!result.ok) {
      process.exitCode = 1;
    }
  },
);

addFormatOption(
  program
    .command("compile <input>")
    .description("编译设计并写入完整 RTL 工程")
    .requiredOption("--out <directory>", "输出目录"),
).action(async (input: string, options: CommonOptions & { out: string }) => {
  const result = await compileInput(input);
  printResult(result, options.format);
  if (!result.ok) {
    process.exitCode = 1;
    return;
  }
  await writeArtifacts(options.out, result.artifacts);
  if (options.format === "pretty") {
    console.log(`已生成 ${result.artifacts.length} 个文件到 ${resolve(options.out)}`);
  }
});

addFormatOption(
  program
    .command("check <input>")
    .description("比较磁盘生成物，不修改文件")
    .requiredOption("--out <directory>", "已生成工程目录"),
).action(async (input: string, options: CommonOptions & { out: string }) => {
  const result = await compileInput(input);
  if (options.format === "pretty") printResult(result, options.format);
  if (!result.ok) {
    if (options.format === "json") printResult(result, options.format);
    process.exitCode = 1;
    return;
  }
  const mismatches = await checkArtifacts(options.out, result.artifacts);
  if (options.format === "json") {
    console.log(
      JSON.stringify(
        { ...resultSummary(result), inSync: mismatches.length === 0, mismatches },
        null,
        2,
      ),
    );
  } else if (mismatches.length === 0) {
    console.log("生成物校验通过");
  } else {
    for (const mismatch of mismatches) {
      console.error(mismatch);
    }
  }
  if (mismatches.length > 0) {
    process.exitCode = 2;
  }
});

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
