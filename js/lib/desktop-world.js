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

const DEFAULT_SCELD_MODEL_URLS = Object.freeze([
  new URL(/* @vite-ignore */ "../../assets/models/sceld.glb", import.meta.url).href,
  new URL(/* @vite-ignore */ "../../assets/models/sceld.gltf", import.meta.url).href,
]);
const SCELD_MODEL_TARGET_LONGEST_DIMENSION = 3.45;

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
  highlightDirColor: 0xff6150,
  highlightFileColor: 0xff8678,
  glowColor: 0x5f646c,
  lineColor: 0xbbc1ca,
  flowColor: 0xffb5ab,
  labelColor: "#ececec",
});

const BRANCH_COLOR_FAMILIES = Object.freeze([
  Object.freeze({
    dirColor: 0xcfd4db,
    fileColor: 0x88909a,
    highlightDirColor: 0xff5f4e,
    highlightFileColor: 0xff8477,
    glowColor: 0x5b616a,
    lineColor: 0xb8bec7,
    flowColor: 0xffb7ac,
    labelColor: "#ececec",
  }),
  Object.freeze({
    dirColor: 0xd8d4cb,
    fileColor: 0x91897b,
    highlightDirColor: 0xff6b59,
    highlightFileColor: 0xff8f7d,
    glowColor: 0x696354,
    lineColor: 0xc8c1b4,
    flowColor: 0xffc0b3,
    labelColor: "#f0ece1",
  }),
  Object.freeze({
    dirColor: 0xc9c9c9,
    fileColor: 0x7b7b7b,
    highlightDirColor: 0xff5a48,
    highlightFileColor: 0xff7f70,
    glowColor: 0x5e5d5d,
    lineColor: 0xb9b9b9,
    flowColor: 0xffb1a6,
    labelColor: "#efefef",
  }),
  Object.freeze({
    dirColor: 0xd7d9d1,
    fileColor: 0x8f9487,
    highlightDirColor: 0xff6f5f,
    highlightFileColor: 0xff988b,
    glowColor: 0x66695f,
    lineColor: 0xc2c5bb,
    flowColor: 0xffc3b9,
    labelColor: "#eff0ea",
  }),
  Object.freeze({
    dirColor: 0xd3d0c8,
    fileColor: 0x8b8478,
    highlightDirColor: 0xff7360,
    highlightFileColor: 0xff9a8b,
    glowColor: 0x686257,
    lineColor: 0xc3bfb4,
    flowColor: 0xffc7bc,
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

function resolveSceldModelUrls() {
  const urls = [];
  const runtimeUrl = typeof window !== "undefined"
    ? String(window.SCELD_MODEL_URL || "").trim()
    : "";
  if (runtimeUrl) {
    urls.push(runtimeUrl);
  }
  for (const url of DEFAULT_SCELD_MODEL_URLS) {
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
      }
    }
  });
}

function normalizeImportedCockpitModel(THREE, modelRoot) {
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  if (bounds.isEmpty()) return;

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bounds.getSize(size);
  bounds.getCenter(center);
  const longestDimension = Math.max(size.x, size.y, size.z);
  if (Number.isFinite(longestDimension) && longestDimension > 1e-6) {
    modelRoot.scale.multiplyScalar(SCELD_MODEL_TARGET_LONGEST_DIMENSION / longestDimension);
  }

  bounds.setFromObject(modelRoot);
  bounds.getSize(size);
  bounds.getCenter(center);
  modelRoot.position.sub(center);
  modelRoot.position.y -= size.y * 0.07;
  modelRoot.position.z -= size.z * 0.24;
}

function loadImportedCockpitModel({
  THREE,
  cockpitRig,
  disposableTextures,
} = {}) {
  if (!THREE || !cockpitRig) {
    return () => {};
  }

  const candidateUrls = resolveSceldModelUrls();
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

function createCockpitRig(THREE) {
  const cockpit = new THREE.Group();
  cockpit.name = "world-sceld-cockpit-rig";
  cockpit.userData.modelSource = "procedural";
  cockpit.userData.modelStatus = "fallback";

  const hullMat = new THREE.MeshBasicMaterial({
    color: 0x101216,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    toneMapped: false,
  });
  const trimMat = new THREE.MeshBasicMaterial({
    color: 0x8e96a3,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
  });
  const accentMat = new THREE.MeshBasicMaterial({
    color: 0x4f5f79,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    toneMapped: false,
  });
  const glassMat = new THREE.MeshBasicMaterial({
    color: 0x6f8ec0,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
    toneMapped: false,
  });

  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.24, 3.4), hullMat);
  deck.position.set(0, -1.18, -0.7);
  cockpit.add(deck);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.18, 2.9), hullMat);
  roof.position.set(0, 1.02, -0.72);
  cockpit.add(roof);

  const leftHull = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.86, 3.0), hullMat);
  leftHull.position.set(-1.56, -0.03, -0.7);
  cockpit.add(leftHull);

  const rightHull = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.86, 3.0), hullMat);
  rightHull.position.set(1.56, -0.03, -0.7);
  cockpit.add(rightHull);

  const rearBulkhead = new THREE.Mesh(new THREE.BoxGeometry(2.84, 1.9, 0.18), hullMat);
  rearBulkhead.position.set(0, -0.03, 0.82);
  cockpit.add(rearBulkhead);

  const dashboard = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.34, 0.85), hullMat);
  dashboard.position.set(0, -0.96, -1.2);
  cockpit.add(dashboard);

  const topFrame = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.1, 0.14), hullMat);
  topFrame.position.set(0, 0.78, -1.1);
  cockpit.add(topFrame);

  const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.56, 0.14), hullMat);
  leftFrame.position.set(-1.16, -0.03, -1.08);
  cockpit.add(leftFrame);

  const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.56, 0.14), hullMat);
  rightFrame.position.set(1.16, -0.03, -1.08);
  cockpit.add(rightFrame);

  const leftSupport = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.26, 0.08), trimMat);
  leftSupport.position.set(-0.68, -0.23, -1.04);
  leftSupport.rotation.z = 0.2;
  cockpit.add(leftSupport);

  const rightSupport = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.26, 0.08), trimMat);
  rightSupport.position.set(0.68, -0.23, -1.04);
  rightSupport.rotation.z = -0.2;
  cockpit.add(rightSupport);

  const frontPlate = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.12), accentMat);
  frontPlate.position.set(0, -0.48, -1.12);
  cockpit.add(frontPlate);

  const canopyGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.02, 1.24), glassMat);
  canopyGlass.position.set(0, 0.02, -1.12);
  cockpit.add(canopyGlass);

  const leftWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.52, 0.9), glassMat);
  leftWindow.position.set(-1.02, 0, -0.48);
  leftWindow.rotation.y = 0.63;
  cockpit.add(leftWindow);

  const rightWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.52, 0.9), glassMat);
  rightWindow.position.set(1.02, 0, -0.48);
  rightWindow.rotation.y = -0.63;
  cockpit.add(rightWindow);

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
    "rgba(162, 34, 24, 0.24)",
    "rgba(42, 10, 8, 0)",
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
      color: 0x1f0604,
      transparent: true,
      opacity: 0.92,
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
      emissive: 0x2c110f,
      emissiveIntensity: 0.22,
    }),
  );
  rightPanel.position.set(3.82, 3.22, -5.88);
  rightPanel.rotation.y = -0.35;
  rightPanel.rotation.x = -0.04;
  root.add(rightPanel);

  const rightPanelGlow = new THREE.PointLight(0xff5d49, 0.58, 9, 2);
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
    const baseEmissive = isDir ? 0.18 : 0.12;
    const highlightEmissive = isDir ? 0.58 : 0.46;

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
      opacity: isDir ? 0.03 : 0.02,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    materials.push(auraMaterial);

    const aura = new THREE.Mesh(auraGeometry, auraMaterial);
    aura.scale.setScalar(isDir ? 0.84 : 0.68);
    aura.userData.baseScale = aura.scale.x;
    aura.userData.baseOpacity = auraMaterial.opacity;
    aura.userData.highlightOpacity = isDir ? 0.09 : 0.07;
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
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
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
      baseOpacity: 0.2 + Math.random() * 0.12,
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
  const CAMERA_TRAVEL_DURATION_SECONDS = 3 * 60 * 60;
  const WORLD_CAMERA_FOV_DEGREES = 38;
  const CAMERA_ROUTE_STANDOFF_RATIO_EARTH = 0.02;
  const CAMERA_ROUTE_STANDOFF_RATIO_JUPITER = 0.08;
  const CAMERA_ROUTE_SIDE_RATIO_EARTH = 0.015;
  const CAMERA_ROUTE_SIDE_RATIO_JUPITER = 0.05;
  const CAMERA_ROUTE_ALTITUDE_RATIO = 0.003;
  const CAMERA_ROUTE_TARGET_RATIO = 0.01;
  const CAMERA_ROUTE_TRANSFER_LINE_OPACITY = 0.52;
  const CAMERA_ROUTE_MARKER_RADIUS = 0.026;

  const root = new THREE.Group();
  root.visible = false;
  root.name = "desktop-world";
  scene.add(root);

  const cockpitRig = createCockpitRig(THREE);
  cockpitRig.visible = false;
  camera.add(cockpitRig);

  const animatedLights = [];
  const animatedObjects = [];
  const disposableTextures = [];
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
    fill: new THREE.DirectionalLight(0x5b221c, 0.36),
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
  const cameraTravel = {
    active: false,
    elapsed: 0,
    progress: 0,
    duration: CAMERA_TRAVEL_DURATION_SECONDS,
    startPos: new THREE.Vector3(),
    endPos: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
    endTarget: new THREE.Vector3(),
  };
  const cameraPosTmp = new THREE.Vector3();
  const cameraTargetTmp = new THREE.Vector3();
  const worldAnchorEarth = new THREE.Vector3();
  const worldAnchorJupiter = new THREE.Vector3();
  const travelForward = new THREE.Vector3();
  const travelSide = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const defaultCameraFov = Number(camera?.fov) > 0 ? Number(camera.fov) : 45;
  const transferMarkerPosition = new THREE.Vector3();
  const transferPathGeometry = new THREE.BufferGeometry();
  const transferPathPoints = new Float32Array(6);
  transferPathGeometry.setAttribute("position", new THREE.BufferAttribute(transferPathPoints, 3));
  const transferPathMaterial = new THREE.LineBasicMaterial({
    color: 0xff8f7a,
    transparent: true,
    opacity: CAMERA_ROUTE_TRANSFER_LINE_OPACITY,
    toneMapped: false,
    depthWrite: false,
  });
  const transferPathLine = new THREE.Line(transferPathGeometry, transferPathMaterial);
  transferPathLine.name = "earth-jupiter-transfer-line";
  transferPathLine.visible = false;
  root.add(transferPathLine);

  const transferMarker = new THREE.Mesh(
    new THREE.SphereGeometry(CAMERA_ROUTE_MARKER_RADIUS, 12, 10),
    new THREE.MeshBasicMaterial({
      color: 0xffb39e,
      transparent: true,
      opacity: 0.86,
      toneMapped: false,
      depthWrite: false,
    }),
  );
  transferMarker.name = "earth-jupiter-transfer-marker";
  transferMarker.visible = false;
  root.add(transferMarker);

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
        const auraBase = Number(aura.userData.baseOpacity) || 0.04;
        const auraHighlight = Number(aura.userData.highlightOpacity) || 0.14;
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
      connection.baseOpacity = inContext ? 0.34 : 0.03;
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
      const baseOpacity = Number(aura.userData.baseOpacity) || 0.18;
      const highlightOpacity = Number(aura.userData.highlightOpacity) || (baseOpacity + 0.12);
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

  function updateTransferTrajectory(progress = 0) {
    const earthAnchor = environment?.getWorldAnchor?.("earth", worldAnchorEarth);
    const jupiterAnchor = environment?.getWorldAnchor?.("jupiter", worldAnchorJupiter);
    if (!earthAnchor || !jupiterAnchor) {
      transferPathLine.visible = false;
      transferMarker.visible = false;
      return;
    }

    transferPathPoints[0] = earthAnchor.x;
    transferPathPoints[1] = earthAnchor.y;
    transferPathPoints[2] = earthAnchor.z;
    transferPathPoints[3] = jupiterAnchor.x;
    transferPathPoints[4] = jupiterAnchor.y;
    transferPathPoints[5] = jupiterAnchor.z;
    transferPathGeometry.attributes.position.needsUpdate = true;
    transferPathGeometry.computeBoundingSphere();

    transferMarkerPosition.lerpVectors(
      earthAnchor,
      jupiterAnchor,
      clamp(progress, 0, 1),
    );
    transferMarker.position.copy(transferMarkerPosition);

    transferPathLine.visible = active;
    transferMarker.visible = active;
  }

  function setStatusPanels({ left = null, right = null } = {}) {
    if (left) environment?.setPanelText?.("left", left);
    if (right) environment?.setPanelText?.("right", right);
  }

  function setVisible(nextVisible) {
    active = Boolean(nextVisible);
    root.visible = active;
    cockpitRig.visible = active;
    setWorldCameraFov(active ? WORLD_CAMERA_FOV_DEGREES : defaultCameraFov);
    if (worldOrbit) {
      worldOrbit.enableRotate = !active;
      worldOrbit.enablePan = !active;
      worldOrbit.enableZoom = !active;
    }
    if (!active) {
      cameraTravel.active = false;
      cameraTravel.progress = 0;
      transferPathLine.visible = false;
      transferMarker.visible = false;
      return;
    }
    updateTransferTrajectory(cameraTravel.progress);
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

  function startEarthToJupiterCameraTravel() {
    root.updateMatrixWorld(true);
    const earthAnchor = environment?.getWorldAnchor?.("earth", worldAnchorEarth);
    const jupiterAnchor = environment?.getWorldAnchor?.("jupiter", worldAnchorJupiter);
    if (!earthAnchor || !jupiterAnchor) return false;
    const routeDistance = Math.max(1e-5, earthAnchor.distanceTo(jupiterAnchor));
    const earthRadius = Number(environment?.getWorldBodyRadius?.("earth")) || 0;
    const jupiterRadius = Number(environment?.getWorldBodyRadius?.("jupiter")) || 0;
    const earthStandoff = Math.max(
      routeDistance * CAMERA_ROUTE_STANDOFF_RATIO_EARTH,
      earthRadius * 24,
      0.03,
    );
    const jupiterStandoff = Math.max(
      routeDistance * CAMERA_ROUTE_STANDOFF_RATIO_JUPITER,
      jupiterRadius * 18,
      0.08,
    );
    const earthSideStandoff = Math.max(
      routeDistance * CAMERA_ROUTE_SIDE_RATIO_EARTH,
      earthRadius * 9,
      0.015,
    );
    const jupiterSideStandoff = Math.max(
      routeDistance * CAMERA_ROUTE_SIDE_RATIO_JUPITER,
      jupiterRadius * 8,
      0.05,
    );
    const lowAltitudeOffset = Math.max(
      routeDistance * CAMERA_ROUTE_ALTITUDE_RATIO,
      earthRadius * 3.5,
      0.01,
    );
    const targetForwardOffset = Math.max(
      routeDistance * CAMERA_ROUTE_TARGET_RATIO,
      earthRadius * 12,
      0.02,
    );

    travelForward.copy(jupiterAnchor).sub(earthAnchor);
    travelForward.y = 0;
    if (travelForward.lengthSq() < 1e-6) {
      travelForward.set(0, 0, -1);
    } else {
      travelForward.normalize();
    }

    travelSide.crossVectors(travelForward, worldUp);
    if (travelSide.lengthSq() < 1e-6) {
      travelSide.set(1, 0, 0);
    } else {
      travelSide.normalize();
    }

    cameraTravel.startTarget.copy(earthAnchor).addScaledVector(travelForward, targetForwardOffset);
    cameraTravel.startTarget.y += lowAltitudeOffset;
    cameraTravel.endTarget.copy(jupiterAnchor).addScaledVector(travelForward, targetForwardOffset * 0.8);
    cameraTravel.endTarget.y += lowAltitudeOffset * 0.9;

    cameraTravel.startPos.copy(earthAnchor);
    cameraTravel.startPos.addScaledVector(travelForward, -earthStandoff);
    cameraTravel.startPos.addScaledVector(travelSide, -earthSideStandoff);
    cameraTravel.startPos.y += lowAltitudeOffset;

    cameraTravel.endPos.copy(jupiterAnchor);
    cameraTravel.endPos.addScaledVector(travelForward, -jupiterStandoff);
    cameraTravel.endPos.addScaledVector(travelSide, jupiterSideStandoff * 0.8);
    cameraTravel.endPos.y += lowAltitudeOffset * 0.8;

    cameraTravel.elapsed = 0;
    cameraTravel.progress = 0;
    cameraTravel.active = true;
    updateTransferTrajectory(0);

    camera.position.copy(cameraTravel.startPos);
    if (worldOrbit) {
      worldOrbit.target.copy(cameraTravel.startTarget);
      worldOrbit.update();
    } else {
      camera.lookAt(cameraTravel.startTarget);
    }
    return true;
  }

  function focusOnWorldCamera(orbit) {
    worldOrbit = orbit || worldOrbit;
    if (worldOrbit) {
      worldOrbit.minDistance = 4;
      worldOrbit.maxDistance = 45;
    }

    const startedTravel = startEarthToJupiterCameraTravel();
    if (startedTravel) return;

    camera.position.set(0.58, 1.78, 9.6);
    if (worldOrbit) {
      worldOrbit.target.set(0, -0.15, -3.05);
      worldOrbit.minDistance = 5;
      worldOrbit.maxDistance = 19;
      worldOrbit.update();
    }
    updateTransferTrajectory(0);
  }

  function update(dt = 0.016, viewCamera = camera, viewportHeightPx = 0) {
    if (!active) return;
    const clampedDt = Math.min(0.08, Math.max(0.001, dt));
    elapsed += clampedDt;

    if (cameraTravel.active) {
      cameraTravel.elapsed += clampedDt;
      const normalized = clamp(cameraTravel.elapsed / cameraTravel.duration, 0, 1);
      const eased = normalized * normalized * (3 - 2 * normalized);
      const arcLift = Math.sin(normalized * Math.PI) * 0.05;
      cameraTravel.progress = normalized;

      cameraPosTmp.lerpVectors(cameraTravel.startPos, cameraTravel.endPos, eased);
      cameraPosTmp.y += arcLift;
      cameraTargetTmp.lerpVectors(cameraTravel.startTarget, cameraTravel.endTarget, eased);

      camera.position.copy(cameraPosTmp);
      if (worldOrbit) {
        worldOrbit.target.copy(cameraTargetTmp);
      } else {
        camera.lookAt(cameraTargetTmp);
      }

      if (normalized >= 1) {
        cameraTravel.active = false;
      }
    }

    updateTransferTrajectory(
      cameraTravel.active
        ? cameraTravel.progress
        : (elapsed * 0.05) % 1,
    );

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
      connection.lineMaterial.opacity = clamp(connection.baseOpacity + wave * 0.08, 0.04, 0.58);
      connection.flowMaterial.opacity = clamp(0.45 + wave * 0.15, 0.08, 0.72);
      connection.lineMaterial.needsUpdate = true;
      connection.flowMaterial.needsUpdate = true;
    }

    const selected = getSelectedNode();
    if (selected?.mesh?.material) {
      const baseIntensity = Number(selected.mesh.userData.highlightEmissive)
        || (selected.type === "dir" ? 0.96 : 0.8);
      selected.mesh.material.emissiveIntensity = baseIntensity + Math.sin(elapsed * 2.9) * 0.1;
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
    cancelCockpitModelLoad?.();
    environment?.dispose?.();
    scene.remove(root);
    if (cockpitRig.parent === camera) {
      camera.remove(cockpitRig);
    }
    transferPathGeometry.dispose();
    transferPathMaterial.dispose();
    transferMarker.geometry.dispose();
    transferMarker.material.dispose();
    safeDisposeObject3D(cockpitRig);
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
    focusOnWorldCamera,
    update,
    dispose,
  };
}
