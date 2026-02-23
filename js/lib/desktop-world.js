import { clamp, safeDisposeObject3D } from "./utils.js";
import { createSolarSystemSetpiece } from "./solar-system-setpiece.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const DESKTOP_WORLD_ACTIONS = Object.freeze([
  "auto",
  "list",
  "read",
  "write",
  "search",
  "delete",
]);

const DEFAULT_WORLD_SHIP_COCKPIT_MODEL_URLS = Object.freeze([]);
const WORLD_SHIP_COCKPIT_TARGET_LONGEST_DIMENSION = 3.45;
const DEFAULT_WORLD_SHIP_MODEL_URLS = Object.freeze([]);
const WORLD_SHIP_TARGET_LONGEST_DIMENSION = 0.36;
const WORLD_SHIP_COCKPIT_FORWARD_OFFSET_RATIO = 0.033_823_53;
const WORLD_SHIP_COCKPIT_VERTICAL_OFFSET_RATIO = 0.011_764_71;
const WORLD_SHIP_COCKPIT_REFERENCE_LONGEST_DIMENSION = 13.6;
const WORLD_SHIP_COCKPIT_SCALE = WORLD_SHIP_TARGET_LONGEST_DIMENSION
  / WORLD_SHIP_COCKPIT_REFERENCE_LONGEST_DIMENSION;
const WORLD_SHIP_COCKPIT_ANCHOR_NAME_HINTS = Object.freeze([
  "window_4 - Default_0",
  "window",
  "reactfront_reactfront_0",
  "reactfront",
]);
const WORLD_CAMERA_NEAR_ACTIVE = 0.002;

const DIRECTORY_STRUCTURE = Object.freeze({
  name: "workspace",
  type: "dir",
  children: [
    {
      name: "src",
      type: "dir",
      children: [
        {
          name: "avatars",
          type: "dir",
          children: [
            { name: "clippy-controller.js", type: "file" },
            { name: "hal9000-controller.js", type: "file" },
            { name: "towely-controller.js", type: "file" },
          ],
        },
        {
          name: "lib",
          type: "dir",
          children: [
            { name: "realtime-voice.js", type: "file" },
            { name: "visemes.js", type: "file" },
            {
              name: "world",
              type: "dir",
              children: [
                { name: "desktop-world.js", type: "file" },
                { name: "tool-router.js", type: "file" },
              ],
            },
          ],
        },
        { name: "studio.js", type: "file" },
      ],
    },
    {
      name: "docs",
      type: "dir",
      children: [
        { name: "01-high-level-architecture.md", type: "file" },
        { name: "04-avatar-data-flow.md", type: "file" },
        { name: "07-scene-and-carousel.md", type: "file" },
      ],
    },
    {
      name: "runtime",
      type: "dir",
      children: [
        {
          name: "sessions",
          type: "dir",
          children: [
            { name: "active-session.json", type: "file" },
            { name: "command-history.log", type: "file" },
          ],
        },
        { name: "cache", type: "dir", children: [{ name: "embedding-index.bin", type: "file" }] },
      ],
    },
    { name: "README.md", type: "file" },
  ],
});

const ROOT_BRANCH_FAMILY = Object.freeze({
  dirColor: 0xd2d4d8,
  fileColor: 0x8a9098,
  highlightDirColor: 0xb9c9e0,
  highlightFileColor: 0xc8d5e7,
  glowColor: 0x4e5b6e,
  lineColor: 0xb0bac6,
  flowColor: 0x97abc4,
  labelColor: "#ececec",
});

const BRANCH_COLOR_FAMILIES = Object.freeze([
  Object.freeze({
    dirColor: 0xcfd4db,
    fileColor: 0x88909a,
    highlightDirColor: 0xb8c8df,
    highlightFileColor: 0xc8d5e7,
    glowColor: 0x4f5d6f,
    lineColor: 0xadb8c5,
    flowColor: 0x95aac3,
    labelColor: "#ececec",
  }),
  Object.freeze({
    dirColor: 0xd8d4cb,
    fileColor: 0x91897b,
    highlightDirColor: 0xb4c6de,
    highlightFileColor: 0xc2d2e6,
    glowColor: 0x536073,
    lineColor: 0xb3bcc8,
    flowColor: 0x90a6c0,
    labelColor: "#f0ece1",
  }),
  Object.freeze({
    dirColor: 0xc9c9c9,
    fileColor: 0x7b7b7b,
    highlightDirColor: 0xb7c7de,
    highlightFileColor: 0xc5d4e7,
    glowColor: 0x4f5a6a,
    lineColor: 0xacb7c4,
    flowColor: 0x95aac2,
    labelColor: "#efefef",
  }),
  Object.freeze({
    dirColor: 0xd7d9d1,
    fileColor: 0x8f9487,
    highlightDirColor: 0xb7c7de,
    highlightFileColor: 0xc6d3e5,
    glowColor: 0x546175,
    lineColor: 0xb1bac6,
    flowColor: 0x93a9c1,
    labelColor: "#eff0ea",
  }),
  Object.freeze({
    dirColor: 0xd3d0c8,
    fileColor: 0x8b8478,
    highlightDirColor: 0xb3c6dd,
    highlightFileColor: 0xc2d2e6,
    glowColor: 0x556176,
    lineColor: 0xafb9c5,
    flowColor: 0x8fa6bf,
    labelColor: "#f2eee4",
  }),
]);

function resolveActionFromType(action, nodeType) {
  if (action && action !== "auto") return action;
  return nodeType === "dir" ? "list" : "read";
}

function countLeaves(node) {
  if (!Array.isArray(node.children) || node.children.length === 0) return 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

function buildNodeLayout(root) {
  const entries = [];
  const leafCountByNode = new WeakMap();
  let idCounter = 1;

  function collectLeafCounts(node) {
    const count = countLeaves(node);
    leafCountByNode.set(node, count);
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        collectLeafCounts(child);
      }
    }
  }

  collectLeafCounts(root);

  function walk(node, {
    depth = 0,
    parentId = null,
    path = "",
    xMin = -5.6,
    xMax = 5.6,
  } = {}) {
    const id = `world-node-${idCounter++}`;
    const normalizedPath = path || node.name;
    const x = (xMin + xMax) * 0.5;
    const y = 2.2 - depth * 0.92;
    const z = -2.1 - depth * 1.22;

    entries.push({
      id,
      name: node.name,
      type: node.type === "dir" ? "dir" : "file",
      depth,
      parentId,
      path: normalizedPath,
      x,
      y,
      z,
    });

    if (!Array.isArray(node.children) || node.children.length === 0) return;

    const totalLeaves = leafCountByNode.get(node) || node.children.length || 1;
    let cursor = xMin;
    for (const child of node.children) {
      const childLeaves = leafCountByNode.get(child) || 1;
      const span = ((xMax - xMin) * childLeaves) / totalLeaves;
      const nextPath = `${normalizedPath}/${child.name}`;
      walk(child, {
        depth: depth + 1,
        parentId: id,
        path: nextPath,
        xMin: cursor,
        xMax: cursor + span,
      });
      cursor += span;
    }
  }

  walk(root);
  return entries;
}

