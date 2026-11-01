# GraphicalHDL JSON Schema 参考

> 本文件由 `schemas/graphicalhdl-design.schema.json` 生成，禁止手工修改。

- Schema ID：`https://graphicalhdl.dev/schemas/graphicalhdl-design.schema.json`
- Draft：2020-12
- 当前版本：`0.1`

| 定义 | 类型 | 必需字段 |
|---|---|---|
| `identifier` | string | - |
| `stableId` | string | - |
| `width` | integer | - |
| `literal` | string | - |
| `project` | object | id, name, topModuleName |
| `design` | object | clockDomain, top, modules |
| `clockDomain` | object | clockPortId, resetPortId, clockEdge, resetKind, resetPolarity |
| `port` | object | id, name, direction, width, role |
| `moduleInstance` | object | id, name, moduleId |
| `topPortEndpoint` | object | kind, portId |
| `instancePortEndpoint` | object | kind, instanceId, portId |
| `topEndpoint` | union | - |
| `topNet` | object | id, name, driver, sinks |
| `topDefinition` | object | id, name, ports, instances, nets |
| `modulePortEndpoint` | object | kind, portId |
| `primitivePinEndpoint` | object | kind, primitiveId, pin |
| `moduleEndpoint` | union | - |
| `moduleNet` | object | id, name, driver, sinks |
| `constPrimitive` | object | id, name, kind, width, value |
| `addPrimitive` | object | id, name, kind, width |
| `mulPrimitive` | object | id, name, kind, aWidth, bWidth |
| `mux2Primitive` | object | id, name, kind, width |
| `regPrimitive` | object | id, name, kind, width, resetValue |
| `primitive` | union | - |
| `moduleImplementation` | object | primitives, nets |
| `moduleDefinition` | object | id, name, ports, implementation |
| `layoutNode` | object | elementId, x, y |
| `viewport` | object | x, y, zoom |
| `layoutView` | object | level, ownerId, nodes |
| `layout` | object | views |
