import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  AVATAR_DEFINITIONS,
  AVATAR_ORDER,
  NO_PROP_VALUE,
  PIN_STAGE_TOP_Y,
} from "./config/avatars.js";
import { createClippyController } from "./avatars/clippy-controller.js";
import { createThumbtackController } from "./avatars/thumbtack-controller.js";
import { clamp, randomBetween, randomColor } from "./lib/utils.js";
import { createRealtimeVoice } from "./lib/realtime-voice.js";

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
const btnVoice = document.getElementById("btnVoice");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.minDistance = 5.5;
orbit.maxDistance = 18;

const lights = {
  hemi: new THREE.HemisphereLight(0x6de8ff, 0x0c0718, 1.1),
  ambient: new THREE.AmbientLight(0x2b4d66, 0.52),
  key: new THREE.DirectionalLight(0xa7f6ff, 1.38),
  fill: new THREE.DirectionalLight(0xff6689, 0.78),
  rim: new THREE.PointLight(0x00e7ff, 1.16, 22, 2),
};
lights.key.position.set(3.2, 5.8, 4.6);
lights.key.castShadow = true;
lights.key.shadow.mapSize.set(1024, 1024);
lights.fill.position.set(-4.4, 2.4, 4.8);
lights.rim.position.set(-5.1, 1.4, -3.2);
scene.add(lights.hemi, lights.ambient, lights.key, lights.fill, lights.rim);

const CAROUSEL_SCENE = {
  fogColor: 0x0a1325,
  fogNear: 12,
  fogFar: 33,
  camera: [0.28, 0.44, 14.2],
  orbitTarget: [0, -0.7, 0],
  minDistance: 7.2,
  maxDistance: 20,
};

function shortestAngleDelta(current, target) {
  let delta = (target - current + Math.PI) % (Math.PI * 2);
  if (delta < 0) delta += Math.PI * 2;
  return delta - Math.PI;
}