function createLabelSprite(THREE, text, color = "#ececec") {
  function shortenLabel(value, maxLength = 22) {
    const raw = String(value || "");
    if (raw.length <= maxLength) return raw;
    const dot = raw.lastIndexOf(".");
    if (dot > 0) {
      const ext = raw.slice(dot);
      const maxHead = maxLength - ext.length - 1;
      if (maxHead >= 7) {
        return `${raw.slice(0, maxHead)}...${ext}`;
      }
    }
    return `${raw.slice(0, maxLength - 3)}...`;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(8, 8, 10, 0.92)";
  ctx.fillRect(12, 22, canvas.width - 24, 84);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 22, canvas.width - 24, 84);
  ctx.globalAlpha = 1;

  ctx.fillStyle = color;
  ctx.font = "600 30px 'Futura PT', Futura, 'Avenir Next', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 6;

  const clipped = shortenLabel(text);
  ctx.fillText(clipped, canvas.width / 2, canvas.height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    toneMapped: false,
  });

  const sprite = new THREE.Sprite(material);
  const width = clamp(0.54 + clipped.length * 0.022, 0.54, 1.24);
  sprite.scale.set(width, 0.16, 1);
  sprite.userData.labelTexture = texture;
  return sprite;
}

function createSpaceDomeTexture(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bgGradient.addColorStop(0, "#020202");
  bgGradient.addColorStop(0.5, "#040404");
  bgGradient.addColorStop(1, "#010101");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const nebulaSeeds = [
    { x: 0.22, y: 0.34, radius: 360, colorA: "rgba(148, 129, 118, 0.11)", colorB: "rgba(24, 20, 18, 0)" },
    { x: 0.63, y: 0.58, radius: 430, colorA: "rgba(110, 24, 18, 0.12)", colorB: "rgba(35, 8, 8, 0)" },
    { x: 0.79, y: 0.32, radius: 300, colorA: "rgba(214, 211, 200, 0.08)", colorB: "rgba(25, 24, 23, 0)" },
  ];

  for (const seed of nebulaSeeds) {
    const nebula = ctx.createRadialGradient(
      canvas.width * seed.x,
      canvas.height * seed.y,
      0,
      canvas.width * seed.x,
      canvas.height * seed.y,
      seed.radius,
    );
    nebula.addColorStop(0, seed.colorA);
    nebula.addColorStop(1, seed.colorB);
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const starCount = 1900;
  for (let i = 0; i < starCount; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const radius = Math.random() < 0.92 ? Math.random() * 1.4 : 1.4 + Math.random() * 2.2;
    const alpha = Math.random() * 0.7 + 0.2;
    const hueShift = Math.random();

    let color = `rgba(233,233,230,${alpha.toFixed(3)})`;
    if (hueShift > 0.82) {
      color = `rgba(255,122,108,${alpha.toFixed(3)})`;
    } else if (hueShift < 0.12) {
      color = `rgba(255,233,209,${alpha.toFixed(3)})`;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createNebulaSpriteTexture(THREE, centerColor, edgeColor) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const gradient = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    24,
    canvas.width / 2,
    canvas.height / 2,
    canvas.width / 2,
  );
  gradient.addColorStop(0, centerColor);
  gradient.addColorStop(1, edgeColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function toTerminalLines(value, {
  maxLines = 6,
  maxChars = 36,
} = {}) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
      .split("\n");
  const lines = [];

  function pushLine(line) {
    const normalized = String(line || "").replace(/\s+/g, " ").trim();
    if (!normalized) return;
    if (normalized.length <= maxChars) {
      lines.push(normalized);
      return;
    }

    let cursor = 0;
    while (cursor < normalized.length) {
      const remaining = normalized.slice(cursor);
      if (remaining.length <= maxChars) {
        lines.push(remaining);
        break;
      }

      const window = remaining.slice(0, maxChars + 1);
      const breakAt = window.lastIndexOf(" ");
      const segmentLength = breakAt > 10 ? breakAt : maxChars;
      lines.push(remaining.slice(0, segmentLength));
      cursor += segmentLength;
      while (normalized[cursor] === " ") cursor += 1;
    }
  }

  for (const entry of source) {
    pushLine(entry);
    if (lines.length >= maxLines) break;
  }

  if (!lines.length) {
    return ["STANDBY"];
  }
  return lines.slice(0, maxLines);
}

function createTerminalScreenTexture(THREE, {
  accent = "#ff5c4a",
  title = "STATUS",
  lines = ["STANDBY"],
  footer = "",
} = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const state = {
    title: String(title || "").toUpperCase(),
    lines: toTerminalLines(lines),
    footer: String(footer || "").toUpperCase(),
  };

  function draw() {
    const width = canvas.width;
    const height = canvas.height;
    const body = ctx.createLinearGradient(0, 0, 0, height);
    body.addColorStop(0, "rgba(12, 12, 13, 0.98)");
    body.addColorStop(1, "rgba(6, 6, 7, 0.98)");

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(243, 241, 236, 0.78)";
    ctx.globalAlpha = 1;
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, width - 20, height - 20);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(22, 22, width - 44, 66);

    ctx.fillStyle = "rgba(17, 17, 18, 0.98)";
    ctx.fillRect(22, 24, width - 44, 70);
    ctx.fillStyle = "#ece7dd";
    ctx.font = "600 39px 'Futura PT', Futura, 'Avenir Next', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(state.title || "STATUS", 40, 60);

    ctx.globalAlpha = 0.14;
    ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
    for (let y = 108; y < height - 28; y += 8) {
      ctx.fillRect(30, y, width - 60, 1);
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#e7e3d9";
    ctx.font = "600 29px 'Share Tech Mono', monospace";
    let y = 138;
    for (const line of state.lines) {
      ctx.fillText(`> ${line}`, 40, y);
      y += 50;
    }

    if (state.footer) {
      ctx.fillStyle = accent;
      ctx.font = "600 23px 'Futura PT', Futura, 'Avenir Next', sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(state.footer, width - 38, height - 32);
    }

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(width - 42, 58, 8, 0, Math.PI * 2);
    ctx.fill();

    texture.needsUpdate = true;
  }

  function render(nextState = {}) {
    if (Object.hasOwn(nextState, "title")) {
      state.title = String(nextState.title || "").toUpperCase();
    }
    if (Object.hasOwn(nextState, "lines")) {
      state.lines = toTerminalLines(nextState.lines);
    }
    if (Object.hasOwn(nextState, "footer")) {
      state.footer = String(nextState.footer || "").toUpperCase();
    }
    draw();
  }

  draw();

  return {
    texture,
    render,
  };
}

function resolveWorldShipCockpitModelUrls() {
  const urls = [];
  const runtimeCockpitUrl = typeof window !== "undefined"
    ? String(window.WORLD_SHIP_COCKPIT_MODEL_URL || "").trim()
    : "";
  if (runtimeCockpitUrl) {
    urls.push(runtimeCockpitUrl);
  }
  // Keep supporting older overrides while defaulting cockpit to the Discovery model asset.
  const legacyRuntimeUrl = typeof window !== "undefined"
    ? String(window.SCELD_MODEL_URL || "").trim()
    : "";
  if (legacyRuntimeUrl && !urls.includes(legacyRuntimeUrl)) {
    urls.push(legacyRuntimeUrl);
  }
  for (const url of DEFAULT_WORLD_SHIP_COCKPIT_MODEL_URLS) {
    if (!urls.includes(url)) {
      urls.push(url);
    }
  }
  return urls;
}

function resolveWorldShipModelUrls() {
  const urls = [];
  const runtimeUrl = typeof window !== "undefined"
    ? String(window.WORLD_SHIP_MODEL_URL || "").trim()
    : "";
  if (runtimeUrl) {
    urls.push(runtimeUrl);
  }
  for (const url of DEFAULT_WORLD_SHIP_MODEL_URLS) {
    if (!urls.includes(url)) {
      urls.push(url);
    }
  }
  return urls;
}

function trackMaterialTextures(root, textureSink, seen = new Set()) {
  if (!root || !Array.isArray(textureSink)) return;
  root.traverse((node) => {
    const materials = Array.isArray(node?.material) ? node.material : [node?.material];
    for (const material of materials) {
      if (!material) continue;
      for (const key of Object.keys(material)) {
        const value = material[key];
        if (!value?.isTexture || seen.has(value)) continue;
        seen.add(value);
        textureSink.push(value);
      }
    }
  });
}

function findNodeByNameHint(root, hints = []) {
  for (const hint of hints) {
    const exactMatch = root?.getObjectByName?.(hint);
    if (exactMatch) return exactMatch;
  }

  const normalizedHints = hints
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter(Boolean);

  let fallbackNode = null;
  root?.traverse?.((node) => {
    if (fallbackNode || !node?.name) return;
    const normalizedName = String(node.name).toLowerCase();
    if (normalizedHints.some((hint) => normalizedName.includes(hint))) {
      fallbackNode = node;
    }
  });
  return fallbackNode;
}

function resolveWorldShipCockpitAnchor(root) {
  return findNodeByNameHint(root, WORLD_SHIP_COCKPIT_ANCHOR_NAME_HINTS);
}

function getObjectLocalBoundsCenter(THREE, root, object, target) {
  if (!THREE || !root || !object || !target) return false;
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) return false;
  bounds.getCenter(target);
  root.worldToLocal(target);
  return true;
}

function prepareImportedCockpitModel(THREE, modelRoot) {
  if (!modelRoot) return;
  modelRoot.traverse((node) => {
    if (!node?.isMesh) return;
    node.castShadow = false;
    node.receiveShadow = false;
    node.frustumCulled = false;

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) continue;
      const materialName = String(material.name || "").toLowerCase();
      const isGlass = materialName.includes("glass") || materialName.includes("window");
      if (isGlass) {
        material.transparent = true;
        material.opacity = clamp(Number(material.opacity) || 0.5, 0.08, 0.65);
        if ("depthWrite" in material) material.depthWrite = false;
        if ("side" in material) material.side = THREE.DoubleSide;
        continue;
      }
      // Cockpit view needs interior-facing surfaces to be visible from inside.
      material.transparent = true;
      material.opacity = clamp(Number(material.opacity) || 0.42, 0.22, 0.62);
      if ("depthWrite" in material) material.depthWrite = false;
      if ("side" in material) material.side = THREE.DoubleSide;
    }
  });
}

