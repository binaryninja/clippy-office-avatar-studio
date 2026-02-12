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

/* ── Placement helpers ── */

export const PLACEMENT_DEFAULTS = { x: 0, y: 0.3, z: 0, scale: 1, rotX: 0, rotY: 0, rotZ: 0 };

export function getPlacementStorageKey(propName, avatarId) {
  return `prop-placement:${propName}:${avatarId}`;
}

export function loadPropPlacement(propName, avatarId, propDefinition) {
  // 1. Try localStorage
  const storageKey = getPlacementStorageKey(propName, avatarId);
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...PLACEMENT_DEFAULTS, ...parsed };
    }
  } catch { /* ignore */ }

  // 2. Try prop definition per-avatar defaults
  if (propDefinition?.placements?.[avatarId]) {
    return { ...PLACEMENT_DEFAULTS, ...propDefinition.placements[avatarId] };
  }

  // 3. Fallback
  return { ...PLACEMENT_DEFAULTS };
}

export function savePropPlacement(propName, avatarId, placement) {
  const storageKey = getPlacementStorageKey(propName, avatarId);
  try {
    localStorage.setItem(storageKey, JSON.stringify(placement));
  } catch { /* ignore */ }
}

export function applyPlacementToObject(object3d, placement) {
  if (!object3d) return;
  object3d.position.set(placement.x, placement.y, placement.z);
  object3d.scale.setScalar(placement.scale);
  object3d.rotation.set(placement.rotX, placement.rotY, placement.rotZ);
}

/* ── Prop manager ── */

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

  function getObject(id) {
    const entry = activePropMap.get(id);
    return entry?.object3d || null;
  }

  return { attach, detach, detachAll, update, listActive, getObject };
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
    placements: definition.placements || null,
    create: definition.create,
  });
}

export function getSharedProp(name) {
  return sharedPropRegistry.get(name) || null;
}

export function listSharedProps() {
  return [...sharedPropRegistry.keys()];
}