function createStageRig() {
  const turntable = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(7.6, 8.4, 0.68, 120),
    new THREE.MeshStandardMaterial({
      color: 0x111b30,
      metalness: 0.52,
      roughness: 0.34,
    }),
  );
  base.position.y = -3.3;
  base.receiveShadow = true;

  const topDeck = new THREE.Mesh(
    new THREE.CylinderGeometry(6.5, 7.1, 0.16, 100),
    new THREE.MeshStandardMaterial({
      color: 0x1d2a46,
      metalness: 0.44,
      roughness: 0.28,
    }),
  );
  topDeck.position.y = -2.88;
  topDeck.receiveShadow = true;

  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(7.22, 0.1, 16, 220),
    new THREE.MeshStandardMaterial({
      color: 0x00e7ff,
      emissive: 0x00e7ff,
      emissiveIntensity: 0.52,
      metalness: 0.82,
      roughness: 0.2,
    }),
  );
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.y = -2.79;

  const centerPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(1.45, 1.86, 0.08, 52),
    new THREE.MeshStandardMaterial({
      color: 0x19233e,
      metalness: 0.66,
      roughness: 0.2,
      emissive: 0xff4d78,
      emissiveIntensity: 0.14,
    }),
  );
  centerPlate.position.y = -2.74;

  const avatarOrbit = new THREE.Group();
  turntable.add(base, topDeck, outerRing, centerPlate, avatarOrbit);
  scene.add(turntable);

  const radiusX = 6.4;
  const radiusZ = 6.4;
  const step = (Math.PI * 2) / Math.max(1, AVATAR_ORDER.length);

  const slots = AVATAR_ORDER.map((avatarId, index) => {
    const baseAngle = index * step;
    const anchor = new THREE.Group();
    anchor.position.set(Math.sin(baseAngle) * radiusX, -0.12, Math.cos(baseAngle) * radiusZ);
    anchor.scale.setScalar(0.8);
    avatarOrbit.add(anchor);
    return { avatarId, baseAngle, anchor };
  });

  const slotById = new Map(slots.map((slot) => [slot.avatarId, slot]));

  let currentRotation = 0;
  let targetRotation = 0;
  let velocity = 0;
  let activeAvatar = AVATAR_ORDER[0] || "clippy";

  function updateSlotPresentation() {
    for (const slot of slots) {
      const angle = slot.baseAngle + currentRotation;
      const depthFocus = (Math.cos(angle) + 1) * 0.5;
      const selectedBoost = slot.avatarId === activeAvatar ? 0.1 : 0;

      const targetScale = 0.58 + depthFocus * 0.24 + selectedBoost;
      const nextScale = slot.anchor.scale.x + (targetScale - slot.anchor.scale.x) * 0.18;
      slot.anchor.scale.setScalar(nextScale);

      const targetY = -0.18 + depthFocus * 0.24 + (slot.avatarId === activeAvatar ? 0.06 : 0);
      slot.anchor.position.y += (targetY - slot.anchor.position.y) * 0.16;
      slot.anchor.rotation.y = -currentRotation;
    }
  }

  function mountAvatar(avatarId, group) {
    const slot = slotById.get(avatarId);
    if (!slot || !group) return;

    if (group.parent) {
      group.parent.remove(group);
    }

    group.userData = group.userData || {};
    group.userData.avatarId = avatarId;
    slot.anchor.add(group);
  }

  function focusAvatar(avatarId, instant = false) {
    const slot = slotById.get(avatarId);
    if (!slot) return;

    activeAvatar = avatarId;
    targetRotation = -slot.baseAngle;

    if (instant) {
      currentRotation = targetRotation;
      velocity = 0;
      turntable.rotation.y = currentRotation;
      updateSlotPresentation();
    }
  }

  function update(dt) {
    const clampedDt = Math.min(dt, 0.08);
    const delta = shortestAngleDelta(currentRotation, targetRotation);

    const accel = delta * 24;
    velocity += accel * clampedDt;
    velocity *= Math.exp(-clampedDt * 7.4);

    if (Math.abs(delta) < 0.0006 && Math.abs(velocity) < 0.0006) {
      currentRotation = targetRotation;
      velocity = 0;
    } else {
      currentRotation += velocity * clampedDt;
    }

    turntable.rotation.y = currentRotation;
    outerRing.rotation.z += clampedDt * 0.34;
    centerPlate.rotation.y -= clampedDt * 0.42;
    updateSlotPresentation();
  }

  focusAvatar(activeAvatar, true);

  return {
    mountAvatar,
    focusAvatar,
    update,
  };
}

const stageRig = createStageRig();

let activeAvatarId = AVATAR_ORDER[0] || "clippy";
const avatarRuntimeRegistry = new Map();
let assistantSpeechLevel = 0;
let assistantViseme = {
  viseme: "sil",
  strength: 0,
};

const controlRegistry = new Map();

const pointer = {
  x: 0,
  y: 0,
};
const neutralPointer = { x: 0, y: 0 };
const raycaster = new THREE.Raycaster();
const pickPointer = new THREE.Vector2();

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

function getAvatarRuntime(avatarId = activeAvatarId) {
  return avatarRuntimeRegistry.get(avatarId) || null;
}

function buildVoiceSessionInstructions() {
  const runtime = getAvatarRuntime();
  const label = runtime?.definition?.label || "Office avatar";
  const description = runtime?.definition?.description || "a mascot inside a browser-based 3D avatar studio";

  return [
    `You are ${label}, ${description}.`,
    "You are speaking with the user by realtime voice.",
    "Keep responses short, clear, and conversational unless the user asks for details.",
    "Ask one focused follow-up question when useful.",
  ].join(" ");
}

function buildVoiceGreetingInstructions() {
  const runtime = getAvatarRuntime();
  const label = runtime?.definition?.label || "the avatar";
  return `In one short friendly sentence, greet the user as ${label} and ask what they want to work on.`;
}

