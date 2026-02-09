import { createClippyPlugin } from "./clippy-3d.js";

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

export const officePackPlugin = createClippyPlugin({
  animations: {
    think: {
      defaultExpression: "focused",
      apply({ clippy, modeTime }) {
        clippy.head.rotation.z += Math.sin(modeTime * 3.5) * 0.11;
        clippy.leftArm.upper.rotation.z = -0.34 + Math.sin(modeTime * 5.8) * 0.08;
        clippy.rightArm.upper.rotation.z = 0.35 + Math.sin(modeTime * 4.2) * 0.06;
        clippy.rightArm.lower.rotation.z = -0.58;
      },
    },
  },
  props: {
    topHat: {
      defaultAnchor: "head",
      create({ THREE, options }) {
        const color = typeof options?.color === "number" ? options.color : 0x121826;
        const group = new THREE.Group();

        const mat = new THREE.MeshStandardMaterial({
          color,
          metalness: 0.18,
          roughness: 0.48,
        });

        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 44), mat);
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.37, 0.48, 44), mat);

        crown.position.y = 0.24;
        group.position.set(0, 0.48, 0.03);
        group.add(brim);
        group.add(crown);

        return {
          object3d: group,
          update({ clippy, object3d }) {
            object3d.rotation.z = Math.sin(clippy.time * 2.6) * 0.03;
          },
          dispose() {
            disposeObject3D(group);
          },
        };
      },
    },
  },
});
