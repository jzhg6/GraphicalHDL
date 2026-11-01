import type {
  DesignDocument,
  ModuleEndpoint,
  NormalizedDesign,
  SemanticDocument,
  TopEndpoint,
} from "@graphicalhdl/ir";
import { canonicalLiteral } from "@graphicalhdl/ir";
import { canonicalStringify, compareText, sha256Text } from "./canonical";

function byId<T extends { id: string }>(left: T, right: T): number {
  return compareText(left.id, right.id);
}

function topEndpointKey(endpoint: TopEndpoint): string {
  return endpoint.kind === "topPort"
    ? JSON.stringify(["topPort", endpoint.portId])
    : JSON.stringify(["instancePort", endpoint.instanceId, endpoint.portId]);
}

function moduleEndpointKey(endpoint: ModuleEndpoint): string {
  return endpoint.kind === "modulePort"
    ? JSON.stringify(["modulePort", endpoint.portId])
    : JSON.stringify(["primitivePin", endpoint.primitiveId, endpoint.pin]);
}

export function normalizeDesign(document: DesignDocument): NormalizedDesign {
  const cloned = structuredClone(document);
  const { layout, ...withoutLayout } = cloned;
  void layout;
  const semantic = withoutLayout as SemanticDocument;

  semantic.design.top.ports.sort(byId);
  semantic.design.top.instances.sort(byId);
  semantic.design.top.nets.sort(byId);
  for (const net of semantic.design.top.nets) {
    net.sinks.sort((left, right) => compareText(topEndpointKey(left), topEndpointKey(right)));
  }

  semantic.design.modules.sort(byId);
  for (const module of semantic.design.modules) {
    module.ports.sort(byId);
    module.implementation.primitives.sort(byId);
    for (const primitive of module.implementation.primitives) {
      if (primitive.kind === "const") {
        primitive.value = canonicalLiteral(primitive.value);
      } else if (primitive.kind === "reg") {
        primitive.resetValue = canonicalLiteral(primitive.resetValue);
      }
    }
    module.implementation.nets.sort(byId);
    for (const net of module.implementation.nets) {
      net.sinks.sort((left, right) =>
        compareText(moduleEndpointKey(left), moduleEndpointKey(right)),
      );
    }
  }

  const semanticHash = sha256Text(canonicalStringify(semantic));
  return { ...semantic, semanticHash };
}