function prepareImportedWorldShipModel(THREE, modelRoot) {
  if (!modelRoot) return;
  modelRoot.traverse((node) => {
    if (!node?.isMesh) return;
    node.castShadow = false;
    node.receiveShadow = false;
    node.frustumCulled = false;

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) continue;
      const materialName = String(material.name || "").toLowerCase();
      const isGlass = materialName.includes("glass") || materialName.includes("window");
      if (isGlass) {
        material.transparent = true;
        material.opacity = clamp(Number(material.opacity) || 0.62, 0.14, 0.72);
        if ("depthWrite" in material) material.depthWrite = false;
        if ("side" in material) material.side = THREE.DoubleSide;
        continue;
      }
      if ("side" in material) material.side = THREE.FrontSide;
    }
  });
}

function normalizeImportedCockpitModel(THREE, modelRoot) {
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  if (bounds.isEmpty()) return;

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const cockpitCenter = new THREE.Vector3();
  const cockpitForwardOffset = WORLD_SHIP_COCKPIT_TARGET_LONGEST_DIMENSION
    * WORLD_SHIP_COCKPIT_FORWARD_OFFSET_RATIO;
  const cockpitVerticalOffset = WORLD_SHIP_COCKPIT_TARGET_LONGEST_DIMENSION
    * WORLD_SHIP_COCKPIT_VERTICAL_OFFSET_RATIO;
  bounds.getSize(size);
  bounds.getCenter(center);
  const longestDimension = Math.max(size.x, size.y, size.z);
  if (Number.isFinite(longestDimension) && longestDimension > 1e-6) {
    modelRoot.scale.multiplyScalar(WORLD_SHIP_COCKPIT_TARGET_LONGEST_DIMENSION / longestDimension);
  }

  bounds.setFromObject(modelRoot);
  bounds.getSize(size);
  bounds.getCenter(center);
  modelRoot.position.sub(center);
  modelRoot.updateMatrixWorld(true);

  const cockpitAnchor = resolveWorldShipCockpitAnchor(modelRoot);
  if (
    cockpitAnchor
    && getObjectLocalBoundsCenter(THREE, modelRoot, cockpitAnchor, cockpitCenter)
    && Number.isFinite(cockpitCenter.z)
  ) {
    if (cockpitCenter.z > 0) {
      modelRoot.rotation.y += Math.PI;
      modelRoot.updateMatrixWorld(true);
      getObjectLocalBoundsCenter(THREE, modelRoot, cockpitAnchor, cockpitCenter);
    }

    modelRoot.position.sub(cockpitCenter);
    modelRoot.position.y -= cockpitVerticalOffset;
    modelRoot.position.z -= cockpitForwardOffset;
    return;
  }

  modelRoot.position.y -= size.y * 0.07;
  modelRoot.position.z -= size.z * 0.24;
}

function normalizeImportedWorldShipModel(THREE, modelRoot) {
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  if (bounds.isEmpty()) return;

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const cockpitCenter = new THREE.Vector3();
  const cockpitForwardOffset = WORLD_SHIP_TARGET_LONGEST_DIMENSION
    * WORLD_SHIP_COCKPIT_FORWARD_OFFSET_RATIO;
  const cockpitVerticalOffset = WORLD_SHIP_TARGET_LONGEST_DIMENSION
    * WORLD_SHIP_COCKPIT_VERTICAL_OFFSET_RATIO;
  bounds.getSize(size);
  bounds.getCenter(center);
  const longestDimension = Math.max(size.x, size.y, size.z);
  if (Number.isFinite(longestDimension) && longestDimension > 1e-6) {
    modelRoot.scale.multiplyScalar(WORLD_SHIP_TARGET_LONGEST_DIMENSION / longestDimension);
  }

  bounds.setFromObject(modelRoot);
  bounds.getCenter(center);
  modelRoot.position.sub(center);
  modelRoot.updateMatrixWorld(true);

  const cockpitAnchor = resolveWorldShipCockpitAnchor(modelRoot);
  if (
    cockpitAnchor
    && getObjectLocalBoundsCenter(THREE, modelRoot, cockpitAnchor, cockpitCenter)
    && Number.isFinite(cockpitCenter.z)
  ) {
    if (cockpitCenter.z > 0) {
      modelRoot.rotation.y += Math.PI;
      modelRoot.updateMatrixWorld(true);
      getObjectLocalBoundsCenter(THREE, modelRoot, cockpitAnchor, cockpitCenter);
    }

    modelRoot.position.sub(cockpitCenter);
    modelRoot.position.y -= cockpitVerticalOffset;
    modelRoot.position.z -= cockpitForwardOffset;
    return;
  }

  bounds.setFromObject(modelRoot);
  bounds.getSize(size);
  modelRoot.position.y -= size.y * 0.11;
  modelRoot.position.z += size.z * 0.46;
}

