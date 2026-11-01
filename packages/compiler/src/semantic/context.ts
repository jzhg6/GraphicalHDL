import type {
  DesignDocument,
  Diagnostic,
  DiagnosticTarget,
  ModuleDefinition,
  ModuleInstance,
  Port,
  Primitive,
  TopDefinition,
} from "@graphicalhdl/ir";

const SYSTEMVERILOG_KEYWORDS = new Set(
  `accept_on alias always always_comb always_ff always_latch and assert assign assume automatic
   before begin bind bins binsof bit break buf bufif0 bufif1 byte case casex casez cell chandle
   checker class clocking cmos config const constraint context continue cover covergroup coverpoint
   cross deassign default defparam design disable dist do edge else end endcase endchecker endclass
   endclocking endconfig endfunction endgenerate endgroup endinterface endmodule endpackage
   endprimitive endprogram endproperty endsequence endspecify endtable endtask enum event eventually
   expect export extends extern final first_match for force foreach forever fork forkjoin function
   generate genvar global highz0 highz1 if iff ifnone ignore_bins illegal_bins implements implies
   import incdir include initial inout input inside instance int integer interconnect intersect join
   join_any join_none large let liblist library local localparam logic longint macromodule matches
   medium modport module nand negedge nettype new nexttime nmos nor noshowcancelled not notif0 notif1
   null or output package packed parameter pmos posedge primitive priority program property protected
   pull0 pull1 pulldown pullup pulsestyle_ondetect pulsestyle_onevent pure rand randc randcase
   randsequence rcmos real realtime ref reg reject_on release repeat restrict return rnmos rpmos rtran
   rtranif0 rtranif1 s_always s_eventually s_nexttime s_until s_until_with scalared sequence shortint
   shortreal showcancelled signed small solve specify specparam static string strong strong0 strong1
   struct super supply0 supply1 sync_accept_on sync_reject_on table tagged task this throughout time
   timeprecision timeunit tran tranif0 tranif1 tri tri0 tri1 triand trior trireg type typedef union
   unique unique0 unsigned until until_with untyped use uwire var vectored virtual void wait wait_order
   wand weak weak0 weak1 while wildcard wire with within wor xnor xor`
    .trim()
    .split(/\s+/),
);

export interface IndexedValue<T> {
  value: T;
  pointer: string;
  index: number;
}

export interface ModuleIndex {
  module: ModuleDefinition;
  pointer: string;
  ports: Map<string, IndexedValue<Port>>;
  primitives: Map<string, IndexedValue<Primitive>>;
}

export interface DesignIndex {
  document: DesignDocument;
  top: TopDefinition;
  topPorts: Map<string, IndexedValue<Port>>;
  instances: Map<string, IndexedValue<ModuleInstance>>;
  modules: Map<string, ModuleIndex>;
}

function target(level: 1 | 2 | 3, ownerId: string, elementId: string): DiagnosticTarget {
  return { level, ownerId, elementId };
}

function duplicateDiagnostics<T extends { id: string; name: string }>(
  values: readonly T[],
  pointer: string,
  stageTarget: (value: T) => DiagnosticTarget,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const ids = new Map<string, number>();
  const names = new Map<string, number>();

  values.forEach((value, index) => {
    const previousId = ids.get(value.id);
    if (previousId !== undefined) {
      diagnostics.push({
        code: "GHDL-E2001",
        severity: "error",
        stage: "index",
        message: `ID "${value.id}" 重复。`,
        hint: "同一作用域内的 ID 必须唯一且稳定。",
        jsonPointer: `${pointer}/${index}/id`,
        target: stageTarget(value),
        related: [
          {
            message: "第一次定义位于此处。",
            jsonPointer: `${pointer}/${previousId}/id`,
          },
        ],
      });
    } else {
      ids.set(value.id, index);
    }

    const previousName = names.get(value.name);
    if (previousName !== undefined) {
      diagnostics.push({
        code: "GHDL-E2002",
        severity: "error",
        stage: "index",
        message: `名称 "${value.name}" 重复。`,
        hint: "同一 RTL 作用域内的名称必须唯一。",
        jsonPointer: `${pointer}/${index}/name`,
        target: stageTarget(value),
        related: [
          {
            message: "第一次定义位于此处。",
            jsonPointer: `${pointer}/${previousName}/name`,
          },
        ],
      });
    } else {
      names.set(value.name, index);
    }
  });

  return diagnostics;
}

