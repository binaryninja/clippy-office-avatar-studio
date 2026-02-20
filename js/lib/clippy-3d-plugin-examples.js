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
    typing: {
      defaultExpression: "focused",
      apply({ clippy, modeTime }) {
        clippy.head.rotation.z += Math.sin(modeTime * 3.0) * 0.04;
        clippy.head.rotation.x += 0.06 + Math.sin(modeTime * 2.4) * 0.02;
        clippy.leftArm.upper.rotation.z = -0.62 + Math.sin(modeTime * 10.2) * 0.1;
        clippy.leftArm.lower.rotation.z = -0.48 + Math.sin(modeTime * 12.4) * 0.14;
        clippy.rightArm.upper.rotation.z = 0.62 - Math.sin(modeTime * 10.2 + 1.6) * 0.1;
        clippy.rightArm.lower.rotation.z = 0.48 - Math.sin(modeTime * 12.4 + 1.6) * 0.14;
      },
    },

    reading: {
      defaultExpression: "focused",
      apply({ clippy, modeTime }) {
        clippy.head.rotation.x += 0.06 + Math.sin(modeTime * 0.8) * 0.02;
        clippy.head.rotation.z += Math.sin(modeTime * 0.6) * 0.03;
        clippy.leftArm.upper.rotation.z = -0.22 + Math.sin(modeTime * 1.4) * 0.03;
        clippy.rightArm.upper.rotation.z = 0.22 - Math.sin(modeTime * 1.4) * 0.03;
      },
    },

    searching: {
      defaultExpression: "surprised",
      apply({ clippy, modeTime }) {
        clippy.head.rotation.z += Math.sin(modeTime * 1.8) * 0.18;
        clippy.head.rotation.x += Math.sin(modeTime * 2.4) * 0.08;
        clippy.leftArm.upper.rotation.z = -0.2;
        clippy.rightArm.upper.rotation.z = -0.52 + Math.sin(modeTime * 2.2) * 0.1;
        clippy.rightArm.lower.rotation.z = -0.34 + Math.sin(modeTime * 2.6) * 0.08;
      },
    },

    error: {
      defaultExpression: "surprised",
      apply({ clippy, modeTime }) {
        const decay = Math.exp(-modeTime * 2.8);
        const shake = Math.sin(modeTime * 28) * decay;
        clippy.head.rotation.z += shake * 0.16;
        clippy.head.position.y += Math.max(0, Math.sin(modeTime * 14) * 0.12 * decay);
        clippy.leftArm.upper.rotation.z = -0.48 * decay + Math.sin(modeTime * 1.6) * 0.04;
        clippy.rightArm.upper.rotation.z = 0.48 * decay - Math.sin(modeTime * 1.6) * 0.04;
      },
    },

    success: {
      defaultExpression: "happy",
      apply({ clippy, modeTime }) {
        const decay = Math.exp(-modeTime * 3.2);
        clippy.head.rotation.x += -0.08 * decay;
        clippy.head.position.y += Math.max(0, Math.sin(modeTime * 8) * 0.08 * decay);
        clippy.leftArm.upper.rotation.z = -0.16 + Math.sin(modeTime * 1.8) * 0.04;
        clippy.rightArm.upper.rotation.z = 0.16 - Math.sin(modeTime * 1.8) * 0.04;
      },
    },

    listening: {
      defaultExpression: "neutral",
      apply({ clippy, modeTime }) {
        clippy.head.rotation.x += 0.04 + Math.sin(modeTime * 1.0) * 0.015;
        clippy.head.rotation.z += Math.sin(modeTime * 0.8) * 0.02;
        clippy.leftArm.upper.rotation.z = -0.18 + Math.sin(modeTime * 1.2) * 0.02;
        clippy.rightArm.upper.rotation.z = 0.18 - Math.sin(modeTime * 1.2) * 0.02;
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