function loadImportedCockpitModel({
  THREE,
  cockpitRig,
  disposableTextures,
} = {}) {
  if (!THREE || !cockpitRig) {
    return () => {};
  }

  const candidateUrls = resolveWorldShipCockpitModelUrls();
  if (!candidateUrls.length) {
    return () => {};
  }

  const loader = new GLTFLoader();
  const fallbackChildren = [...cockpitRig.children];
  const trackedTextureSet = new Set();
  let cancelled = false;
  let fallbackDisposed = false;

  function disposeFallback() {
    if (fallbackDisposed) return;
    fallbackDisposed = true;
    for (const child of fallbackChildren) {
      if (!child) continue;
      if (child.parent === cockpitRig) {
        cockpitRig.remove(child);
      }
      safeDisposeObject3D(child);
    }
  }

  function tryLoad(index) {
    if (cancelled) return;
    if (index >= candidateUrls.length) {
      cockpitRig.userData.modelSource = "none";
      cockpitRig.userData.modelStatus = "failed";
      return;
    }
    const url = candidateUrls[index];
    loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        const modelRoot = gltf?.scene || gltf?.scenes?.[0] || null;
        if (!modelRoot) {
          tryLoad(index + 1);
          return;
        }

        prepareImportedCockpitModel(THREE, modelRoot);
        normalizeImportedCockpitModel(THREE, modelRoot);
        trackMaterialTextures(modelRoot, disposableTextures, trackedTextureSet);
        disposeFallback();
        cockpitRig.add(modelRoot);
        cockpitRig.userData.modelSource = "imported";
        cockpitRig.userData.modelUrl = url;
        cockpitRig.userData.modelStatus = "loaded";
      },
      undefined,
      () => {
        if (cancelled) return;
        tryLoad(index + 1);
      },
    );
  }

  tryLoad(0);
  return () => {
    cancelled = true;
  };
}

function loadWorldShipModel({
  THREE,
  worldShipRig,
  disposableTextures,
} = {}) {
  if (!THREE || !worldShipRig) {
    return () => {};
  }

  const candidateUrls = resolveWorldShipModelUrls();
  if (!candidateUrls.length) {
    return () => {};
  }

  const loader = new GLTFLoader();
  const trackedTextureSet = new Set();
  let cancelled = false;

  function tryLoad(index) {
    if (cancelled || index >= candidateUrls.length) return;
    const url = candidateUrls[index];
    loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        const modelRoot = gltf?.scene || gltf?.scenes?.[0] || null;
        if (!modelRoot) {
          tryLoad(index + 1);
          return;
        }

        prepareImportedWorldShipModel(THREE, modelRoot);
        normalizeImportedWorldShipModel(THREE, modelRoot);
        trackMaterialTextures(modelRoot, disposableTextures, trackedTextureSet);
        worldShipRig.add(modelRoot);
        worldShipRig.userData.modelSource = "imported";
        worldShipRig.userData.modelUrl = url;
        worldShipRig.userData.modelStatus = "loaded";
      },
      undefined,
      () => {
        if (cancelled) return;
        tryLoad(index + 1);
      },
    );
  }

  tryLoad(0);
  return () => {
    cancelled = true;
  };
}

function createCockpitRig(THREE) {
  const cockpit = new THREE.Group();
  cockpit.name = "world-discovery-cockpit-rig";
  cockpit.userData.modelSource = "none";
  cockpit.userData.modelStatus = "awaiting-import";
  return cockpit;
}