function keywordDiagnostics(
  values: readonly { id: string; name: string }[],
  pointer: string,
  stageTarget: (value: { id: string; name: string }) => DiagnosticTarget,
): Diagnostic[] {
  return values.flatMap((value, index) =>
    SYSTEMVERILOG_KEYWORDS.has(value.name)
      ? [
          {
            code: "GHDL-E2003",
            severity: "error" as const,
            stage: "index" as const,
            message: `名称 "${value.name}" 是 SystemVerilog keyword。`,
            hint: "请显式重命名；Compiler 不会自动修改名称。",
            jsonPointer: `${pointer}/${index}/name`,
            target: stageTarget(value),
          },
        ]
      : [],
  );
}

function namespaceCollisionDiagnostics(
  groups: readonly {
    values: readonly { id: string; name: string }[];
    pointer: string;
    target: (value: { id: string; name: string }) => DiagnosticTarget;
  }[],
): Diagnostic[] {
  const firstByName = new Map<
    string,
    { pointer: string; target: DiagnosticTarget; groupIndex: number }
  >();
  const diagnostics: Diagnostic[] = [];

  groups.forEach((group, groupIndex) => {
    group.values.forEach((value, index) => {
      const currentPointer = `${group.pointer}/${index}/name`;
      const currentTarget = group.target(value);
      const previous = firstByName.get(value.name);
      if (previous && previous.groupIndex !== groupIndex) {
        diagnostics.push({
          code: "GHDL-E2004",
          severity: "error",
          stage: "index",
          message: `RTL 名称 "${value.name}" 与同一 module 中的其他对象冲突。`,
          hint: "Port、net 和 instance 使用同一个 SystemVerilog 名称空间。",
          jsonPointer: currentPointer,
          target: currentTarget,
          related: [{ message: "冲突的第一次定义位于此处。", jsonPointer: previous.pointer }],
        });
      } else if (!previous) {
        firstByName.set(value.name, {
          pointer: currentPointer,
          target: currentTarget,
          groupIndex,
        });
      }
    });
  });
  return diagnostics;
}

