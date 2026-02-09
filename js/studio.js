import * as THREE from "https://esm.sh/three@0.162.0";
import { OrbitControls } from "https://esm.sh/three@0.162.0/examples/jsm/controls/OrbitControls.js";
import {
  AVATAR_DEFINITIONS,
  AVATAR_ORDER,
  NO_PROP_VALUE,
  PIN_STAGE_TOP_Y,
  SCENE_PRESETS,
} from "./config/avatars.js";
import { createClippyController } from "./avatars/clippy-controller.js";
import { createThumbtackController } from "./avatars/thumbtack-controller.js";
import { clamp, randomBetween, randomColor } from "./lib/utils.js";

const canvas = document.getElementById("studioCanvas");
const stageEl = document.querySelector(".stage");
const statusEl = document.getElementById("status");
const avatarSelectEl = document.getElementById("avatarSelect");
const controlsEl = document.getElementById("controlSections");
const presetJsonEl = document.getElementById("presetJson");
const btnReset = document.getElementById("btnReset");
const btnRandom = document.getElementById("btnRandom");
const btnCopy = document.getElementById("btnCopy");
const btnApply = document.getElementById("btnApply");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.minDistance = 3;
orbit.maxDistance = 15;

const lights = {
  hemi: new THREE.HemisphereLight(0xfff8ea, 0xb78857, 1.08),
  ambient: new THREE.AmbientLight(0xfff6e9, 0.44),
  key: new THREE.DirectionalLight(0xfff0d9, 1.5),
  fill: new THREE.DirectionalLight(0xfff7eb, 0.74),
  rim: new THREE.PointLight(0x0f766e, 0.82, 16, 2),
};
lights.key.position.set(3.2, 5.6, 4.1);
lights.key.castShadow = true;
lights.key.shadow.mapSize.set(1024, 1024);
lights.fill.position.set(-3.2, 2.2, 5);
lights.rim.position.set(-4.6, 1.1, -3.2);
scene.add(lights.hemi, lights.ambient, lights.key, lights.fill, lights.rim);

function createStageRig() {
  const clippyGroup = new THREE.Group();
  const pinGroup = new THREE.Group();

  const clippyStage = new THREE.Mesh(
    new THREE.CylinderGeometry(3.6, 4.4, 0.58, 84),
    new THREE.MeshStandardMaterial({
      color: 0xd8b98a,
      metalness: 0.2,
      roughness: 0.72,
    }),
  );
  clippyStage.position.y = -3.3;
  clippyStage.receiveShadow = true;

  const clippyRing = new THREE.Mesh(
    new THREE.TorusGeometry(3.82, 0.08, 14, 120),
    new THREE.MeshStandardMaterial({
      color: 0x0f766e,
      emissive: 0x0f766e,
      emissiveIntensity: 0.2,
      metalness: 0.62,
      roughness: 0.4,
    }),
  );
  clippyRing.rotation.x = Math.PI / 2;
  clippyRing.position.y = -3.01;

  clippyGroup.add(clippyStage, clippyRing);

  const pinStage = new THREE.Mesh(
    new THREE.CylinderGeometry(3.8, 4.5, 0.56, 90),
    new THREE.MeshStandardMaterial({
      color: 0xd6ab73,
      metalness: 0.08,
      roughness: 0.9,
    }),
  );
  pinStage.position.y = -2.95;
  pinStage.receiveShadow = true;

  const pinRing = new THREE.Mesh(
    new THREE.TorusGeometry(4.03, 0.07, 14, 130),
    new THREE.MeshStandardMaterial({
      color: 0x0f766e,
      emissive: 0x0f766e,
      emissiveIntensity: 0.2,
      metalness: 0.63,
      roughness: 0.35,
    }),
  );
  pinRing.rotation.x = Math.PI / 2;
  pinRing.position.y = PIN_STAGE_TOP_Y;

  pinGroup.add(pinStage, pinRing);

  scene.add(clippyGroup, pinGroup);

  let active = "clippy";

  function setPreset(name) {
    active = name;
    clippyGroup.visible = name === "clippy";
    pinGroup.visible = name === "pin";
  }

  function update(dt) {
    if (active === "clippy") {
      clippyRing.rotation.z += dt * 0.48;
    } else {
      pinRing.rotation.z += dt * 0.38;
    }
  }

  return { setPreset, update };
}

const stageRig = createStageRig();

let activeAvatarId = "clippy";
let activeDefinition = AVATAR_DEFINITIONS.clippy;
let activeController = null;
let activeCatalog = { modes: [], expressions: [], props: [NO_PROP_VALUE] };
let activeState = { ...activeDefinition.defaultState };

const controlRegistry = new Map();

const pointer = {
  x: 0,
  y: 0,
};

function setStatus(text, ttlMs = 1600) {
  statusEl.textContent = text;
  if (ttlMs <= 0) return;
  const token = Symbol("status");
  setStatus.last = token;
  setTimeout(() => {
    if (setStatus.last === token) {
      statusEl.textContent = "";
    }
  }, ttlMs);
}