function createEnvironment(
  THREE,
  root,
  animatedLightRefs,
  animatedObjectRefs,
  disposableTextures,
) {
  const panelScreens = {
    left: null,
    right: null,
  };

  function setPanelText(panelId, nextState = {}) {
    const panel = panelScreens[panelId];
    if (!panel?.render) return;
    panel.render(nextState);
  }

  const spaceDomeTexture = createSpaceDomeTexture(THREE);
  if (spaceDomeTexture) {
    const spaceDome = new THREE.Mesh(
      new THREE.SphereGeometry(64, 68, 36),
      new THREE.MeshBasicMaterial({
        map: spaceDomeTexture,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    spaceDome.position.set(0, 0, -8);
    root.add(spaceDome);
    animatedObjectRefs.push({
      kind: "rotateY",
      mesh: spaceDome,
      speed: 0.0024,
    });
    disposableTextures.push(spaceDomeTexture);
  }

  const starCount = 1700;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const idx = i * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = 26 + Math.random() * 30;
    starPositions[idx] = radius * Math.sin(phi) * Math.cos(theta);
    starPositions[idx + 1] = radius * Math.cos(phi);
    starPositions[idx + 2] = radius * Math.sin(phi) * Math.sin(theta) - 8;

    const tint = Math.random();
    if (tint > 0.82) {
      starColors[idx] = 0.62;
      starColors[idx + 1] = 0.84;
      starColors[idx + 2] = 1;
    } else if (tint < 0.12) {
      starColors[idx] = 1;
      starColors[idx + 1] = 0.75;
      starColors[idx + 2] = 0.92;
    } else {
      starColors[idx] = 0.92;
      starColors[idx + 1] = 0.97;
      starColors[idx + 2] = 1;
    }
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  starGeometry.setAttribute("color", new THREE.Float32BufferAttribute(starColors, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  root.add(stars);
  animatedObjectRefs.push({
    kind: "twinkle",
    mesh: stars,
    speed: 0.92,
    amplitude: 0.16,
    baseOpacity: 0.72,
    phase: Math.random() * Math.PI * 2,
  });

  const nebulaTextureA = createNebulaSpriteTexture(
    THREE,
    "rgba(82, 118, 168, 0.14)",
    "rgba(20, 30, 48, 0)",
  );
  const nebulaTextureB = createNebulaSpriteTexture(
    THREE,
    "rgba(214, 206, 193, 0.12)",
    "rgba(35, 32, 29, 0)",
  );
  if (nebulaTextureA) disposableTextures.push(nebulaTextureA);
  if (nebulaTextureB) disposableTextures.push(nebulaTextureB);

  const nebulaSpecs = [
    { texture: nebulaTextureA, x: -11, y: 4, z: -22, scale: 18, speed: 0.22, phase: 0.6 },
    { texture: nebulaTextureB, x: 12, y: 1, z: -19, scale: 16, speed: 0.18, phase: 1.5 },
  ];
  for (const spec of nebulaSpecs) {
    if (!spec.texture) continue;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: spec.texture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    sprite.position.set(spec.x, spec.y, spec.z);
    sprite.scale.set(spec.scale, spec.scale, 1);
    root.add(sprite);
    animatedObjectRefs.push({
      kind: "pulse",
      mesh: sprite,
      baseScale: spec.scale,
      baseOpacity: 0.1,
      amplitude: 0.03,
      speed: spec.speed,
      phase: spec.phase,
    });
  }

  const monitorFrame = new THREE.Mesh(
    new THREE.BoxGeometry(6.2, 3.4, 0.22),
    new THREE.MeshStandardMaterial({
      color: 0x090909,
      metalness: 0.52,
      roughness: 0.42,
      emissive: 0x141414,
      emissiveIntensity: 0.14,
    }),
  );
  monitorFrame.position.set(0, 0.56, -5.9);
  monitorFrame.castShadow = true;
  root.add(monitorFrame);

  const monitorScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(5.78, 2.98),
    new THREE.MeshBasicMaterial({
      color: 0x09121d,
      transparent: true,
      opacity: 0.86,
    }),
  );
  monitorScreen.position.set(0, 0.56, -5.78);
  root.add(monitorScreen);

  const solarSetpiece = createSolarSystemSetpiece({
    textureSink: disposableTextures,
  });
  if (solarSetpiece?.group) {
    root.add(solarSetpiece.group);
    animatedObjectRefs.push({
      kind: "customUpdate",
      update: (dt, viewCamera, viewportHeightPx) => solarSetpiece.update(dt, viewCamera, viewportHeightPx),
    });
  }

  const rightPanel = new THREE.Mesh(
    new THREE.BoxGeometry(2.84, 1.66, 0.18),
    new THREE.MeshStandardMaterial({
      color: 0x0a0a0b,
      metalness: 0.46,
      roughness: 0.4,
      emissive: 0x131f2f,
      emissiveIntensity: 0.14,
    }),
  );
  rightPanel.position.set(3.82, 3.22, -5.88);
  rightPanel.rotation.y = -0.35;
  rightPanel.rotation.x = -0.04;
  root.add(rightPanel);

  const rightPanelGlow = new THREE.PointLight(0x8ba8d2, 0.34, 9, 2);
  rightPanelGlow.position.set(3.92, 3.52, -5.36);
  root.add(rightPanelGlow);
  animatedLightRefs.push(rightPanelGlow);

  const rightTerminal = createTerminalScreenTexture(THREE, {
    accent: "#ff604e",
    title: "MISSION STATUS",
    lines: ["WORLD STANDBY", "AWAITING INPUT"],
    footer: "HAL LINK",
  });
  if (rightTerminal) {
    const rightScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.36, 1.18),
      new THREE.MeshBasicMaterial({
        map: rightTerminal.texture,
        transparent: true,
        opacity: 0.96,
        toneMapped: false,
      }),
    );
    rightScreen.position.set(0, 0, 0.097);
    rightPanel.add(rightScreen);
    panelScreens.right = rightTerminal;
    disposableTextures.push(rightTerminal.texture);
  }

  const leftPanel = new THREE.Mesh(
    new THREE.BoxGeometry(2.84, 1.66, 0.18),
    new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      metalness: 0.42,
      roughness: 0.42,
      emissive: 0x1d1c19,
      emissiveIntensity: 0.18,
    }),
  );
  leftPanel.position.set(-3.82, 3.22, -5.88);
  leftPanel.rotation.y = 0.35;
  leftPanel.rotation.x = -0.04;
  root.add(leftPanel);

  const leftPanelGlow = new THREE.PointLight(0xd8d2c6, 0.5, 9.5, 2);
  leftPanelGlow.position.set(-3.92, 3.52, -5.36);
  root.add(leftPanelGlow);
  animatedLightRefs.push(leftPanelGlow);

  const leftTerminal = createTerminalScreenTexture(THREE, {
    accent: "#dfd9ce",
    title: "AE-35 COMMAND",
    lines: ["ACTION AUTO", "SELECT A NODE"],
    footer: "DISCOVERY BUS",
  });
  if (leftTerminal) {
    const leftScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.36, 1.18),
      new THREE.MeshBasicMaterial({
        map: leftTerminal.texture,
        transparent: true,
        opacity: 0.96,
        toneMapped: false,
      }),
    );
    leftScreen.position.set(0, 0, 0.097);
    leftPanel.add(leftScreen);
    panelScreens.left = leftTerminal;
    disposableTextures.push(leftTerminal.texture);
  }

  return {
    setPanelText,
    getWorldAnchor(name, target) {
      return solarSetpiece?.getWorldAnchor?.(name, target) || null;
    },
    getWorldBodyRadius(name) {
      return solarSetpiece?.getWorldBodyRadius?.(name) || null;
    },
    setScaleMode(mode) {
      solarSetpiece?.setScaleMode?.(mode);
    },
    getScaleMode() {
      return solarSetpiece?.getScaleMode?.() || "readable";
    },
    dispose() {
      solarSetpiece?.dispose?.();
    },
  };
}

