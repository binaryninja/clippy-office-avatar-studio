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

registerSharedProp("sunglasses", {
  defaultAnchor: "head",
  placements: {
    clippy: { x: 0, y: -0.24, z: 0.26, scale: 0.72, rotX: 0, rotY: 0, rotZ: 0 },
    pushy: { x: 0, y: 0.06, z: 0.1, scale: 0.42, rotX: 0, rotY: 0, rotZ: 0 },
    tacky: { x: 0, y: 0.06, z: 0.1, scale: 0.42, rotX: 0, rotY: 0, rotZ: 0 },
    towely: { x: 0, y: 0.02, z: 0.24, scale: 1, rotX: 0, rotY: 0, rotZ: 0 },
  },
  create({ THREE }) {
    const group = new THREE.Group();

    // Lenses — dark, slightly reflective ovals
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0x080c14,
      metalness: 0.72,
      roughness: 0.16,
      envMapIntensity: 1.2,
    });

    const lensGeom = new THREE.SphereGeometry(0.09, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const leftLens = new THREE.Mesh(lensGeom, lensMat);
    const rightLens = new THREE.Mesh(lensGeom, lensMat);

    leftLens.scale.set(1, 0.72, 0.32);
    rightLens.scale.set(1, 0.72, 0.32);
    leftLens.position.set(-0.18, 0, 0);
    rightLens.position.set(0.18, 0, 0);
    leftLens.rotation.x = Math.PI * 0.5;
    rightLens.rotation.x = Math.PI * 0.5;

    // Frame — thin wire connecting the lenses
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      metalness: 0.88,
      roughness: 0.22,
    });

    // Bridge between lenses
    const bridge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8),
      frameMat,
    );
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 0.04, 0.02);

    // Lens rims
    const rimGeom = new THREE.TorusGeometry(0.088, 0.007, 8, 32);
    const leftRim = new THREE.Mesh(rimGeom, frameMat);
    const rightRim = new THREE.Mesh(rimGeom, frameMat);
    leftRim.position.copy(leftLens.position);
    rightRim.position.copy(rightLens.position);
    leftRim.position.z += 0.012;
    rightRim.position.z += 0.012;
    leftRim.scale.set(1, 0.72, 1);
    rightRim.scale.set(1, 0.72, 1);

    // Temple arms (side pieces)
    const armGeom = new THREE.CylinderGeometry(0.006, 0.005, 0.22, 6);
    const leftArm = new THREE.Mesh(armGeom, frameMat);
    const rightArm = new THREE.Mesh(armGeom, frameMat);
    leftArm.position.set(-0.27, 0.01, -0.08);
    rightArm.position.set(0.27, 0.01, -0.08);
    leftArm.rotation.x = Math.PI * 0.42;
    rightArm.rotation.x = Math.PI * 0.42;

    // Position is now set externally by applyPlacementToObject
    group.add(leftLens, rightLens, bridge, leftRim, rightRim, leftArm, rightArm);

    return {
      object3d: group,
      dispose() {
        disposeObject3D(group);
      },
    };
  },
});

registerSharedProp("topHat", {
  defaultAnchor: "head",
  placements: {
    clippy: { x: 0, y: 0.48, z: 0.03, scale: 1, rotX: 0, rotY: 0, rotZ: 0 },
    pushy: { x: 0, y: 0.28, z: 0.02, scale: 0.28, rotX: 0, rotY: 0, rotZ: 0 },
    tacky: { x: 0, y: 0.28, z: 0.02, scale: 0.28, rotX: 0, rotY: 0, rotZ: 0 },
    towely: { x: 0, y: 0.42, z: 0.08, scale: 0.52, rotX: 0, rotY: 0, rotZ: 0 },
  },
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
    // Position is now set externally by applyPlacementToObject
    group.add(brim, crown);

    return {
      object3d: group,
      dispose() {
        disposeObject3D(group);
      },
    };
  },
});
