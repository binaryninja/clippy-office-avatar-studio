/**
 * Shared prop system for attaching Object3D props to named anchor points
 * on any avatar controller.
 *
 * Prop definition interface:
 *   { defaultAnchor: string, create({ THREE, anchor, options }) }
 *
 * create() must return:
 *   { object3d: Object3D, update?(ctx): void, dispose?(): void }
 */

let nextPropId = 1;

/**
 * Create a prop manager that handles mounting/unmounting props on any
 * controller that exposes getAnchors().
 */
export function createPropManager() {
  const activePropMap = new Map();

  function attach({ name, anchorName, anchor, propDefinition, THREE, options = {} }) {
    if (!anchor) {
      console.warn(`Prop "${name}": anchor "${anchorName}" not found`);
      return null;
    }

    const result = propDefinition.create({ THREE, anchor, options });
    if (!result || !result.object3d) {
      console.warn(`Prop "${name}": create() did not return { object3d }`);
      return null;
    }

    const id = nextPropId++;
    anchor.add(result.object3d);

    const entry = {
      id,
      name,
      object3d: result.object3d,
      update: typeof result.update === "function" ? result.update : null,
      dispose: typeof result.dispose === "function" ? result.dispose : null,
      anchorName,
      anchor,
    };

    activePropMap.set(id, entry);
    return id;
  }

  function detach(id) {
    const entry = activePropMap.get(id);
    if (!entry) return false;

    if (entry.anchor) {
      entry.anchor.remove(entry.object3d);
    }
    if (entry.dispose) {
      entry.dispose();
    }

    activePropMap.delete(id);
    return true;
  }

  function detachAll() {
    for (const id of [...activePropMap.keys()]) {
      detach(id);
    }
  }

  function update(ctx) {
    for (const entry of activePropMap.values()) {
      if (entry.update) {
        entry.update({ ...ctx, object3d: entry.object3d, anchorName: entry.anchorName });
      }
    }
  }

  function listActive() {
    return [...activePropMap.values()].map((e) => ({
      id: e.id,
      name: e.name,
      anchorName: e.anchorName,
    }));
  }

  return { attach, detach, detachAll, update, listActive };
}

const sharedPropRegistry = new Map();

/**
 * Register a prop definition that can be mounted on any avatar with the
 * appropriate anchor point.
 */
export function registerSharedProp(name, definition) {
  sharedPropRegistry.set(name, {
    name,
    defaultAnchor: definition.defaultAnchor || "head",
    create: definition.create,
  });
}

export function getSharedProp(name) {
  return sharedPropRegistry.get(name) || null;
}

export function listSharedProps() {
  return [...sharedPropRegistry.keys()];
}
