/**
 * Shared prop definitions that work across any avatar engine with the right
 * anchor points. Import this module for side-effect registration.
 */

import { registerSharedProp } from "./prop-system.js";

function disposeObject3D(root) {
  if (!root) return;
  root.traverse((node) => {
    if (node.geometry && typeof node.geometry.dispose === "function") {
      node.geometry.dispose();
    }
    if (!node.material) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const mat of mats) {
      if (mat && typeof mat.dispose === "function") {
        mat.dispose();
      }
    }
  });
}

registerSharedProp("topHat", {
  defaultAnchor: "head",
  create({ THREE }) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x121826,
      metalness: 0.18,
      roughness: 0.48,
    });

    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 44), mat);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.37, 0.48, 44), mat);

    crown.position.y = 0.24;
    group.position.set(0, 0.48, 0.03);
    group.add(brim, crown);

    return {
      object3d: group,
      dispose() {
        disposeObject3D(group);
      },
    };
  },
});
