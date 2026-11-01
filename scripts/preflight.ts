import { spawnSync } from "node:child_process";

interface ToolStatus {
  name: string;
  available: boolean;
  version?: string;
  required: boolean;
}

function inspect(name: string, args: string[], required: boolean): ToolStatus {
  const result = spawnSync(name, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    return { name, available: false, required };
  }
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  const version = text
    .split("\n")
    .find((line) => line.trim().length > 0)
    ?.trim();
  return version
    ? { name, available: true, version, required }
    : { name, available: true, required };
}

const tools = [
  inspect("node", ["--version"], true),
  inspect("npm", ["--version"], true),
  inspect("verilator", ["--version"], false),
  inspect("iverilog", ["-V"], false),
  inspect("yosys", ["-V"], false),
];

for (const tool of tools) {
  const state = tool.available ? "OK" : tool.required ? "MISSING" : "NOT AVAILABLE";
  console.log(`${state.padEnd(13)} ${tool.name}${tool.version ? `: ${tool.version}` : ""}`);
}

if (tools.some((tool) => tool.required && !tool.available)) {
  process.exitCode = 1;
}