function flattenControlFields(definition) {
  const fields = [];
  for (const section of definition.controls) {
    for (const field of section.fields) {
      fields.push(field);
    }
  }
  return fields;
}

function decimalsFromStep(step) {
  const str = String(step);
  const dot = str.indexOf(".");
  return dot >= 0 ? str.length - dot - 1 : 0;
}

function formatFieldValue(field, value) {
  if (field.type !== "range" || typeof value !== "number") {
    return String(value ?? "");
  }

  if (field.format === "speed") {
    return `${value.toFixed(2)}x`;
  }

  const decimals = Math.min(3, Math.max(0, decimalsFromStep(field.step ?? 0.01)));
  return value.toFixed(decimals);
}

function resolveOptions(field, catalog) {
  if (!field.catalogKey) {
    return [...(field.options || [])];
  }

  const dynamicOptions = catalog[field.catalogKey] || [];
  if (!dynamicOptions.length) {
    return [...(field.options || [])];
  }

  if (field.key === "propName") {
    const normalized = new Set(dynamicOptions);
    normalized.add(NO_PROP_VALUE);
    return [...normalized];
  }

  return [...dynamicOptions];
}

function buildControlInput(field, options) {
  let input;

  if (field.type === "select") {
    input = document.createElement("select");
    for (const option of options) {
      const opt = document.createElement("option");
      opt.value = option;
      opt.textContent = option === NO_PROP_VALUE ? "(none)" : option;
      input.append(opt);
    }
  } else if (field.type === "color") {
    input = document.createElement("input");
    input.type = "color";
  } else {
    input = document.createElement("input");
    input.type = "range";
    input.min = String(field.min);
    input.max = String(field.max);
    input.step = String(field.step);
  }

  input.id = `control-${field.key}`;
  input.dataset.key = field.key;
  return input;
}

function buildControls(definition, catalog) {
  controlsEl.textContent = "";
  controlRegistry.clear();

  for (const section of definition.controls) {
    const sectionEl = document.createElement("section");
    sectionEl.className = "control-group";

    const titleEl = document.createElement("h3");
    titleEl.className = "group-title";
    titleEl.textContent = section.title;
    sectionEl.append(titleEl);

    for (const field of section.fields) {
      const options = resolveOptions(field, catalog);
      const controlEl = document.createElement("div");
      controlEl.className = "control";

      const labelEl = document.createElement("label");
      labelEl.className = "control-label";
      labelEl.setAttribute("for", `control-${field.key}`);
      labelEl.textContent = field.label;

      const valueEl = document.createElement("span");
      valueEl.className = "control-value";

      const input = buildControlInput(field, options);

      const headerEl = document.createElement("div");
      headerEl.className = "control-head";
      headerEl.append(labelEl, valueEl);

      controlEl.append(headerEl, input);
      sectionEl.append(controlEl);

      controlRegistry.set(field.key, { field, input, valueEl });

      const onInput = () => {
        const nextValue = coerceFieldValue(field, input.value, catalog);
        activeState[field.key] = nextValue;
        applyStateToController();
      };

      input.addEventListener("input", onInput);
      input.addEventListener("change", onInput);
    }

    controlsEl.append(sectionEl);
  }
}

function coerceFieldValue(field, rawValue, catalog) {
  if (field.type === "color") {
    return String(rawValue || "#000000");
  }

  if (field.type === "select") {
    const options = resolveOptions(field, catalog);
    if (!options.length) return "";
    return options.includes(rawValue) ? rawValue : options[0];
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return Number(field.min || 0);
  }

  return clamp(parsed, field.min, field.max);
}

function sanitizeState(definition, source, catalog, baseState) {
  const sanitized = { ...baseState };

  for (const field of flattenControlFields(definition)) {
    const raw = source[field.key];
    if (typeof raw === "undefined") continue;

    if (field.type === "select") {
      const options = resolveOptions(field, catalog);
      if (options.includes(raw)) {
        sanitized[field.key] = raw;
      }
      continue;
    }

    if (field.type === "color") {
      sanitized[field.key] = String(raw);
      continue;
    }

    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      sanitized[field.key] = clamp(parsed, field.min, field.max);
    }
  }

  return sanitized;
}

function randomizeState(definition, catalog) {
  const next = { ...activeState };

  for (const field of flattenControlFields(definition)) {
    if (field.type === "color") {
      next[field.key] = randomColor();
      continue;
    }

    if (field.type === "select") {
      const options = resolveOptions(field, catalog);
      if (!options.length) continue;

      if (field.key === "propName") {
        next[field.key] = options[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * options.length)];
      } else {
        next[field.key] = options[Math.floor(Math.random() * options.length)];
      }
      continue;
    }

    const precision = decimalsFromStep(field.step ?? 0.01);
    next[field.key] = randomBetween(field.min, field.max, precision);
  }

  return next;
}

