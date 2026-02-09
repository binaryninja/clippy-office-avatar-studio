export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function randomColor() {
  const n = Math.floor(Math.random() * 0xffffff);
  return `#${n.toString(16).padStart(6, "0")}`;
}

export function randomBetween(min, max, precision = 2) {
  return Number((min + Math.random() * (max - min)).toFixed(precision));
}

export function safeDisposeGeometry(geometry) {
  if (geometry && typeof geometry.dispose === "function") {
    geometry.dispose();
  }
}

export function safeDisposeMaterial(material) {
  if (!material) return;
  const materials = Array.isArray(material) ? material : [material];
  for (const entry of materials) {
    if (entry && typeof entry.dispose === "function") {
      entry.dispose();
    }
  }
}

export function safeDisposeObject3D(root) {
  if (!root || typeof root.traverse !== "function") return;
  root.traverse((node) => {
    safeDisposeGeometry(node.geometry);
    safeDisposeMaterial(node.material);
  });
}
