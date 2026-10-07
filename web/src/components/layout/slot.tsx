import { createContext, useContext } from "react";
import {
  featureRegistry,
  type FeatureRegistry,
  type SlotContext,
  type SlotName,
} from "@/lib/features";

export const FeatureRegistryContext =
  createContext<FeatureRegistry>(featureRegistry);

/** Renders every feature component contributed to `name`; nothing if none. */
export function SlotOutlet({
  name,
  ...context
}: { name: SlotName } & SlotContext) {
  const registry = useContext(FeatureRegistryContext);
  return (
    <>
      {registry.slots[name].map((Component, i) => (
        <Component key={i} {...context} />
      ))}
    </>
  );
}
