# Compiler pipeline

`packages/compiler` 是一个不访问 filesystem、DOM 或 `process` 的 pure TypeScript library，可同时运行在 Node CLI 和浏览器中。

## 公共 API

```ts
compileJson(source: string, options?: CompileOptions): CompileResult;
compileDocument(document: unknown, options?: CompileOptions): CompileResult;
getPrimitiveCatalog(): readonly PrimitiveCatalogEntry[];
```

用户输入错误通过 `CompileResult.ok=false` 返回，不抛普通 exception。只有 Compiler invariant 破坏才使用 `InternalCompilerError`。

## 阶段

1. **Parse**：`json-source-map` 解析 JSON，建立 JSON Pointer 到 line/column 的映射。
2. **Schema**：Ajv 2020 校验结构、unknown field、union 和版本。
3. **Index**：建立 module/port/instance/primitive symbol table，检查 scoped ID/name。
4. **Resolve**：解析 module reference、endpoint 和 pin。
5. **Type**：检查方向、位宽、required input 和 one-driver/many-sink。
6. **Clock/reset**：检查唯一 Clock domain 和 Register 直连。
7. **Graph**：检测 combinational cycle、未驱动 output 和跨 module feedback。
8. **Normalize**：移除 layout、稳定排序、规范 literal、计算 semantic hash。
9. **Codegen**：输出每 module 一个 SystemVerilog 文件和 top。
10. **Report**：输出 filelist、diagnostics、source map 和 manifest。

任何 error 都会阻断 codegen；warning 不阻断。checked-in 示例必须 zero-warning。

## Diagnostic

Diagnostic 包含：

- 稳定 code，例如 `GHDL-E4002`。
- `severity` 和 `stage`。
- 中文 `message` 与 `hint`。
- 原始 JSON Pointer 和可用的 line/column。
- `target`：Level、owner ID、element ID、可选 pin/port。
- 可选 `related`，用于 duplicate definition 或 driver/sink 两端定位。

Web editor 使用 `target` 切换层级和聚焦图元，CLI 使用 line/column 输出文本位置。

## Generated source map

`report/source-map.json` 不是 JavaScript Source Map。每条 mapping 包含：

- artifact path
- generated start/end line
- normalized IR JSON Pointer
- Level、owner ID、element ID
- 可选 pin/net ID

JSON Pointer 指向 normalized IR，以保持 array reorder 后 artifact deterministic；稳定图元 ID 用于映射回编辑器中的原始对象。

## Deterministic codegen

Emitter 保证：

- fixed indentation 和 newline
- stable sort
- canonical literal
- 无 timestamp
- 无 absolute path
- 无随机 ID
- manifest 对每个 artifact 记录 SHA-256

CLI `check` 会在内存中重新生成并逐字比较磁盘内容，不修改任何文件。