const realtimeVoice = createRealtimeVoice({
  buttonEl: btnVoice,
  onStatus: setStatus,
  onAssistantSpeechLevel: (level) => {
    assistantSpeechLevel = clamp(level, 0, 1);
  },
  onAssistantViseme: (payload) => {
    assistantViseme = {
      viseme: String(payload?.viseme || "sil"),
      strength: clamp(Number(payload?.strength) || 0, 0, 1),
    };
  },
  getSessionInstructions: buildVoiceSessionInstructions,
  getGreetingInstructions: buildVoiceGreetingInstructions,
});

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

function formatSelectValue(value) {
  return value === NO_PROP_VALUE ? "(none)" : String(value ?? "");
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
        const runtime = getAvatarRuntime();
        if (!runtime) return;

        const nextValue = coerceFieldValue(field, input.value, runtime.catalog);
        runtime.state[field.key] = nextValue;
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

function randomizeState(definition, catalog, baseState) {
  const next = { ...baseState };

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
  const runtime = getAvatarRuntime();
  if (!runtime) return;

  for (const [key, descriptor] of controlRegistry) {
    const { field, input, valueEl } = descriptor;
    const value = runtime.state[key];

    if (field.type === "select" || field.type === "color") {
      input.value = String(value);
      valueEl.textContent = field.type === "select" ? formatSelectValue(value) : "";
    } else {
      input.value = String(value);
      valueEl.textContent = formatFieldValue(field, value);
    }
  }
}

function publishPresetText() {
  const runtime = getAvatarRuntime();
  presetJsonEl.value = runtime ? JSON.stringify(runtime.state, null, 2) : "{}";
}

function applyStateToController(force = false) {
  const runtime = getAvatarRuntime();
  if (!runtime) return;

  runtime.state = sanitizeState(runtime.definition, runtime.state, runtime.catalog, runtime.definition.defaultState);
  runtime.controller.setState(runtime.state, { force });
  syncControlsFromState();
  publishPresetText();
}

function applyScenePreset() {
  scene.fog = new THREE.Fog(CAROUSEL_SCENE.fogColor, CAROUSEL_SCENE.fogNear, CAROUSEL_SCENE.fogFar);
  camera.position.set(...CAROUSEL_SCENE.camera);
  orbit.target.set(...CAROUSEL_SCENE.orbitTarget);
  orbit.minDistance = CAROUSEL_SCENE.minDistance;
  orbit.maxDistance = CAROUSEL_SCENE.maxDistance;
  orbit.update();
}

function createController(definition, initialState) {
  if (definition.engine === "clippy") {
    return createClippyController({
      THREE,
      scene,
      initialState,
    });
  }

  return createThumbtackController({
    THREE,
    scene,
    initialState,
    profile: definition.profile,
    stageTopY: PIN_STAGE_TOP_Y,
  });
}

function destroyAvatarRuntimes() {
  for (const runtime of avatarRuntimeRegistry.values()) {
    runtime.controller.dispose();
  }
  avatarRuntimeRegistry.clear();
}

function createAvatarRuntimes() {
  destroyAvatarRuntimes();

  for (const avatarId of AVATAR_ORDER) {
    const definition = AVATAR_DEFINITIONS[avatarId];
    if (!definition) continue;

    const initialState = { ...definition.defaultState };
    const controller = createController(definition, initialState);
    const catalog = controller.getCatalog();
    const state = sanitizeState(definition, initialState, catalog, definition.defaultState);

    controller.setState(state, { force: true });
    stageRig.mountAvatar(avatarId, controller.group);

    avatarRuntimeRegistry.set(avatarId, {
      avatarId,
      definition,
      controller,
      catalog,
      state,
    });
  }

  if (!avatarRuntimeRegistry.has(activeAvatarId)) {
    activeAvatarId = AVATAR_ORDER.find((avatarId) => avatarRuntimeRegistry.has(avatarId)) || activeAvatarId;
  }
}

function loadAvatar(avatarId, { instant = false, silent = false } = {}) {
  const runtime = getAvatarRuntime(avatarId);
  if (!runtime) return;

  activeAvatarId = avatarId;
  avatarSelectEl.value = avatarId;

  stageRig.focusAvatar(avatarId, instant);
  buildControls(runtime.definition, runtime.catalog);
  syncControlsFromState();
  publishPresetText();
  realtimeVoice.syncSessionContext();

  if (!silent) {
    setStatus(`${runtime.definition.label} in focus`, 2100);
  }
}

function resize() {
  const width = stageEl.clientWidth || window.innerWidth;
  const height = stageEl.clientHeight || window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function pickAvatarAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  pickPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pickPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pickPointer, camera);

  const roots = [];
  for (const avatarId of AVATAR_ORDER) {
    const runtime = avatarRuntimeRegistry.get(avatarId);
    if (runtime?.controller?.group) {
      roots.push(runtime.controller.group);
    }
  }

  if (!roots.length) return null;

  const hits = raycaster.intersectObjects(roots, true);
  for (const hit of hits) {
    let node = hit.object;
    while (node) {
      const avatarId = node.userData?.avatarId;
      if (avatarId && avatarRuntimeRegistry.has(avatarId)) {
        return avatarId;
      }
      node = node.parent;
    }
  }

  return null;
}