function syncControlsFromState() {
  for (const [key, descriptor] of controlRegistry) {
    const { field, input, valueEl } = descriptor;
    const value = activeState[key];

    if (field.type === "select" || field.type === "color") {
      input.value = String(value);
      valueEl.textContent = field.type === "select" ? String(value) : "";
    } else {
      input.value = String(value);
      valueEl.textContent = formatFieldValue(field, value);
    }
  }
}

function publishPresetText() {
  presetJsonEl.value = JSON.stringify(activeState, null, 2);
}

function applyStateToController(force = false) {
  if (!activeController) return;
  activeController.setState(activeState, { force });
  syncControlsFromState();
  publishPresetText();
}

function applyScenePreset(name) {
  const preset = SCENE_PRESETS[name] || SCENE_PRESETS.clippy;
  stageRig.setPreset(name);

  scene.fog = new THREE.Fog(preset.fogColor, preset.fogNear, preset.fogFar);
  camera.position.set(...preset.camera);
  orbit.target.set(...preset.orbitTarget);

  if (name === "clippy") {
    orbit.minDistance = 3.6;
  } else {
    orbit.minDistance = 3.2;
  }
  orbit.maxDistance = 15;
  orbit.update();
}

function createController(definition) {
  if (definition.engine === "clippy") {
    return createClippyController({
      THREE,
      scene,
      initialState: activeState,
    });
  }

  return createThumbtackController({
    THREE,
    scene,
    initialState: activeState,
    profile: definition.profile,
    stageTopY: PIN_STAGE_TOP_Y,
  });
}

function destroyActiveController() {
  if (!activeController) return;
  activeController.dispose();
  activeController = null;
}

function loadAvatar(avatarId) {
  const definition = AVATAR_DEFINITIONS[avatarId];
  if (!definition) return;

  destroyActiveController();

  activeAvatarId = avatarId;
  activeDefinition = definition;
  activeState = { ...definition.defaultState };

  applyScenePreset(definition.scenePreset);
  activeController = createController(definition);
  activeCatalog = activeController.getCatalog();

  activeState = sanitizeState(definition, activeState, activeCatalog, definition.defaultState);
  buildControls(definition, activeCatalog);
  applyStateToController(true);
  avatarSelectEl.value = avatarId;

  setStatus(`${definition.label} loaded`, 2100);
}

function resize() {
  const width = stageEl.clientWidth || window.innerWidth;
  const height = stageEl.clientHeight || window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function installGlobalHandlers() {
  avatarSelectEl.addEventListener("change", () => {
    loadAvatar(avatarSelectEl.value);
  });

  btnReset.addEventListener("click", () => {
    activeState = { ...activeDefinition.defaultState };
    activeState = sanitizeState(activeDefinition, activeState, activeCatalog, activeDefinition.defaultState);
    applyStateToController(true);
    setStatus("Reset", 1500);
  });

  btnRandom.addEventListener("click", () => {
    activeState = randomizeState(activeDefinition, activeCatalog);
    activeState = sanitizeState(activeDefinition, activeState, activeCatalog, activeDefinition.defaultState);
    applyStateToController(true);
    setStatus("Randomized", 1500);
  });

  btnCopy.addEventListener("click", async () => {
    publishPresetText();
    try {
      await navigator.clipboard.writeText(presetJsonEl.value);
      setStatus("JSON copied", 1700);
    } catch {
      presetJsonEl.select();
      setStatus("Clipboard blocked", 2300);
    }
  });

  btnApply.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(presetJsonEl.value || "{}");
      activeState = sanitizeState(activeDefinition, { ...activeState, ...parsed }, activeCatalog, activeDefinition.defaultState);
      applyStateToController(true);
      setStatus("Preset applied", 1700);
    } catch (err) {
      console.warn(err);
      setStatus("Invalid JSON", 2300);
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  });

  canvas.addEventListener("pointerleave", () => {
    pointer.x = 0;
    pointer.y = 0;
  });

  window.addEventListener("resize", resize);
}

function populateAvatarSelect() {
  avatarSelectEl.textContent = "";
  for (const avatarId of AVATAR_ORDER) {
    const definition = AVATAR_DEFINITIONS[avatarId];
    if (!definition) continue;
    const option = document.createElement("option");
    option.value = avatarId;
    option.textContent = definition.label;
    avatarSelectEl.append(option);
  }
}

function startRenderLoop() {
  const clock = new THREE.Clock();

  function animate() {
    const dt = clock.getDelta();

    if (activeController) {
      activeController.update(dt, pointer);
    }

    stageRig.update(dt);
    orbit.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();
}

function init() {
  populateAvatarSelect();
  installGlobalHandlers();
  resize();
  loadAvatar(activeAvatarId);
  startRenderLoop();
}

try {
  init();
} catch (err) {
  console.error(err);
  setStatus("Studio failed to initialize", 5000);
}
