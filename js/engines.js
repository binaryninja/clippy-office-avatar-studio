/**
 * Self-registering engine registry.
 *
 * Each avatar engine module calls registerEngine() on import to add itself.
 * The studio resolves engines by name via getEngine() — no hardcoded
 * if/else chain or per-engine imports required in the host module.
 */

const engineRegistry = new Map();

export function registerEngine(name, factory) {
  engineRegistry.set(name, factory);
}

export function getEngine(name) {
  const factory = engineRegistry.get(name);
  if (!factory) {
    throw new Error(
      `Unknown engine "${name}". Registered: ${[...engineRegistry.keys()].join(", ") || "(none)"}`,
    );
  }
  return factory;
}
