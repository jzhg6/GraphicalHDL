# Primitive 参考

Primitive catalog 位于 `packages/ir/src/primitives.ts`，是 pin、位宽和 stateful 属性的权威来源。

## `const`

| Pin | 方向   | 位宽    |
| --- | ------ | ------- |
| `y` | output | `width` |

参数：`width`、`value`。`value` 接受十进制或 `0x` 十六进制无符号 literal，且必须能在 `width` 内表示。

## `add`

| Pin | 方向   | 位宽    |
| --- | ------ | ------- |
| `a` | input  | `width` |
| `b` | input  | `width` |
| `y` | output | `width` |

执行无符号加法，结果按 `2^width` wrap。Compiler 不自动增加 carry bit。

## `mul`

| Pin | 方向   | 位宽              |
| --- | ------ | ----------------- |
| `a` | input  | `aWidth`          |
| `b` | input  | `bWidth`          |
| `y` | output | `aWidth + bWidth` |

执行无符号全宽乘法。Emitter 会显式扩展 operand，避免依赖 SystemVerilog expression sizing 的隐式规则。

## `mux2`

| Pin   | 方向   | 位宽    |
| ----- | ------ | ------- |
| `a`   | input  | `width` |
| `b`   | input  | `width` |
| `sel` | input  | 1       |
| `y`   | output | `width` |

`sel=0` 选择 `a`，`sel=1` 选择 `b`。

## `reg`

| Pin   | 方向   | 位宽/role |
| ----- | ------ | --------- |
| `d`   | input  | `width`   |
| `clk` | input  | 1 / clock |
| `rst` | input  | 1 / reset |
| `q`   | output | `width`   |

参数：`width`、`resetValue`。行为：

```systemverilog
always_ff @(posedge clk) begin
  if (rst) begin
    q <= RESET_VALUE;
  end else begin
    q <= d;
  end
end
```

v0.1 无 enable、asynchronous reset 或 negative edge。

## 连接规则

- 所有 primitive input 必须恰好连接一次。
- Primitive output 可以不使用，但一旦连线，只能驱动一条可 fanout net。
- Driver 与 sink 位宽必须完全一致。
- Compiler 不插入 resize/cast。
- Combinational primitive 之间不得形成环；经过 `reg` 的 feedback 合法。
