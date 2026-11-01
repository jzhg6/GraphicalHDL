# GraphicalHDL IR v0.1

权威格式由 `schemas/graphicalhdl-design.schema.json` 定义。本文件解释 Schema 之外的跨对象语义。

## 顶层结构

```json
{
  "schemaVersion": "0.1",
  "project": {},
  "design": {},
  "layout": {}
}
```

- `project`：工程 ID、显示名称、生成的 top module 名称。
- `design`：唯一参与 Compiler 语义和 RTL 生成的数据。
- `layout`：view、node position 和 viewport；可省略，不参与 semantic hash。

只修改 `layout` 不得改变 normalized IR、semantic hash 或任何生成 artifact。

## 三层映射

| 层级    | JSON 位置                         | 内容                                  |
| ------- | --------------------------------- | ------------------------------------- |
| Level 1 | `design.top`                      | top ports、module instances、top nets |
| Level 2 | `design.modules[].ports`          | module interface                      |
| Level 3 | `design.modules[].implementation` | primitive 和 internal nets            |

v0.1 固定为这三层，不支持 module implementation 内再次实例化任意 module。

## 稳定 ID 与 RTL 名称

`id` 用于引用、diagnostic 和 UI selection；`name` 用于生成 SystemVerilog identifier。两者不可混用：

- ID 在对应作用域内唯一，修改显示位置时保持不变。
- Name 必须匹配 `[A-Za-z_][A-Za-z0-9_]*`。
- SystemVerilog keyword 被 semantic checker 拒绝。
- Compiler 不自动 sanitize 名称。

## Net

每条 net 固定包含一个 `driver` 和至少一个 `sink`：

```json
{
  "id": "net_sum",
  "name": "sum_value",
  "driver": { "kind": "primitivePin", "primitiveId": "adder", "pin": "y" },
  "sinks": [{ "kind": "primitivePin", "primitiveId": "result_reg", "pin": "d" }]
}
```

一条 net 可 fanout。一个 endpoint 不得被多条 net 重复驱动或重复用作 driver。

Level 1 endpoint：

- `topPort`
- `instancePort`

Level 3 endpoint：

- `modulePort`
- `primitivePin`

方向从 interface 和 primitive catalog 明确获得，不根据画线方向推断。

## Clock domain

v0.1 的 `design.clockDomain` 固定为：

- rising edge
- synchronous reset
- active-high reset
- 单 Clock domain

Top clock/reset 必须是对应 role 的 1-bit input。每个 `reg.clk` 和 `reg.rst` 必须直接由 module interface 中对应 role 的 input 驱动；不允许 gated Clock 或 derived reset。

## 归一化

Compiler 在 semantic checks 后：

1. 完全移除 `layout`。
2. 按稳定 ID 排序 module、port、instance、primitive 和 net。
3. 按 endpoint key 排序 fanout sinks。
4. 将 literal 规范化为十进制字符串。
5. 对 canonical JSON 计算 SHA-256 semantic hash。

因此 JSON property order、非语义 array order 和 layout 变化不会改变生成结果。
