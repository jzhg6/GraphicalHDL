# 开发与验证

## 环境

硬要求：

- Node.js 22+
- npm 10+

可选 RTL 工具：

- Verilator：lint
- Icarus Verilog：self-checking simulation
- Yosys：generic synthesis
- Chromium/Playwright：Web E2E

`npm run preflight` 只报告状态，不自动安装系统工具。缺少可选工具时，不得把对应门禁声明为已通过。

## 常用命令

```bash
npm run generate          # 更新 Schema 派生类型与文档
npm run generate:check    # 检查派生产物漂移
npm run format
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run dev
```

## RTL 验证

先生成示例：

```bash
npm run example:compile
npm run example:check
```

再执行独立门禁：

```bash
npm run rtl:lint
npm run rtl:sim
npm run rtl:synth
```

`tests/rtl/mac_accumulator_tb.sv` 是独立 self-checking testbench，覆盖 synchronous reset、pipeline fill/drain、覆盖写和连续 accumulation。它不使用 Compiler 自己的 reference model，以减少 common-mode bug。

## 测试分层

- `tests/contract/schema.test.ts`：Schema meta/正反合同和 parse location。
- `tests/contract/compiler.test.ts`：semantic rule、diagnostic target、determinism。
- `tests/unit/output-writer.test.ts`：staging、drift 和未知目录保护。
- `tests/unit/editor-model.test.ts`：三层 graph adapter 与 editor reducer。
- `tests/rtl/`：生成 RTL 的独立行为测试。
- `tests/e2e/`：浏览器中的三层导航、属性编辑、实时 diagnostic 和 RTL preview。

## Output ownership

CLI 仅在完整编译成功后写文件：

1. 检查目标目录是否为空，或是否包含有效旧 manifest。
2. 在目标目录同级创建 staging directory。
3. 写入全部新 artifact。
4. 原子替换旧目录。
5. 只覆盖 manifest 明确拥有的文件。

未知非空目录或 Compiler 不拥有的额外文件会阻止覆盖。

## 新增 primitive

1. 扩展 JSON Schema 中的 discriminated `primitive` union。
2. 更新 `packages/ir/src/primitives.ts` 的 catalog 和 pin width function。
3. 更新 semantic checks（如有额外 invariant）。
4. 在 SystemVerilog emitter 中添加 lowering。
5. 添加正反 contract test、golden output 和独立 RTL behavior test。
6. 运行 `npm run generate` 和全部门禁。

Schema、catalog 和 emitter 的 primitive kind 集合必须保持一致。
