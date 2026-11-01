import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generated = path.join(root, "build/mac-accumulator/rtl");
const rtlSources = [
  path.join(generated, "mac_core.sv"),
  path.join(generated, "output_stage.sv"),
  path.join(generated, "mac_demo_top.sv"),
];

function available(command: string, args = ["--version"]): boolean {
  return spawnSync(command, args, { stdio: "ignore" }).status === 0;
}

function run(command: string, args: string[], cwd = root): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} 退出码 ${result.status ?? "unknown"}`);
  }
}

function lint(): void {
  if (!available("verilator")) {
    throw new Error("Verilator 未安装，RTL lint 未执行");
  }
  run("verilator", [
    "--lint-only",
    "-Wall",
    "--Wno-fatal",
    "--top-module",
    "mac_demo_top",
    ...rtlSources,
  ]);
}

function simulate(): void {
  if (!available("iverilog", ["-V"])) {
    throw new Error("Icarus Verilog 未安装，RTL simulation 未执行");
  }
  const outputDir = path.join(root, "build/rtl-sim");
  mkdirSync(outputDir, { recursive: true });
  const executable = path.join(outputDir, "mac_accumulator.vvp");
  run("iverilog", [
    "-g2012",
    "-s",
    "mac_accumulator_tb",
    "-o",
    executable,
    ...rtlSources,
    path.join(root, "tests/rtl/mac_accumulator_tb.sv"),
  ]);
  run("vvp", [executable]);
}

function synthesize(): void {
  if (!available("yosys", ["-V"])) {
    throw new Error("Yosys 未安装，RTL synthesis 未执行");
  }
  mkdirSync(path.join(root, "build/yosys"), { recursive: true });
  run("yosys", ["-s", path.join(root, "verification/yosys/synth.ys")]);
}

const action = process.argv[2];
try {
  if (action === "lint") {
    lint();
  } else if (action === "sim") {
    simulate();
  } else if (action === "synth") {
    synthesize();
  } else {
    throw new Error("用法：verify-rtl.ts <lint|sim|synth>");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