function createDirectoryGraph(THREE, directoryGroup) {
  const entries = buildNodeLayout(DIRECTORY_STRUCTURE);
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const materials = [];
  const labels = [];
  const pickables = [];
  const connections = [];

  const topLevelNames = Array.isArray(DIRECTORY_STRUCTURE.children)
    ? DIRECTORY_STRUCTURE.children.map((child) => child.name)
    : [];
  const branchIndexByName = new Map(topLevelNames.map((name, index) => [name, index]));

  const dirGeometry = new THREE.IcosahedronGeometry(0.21, 1);
  const fileGeometry = new THREE.IcosahedronGeometry(0.15, 0);
  const auraGeometry = new THREE.SphereGeometry(1, 20, 14);
  const flowGeometry = new THREE.SphereGeometry(0.025, 10, 10);

  function resolveEntryFamily(entry) {
    const pathParts = String(entry.path || "").split("/");
    const topLevel = pathParts.length > 1 ? pathParts[1] : "";
    if (!branchIndexByName.has(topLevel)) {
      return {
        branchName: topLevel,
        family: ROOT_BRANCH_FAMILY,
      };
    }
    const branchIndex = branchIndexByName.get(topLevel) || 0;
    return {
      branchName: topLevel,
      family: BRANCH_COLOR_FAMILIES[branchIndex % BRANCH_COLOR_FAMILIES.length],
    };
  }

  for (const entry of entries) {
    const { family, branchName } = resolveEntryFamily(entry);
    entry.family = family;
    entry.branchName = branchName;

    const isDir = entry.type === "dir";
    const baseColor = isDir ? family.dirColor : family.fileColor;
    const highlightColor = isDir ? family.highlightDirColor : family.highlightFileColor;
    const baseEmissive = isDir ? 0.08 : 0.05;
    const highlightEmissive = isDir ? 0.2 : 0.15;

    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      metalness: isDir ? 0.18 : 0.1,
      roughness: isDir ? 0.36 : 0.52,
      emissive: family.glowColor,
      emissiveIntensity: baseEmissive,
      transparent: true,
      opacity: isDir ? 0.9 : 0.82,
    });
    materials.push(material);

    const mesh = new THREE.Mesh(entry.type === "dir" ? dirGeometry : fileGeometry, material);
    const baseScale = isDir ? 1.08 : 0.94;
    mesh.scale.setScalar(baseScale);
    mesh.position.set(entry.x, entry.y, entry.z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.worldNodeId = entry.id;
    mesh.userData.worldNodeType = entry.type;
    mesh.userData.worldNodePath = entry.path;
    mesh.userData.worldNodeName = entry.name;
    mesh.userData.baseY = entry.y;
    mesh.userData.baseScale = baseScale;
    mesh.userData.baseColor = baseColor;
    mesh.userData.highlightColor = highlightColor;
    mesh.userData.baseEmissive = baseEmissive;
    mesh.userData.highlightEmissive = highlightEmissive;
    mesh.userData.family = family;

    const auraMaterial = new THREE.MeshBasicMaterial({
      color: family.glowColor,
      transparent: true,
      opacity: isDir ? 0.012 : 0.008,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    materials.push(auraMaterial);

    const aura = new THREE.Mesh(auraGeometry, auraMaterial);
    aura.scale.setScalar(isDir ? 0.84 : 0.68);
    aura.userData.baseScale = aura.scale.x;
    aura.userData.baseOpacity = auraMaterial.opacity;
    aura.userData.highlightOpacity = isDir ? 0.03 : 0.022;
    mesh.add(aura);
    mesh.userData.aura = aura;
    directoryGroup.add(mesh);

    const labelColor = family.labelColor;
    const label = createLabelSprite(THREE, entry.name, labelColor);
    if (label) {
      label.position.set(entry.x, entry.y + 0.26, entry.z);
      label.visible = entry.depth <= 1;
      directoryGroup.add(label);
      labels.push(label);
      mesh.userData.label = label;
    }

    entry.mesh = mesh;
    pickables.push(mesh);
  }

  for (const entry of entries) {
    if (!entry.parentId) continue;
    const parentEntry = entriesById.get(entry.parentId);
    if (!parentEntry) continue;

    const family = entry.family || ROOT_BRANCH_FAMILY;
    const start = new THREE.Vector3(parentEntry.x, parentEntry.y - 0.06, parentEntry.z);
    const end = new THREE.Vector3(entry.x, entry.y + 0.05, entry.z);
    const arcHeight = Math.max(start.y, end.y) + 0.16 + Math.abs(start.x - end.x) * 0.07;
    const arcZ = Math.min(start.z, end.z) - 0.24;
    const controlA = new THREE.Vector3(
      start.x * 0.72 + end.x * 0.28,
      arcHeight,
      arcZ,
    );
    const controlB = new THREE.Vector3(
      start.x * 0.28 + end.x * 0.72,
      arcHeight,
      arcZ,
    );

    const curve = new THREE.CubicBezierCurve3(start, controlA, controlB, end);
    const curvePoints = curve.getPoints(28);

    const lineMaterial = new THREE.LineBasicMaterial({
      color: family.lineColor,
      transparent: true,
      opacity: 0.2,
    });
    materials.push(lineMaterial);

    const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const line = new THREE.Line(geometry, lineMaterial);
    line.userData.connection = true;
    directoryGroup.add(line);

    const flowMaterial = new THREE.MeshBasicMaterial({
      color: family.flowColor,
      transparent: true,
      opacity: 0.18,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    materials.push(flowMaterial);

    const flow = new THREE.Mesh(flowGeometry, flowMaterial);
    const phase = Math.random();
    const flowPosition = new THREE.Vector3();
    curve.getPointAt(phase, flowPosition);
    flow.position.copy(flowPosition);
    directoryGroup.add(flow);

    connections.push({
      curve,
      lineMaterial,
      flowMaterial,
      flow,
      flowPosition,
      speed: 0.1 + Math.random() * 0.24,
      phase,
      baseOpacity: 0.1 + Math.random() * 0.08,
      sourceId: parentEntry.id,
      targetId: entry.id,
    });
  }

  return {
    entries,
    entriesById,
    materials,
    labels,
    pickables,
    connections,
    dirGeometry,
    fileGeometry,
    auraGeometry,
    flowGeometry,
  };
}

export function createDesktopWorld({
  THREE,
  scene,
  camera,
  canvas,
  onToolAction,
} = {}) {
  const WORLD_CAMERA_FOV_DEGREES = 38;
  const WORLD_ENTRY_CAMERA_POSITION = Object.freeze([0.079, 9.166, 10.487]);
  const WORLD_ENTRY_CAMERA_TARGET = Object.freeze([0.047, 5.996, 4.246]);
  const WORLD_ENTRY_MIN_DISTANCE = 2.5;
  const WORLD_ENTRY_MAX_DISTANCE = 12;

  const root = new THREE.Group();
  root.visible = false;
  root.name = "desktop-world";
  scene.add(root);

  const worldShipRig = new THREE.Group();
  worldShipRig.name = "world-discovery-ship-rig";
  worldShipRig.userData.modelSource = "none";
  worldShipRig.userData.modelStatus = "fallback";
  worldShipRig.visible = false;
  root.add(worldShipRig);

  const cockpitRig = createCockpitRig(THREE);
  cockpitRig.scale.setScalar(WORLD_SHIP_COCKPIT_SCALE);
  cockpitRig.visible = false;
  worldShipRig.add(cockpitRig);

  const animatedLights = [];
  const animatedObjects = [];
  const disposableTextures = [];
  const cancelWorldShipModelLoad = loadWorldShipModel({
    THREE,
    worldShipRig,
    disposableTextures,
  });
  const cancelCockpitModelLoad = loadImportedCockpitModel({
    THREE,
    cockpitRig,
    disposableTextures,
  });
  const environment = createEnvironment(
    THREE,
    root,
    animatedLights,
    animatedObjects,
    disposableTextures,
  );

  const worldLights = {
    ambient: new THREE.AmbientLight(0x171717, 0.44),
    key: new THREE.DirectionalLight(0xf2efe8, 1.06),
    fill: new THREE.DirectionalLight(0x2f3b4e, 0.26),
  };
  worldLights.key.position.set(2.2, 5.2, 1.8);
  worldLights.key.castShadow = true;
  worldLights.key.shadow.mapSize.set(1024, 1024);
  worldLights.fill.position.set(-3.8, 2.2, 3.8);
  root.add(worldLights.ambient, worldLights.key, worldLights.fill);

  const avatarAnchor = new THREE.Group();
  avatarAnchor.position.set(-3.3, 2.62, 0.52);
  avatarAnchor.rotation.y = 0.2;
  root.add(avatarAnchor);

  const directoryGroup = new THREE.Group();
  root.add(directoryGroup);

  const graph = createDirectoryGraph(THREE, directoryGroup);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const rayDirection = new THREE.Vector3();
  const rootEntryId = graph.entries[0]?.id || "";
  let active = false;
  let selectedNodeId = rootEntryId;
  let currentAction = "auto";
  let attachedAvatar = null;
  let attachedAvatarId = "";
  let elapsed = 0;
  let worldOrbit = null;
  const defaultCameraFov = Number(camera?.fov) > 0 ? Number(camera.fov) : 45;
  const defaultCameraNear = Number(camera?.near) > 0 ? Number(camera.near) : 0.1;

  function buildContextSet(selectedId) {
    const context = new Set();
    if (!selectedId || !graph.entriesById.has(selectedId)) return context;

    let cursorId = selectedId;
    while (cursorId && graph.entriesById.has(cursorId)) {
      context.add(cursorId);
      const cursor = graph.entriesById.get(cursorId);
      cursorId = cursor?.parentId || "";
    }

    for (const entry of graph.entries) {
      if (entry.parentId === selectedId) {
        context.add(entry.id);
      }
    }

    return context;
  }

  function applyGraphReadability(selectedId) {
    const contextSet = buildContextSet(selectedId);

    for (const entry of graph.entries) {
      const mesh = entry.mesh;
      if (!mesh?.material) continue;
      const isSelected = entry.id === selectedId;
      const inContext = contextSet.has(entry.id);
      const baseOpacity = inContext ? (isSelected ? 1 : 0.84) : 0.18;
      mesh.material.opacity = baseOpacity;
      mesh.material.needsUpdate = true;

      const aura = mesh.userData?.aura;
      if (aura?.material) {
        const auraBase = Number(aura.userData.baseOpacity) || 0.012;
        const auraHighlight = Number(aura.userData.highlightOpacity) || 0.03;
        aura.material.opacity = isSelected
          ? auraHighlight
          : inContext
            ? auraBase * 0.95
            : auraBase * 0.28;
        aura.material.needsUpdate = true;
      }

      const label = mesh.userData?.label;
      if (label?.material) {
        const shouldShowLabel = entry.depth <= 1 || inContext;
        label.visible = shouldShowLabel;
        label.material.opacity = isSelected ? 1 : inContext ? 0.92 : 0.8;
        label.material.needsUpdate = true;
      }
    }

    for (const connection of graph.connections || []) {
      const inContext = contextSet.has(connection.sourceId) && contextSet.has(connection.targetId);
      connection.baseOpacity = inContext ? 0.16 : 0.01;
      connection.flow.visible = inContext;
    }
  }

  function setEntryHighlight(entry, highlighted) {
    if (!entry?.mesh?.material) return;
    const baseEmissive = Number(entry.mesh.userData.baseEmissive) || 0.3;
    const highlightEmissive = Number(entry.mesh.userData.highlightEmissive) || (baseEmissive + 0.4);
    entry.mesh.material.emissiveIntensity = highlighted ? highlightEmissive : baseEmissive;
    entry.mesh.material.color.set(
      highlighted
        ? (entry.mesh.userData.highlightColor || entry.mesh.userData.baseColor || 0x8ca8d6)
        : (entry.mesh.userData.baseColor || 0x3a4763),
    );
    entry.mesh.material.needsUpdate = true;

    const aura = entry.mesh.userData?.aura;
    if (aura?.material) {
      const baseOpacity = Number(aura.userData.baseOpacity) || 0.01;
      const highlightOpacity = Number(aura.userData.highlightOpacity) || (baseOpacity + 0.016);
      aura.material.opacity = highlighted ? highlightOpacity : baseOpacity;
      aura.material.needsUpdate = true;
    }

    const label = entry.mesh.userData?.label;
    if (label?.material) {
      label.material.opacity = highlighted ? 1 : 0.84;
      label.material.needsUpdate = true;
    }
  }

  function applySelection(nextNodeId) {
    if (!nextNodeId || !graph.entriesById.has(nextNodeId)) return;
    if (selectedNodeId && graph.entriesById.has(selectedNodeId)) {
      setEntryHighlight(graph.entriesById.get(selectedNodeId), false);
    }
    selectedNodeId = nextNodeId;
    setEntryHighlight(graph.entriesById.get(selectedNodeId), true);
    applyGraphReadability(selectedNodeId);
  }

  applySelection(selectedNodeId);

  function getSelectedNode() {
    return graph.entriesById.get(selectedNodeId) || null;
  }

  function setAction(action) {
    if (!DESKTOP_WORLD_ACTIONS.includes(action)) return;
    currentAction = action;
  }

  function getAction() {
    return currentAction;
  }

  function setScaleMode(mode) {
    environment?.setScaleMode?.(mode);
  }

  function getScaleMode() {
    return environment?.getScaleMode?.() || "readable";
  }

  function setWorldCameraFov(fovDegrees) {
    const nextFov = Number(fovDegrees);
    if (!Number.isFinite(nextFov) || nextFov <= 0.1) return;
    if (Math.abs((Number(camera?.fov) || 0) - nextFov) <= 1e-4) return;
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
  }

  function setWorldCameraNear(nearDistance) {
    const nextNear = Number(nearDistance);
    if (!Number.isFinite(nextNear) || nextNear <= 1e-6) return;
    if (Math.abs((Number(camera?.near) || 0) - nextNear) <= 1e-6) return;
    camera.near = nextNear;
    camera.updateProjectionMatrix();
  }

  function setStatusPanels({ left = null, right = null } = {}) {
    if (left) environment?.setPanelText?.("left", left);
    if (right) environment?.setPanelText?.("right", right);
  }

  function setVisible(nextVisible) {
    active = Boolean(nextVisible);
    root.visible = active;
    worldShipRig.visible = false;
    cockpitRig.visible = false;
    setWorldCameraFov(active ? WORLD_CAMERA_FOV_DEGREES : defaultCameraFov);
    setWorldCameraNear(active ? WORLD_CAMERA_NEAR_ACTIVE : defaultCameraNear);
    if (worldOrbit) {
      worldOrbit.enableRotate = !active;
      worldOrbit.enablePan = !active;
      worldOrbit.enableZoom = !active;
    }
  }

  function setXrPresentationActive() {
    worldShipRig.visible = false;
  }

  function attachAvatar(avatarId, avatarGroup, { yOffset = 0 } = {}) {
    if (!avatarGroup) return false;
    if (avatarGroup.parent) avatarGroup.parent.remove(avatarGroup);
    avatarAnchor.add(avatarGroup);
    avatarAnchor.position.y = 2.62 + yOffset;
    avatarGroup.rotation.y = 0;
    attachedAvatar = avatarGroup;
    attachedAvatarId = String(avatarId || "");
    return true;
  }

  function detachAvatar() {
    if (!attachedAvatar) {
      return {
        avatarId: attachedAvatarId,
        avatarGroup: null,
      };
    }

    const avatarGroup = attachedAvatar;
    if (avatarGroup.parent === avatarAnchor) {
      avatarAnchor.remove(avatarGroup);
    }
    attachedAvatar = null;
    const avatarId = attachedAvatarId;
    attachedAvatarId = "";
    return { avatarId, avatarGroup };
  }

  function pickWorldNodeFromHits(hits) {
    const hit = hits[0];
    if (!hit?.object?.userData?.worldNodeId) return null;

    const nodeId = hit.object.userData.worldNodeId;
    applySelection(nodeId);
    const node = graph.entriesById.get(nodeId);
    if (!node) return null;

    const action = resolveActionFromType(currentAction, node.type);
    const payload = {
      action,
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      path: node.path,
      avatarId: attachedAvatarId,
    };

    if (typeof onToolAction === "function") {
      onToolAction(payload);
    }
    return payload;
  }

  function pickWorldNode(clientX, clientY) {
    if (!active || !canvas || !camera) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObjects(graph.pickables, false);
    return pickWorldNodeFromHits(hits);
  }

  function pickWorldNodeFromRay(origin, direction, { maxDistance = Infinity } = {}) {
    if (!active || !origin || !direction) return null;
    rayDirection.copy(direction);
    if (rayDirection.lengthSq() < 1e-8) return null;
    rayDirection.normalize();

    const previousFar = raycaster.far;
    if (Number.isFinite(maxDistance) && maxDistance > 0) {
      raycaster.far = maxDistance;
    } else {
      raycaster.far = Infinity;
    }
    raycaster.set(origin, rayDirection);
    const hits = raycaster.intersectObjects(graph.pickables, false);
    raycaster.far = previousFar;

    return pickWorldNodeFromHits(hits);
  }

  function focusOnWorldCamera(orbit) {
    worldOrbit = orbit || worldOrbit;
    if (worldOrbit) {
      worldOrbit.minDistance = WORLD_ENTRY_MIN_DISTANCE;
      worldOrbit.maxDistance = WORLD_ENTRY_MAX_DISTANCE;
    }

    camera.position.set(...WORLD_ENTRY_CAMERA_POSITION);
    camera.lookAt(...WORLD_ENTRY_CAMERA_TARGET);
    if (worldOrbit) {
      worldOrbit.target.set(...WORLD_ENTRY_CAMERA_TARGET);
      worldOrbit.update();
    }
    worldShipRig.visible = false;
    cockpitRig.visible = false;
  }

  function update(dt = 0.016, viewCamera = camera, viewportHeightPx = 0) {
    if (!active) return;
    const clampedDt = Math.min(0.08, Math.max(0.001, dt));
    elapsed += clampedDt;

    for (const animated of animatedObjects) {
      if (animated.kind === "customUpdate" && typeof animated.update === "function") {
        animated.update(clampedDt, viewCamera, viewportHeightPx);
        continue;
      }

      const mesh = animated?.mesh;
      if (!mesh) continue;

      if (animated.kind === "rotateY") {
        mesh.rotation.y += clampedDt * (animated.speed || 0.05);
        continue;
      }

      if (animated.kind === "rotateZ") {
        mesh.rotation.z += clampedDt * (animated.speed || 0.08);
        continue;
      }

      if (animated.kind === "twinkle" && mesh.material) {
        const opacity = (animated.baseOpacity || 0.7)
          + Math.sin(elapsed * (animated.speed || 1) + (animated.phase || 0)) * (animated.amplitude || 0.12);
        mesh.material.opacity = clamp(opacity, 0.2, 0.95);
        mesh.material.needsUpdate = true;
        continue;
      }

      if (animated.kind === "pulse") {
        const wave = Math.sin(elapsed * (animated.speed || 0.4) + (animated.phase || 0));
        const scale = (animated.baseScale || 1) * (1 + wave * (animated.amplitude || 0.06));
        mesh.scale.set(scale, scale, 1);
        if (mesh.material) {
          mesh.material.opacity = clamp(
            (animated.baseOpacity || 0.24) + wave * 0.06,
            0.05,
            0.65,
          );
          mesh.material.needsUpdate = true;
        }
        continue;
      }

    }
    for (const entry of graph.entries) {
      const mesh = entry.mesh;
      if (!mesh) continue;
      const depthOffset = entry.depth * 0.62;
      const bob = Math.sin(elapsed * (1.3 + entry.depth * 0.08) + depthOffset) * 0.013;
      mesh.position.y = (mesh.userData.baseY || entry.y) + bob;
      mesh.rotation.y = Math.sin(elapsed * 0.42 + depthOffset) * 0.03;

      const baseScale = Number(mesh.userData.baseScale) || 1;
      const twinkle = 1 + Math.sin(elapsed * (2 + entry.depth * 0.18) + depthOffset * 1.7) * 0.085;
      mesh.scale.setScalar(baseScale * twinkle);

      const aura = mesh.userData?.aura;
      if (aura) {
        const auraBaseScale = Number(aura.userData.baseScale) || 1.8;
        aura.scale.setScalar(auraBaseScale * (1 + Math.sin(elapsed * 2.4 + depthOffset) * 0.1));
      }

      const label = mesh.userData.label;
      if (label) {
        label.position.y = mesh.position.y + 0.2;
        label.position.z = mesh.position.z;
      }
    }

    for (const connection of graph.connections || []) {
      const t = (elapsed * connection.speed + connection.phase) % 1;
      connection.curve.getPointAt(t, connection.flowPosition);
      connection.flow.position.copy(connection.flowPosition);

      const wave = Math.sin(elapsed * 2 + connection.phase * Math.PI * 2);
      connection.lineMaterial.opacity = clamp(connection.baseOpacity + wave * 0.05, 0.02, 0.26);
      connection.flowMaterial.opacity = clamp(0.11 + wave * 0.04, 0.02, 0.2);
      connection.lineMaterial.needsUpdate = true;
      connection.flowMaterial.needsUpdate = true;
    }

    const selected = getSelectedNode();
    if (selected?.mesh?.material) {
      const baseIntensity = Number(selected.mesh.userData.highlightEmissive)
        || (selected.type === "dir" ? 0.22 : 0.18);
      selected.mesh.material.emissiveIntensity = baseIntensity + Math.sin(elapsed * 2.9) * 0.04;
    }

    if (animatedLights.length > 0) {
      const left = animatedLights[0];
      if (left) {
        left.intensity = 0.42 + Math.sin(elapsed * 1.2) * 0.09;
      }
    }

    if (animatedLights.length > 1) {
      const right = animatedLights[1];
      if (right) {
        right.intensity = 0.46 + Math.cos(elapsed * 1.1) * 0.1;
      }
    }
  }

  function dispose() {
    cancelWorldShipModelLoad?.();
    cancelCockpitModelLoad?.();
    environment?.dispose?.();
    scene.remove(root);
    if (worldShipRig.parent === root) {
      root.remove(worldShipRig);
    }
    safeDisposeObject3D(worldShipRig);
    safeDisposeObject3D(root);
    for (const texture of disposableTextures) {
      if (texture && typeof texture.dispose === "function") {
        texture.dispose();
      }
    }
    for (const label of graph.labels) {
      const texture = label?.userData?.labelTexture;
      if (texture && typeof texture.dispose === "function") {
        texture.dispose();
      }
    }
    if (graph.dirGeometry) graph.dirGeometry.dispose();
    if (graph.fileGeometry) graph.fileGeometry.dispose();
    if (graph.auraGeometry) graph.auraGeometry.dispose();
    if (graph.flowGeometry) graph.flowGeometry.dispose();
  }

  return {
    group: root,
    setVisible,
    isActive: () => active,
    setAction,
    getAction,
    setScaleMode,
    getScaleMode,
    setStatusPanels,
    attachAvatar,
    detachAvatar,
    pickWorldNode,
    pickWorldNodeFromRay,
    setXrPresentationActive,
    focusOnWorldCamera,
    update,
    dispose,
  };
}
