/* 由 schemas/graphicalhdl-design.schema.json 生成，禁止手工修改。 */

export type StableId = string;
export type Identifier = string;
export type Width = number;
export type TopEndpoint = TopPortEndpoint | InstancePortEndpoint;
export type Primitive = ConstPrimitive | AddPrimitive | MulPrimitive | Mux2Primitive | RegPrimitive;
export type Literal = string;
export type ModuleEndpoint = ModulePortEndpoint | PrimitivePinEndpoint;

export interface GraphicalHDLDesignDocumentV01 {
  schemaVersion: "0.1";
  project: Project;
  design: Design;
  layout?: Layout;
}
export interface Project {
  id: string;
  name: string;
  topModuleName: string;
}
export interface Design {
  clockDomain: ClockDomain;
  top: TopDefinition;
  modules: ModuleDefinition[];
}
export interface ClockDomain {
  clockPortId: StableId;
  resetPortId: StableId;
  clockEdge: "rising";
  resetKind: "synchronous";
  resetPolarity: "activeHigh";
}
export interface TopDefinition {
  id: StableId;
  name: Identifier;
  description?: string;
  ports: Port[];
  instances: ModuleInstance[];
  nets: TopNet[];
}
export interface Port {
  id: StableId;
  name: Identifier;
  direction: "input" | "output";
  width: Width;
  role: "data" | "control" | "clock" | "reset";
  description?: string;
}
export interface ModuleInstance {
  id: StableId;
  name: Identifier;
  moduleId: StableId;
  description?: string;
}
export interface TopNet {
  id: StableId;
  name: Identifier;
  driver: TopEndpoint;
  sinks: [TopEndpoint, ...TopEndpoint[]];
}
export interface TopPortEndpoint {
  kind: "topPort";
  portId: StableId;
}
export interface InstancePortEndpoint {
  kind: "instancePort";
  instanceId: StableId;
  portId: StableId;
}
export interface ModuleDefinition {
  id: StableId;
  name: Identifier;
  description?: string;
  ports: Port[];
  implementation: ModuleImplementation;
}
export interface ModuleImplementation {
  primitives: Primitive[];
  nets: ModuleNet[];
}
export interface ConstPrimitive {
  id: StableId;
  name: Identifier;
  kind: "const";
  width: Width;
  value: Literal;
}
export interface AddPrimitive {
  id: StableId;
  name: Identifier;
  kind: "add";
  width: Width;
}
export interface MulPrimitive {
  id: StableId;
  name: Identifier;
  kind: "mul";
  aWidth: Width;
  bWidth: Width;
}
export interface Mux2Primitive {
  id: StableId;
  name: Identifier;
  kind: "mux2";
  width: Width;
}
export interface RegPrimitive {
  id: StableId;
  name: Identifier;
  kind: "reg";
  width: Width;
  resetValue: Literal;
}
export interface ModuleNet {
  id: StableId;
  name: Identifier;
  driver: ModuleEndpoint;
  sinks: [ModuleEndpoint, ...ModuleEndpoint[]];
}
export interface ModulePortEndpoint {
  kind: "modulePort";
  portId: StableId;
}
export interface PrimitivePinEndpoint {
  kind: "primitivePin";
  primitiveId: StableId;
  pin: string;
}
export interface Layout {
  views: LayoutView[];
}
export interface LayoutView {
  level: 1 | 2 | 3;
  ownerId: StableId;
  nodes: LayoutNode[];
  viewport?: Viewport;
}
export interface LayoutNode {
  elementId: StableId;
  x: number;
  y: number;
}
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}