function installGlobalHandlers() {
  avatarSelectEl.addEventListener("change", () => {
    loadAvatar(avatarSelectEl.value);
  });

  btnReset.addEventListener("click", () => {
    const runtime = getAvatarRuntime();
    if (!runtime) return;

    runtime.state = { ...runtime.definition.defaultState };
    runtime.state = sanitizeState(runtime.definition, runtime.state, runtime.catalog, runtime.definition.defaultState);
    applyStateToController(true);
    setStatus("Reset", 1500);
  });

  btnRandom.addEventListener("click", () => {
    const runtime = getAvatarRuntime();
    if (!runtime) return;

    runtime.state = randomizeState(runtime.definition, runtime.catalog, runtime.state);
    runtime.state = sanitizeState(runtime.definition, runtime.state, runtime.catalog, runtime.definition.defaultState);
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
    const runtime = getAvatarRuntime();
    if (!runtime) return;

    try {
      const parsed = JSON.parse(presetJsonEl.value || "{}");
      runtime.state = sanitizeState(
        runtime.definition,
        { ...runtime.state, ...parsed },
        runtime.catalog,
        runtime.definition.defaultState,
      );
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

  canvas.addEventListener("click", (event) => {
    const avatarId = pickAvatarAt(event.clientX, event.clientY);
    if (avatarId && avatarId !== activeAvatarId) {
      loadAvatar(avatarId);
    }
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

    for (const [avatarId, runtime] of avatarRuntimeRegistry) {
      const lookPointer = avatarId === activeAvatarId ? pointer : neutralPointer;
      if (typeof runtime.controller.setVoiceActivity === "function") {
        runtime.controller.setVoiceActivity(avatarId === activeAvatarId ? assistantSpeechLevel : 0);
      }
      if (typeof runtime.controller.setVoiceViseme === "function") {
        runtime.controller.setVoiceViseme(avatarId === activeAvatarId ? assistantViseme : null);
      }
      runtime.controller.update(dt, lookPointer);
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
  realtimeVoice.init();
  installGlobalHandlers();
  applyScenePreset();
  createAvatarRuntimes();
  resize();
  loadAvatar(activeAvatarId, { instant: true, silent: true });
  startRenderLoop();
}

try {
  init();
} catch (err) {
  console.error(err);
  setStatus("Studio failed to initialize", 5000);
}