export function buildDesignIndex(document: DesignDocument): {
  index: DesignIndex;
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const top = document.design.top;
  const topPorts = new Map<string, IndexedValue<Port>>();
  const instances = new Map<string, IndexedValue<ModuleInstance>>();
  const modules = new Map<string, ModuleIndex>();

  if (document.project.topModuleName !== top.name) {
    diagnostics.push({
      code: "GHDL-E2005",
      severity: "error",
      stage: "index",
      message: "project.topModuleName 与 design.top.name 不一致。",
      hint: "两处必须使用同一个显式顶层 module 名称。",
      jsonPointer: "/project/topModuleName",
      target: target(1, top.id, top.id),
      related: [{ message: "顶层定义名称位于此处。", jsonPointer: "/design/top/name" }],
    });
  }

  top.ports.forEach((value, index) => {
    topPorts.set(value.id, { value, index, pointer: `/design/top/ports/${index}` });
  });
  top.instances.forEach((value, index) => {
    instances.set(value.id, { value, index, pointer: `/design/top/instances/${index}` });
  });

  diagnostics.push(
    ...duplicateDiagnostics(top.ports, "/design/top/ports", (value) => target(1, top.id, value.id)),
    ...duplicateDiagnostics(top.instances, "/design/top/instances", (value) =>
      target(1, top.id, value.id),
    ),
    ...duplicateDiagnostics(top.nets, "/design/top/nets", (value) => target(1, top.id, value.id)),
    ...keywordDiagnostics(top.ports, "/design/top/ports", (value) => target(1, top.id, value.id)),
    ...keywordDiagnostics(top.instances, "/design/top/instances", (value) =>
      target(1, top.id, value.id),
    ),
    ...keywordDiagnostics(top.nets, "/design/top/nets", (value) => target(1, top.id, value.id)),
    ...namespaceCollisionDiagnostics([
      {
        values: top.ports,
        pointer: "/design/top/ports",
        target: (value) => target(1, top.id, value.id),
      },
      {
        values: top.instances,
        pointer: "/design/top/instances",
        target: (value) => target(1, top.id, value.id),
      },
      {
        values: top.nets,
        pointer: "/design/top/nets",
        target: (value) => target(1, top.id, value.id),
      },
    ]),
  );

  const moduleIds = new Map<string, number>();
  const moduleNames = new Map<string, number>();
  document.design.modules.forEach((module, moduleIndex) => {
    const modulePointer = `/design/modules/${moduleIndex}`;
    const previousId = moduleIds.get(module.id);
    const previousName = moduleNames.get(module.name);
    if (previousId !== undefined) {
      diagnostics.push({
        code: "GHDL-E2001",
        severity: "error",
        stage: "index",
        message: `Module ID "${module.id}" 重复。`,
        hint: "Module ID 必须在整个工程内唯一。",
        jsonPointer: `${modulePointer}/id`,
        target: target(2, module.id, module.id),
        related: [
          { message: "第一次定义位于此处。", jsonPointer: `/design/modules/${previousId}/id` },
        ],
      });
    } else {
      moduleIds.set(module.id, moduleIndex);
    }
    if (previousName !== undefined || module.name === top.name) {
      diagnostics.push({
        code: "GHDL-E2002",
        severity: "error",
        stage: "index",
        message: `Module 名称 "${module.name}" 重复。`,
        hint: "所有生成的 SystemVerilog module 名称必须唯一。",
        jsonPointer: `${modulePointer}/name`,
        target: target(2, module.id, module.id),
        related:
          previousName !== undefined
            ? [
                {
                  message: "第一次定义位于此处。",
                  jsonPointer: `/design/modules/${previousName}/name`,
                },
              ]
            : [{ message: "与 top module 同名。", jsonPointer: "/design/top/name" }],
      });
    } else {
      moduleNames.set(module.name, moduleIndex);
    }
    if (SYSTEMVERILOG_KEYWORDS.has(module.name)) {
      diagnostics.push({
        code: "GHDL-E2003",
        severity: "error",
        stage: "index",
        message: `Module 名称 "${module.name}" 是 SystemVerilog keyword。`,
        hint: "请显式重命名该 module。",
        jsonPointer: `${modulePointer}/name`,
        target: target(2, module.id, module.id),
      });
    }

    const ports = new Map<string, IndexedValue<Port>>();
    const primitives = new Map<string, IndexedValue<Primitive>>();
    module.ports.forEach((value, index) => {
      ports.set(value.id, { value, index, pointer: `${modulePointer}/ports/${index}` });
    });
    module.implementation.primitives.forEach((value, index) => {
      primitives.set(value.id, {
        value,
        index,
        pointer: `${modulePointer}/implementation/primitives/${index}`,
      });
    });
    modules.set(module.id, { module, pointer: modulePointer, ports, primitives });

    diagnostics.push(
      ...duplicateDiagnostics(module.ports, `${modulePointer}/ports`, (value) =>
        target(2, module.id, value.id),
      ),
      ...duplicateDiagnostics(
        module.implementation.primitives,
        `${modulePointer}/implementation/primitives`,
        (value) => target(3, module.id, value.id),
      ),
      ...duplicateDiagnostics(
        module.implementation.nets,
        `${modulePointer}/implementation/nets`,
        (value) => target(3, module.id, value.id),
      ),
      ...keywordDiagnostics(module.ports, `${modulePointer}/ports`, (value) =>
        target(2, module.id, value.id),
      ),
      ...keywordDiagnostics(
        module.implementation.primitives,
        `${modulePointer}/implementation/primitives`,
        (value) => target(3, module.id, value.id),
      ),
      ...keywordDiagnostics(
        module.implementation.nets,
        `${modulePointer}/implementation/nets`,
        (value) => target(3, module.id, value.id),
      ),
      ...namespaceCollisionDiagnostics([
        {
          values: module.ports,
          pointer: `${modulePointer}/ports`,
          target: (value) => target(2, module.id, value.id),
        },
        {
          values: module.implementation.nets,
          pointer: `${modulePointer}/implementation/nets`,
          target: (value) => target(3, module.id, value.id),
        },
      ]),
    );
  });

  if (SYSTEMVERILOG_KEYWORDS.has(top.name)) {
    diagnostics.push({
      code: "GHDL-E2003",
      severity: "error",
      stage: "index",
      message: `Top module 名称 "${top.name}" 是 SystemVerilog keyword。`,
      hint: "请显式重命名 top module。",
      jsonPointer: "/design/top/name",
      target: target(1, top.id, top.id),
    });
  }

  return {
    index: { document, top, topPorts, instances, modules },
    diagnostics,
  };
}
