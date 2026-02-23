import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  AVATAR_DEFINITIONS,
  AVATAR_ORDER,
  NO_PROP_VALUE,
} from "./config/avatars.js";
import { getEngine } from "./engines.js";
// Side-effect imports: each controller self-registers its engine on load.
import "./avatars/clippy-controller.js";
import "./avatars/thumbtack-controller.js";
import "./avatars/towely-controller.js";
import "./avatars/puffball-controller.js";
import "./avatars/hal9000-controller.js";
import { clamp, randomBetween, randomColor } from "./lib/utils.js";
import { createRealtimeVoice } from "./lib/realtime-voice.js";
import { createElevenLabsVoice } from "./lib/elevenlabs-voice.js";
import { assertControllerInterface } from "./lib/controller-utils.js";
import { mapWsEventToAnimation } from "./lib/ws-event-mapper.js";
import { createWsPreview } from "./lib/ws-preview.js";
import { createDesktopWorld, DESKTOP_WORLD_ACTIONS } from "./lib/desktop-world.js";

const DEFAULT_AVATAR_ID = "hal9000";
const FALLBACK_AVATAR_ID = "clippy";
const ELEVENLABS_HAL9000_AGENT_ID = "agent_2601khypzbkje0hvtr252mmavwam";

function resolveInitialAvatarId() {
  if (AVATAR_ORDER.includes(DEFAULT_AVATAR_ID)) {
    return DEFAULT_AVATAR_ID;
  }
  return AVATAR_ORDER[0] || FALLBACK_AVATAR_ID;
}

const canvas = document.getElementById("studioCanvas");
const stageEl = document.querySelector(".stage");
const statusEl = document.getElementById("status");
const headerActionsEl = document.querySelector(".header-actions");
const avatarSelectEl = document.getElementById("avatarSelect");
const controlsEl = document.getElementById("controlSections");
const presetJsonEl = document.getElementById("presetJson");
const btnReset = document.getElementById("btnReset");
const btnRandom = document.getElementById("btnRandom");
const btnCopy = document.getElementById("btnCopy");
const btnApply = document.getElementById("btnApply");
const btnWorldToggle = document.getElementById("btnWorldToggle");
const btnVoice = document.getElementById("btnVoice");
const btnElevenVoice = document.getElementById("btnElevenVoice");
const worldActionEl = document.getElementById("worldAction");
const worldScaleModeEl = document.getElementById("worldScaleMode");
const worldSelectionEl = document.getElementById("worldSelection");
const characterNameEl = document.getElementById("characterName");
const characterBackgroundEl = document.getElementById("characterBackground");
const characterPersonalityEl = document.getElementById("characterPersonality");
const btnSaveCharacter = document.getElementById("btnSaveCharacter");
const btnResetCharacter = document.getElementById("btnResetCharacter");
const openAiTokenEl = document.getElementById("openAiToken");
const elevenLabsAgentPresetEl = document.getElementById("elevenLabsAgentPreset");
const elevenLabsAgentIdEl = document.getElementById("elevenLabsAgentId");
const elevenLabsApiKeyEl = document.getElementById("elevenLabsApiKey");
const btnSaveVoiceCredentials = document.getElementById("btnSaveVoiceCredentials");
const btnClearVoiceCredentials = document.getElementById("btnClearVoiceCredentials");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
const xrPlayerRig = new THREE.Group();
xrPlayerRig.name = "xr-player-rig";
scene.add(xrPlayerRig);
xrPlayerRig.add(camera);

const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.minDistance = 5.5;
orbit.maxDistance = 18;

const lights = {
  hemi: new THREE.HemisphereLight(0xf0eee8, 0x050505, 0.88),
  ambient: new THREE.AmbientLight(0x242424, 0.52),
  key: new THREE.DirectionalLight(0xf4f2ec, 1.16),
  fill: new THREE.DirectionalLight(0x742820, 0.44),
  rim: new THREE.PointLight(0x31100c, 0.6, 20, 2),
};
lights.key.position.set(3.2, 5.8, 4.6);
lights.key.castShadow = true;
lights.key.shadow.mapSize.set(1024, 1024);
lights.fill.position.set(-4.4, 2.4, 4.8);
lights.rim.position.set(-5.1, 1.4, -3.2);
scene.add(lights.hemi, lights.ambient, lights.key, lights.fill, lights.rim);

const CHARACTER_PROFILE_STORAGE_KEY = "office-avatar-studio:character-profiles:v1";
const CHARACTER_PROFILE_MAX_LENGTH = 420;
const VOICE_CREDENTIALS_STORAGE_KEY = "office-avatar-studio:voice-credentials:v1";
const ELEVENLABS_AGENT_PRESETS = Object.freeze([
  {
    label: "Hal9000",
    agentId: ELEVENLABS_HAL9000_AGENT_ID,
  },
  {
    label: "Towelie",
    agentId: "agent_6201kh80gehme6wacehwktq31hsk",
  },
]);

function sanitizeProfileText(value, maxLength = CHARACTER_PROFILE_MAX_LENGTH) {
  return String(value || "").trim().slice(0, maxLength);
}

function getDefaultCharacterProfile(avatarId) {
  const definition = AVATAR_DEFINITIONS[avatarId] || {};
  const seed = definition.characterProfile || {};
  return {
    name: sanitizeProfileText(definition.label || "Office avatar", 80),
    background: sanitizeProfileText(seed.background),
    personality: sanitizeProfileText(seed.personality),
  };
}

function normalizeCharacterProfile(profile = {}, avatarId = activeAvatarId) {
  const defaults = getDefaultCharacterProfile(avatarId);
  return {
    name: sanitizeProfileText(profile.name, 80) || defaults.name,
    background: sanitizeProfileText(profile.background),
    personality: sanitizeProfileText(profile.personality),
  };
}

function loadCharacterProfiles() {
  try {
    const raw = localStorage.getItem(CHARACTER_PROFILE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("Failed to load character profiles", error);
    return {};
  }
}

function persistCharacterProfiles(profileStore) {
  try {
    localStorage.setItem(CHARACTER_PROFILE_STORAGE_KEY, JSON.stringify(profileStore));
    return true;
  } catch (error) {
    console.warn("Failed to save character profiles", error);
    return false;
  }
}

function sanitizeVoiceToken(value) {
  return String(value || "").trim();
}

function sanitizeVoiceAgentId(value) {
  return String(value || "").trim();
}

function sanitizeVoiceApiKey(value) {
  return String(value || "").trim();
}

function resolveKnownElevenLabsAgentId(value) {
  const normalized = sanitizeVoiceAgentId(value);
  if (!normalized) return "";
  const preset = ELEVENLABS_AGENT_PRESETS.find((entry) => entry.agentId === normalized);
  return preset ? preset.agentId : "";
}

function loadVoiceCredentials() {
  try {
    const raw = localStorage.getItem(VOICE_CREDENTIALS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return {
      openAiToken: sanitizeVoiceToken(parsed.openAiToken),
      elevenLabsAgentId: sanitizeVoiceAgentId(parsed.elevenLabsAgentId),
      elevenLabsApiKey: sanitizeVoiceApiKey(parsed.elevenLabsApiKey),
    };
  } catch (error) {
    console.warn("Failed to load voice credentials", error);
    return {};
  }
}

function persistVoiceCredentials(credentials) {
  try {
    localStorage.setItem(
      VOICE_CREDENTIALS_STORAGE_KEY,
      JSON.stringify({
        openAiToken: sanitizeVoiceToken(credentials?.openAiToken),
        elevenLabsAgentId: sanitizeVoiceAgentId(credentials?.elevenLabsAgentId),
        elevenLabsApiKey: sanitizeVoiceApiKey(credentials?.elevenLabsApiKey),
      }),
    );
    return true;
  } catch (error) {
    console.warn("Failed to save voice credentials", error);
    return false;
  }
}

function clearPersistedVoiceCredentials() {
  try {
    localStorage.removeItem(VOICE_CREDENTIALS_STORAGE_KEY);
    return true;
  } catch (error) {
    console.warn("Failed to clear voice credentials", error);
    return false;
  }
}

const CAROUSEL_SCENE = {
  fogColor: 0x070707,
  fogNear: 12,
  fogFar: 34,
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
      color: 0x0a0a0a,
      metalness: 0.48,
      roughness: 0.4,
    }),
  );
  base.position.y = -3.3;
  base.receiveShadow = true;

  const topDeck = new THREE.Mesh(
    new THREE.CylinderGeometry(6.5, 7.1, 0.16, 100),
    new THREE.MeshStandardMaterial({
      color: 0x151515,
      metalness: 0.42,
      roughness: 0.34,
    }),
  );
  topDeck.position.y = -2.88;
  topDeck.receiveShadow = true;

  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(7.22, 0.1, 16, 220),
    new THREE.MeshStandardMaterial({
      color: 0xd5d2c9,
      emissive: 0x292827,
      emissiveIntensity: 0.12,
      metalness: 0.72,
      roughness: 0.24,
    }),
  );
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.y = -2.79;

  const centerPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(1.45, 1.86, 0.08, 52),
    new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.64,
      roughness: 0.24,
      emissive: 0x4e130d,
      emissiveIntensity: 0.22,
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
  let activeAvatar = resolveInitialAvatarId();

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

  function unmountAvatar(avatarId) {
    const slot = slotById.get(avatarId);
    if (!slot) return null;

    const group = slot.anchor.children.find(
      (child) => child?.userData?.avatarId === avatarId,
    );
    if (!group) return null;

    slot.anchor.remove(group);
    return group;
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

  function setVisible(visible) {
    turntable.visible = Boolean(visible);
  }

  focusAvatar(activeAvatar, true);

  return {
    mountAvatar,
    unmountAvatar,
    focusAvatar,
    update,
    setVisible,
  };
}

const stageRig = createStageRig();

let activeAvatarId = resolveInitialAvatarId();
let worldModeActive = false;
let worldAvatarId = "";
const avatarRuntimeRegistry = new Map();
let assistantSpeechLevel = 0;
let assistantViseme = {
  viseme: "sil",
  strength: 0,
};
let activeVoiceProvider = null;
let devVowelDemoRunId = 0;

const controlRegistry = new Map();
const characterProfiles = loadCharacterProfiles();
const storedVoiceCredentials = loadVoiceCredentials();
const hasStoredOpenAiToken = Object.hasOwn(storedVoiceCredentials, "openAiToken");
const hasStoredElevenLabsAgentId = Object.hasOwn(storedVoiceCredentials, "elevenLabsAgentId");
const hasStoredElevenLabsApiKey = Object.hasOwn(storedVoiceCredentials, "elevenLabsApiKey");
const DEFAULT_OPENAI_API_KEY =
  String(window.OPENAI_API_KEY || "").trim()
  || String(import.meta.env.VITE_OPENAI_API_KEY || "").trim();
const DEFAULT_ELEVENLABS_AGENT_ID =
  String(window.ELEVENLABS_AGENT_ID || "").trim()
  || String(import.meta.env.VITE_ELEVENLABS_AGENT_ID || "").trim()
  || ELEVENLABS_HAL9000_AGENT_ID;
const DEFAULT_ELEVENLABS_API_KEY =
  String(window.ELEVENLABS_API_KEY || "").trim()
  || String(import.meta.env.VITE_ELEVENLABS_API_KEY || "").trim();
const voiceCredentials = {
  openAiToken: hasStoredOpenAiToken
    ? sanitizeVoiceToken(storedVoiceCredentials.openAiToken)
    : DEFAULT_OPENAI_API_KEY,
  elevenLabsAgentId: hasStoredElevenLabsAgentId
    ? sanitizeVoiceAgentId(storedVoiceCredentials.elevenLabsAgentId)
    : DEFAULT_ELEVENLABS_AGENT_ID,
  elevenLabsApiKey: hasStoredElevenLabsApiKey
    ? sanitizeVoiceApiKey(storedVoiceCredentials.elevenLabsApiKey)
    : DEFAULT_ELEVENLABS_API_KEY,
};
let profileAutosaveTimer = null;
let wsTransientTimer = null;
let wsSustainedMode = "idle";
let _wsPreviewInstance = null;
let wsThinkingText = "";
let wsThinkingClearTimer = null;
let xrEnterButton = null;
let xrSupportChecked = false;
let xrImmersiveVrSupported = false;
let xrControllersReady = false;
let xrStartupAlignFrames = 0;

const THINKING_TOKEN_PLACEHOLDER = "...";
const THINKING_TEXT_MAX_LENGTH = 280;
const THINKING_TEXT_HOLD_MS = 2200;
const XR_RAY_LENGTH = 28;
const XR_WORLD_PICK_DISTANCE = 48;
const XR_MOVE_SPEED_MPS = 2.45;
const XR_TURN_SPEED_RPS = 1.6;
const XR_AXIS_DEADZONE = 0.2;
const XR_WORLD_SHIP_LOCK_ENABLED = false;
const XR_WORLD_FALLBACK_BACKOFF = 0.44;
const XR_WORLD_FALLBACK_LIFT = 0.06;

const pointer = {
  x: 0,
  y: 0,
};
const neutralPointer = { x: 0, y: 0 };
const raycaster = new THREE.Raycaster();
const pickPointer = new THREE.Vector2();
const xrControllerTempMatrix = new THREE.Matrix4();
const xrControllerOrigin = new THREE.Vector3();
const xrControllerDirection = new THREE.Vector3();
const xrMoveForward = new THREE.Vector3();
const xrMoveRight = new THREE.Vector3();
const xrMoveDelta = new THREE.Vector3();
const xrHeadPosition = new THREE.Vector3();
const xrAlignCurrentHead = new THREE.Vector3();
const xrAlignDesiredForward = new THREE.Vector3();
const xrAlignCurrentForward = new THREE.Vector3();
const xrAlignOffset = new THREE.Vector3();
const xrAlignPoseQuaternion = new THREE.Quaternion();
const xrAlignRigWorldQuaternion = new THREE.Quaternion();
const xrShipLockPosition = new THREE.Vector3();
const xrShipLockDelta = new THREE.Vector3();
const xrFallbackForward = new THREE.Vector3();
const xrWorldUp = new THREE.Vector3(0, 1, 0);
const xrDesktopCameraSnapshot = {
  captured: false,
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  worldPosition: new THREE.Vector3(),
  worldQuaternion: new THREE.Quaternion(),
  orbitTarget: new THREE.Vector3(),
};
const xrControllers = [];

const WORLD_ACTION_MODE_PREFERENCES = Object.freeze({
  list: ["file", "searching", "reading", "thinking", "idle"],
  read: ["reading", "file", "thinking", "idle"],
  write: ["typing", "thinking", "file", "idle"],
  search: ["searching", "thinking", "reading", "idle"],
  delete: ["error", "thinking", "idle"],
});
const WORLD_SCALE_MODES = Object.freeze({
  READABLE: "readable",
  TRUE_SCALE: "true-scale",
});

function setWorldSelectionText(text) {
  if (worldSelectionEl) {
    worldSelectionEl.textContent = String(text || "").trim() || "No world node selected.";
  }
}

function getWorldSelectionPrompt(action = desktopWorld.getAction()) {
  const actionLabel = String(action || "auto").toUpperCase();
  if (renderer.xr.isPresenting) {
    return `World active. Aim controller and pull trigger to run ${actionLabel}.`;
  }
  return `World active. Click a node to run ${actionLabel}.`;
}

const desktopWorld = createDesktopWorld({
  THREE,
  scene,
  camera,
  canvas,
  onToolAction: handleWorldToolAction,
  onDebugStatus: ({
    level = "info",
    message = "",
    data = null,
  } = {}) => {
    const text = String(message || "").trim();
    if (!text) return;
    setStatus(`World debug: ${text}`, 3600);
    if (level === "error") {
      if (data) {
        console.error("[WorldDebug]", text, data);
        return;
      }
      console.error("[WorldDebug]", text);
      return;
    }
    if (level === "warn") {
      if (data) {
        console.warn("[WorldDebug]", text, data);
        return;
      }
      console.warn("[WorldDebug]", text);
      return;
    }
    if (data) {
      console.info("[WorldDebug]", text, data);
      return;
    }
    console.info("[WorldDebug]", text);
  },
});

function refreshWorldStatusPanels({ detail = "", payload = null } = {}) {
  const actionLabel = String(desktopWorld.getAction() || "auto").toUpperCase();
  const avatarLabel = String(
    AVATAR_DEFINITIONS[activeAvatarId]?.label || activeAvatarId || "none",
  ).toUpperCase();
  const worldState = worldModeActive ? "WORLD ONLINE" : "WORLD STANDBY";
  const voiceState = isAnyVoiceConnected() ? "VOICE LINKED" : "VOICE IDLE";
  const detailLine = String(detail || "").trim()
    || String(worldSelectionEl?.textContent || "No world node selected.").trim();

  const lastActionLine = payload
    ? `${String(payload.action || "auto").toUpperCase()} ${String(payload.nodeType || "node").toUpperCase()}`
    : "NO COMMAND";
  const targetLine = payload
    ? String(payload.path || payload.nodeName || "Awaiting target")
    : "Awaiting target";

  desktopWorld.setStatusPanels({
    left: {
      title: "AE-35 Command",
      lines: [
        `ACTION ${actionLabel}`,
        detailLine,
        `AVATAR ${avatarLabel}`,
      ],
      footer: "Discovery Bus",
    },
    right: {
      title: "Mission Status",
      lines: [
        worldState,
        voiceState,
        `LAST ${lastActionLine}`,
        targetLine,
      ],
      footer: "HAL Link",
    },
  });
}

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setAssistantMouth({ viseme = "sil", strength = 0, level = 0 } = {}) {
  assistantViseme = {
    viseme: String(viseme || "sil"),
    strength: clamp(Number(strength) || 0, 0, 1),
  };
  assistantSpeechLevel = clamp(Number(level) || 0, 0, 1);
}

function clearWsThinkingTimer() {
  if (!wsThinkingClearTimer) return;
  clearTimeout(wsThinkingClearTimer);
  wsThinkingClearTimer = null;
}

function clearWsThoughtBubble() {
  clearWsThinkingTimer();
  wsThinkingText = "";
  pushClippyThoughtText("", { visible: false });
}

function trimWsThinkingText(value, maxLength = THINKING_TEXT_MAX_LENGTH) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return text.slice(text.length - maxLength);
}

function getClippyThoughtController() {
  const runtime = avatarRuntimeRegistry.get("clippy");
  if (!runtime || typeof runtime.controller?.setThoughtText !== "function") {
    return null;
  }
  return runtime.controller;
}

function pushClippyThoughtText(text, options = {}) {
  const controller = getClippyThoughtController();
  if (!controller) return;
  controller.setThoughtText(text, options);
}

function extractWsToken(event) {
  const candidates = [
    event?.token,
    event?.delta,
    event?.text,
    event?.content,
    event?.message,
    event?.payload?.token,
    event?.payload?.delta,
    event?.payload?.text,
    event?.data?.token,
    event?.data?.delta,
    event?.data?.text,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate) {
      return candidate;
    }
  }
  return "";
}

function handleWsThoughtEvent(event) {
  if (!event || !event.type) return;

  if (event.type === "agent.thinking_start") {
    clearWsThinkingTimer();
    wsThinkingText = "";
    pushClippyThoughtText(THINKING_TOKEN_PLACEHOLDER, { visible: true });
    return;
  }

  if (event.type === "agent.thinking_token") {
    clearWsThinkingTimer();
    const token = extractWsToken(event);
    if (!token) {
      if (!wsThinkingText) {
        pushClippyThoughtText(THINKING_TOKEN_PLACEHOLDER, { visible: true });
      }
      return;
    }
    wsThinkingText = trimWsThinkingText(`${wsThinkingText}${token}`);
    pushClippyThoughtText(wsThinkingText, { visible: true });
    return;
  }

  if (event.type === "agent.thinking_done") {
    clearWsThinkingTimer();
    if (!wsThinkingText) {
      pushClippyThoughtText("", { visible: false });
      return;
    }

    pushClippyThoughtText(wsThinkingText, { visible: true });
    wsThinkingClearTimer = setTimeout(() => {
      wsThinkingClearTimer = null;
      wsThinkingText = "";
      pushClippyThoughtText("", { visible: false });
    }, THINKING_TEXT_HOLD_MS);
    return;
  }

  if (
    event.type === "agent.text_token"
    || event.type === "agent.text_done"
    || event.type === "agent.tool_use_start"
  ) {
    clearWsThoughtBubble();
    return;
  }

  if (event.type === "agent.response_complete" || event.type === "session.error") {
    clearWsThoughtBubble();
  }
}

function getActiveCharacterProfile() {
  return normalizeCharacterProfile(characterProfiles[activeAvatarId], activeAvatarId);
}

function syncCharacterProfileInputs() {
  if (!characterNameEl || !characterBackgroundEl || !characterPersonalityEl) return;
  const profile = getActiveCharacterProfile();
  characterNameEl.value = profile.name;
  characterBackgroundEl.value = profile.background;
  characterPersonalityEl.value = profile.personality;
}

function captureCharacterProfileFromInputs() {
  return normalizeCharacterProfile(
    {
      name: characterNameEl?.value,
      background: characterBackgroundEl?.value,
      personality: characterPersonalityEl?.value,
    },
    activeAvatarId,
  );
}

function saveCharacterProfile({ announce = true } = {}) {
  const profile = captureCharacterProfileFromInputs();
  characterProfiles[activeAvatarId] = profile;
  const saved = persistCharacterProfiles(characterProfiles);
  if (saved && announce) {
    setStatus(`Saved character: ${profile.name}`, 1800);
  } else if (!saved && announce) {
    setStatus("Could not save character", 2300);
  }
  return profile;
}

function queueCharacterProfileAutosave() {
  if (profileAutosaveTimer) {
    clearTimeout(profileAutosaveTimer);
  }
  profileAutosaveTimer = setTimeout(() => {
    profileAutosaveTimer = null;
    saveCharacterProfile({ announce: false });
  }, 500);
}

function syncElevenLabsAgentPresetInput(agentId = voiceCredentials.elevenLabsAgentId) {
  if (!elevenLabsAgentPresetEl) return;
  elevenLabsAgentPresetEl.value = resolveKnownElevenLabsAgentId(agentId);
}

function syncVoiceCredentialInputs() {
  if (openAiTokenEl) {
    openAiTokenEl.value = voiceCredentials.openAiToken;
  }
  syncElevenLabsAgentPresetInput();
  if (elevenLabsAgentIdEl) {
    elevenLabsAgentIdEl.value = voiceCredentials.elevenLabsAgentId;
  }
  if (elevenLabsApiKeyEl) {
    elevenLabsApiKeyEl.value = voiceCredentials.elevenLabsApiKey;
  }
}

function captureVoiceCredentialsFromInputs() {
  return {
    openAiToken: sanitizeVoiceToken(openAiTokenEl?.value),
    elevenLabsAgentId: sanitizeVoiceAgentId(elevenLabsAgentIdEl?.value),
    elevenLabsApiKey: sanitizeVoiceApiKey(elevenLabsApiKeyEl?.value),
  };
}

function applyVoiceCredentialsToProviders() {
  realtimeVoice.setApiKey(voiceCredentials.openAiToken);
  elevenLabsVoice.setAgentId(voiceCredentials.elevenLabsAgentId);
  elevenLabsVoice.setApiKey(voiceCredentials.elevenLabsApiKey);
}

function saveVoiceCredentials({ announce = true } = {}) {
  const next = captureVoiceCredentialsFromInputs();
  voiceCredentials.openAiToken = next.openAiToken;
  voiceCredentials.elevenLabsAgentId = next.elevenLabsAgentId;
  voiceCredentials.elevenLabsApiKey = next.elevenLabsApiKey;
  applyVoiceCredentialsToProviders();
  const saved = persistVoiceCredentials(voiceCredentials);
  if (announce) {
    setStatus(saved ? "Voice credentials saved" : "Could not save credentials", saved ? 1800 : 2400);
  }
}

function clearStoredVoiceCredentials({ announce = true } = {}) {
  const cleared = clearPersistedVoiceCredentials();
  voiceCredentials.openAiToken = DEFAULT_OPENAI_API_KEY;
  voiceCredentials.elevenLabsAgentId = DEFAULT_ELEVENLABS_AGENT_ID;
  voiceCredentials.elevenLabsApiKey = DEFAULT_ELEVENLABS_API_KEY;
  syncVoiceCredentialInputs();
  applyVoiceCredentialsToProviders();
  if (announce) {
    setStatus(cleared ? "Stored credentials cleared" : "Could not clear credentials", cleared ? 1800 : 2400);
  }
}

function buildVoiceSessionInstructions() {
  const runtime = getAvatarRuntime();
  const profile = getActiveCharacterProfile();
  const fallbackLabel = runtime?.definition?.label || "Office avatar";
  const displayName = profile.name || fallbackLabel;
  const description = runtime?.definition?.description || "a mascot inside a browser-based 3D avatar studio";

  const instructions = [
    `You are ${displayName}, ${description}.`,
    "You are speaking with the user by realtime voice.",
    "Keep responses short, clear, and conversational unless the user asks for details.",
    "Ask one focused follow-up question when useful.",
  ];

  if (profile.background) {
    instructions.push(`Character background: ${profile.background}.`);
  }

  if (profile.personality) {
    instructions.push(`Personality and behavior: ${profile.personality}.`);
  }

  return instructions.join(" ");
}

function buildVoiceGreetingInstructions() {
  const profile = getActiveCharacterProfile();
  return `In one short friendly sentence, greet the user as ${profile.name} and ask what they want to work on.`;
}

function canConsumeVoice(provider) {
  if (!activeVoiceProvider) {
    activeVoiceProvider = provider;
    return true;
  }
  return activeVoiceProvider === provider;
}

function handleVoiceConnectionChange(provider, connected) {
  if (connected) {
    activeVoiceProvider = provider;
    if (provider === "openai") {
      elevenLabsVoice.disconnect({ silent: true });
    } else if (provider === "elevenlabs") {
      realtimeVoice.disconnect({ silent: true });
    }
    refreshWorldStatusPanels();
    return;
  }

  if (activeVoiceProvider === provider) {
    activeVoiceProvider = null;
    setAssistantMouth();
  }
  refreshWorldStatusPanels();
}

const rawElevenLabsConnectionType =
  String(window.ELEVENLABS_CONNECTION_TYPE || "").trim()
  || String(import.meta.env.VITE_ELEVENLABS_CONNECTION_TYPE || "").trim()
  || "webrtc";
const elevenLabsConnectionType = rawElevenLabsConnectionType.toLowerCase() === "websocket" ? "websocket" : "webrtc";

const realtimeVoice = createRealtimeVoice({
  buttonEl: btnVoice,
  apiKey: voiceCredentials.openAiToken,
  onStatus: setStatus,
  onConnectionStateChange: ({ connected }) => {
    handleVoiceConnectionChange("openai", connected);
  },
  onAssistantSpeechLevel: (level) => {
    if (!canConsumeVoice("openai")) return;
    assistantSpeechLevel = clamp(level, 0, 1);
  },
  onAssistantViseme: (payload) => {
    if (!canConsumeVoice("openai")) return;
    assistantViseme = {
      viseme: String(payload?.viseme || "sil"),
      strength: clamp(Number(payload?.strength) || 0, 0, 1),
    };
  },
  getSessionInstructions: buildVoiceSessionInstructions,
  getGreetingInstructions: buildVoiceGreetingInstructions,
});

const elevenLabsVoice = createElevenLabsVoice({
  buttonEl: btnElevenVoice,
  agentId: voiceCredentials.elevenLabsAgentId,
  apiKey: voiceCredentials.elevenLabsApiKey,
  connectionType: elevenLabsConnectionType,
  clientTools: {
    enterWorld: async () => runEnterWorldClientTool(),
  },
  onStatus: setStatus,
  onConnectionStateChange: ({ connected }) => {
    handleVoiceConnectionChange("elevenlabs", connected);
  },
  onAssistantSpeechLevel: (level) => {
    if (!canConsumeVoice("elevenlabs")) return;
    assistantSpeechLevel = clamp(level, 0, 1);
  },
  onAssistantViseme: (payload) => {
    if (!canConsumeVoice("elevenlabs")) return;
    assistantViseme = {
      viseme: String(payload?.viseme || "sil"),
      strength: clamp(Number(payload?.strength) || 0, 0, 1),
    };
  },
  getSessionInstructions: buildVoiceSessionInstructions,
});

function isAnyVoiceConnected() {
  return realtimeVoice.isConnected() || elevenLabsVoice.isConnected();
}

async function runDevVowelDemo() {
  if (!import.meta.env.DEV) return;

  const runId = ++devVowelDemoRunId;
  const sequence = [
    { label: "A", viseme: "aa", strength: 0.98, level: 0.88, holdMs: 520 },
    { label: "E", viseme: "ee", strength: 0.94, level: 0.8, holdMs: 500 },
    { label: "I", viseme: "ee", strength: 0.9, level: 0.74, holdMs: 460 },
    { label: "O", viseme: "oh", strength: 0.95, level: 0.84, holdMs: 520 },
    { label: "U", viseme: "ou", strength: 0.94, level: 0.8, holdMs: 520 },
  ];

  await sleep(420);
  if (runId !== devVowelDemoRunId || isAnyVoiceConnected()) return;
  setStatus("Dev mouth demo: A-E-I-O-U", 1500);

  for (const step of sequence) {
    if (runId !== devVowelDemoRunId || isAnyVoiceConnected()) return;
    setAssistantMouth(step);
    await sleep(step.holdMs);

    if (runId !== devVowelDemoRunId || isAnyVoiceConnected()) return;
    setAssistantMouth();
    await sleep(150);
  }

  if (runId === devVowelDemoRunId && !isAnyVoiceConnected()) {
    setAssistantMouth();
  }
}

function resolveWsMode(mapping, runtime) {
  const requested = String(mapping?.mode || "").trim();
  if (!requested) return "";

  const availableModes = Array.isArray(runtime?.catalog?.modes)
    ? runtime.catalog.modes
    : [];
  if (!availableModes.length) return requested;
  if (availableModes.includes(requested)) return requested;

  const fallback = String(mapping?.fallbackMode || "").trim();
  if (fallback && availableModes.includes(fallback)) return fallback;

  if (availableModes.includes(runtime?.state?.mode)) {
    return runtime.state.mode;
  }

  return availableModes[0] || requested;
}

function handleWsEvent(event) {
  handleWsThoughtEvent(event);

  const mapping = mapWsEventToAnimation(event);
  if (!mapping) return;

  const runtime = getAvatarRuntime();
  if (!runtime) return;
  const nextMode = resolveWsMode(mapping, runtime);
  if (!nextMode) return;

  // Clear any pending transient revert
  if (wsTransientTimer) {
    clearTimeout(wsTransientTimer);
    wsTransientTimer = null;
  }

  if (mapping.transient) {
    // Transient mode: apply, then revert to previous sustained mode
    runtime.state.mode = nextMode;
    applyStateToController();

    let revertMode = wsSustainedMode;
    if (mapping.sustainedMode) {
      const resolvedSustainedMode = resolveWsMode(
        {
          mode: mapping.sustainedMode,
          fallbackMode: mapping.sustainedFallbackMode,
        },
        runtime,
      );
      if (resolvedSustainedMode) {
        wsSustainedMode = resolvedSustainedMode;
        revertMode = resolvedSustainedMode;
      }
    }

    wsTransientTimer = setTimeout(() => {
      wsTransientTimer = null;
      const rt = getAvatarRuntime();
      if (rt) {
        rt.state.mode = revertMode;
        applyStateToController();
      }
    }, mapping.durationMs || 1000);
  } else {
    // Sustained mode: update both current and sustained tracking
    wsSustainedMode = nextMode;
    runtime.state.mode = nextMode;
    applyStateToController();
  }
}

function normalizeWorldAction(value) {
  return DESKTOP_WORLD_ACTIONS.includes(value) ? value : "auto";
}

function normalizeWorldScaleMode(value) {
  return value === WORLD_SCALE_MODES.TRUE_SCALE
    ? WORLD_SCALE_MODES.TRUE_SCALE
    : WORLD_SCALE_MODES.READABLE;
}

function formatWorldScaleModeLabel(mode) {
  return mode === WORLD_SCALE_MODES.TRUE_SCALE ? "True Scale" : "Readable";
}

function resolveModeForWorldAction(action, runtime) {
  const availableModes = Array.isArray(runtime?.catalog?.modes)
    ? runtime.catalog.modes
    : [];
  if (!availableModes.length) return "";

  const preferred = WORLD_ACTION_MODE_PREFERENCES[action] || ["idle"];
  for (const candidate of preferred) {
    if (availableModes.includes(candidate)) {
      return candidate;
    }
  }

  if (availableModes.includes(runtime?.state?.mode)) {
    return runtime.state.mode;
  }

  return availableModes[0] || "";
}

function applyWorldActionToAvatar(action) {
  const runtime = getAvatarRuntime();
  if (!runtime) return;

  const nextMode = resolveModeForWorldAction(action, runtime);
  if (!nextMode) return;

  runtime.state.mode = nextMode;
  applyStateToController();
}

function syncWorldToggleButton() {
  if (!btnWorldToggle) return;
  btnWorldToggle.textContent = worldModeActive ? "Exit World" : "Enter World";
  btnWorldToggle.dataset.state = worldModeActive ? "active" : "idle";
}

function swapWorldAvatar(avatarId) {
  const nextRuntime = getAvatarRuntime(avatarId);
  if (!nextRuntime?.controller?.group) {
    return false;
  }

  if (worldAvatarId === avatarId && desktopWorld.isActive()) {
    return true;
  }

  if (worldAvatarId) {
    const previous = desktopWorld.detachAvatar();
    if (previous.avatarGroup) {
      stageRig.mountAvatar(previous.avatarId || worldAvatarId, previous.avatarGroup);
    }
    worldAvatarId = "";
  }

  const avatarGroup = stageRig.unmountAvatar(avatarId) || nextRuntime.controller.group;
  const stageTopY = Number(nextRuntime.definition?.stageTopY);
  const yOffset = Number.isFinite(stageTopY) ? -stageTopY : 0;
  const attached = desktopWorld.attachAvatar(avatarId, avatarGroup, { yOffset });
  if (attached) {
    worldAvatarId = avatarId;
  }
  return attached;
}

function enterWorldMode({ silent = false } = {}) {
  if (worldModeActive) return;
  if (!getAvatarRuntime()) return;

  desktopWorld.setAction(normalizeWorldAction(worldActionEl?.value));
  desktopWorld.setVisible(true);
  stageRig.setVisible(false);

  if (!swapWorldAvatar(activeAvatarId)) {
    desktopWorld.setVisible(false);
    stageRig.setVisible(true);
    setStatus("Could not mount avatar into world", 2200);
    return;
  }

  worldModeActive = true;
  syncWorldToggleButton();
  if (!renderer.xr.isPresenting) {
    // Keep desktop world camera placement deterministic by clearing any stale XR rig offset.
    xrPlayerRig.position.set(0, 0, 0);
    xrPlayerRig.rotation.set(0, 0, 0);
  }
  desktopWorld.focusOnWorldCamera(orbit);
  scene.fog = new THREE.Fog(0x02050f, 20, 78);
  setWorldSelectionText(getWorldSelectionPrompt());
  updateXrControllerRays();
  refreshWorldStatusPanels();
  if (!silent) {
    setStatus("Entered world: Earth orbit insertion, transfer trajectory locked to Jupiter", 2400);
  }
}

function exitWorldMode({ silent = false } = {}) {
  if (!worldModeActive) return;

  const previous = desktopWorld.detachAvatar();
  if (previous.avatarGroup) {
    stageRig.mountAvatar(previous.avatarId || activeAvatarId, previous.avatarGroup);
  }

  worldAvatarId = "";
  worldModeActive = false;
  desktopWorld.setVisible(false);
  stageRig.setVisible(true);
  stageRig.focusAvatar(activeAvatarId, true);
  applyScenePreset();
  syncWorldToggleButton();
  setWorldSelectionText("No world node selected.");
  updateXrControllerRays();
  refreshWorldStatusPanels();

  if (!silent) {
    setStatus("Returned to carousel", 1700);
  }
}

function runEnterWorldClientTool() {
  if (worldModeActive) {
    return {
      status: "already_in_world",
      worldModeActive: true,
    };
  }

  enterWorldMode();

  return {
    status: worldModeActive ? "entered_world" : "enter_world_failed",
    worldModeActive,
  };
}

function handleWorldToolAction(payload) {
  if (!payload) return;
  applyWorldActionToAvatar(payload.action);
  setWorldSelectionText(`${payload.action.toUpperCase()} ${payload.path}`);
  refreshWorldStatusPanels({
    detail: `${payload.action.toUpperCase()} ${payload.path}`,
    payload,
  });
  setStatus(`Tool ${payload.action}: ${payload.nodeName}`, 1800);
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent("avatar-world:tool-action", { detail: payload }));
  }
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
  if (!runtime) {
    presetJsonEl.value = "{}";
    return;
  }
  const preset = { ...runtime.state, characterProfile: getActiveCharacterProfile() };
  presetJsonEl.value = JSON.stringify(preset, null, 2);
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
  const factory = getEngine(definition.engine);
  return factory({
    THREE,
    scene,
    initialState,
    profile: definition.profile,
    stageTopY: definition.stageTopY,
    avatarId: definition.id,
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
    assertControllerInterface(controller, definition.engine);
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

  if (worldModeActive) {
    swapWorldAvatar(avatarId);
    desktopWorld.focusOnWorldCamera(orbit);
    refreshWorldStatusPanels();
  } else {
    stageRig.focusAvatar(avatarId, instant);
  }
  buildControls(runtime.definition, runtime.catalog);
  syncControlsFromState();
  syncCharacterProfileInputs();
  publishPresetText();
  realtimeVoice.syncSessionContext();
  elevenLabsVoice.syncSessionContext();

  if (!silent) {
    const suffix = worldModeActive ? "in world focus" : "in focus";
    setStatus(`${runtime.definition.label} ${suffix}`, 2100);
  }
}

function resize() {
  if (renderer.xr.isPresenting) return;
  const width = stageEl.clientWidth || window.innerWidth;
  const height = stageEl.clientHeight || window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function createXrControllerRay() {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);
  const material = new THREE.LineBasicMaterial({
    color: 0xff7566,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    toneMapped: false,
  });
  const line = new THREE.Line(geometry, material);
  line.name = "xr-pointer-ray";
  line.scale.z = XR_RAY_LENGTH;
  line.visible = false;
  return line;
}

function captureXrDesktopCameraSnapshot() {
  xrDesktopCameraSnapshot.captured = true;
  xrDesktopCameraSnapshot.position.copy(camera.position);
  xrDesktopCameraSnapshot.quaternion.copy(camera.quaternion);
  camera.getWorldPosition(xrDesktopCameraSnapshot.worldPosition);
  camera.getWorldQuaternion(xrDesktopCameraSnapshot.worldQuaternion);
  xrDesktopCameraSnapshot.orbitTarget.copy(orbit.target);
}

function applyXrWorldFallbackOffset() {
  if (!xrDesktopCameraSnapshot.captured) return;
  camera.getWorldDirection(xrFallbackForward);
  xrFallbackForward.y = 0;
  if (xrFallbackForward.lengthSq() < 1e-8) {
    xrFallbackForward.set(0, 0, -1);
  } else {
    xrFallbackForward.normalize();
  }
  xrDesktopCameraSnapshot.worldPosition.addScaledVector(xrFallbackForward, -XR_WORLD_FALLBACK_BACKOFF);
  xrDesktopCameraSnapshot.worldPosition.y += XR_WORLD_FALLBACK_LIFT;
}

function restoreXrDesktopCameraSnapshot() {
  xrPlayerRig.position.set(0, 0, 0);
  xrPlayerRig.rotation.set(0, 0, 0);
  if (!xrDesktopCameraSnapshot.captured) return;

  camera.position.copy(xrDesktopCameraSnapshot.position);
  camera.quaternion.copy(xrDesktopCameraSnapshot.quaternion);
  orbit.target.copy(xrDesktopCameraSnapshot.orbitTarget);
  orbit.update();
  xrDesktopCameraSnapshot.captured = false;
}

function alignXrRigToDesktopCameraSnapshot(xrFrame = null) {
  if (!xrDesktopCameraSnapshot.captured || !renderer.xr.isPresenting) return false;
  let sampledPose = false;
  if (xrFrame && typeof xrFrame.getViewerPose === "function") {
    const referenceSpace = typeof renderer.xr.getReferenceSpace === "function"
      ? renderer.xr.getReferenceSpace()
      : null;
    const viewerPose = referenceSpace ? xrFrame.getViewerPose(referenceSpace) : null;
    const transform = viewerPose?.transform;
    if (transform?.position && transform?.orientation) {
      xrPlayerRig.updateMatrixWorld(true);
      xrAlignCurrentHead.set(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );
      xrAlignCurrentHead.applyMatrix4(xrPlayerRig.matrixWorld);

      xrAlignPoseQuaternion.set(
        transform.orientation.x,
        transform.orientation.y,
        transform.orientation.z,
        transform.orientation.w,
      );
      xrPlayerRig.getWorldQuaternion(xrAlignRigWorldQuaternion);
      xrAlignCurrentForward.set(0, 0, -1)
        .applyQuaternion(xrAlignPoseQuaternion)
        .applyQuaternion(xrAlignRigWorldQuaternion);
      sampledPose = true;
    }
  }

  if (!sampledPose) {
    const xrCamera = renderer.xr.getCamera(camera);
    if (!xrCamera) return false;
    xrCamera.getWorldPosition(xrAlignCurrentHead);
    xrCamera.getWorldDirection(xrAlignCurrentForward);
  }

  xrAlignCurrentForward.y = 0;
  if (xrAlignCurrentForward.lengthSq() < 1e-8) {
    xrAlignCurrentForward.set(0, 0, -1);
  } else {
    xrAlignCurrentForward.normalize();
  }

  xrAlignDesiredForward.set(0, 0, -1).applyQuaternion(xrDesktopCameraSnapshot.worldQuaternion);
  xrAlignDesiredForward.y = 0;
  if (xrAlignDesiredForward.lengthSq() < 1e-8) {
    xrAlignDesiredForward.set(0, 0, -1);
  } else {
    xrAlignDesiredForward.normalize();
  }

  const yawDot = clamp(xrAlignCurrentForward.dot(xrAlignDesiredForward), -1, 1);
  const crossY = (xrAlignCurrentForward.z * xrAlignDesiredForward.x)
    - (xrAlignCurrentForward.x * xrAlignDesiredForward.z);
  const yawDelta = Math.atan2(crossY, yawDot);

  if (Math.abs(yawDelta) > 1e-5) {
    xrPlayerRig.position.sub(xrAlignCurrentHead);
    xrPlayerRig.position.applyAxisAngle(xrWorldUp, yawDelta);
    xrPlayerRig.position.add(xrAlignCurrentHead);
    xrPlayerRig.rotateY(yawDelta);
  }

  xrAlignOffset.copy(xrDesktopCameraSnapshot.worldPosition).sub(xrAlignCurrentHead);
  xrPlayerRig.position.add(xrAlignOffset);
  return true;
}

function resolveXrControllerForHand(handedness) {
  const exact = xrControllers.find((entry) => entry.connected && entry.handedness === handedness);
  if (exact) return exact;

  const fallbackIndex = handedness === "left" ? 0 : 1;
  const fallback = xrControllers.find((entry) => entry.connected && entry.index === fallbackIndex);
  return fallback || null;
}

function resolveAnyConnectedXrController(exclude = null) {
  return xrControllers.find((entry) => entry.connected && entry !== exclude) || null;
}

function readXrControllerAxes(controllerState) {
  const axes = controllerState?.inputSource?.gamepad?.axes;
  if (!Array.isArray(axes) || axes.length < 2) {
    return { x: 0, y: 0 };
  }

  const pairs = [];
  for (let i = 0; i + 1 < axes.length; i += 2) {
    const x = Number(axes[i]) || 0;
    const y = Number(axes[i + 1]) || 0;
    pairs.push({
      x,
      y,
      magnitude: Math.hypot(x, y),
    });
  }

  if (!pairs.length) {
    return { x: 0, y: 0 };
  }

  let bestPair = pairs[0];
  for (const pair of pairs) {
    if (pair.magnitude > bestPair.magnitude) {
      bestPair = pair;
    }
  }

  // Quest controllers commonly expose sticks on axes[2]/axes[3].
  if (bestPair.magnitude <= 0.0001 && pairs.length > 1) {
    bestPair = pairs[pairs.length - 1];
  }

  return {
    x: bestPair.x,
    y: bestPair.y,
  };
}

function applyXrAxisDeadzone(value) {
  const magnitude = Math.abs(Number(value) || 0);
  if (magnitude < XR_AXIS_DEADZONE) return 0;
  const normalized = clamp((magnitude - XR_AXIS_DEADZONE) / (1 - XR_AXIS_DEADZONE), 0, 1);
  return Math.sign(value) * normalized;
}

function getXrControllerRay(controller, origin, direction) {
  if (!controller) return false;
  origin.setFromMatrixPosition(controller.matrixWorld);
  xrControllerTempMatrix.identity().extractRotation(controller.matrixWorld);
  direction.set(0, 0, -1).applyMatrix4(xrControllerTempMatrix);
  if (direction.lengthSq() < 1e-8) return false;
  direction.normalize();
  return true;
}

function pickWorldNodeFromXrController(controllerState) {
  if (!worldModeActive || !desktopWorld.isActive()) return null;
  if (!controllerState?.connected) return null;
  if (!getXrControllerRay(controllerState.controller, xrControllerOrigin, xrControllerDirection)) {
    return null;
  }
  return desktopWorld.pickWorldNodeFromRay(xrControllerOrigin, xrControllerDirection, {
    maxDistance: XR_WORLD_PICK_DISTANCE,
  });
}

function updateXrControllerRays() {
  const shouldShow = renderer.xr.isPresenting && worldModeActive;
  for (const state of xrControllers) {
    if (!state?.ray) continue;
    state.ray.visible = shouldShow && state.connected;
  }
}

function updateXrLocomotion(dt) {
  if (!renderer.xr.isPresenting || !worldModeActive) return;
  if (XR_WORLD_SHIP_LOCK_ENABLED && desktopWorld.isCameraLockedToShip?.()) return;
  if (xrStartupAlignFrames > 0) return;

  const leftController = resolveXrControllerForHand("left") || resolveAnyConnectedXrController();
  const rightController = resolveXrControllerForHand("right") || resolveAnyConnectedXrController(leftController);
  const leftAxes = readXrControllerAxes(leftController);
  const rightAxes = readXrControllerAxes(rightController);

  const moveX = applyXrAxisDeadzone(leftAxes.x);
  const moveY = applyXrAxisDeadzone(leftAxes.y);
  const turnX = applyXrAxisDeadzone(rightAxes.x);
  if (!moveX && !moveY && !turnX) return;

  const xrCamera = renderer.xr.getCamera(camera);
  if (!xrCamera) return;

  if (turnX) {
    xrCamera.getWorldPosition(xrHeadPosition);
    const turnDelta = -turnX * XR_TURN_SPEED_RPS * dt;
    xrPlayerRig.position.sub(xrHeadPosition);
    xrPlayerRig.position.applyAxisAngle(xrWorldUp, turnDelta);
    xrPlayerRig.position.add(xrHeadPosition);
    xrPlayerRig.rotateY(turnDelta);
  }

  if (moveX || moveY) {
    xrCamera.getWorldDirection(xrMoveForward);
    xrMoveForward.y = 0;
    if (xrMoveForward.lengthSq() < 1e-6) {
      xrMoveForward.set(0, 0, -1);
    } else {
      xrMoveForward.normalize();
    }
    xrMoveRight.crossVectors(xrMoveForward, xrWorldUp).normalize();

    const moveDistance = XR_MOVE_SPEED_MPS * dt;
    xrMoveDelta.set(0, 0, 0);
    if (moveY) {
      xrMoveDelta.addScaledVector(xrMoveForward, -moveY * moveDistance);
    }
    if (moveX) {
      xrMoveDelta.addScaledVector(xrMoveRight, moveX * moveDistance);
    }
    xrPlayerRig.position.add(xrMoveDelta);
  }
}

function lockXrCameraToWorldShipCockpit() {
  if (!XR_WORLD_SHIP_LOCK_ENABLED) return false;
  if (!renderer.xr.isPresenting || !worldModeActive) return false;
  if (!desktopWorld.isCameraLockedToShip?.()) return false;
  if (typeof desktopWorld.getWorldShipCameraPose !== "function") return false;

  const hasPose = desktopWorld.getWorldShipCameraPose(xrShipLockPosition, null, { xr: true });
  if (!hasPose) return false;

  const xrCamera = renderer.xr.getCamera(camera);
  if (!xrCamera) return false;
  xrCamera.getWorldPosition(xrHeadPosition);
  xrShipLockDelta.copy(xrShipLockPosition).sub(xrHeadPosition);
  xrPlayerRig.position.add(xrShipLockDelta);
  return true;
}

function setupXrControllers() {
  if (xrControllersReady) return;
  xrControllersReady = true;

  for (let index = 0; index < 2; index += 1) {
    const controller = renderer.xr.getController(index);
    const ray = createXrControllerRay();
    controller.add(ray);
    scene.add(controller);

    const state = {
      index,
      controller,
      ray,
      connected: false,
      handedness: "",
      inputSource: null,
    };
    xrControllers.push(state);

    controller.addEventListener("connected", (event) => {
      const inputSource = event.data;
      state.connected = true;
      state.inputSource = inputSource || null;
      state.handedness = String(inputSource?.handedness || "");

      const rayColor = state.handedness === "left" ? 0x80b1ff : 0xff7e6f;
      if (state.ray?.material?.color) {
        state.ray.material.color.setHex(rayColor);
      }
      if (state.ray) {
        state.ray.visible = renderer.xr.isPresenting && worldModeActive;
      }
    });

    controller.addEventListener("disconnected", () => {
      state.connected = false;
      state.handedness = "";
      state.inputSource = null;
      if (state.ray) {
        state.ray.visible = false;
      }
    });

    controller.addEventListener("selectstart", () => {
      if (!renderer.xr.isPresenting || !worldModeActive) return;
      const payload = pickWorldNodeFromXrController(state);
      if (!payload) {
        setStatus("No world node targeted", 1200);
      }
    });
  }
}

function ensureXrEnterButton() {
  if (!headerActionsEl) return null;
  if (xrEnterButton) return xrEnterButton;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "btnEnterVr";
  button.className = "btn-voice";
  button.textContent = "VR: Checking";
  button.disabled = true;
  button.dataset.state = "syncing";

  headerActionsEl.insertBefore(button, statusEl || null);
  xrEnterButton = button;
  return xrEnterButton;
}

function syncXrEnterButtonState() {
  if (!xrEnterButton) return;

  if (!xrSupportChecked) {
    xrEnterButton.textContent = "VR: Checking";
    xrEnterButton.disabled = true;
    xrEnterButton.dataset.state = "syncing";
    return;
  }

  if (!xrImmersiveVrSupported) {
    xrEnterButton.textContent = "VR: Unsupported";
    xrEnterButton.disabled = true;
    xrEnterButton.dataset.state = "idle";
    return;
  }

  xrEnterButton.disabled = false;
  if (renderer.xr.isPresenting) {
    xrEnterButton.textContent = "Exit VR";
    xrEnterButton.dataset.state = "live";
  } else {
    xrEnterButton.textContent = "Enter VR";
    xrEnterButton.dataset.state = "idle";
  }
}

async function enterVrSession() {
  if (!xrImmersiveVrSupported || renderer.xr.isPresenting) return;
  if (!navigator.xr?.requestSession) return;

  captureXrDesktopCameraSnapshot();
  if (worldModeActive && !XR_WORLD_SHIP_LOCK_ENABLED) {
    applyXrWorldFallbackOffset();
  }
  try {
    const worldModeReferenceType = worldModeActive ? "local" : "local-floor";
    renderer.xr.setReferenceSpaceType(worldModeReferenceType);
    const sessionInit = worldModeActive
      ? {
        optionalFeatures: ["bounded-floor", "hand-tracking", "layers"],
      }
      : {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["bounded-floor", "hand-tracking", "layers"],
      };
    const session = await navigator.xr.requestSession("immersive-vr", sessionInit);
    await renderer.xr.setSession(session);
  } catch (error) {
    xrDesktopCameraSnapshot.captured = false;
    console.warn("Failed to enter VR session", error);
    setStatus("Could not enter VR", 2200);
    syncXrEnterButtonState();
  }
}

function setupXrSessionHandlers() {
  renderer.xr.addEventListener("sessionstart", () => {
    orbit.enabled = false;
    if (xrDesktopCameraSnapshot.captured) {
      xrStartupAlignFrames = 90;
    }
    if (worldModeActive) {
      setWorldSelectionText(getWorldSelectionPrompt());
    }
    updateXrControllerRays();
    syncXrEnterButtonState();
    if (XR_WORLD_SHIP_LOCK_ENABLED && worldModeActive && desktopWorld.isCameraLockedToShip?.()) {
      setStatus("Entered VR: cockpit lock active (head look only), trigger selects nodes", 2400);
    } else {
      setStatus("Entered VR: left stick move, right stick turn, trigger selects nodes", 2200);
    }
  });

  renderer.xr.addEventListener("sessionend", () => {
    xrStartupAlignFrames = 0;
    renderer.xr.setReferenceSpaceType("local-floor");
    restoreXrDesktopCameraSnapshot();
    orbit.enabled = true;
    if (worldModeActive) {
      setWorldSelectionText(getWorldSelectionPrompt());
    }
    updateXrControllerRays();
    syncXrEnterButtonState();
    resize();
    setStatus("Exited VR", 1600);
  });
}

async function initWebXr() {
  setupXrControllers();
  const button = ensureXrEnterButton();
  if (!button) return;

  setupXrSessionHandlers();

  button.addEventListener("click", async () => {
    if (renderer.xr.isPresenting) {
      try {
        await renderer.xr.getSession()?.end();
      } catch (error) {
        console.warn("Failed to exit VR session", error);
      }
      return;
    }
    await enterVrSession();
  });

  if (!navigator.xr?.isSessionSupported) {
    xrSupportChecked = true;
    xrImmersiveVrSupported = false;
    syncXrEnterButtonState();
    return;
  }

  try {
    xrImmersiveVrSupported = await navigator.xr.isSessionSupported("immersive-vr");
  } catch (error) {
    console.warn("Failed to check immersive-vr support", error);
    xrImmersiveVrSupported = false;
  }

  xrSupportChecked = true;
  syncXrEnterButtonState();
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

  btnWorldToggle?.addEventListener("click", () => {
    if (worldModeActive) {
      exitWorldMode();
    } else {
      enterWorldMode();
    }
  });

  worldActionEl?.addEventListener("change", () => {
    const normalized = normalizeWorldAction(worldActionEl.value);
    worldActionEl.value = normalized;
    desktopWorld.setAction(normalized);
    refreshWorldStatusPanels({ detail: `World action: ${normalized.toUpperCase()}.` });
    if (worldModeActive) {
      setWorldSelectionText(getWorldSelectionPrompt(normalized));
      setStatus(`World action set to ${normalized}`, 1500);
    }
  });

  worldScaleModeEl?.addEventListener("change", () => {
    const normalized = normalizeWorldScaleMode(worldScaleModeEl.value);
    worldScaleModeEl.value = normalized;
    desktopWorld.setScaleMode(normalized);

    const label = formatWorldScaleModeLabel(normalized);
    refreshWorldStatusPanels({ detail: `World scale: ${label.toUpperCase()}.` });
    setStatus(`World scale set to ${label}`, 1700);
  });

  btnSaveCharacter?.addEventListener("click", () => {
    saveCharacterProfile();
    realtimeVoice.syncSessionContext();
    elevenLabsVoice.syncSessionContext();
  });

  btnResetCharacter?.addEventListener("click", () => {
    const defaults = getDefaultCharacterProfile(activeAvatarId);
    characterProfiles[activeAvatarId] = defaults;
    persistCharacterProfiles(characterProfiles);
    syncCharacterProfileInputs();
    realtimeVoice.syncSessionContext();
    elevenLabsVoice.syncSessionContext();
    setStatus("Profile reset", 1500);
  });

  const profileInputHandler = () => {
    queueCharacterProfileAutosave();
    realtimeVoice.syncSessionContext();
    elevenLabsVoice.syncSessionContext();
  };

  characterNameEl?.addEventListener("input", profileInputHandler);
  characterBackgroundEl?.addEventListener("input", profileInputHandler);
  characterPersonalityEl?.addEventListener("input", profileInputHandler);

  const voiceCredentialInputHandler = () => {
    const next = captureVoiceCredentialsFromInputs();
    voiceCredentials.openAiToken = next.openAiToken;
    voiceCredentials.elevenLabsAgentId = next.elevenLabsAgentId;
    voiceCredentials.elevenLabsApiKey = next.elevenLabsApiKey;
    applyVoiceCredentialsToProviders();
  };

  openAiTokenEl?.addEventListener("input", voiceCredentialInputHandler);
  elevenLabsApiKeyEl?.addEventListener("input", voiceCredentialInputHandler);
  elevenLabsAgentIdEl?.addEventListener("input", () => {
    syncElevenLabsAgentPresetInput(elevenLabsAgentIdEl.value);
    voiceCredentialInputHandler();
  });
  elevenLabsAgentPresetEl?.addEventListener("change", () => {
    const presetAgentId = resolveKnownElevenLabsAgentId(elevenLabsAgentPresetEl.value);
    if (presetAgentId && elevenLabsAgentIdEl) {
      elevenLabsAgentIdEl.value = presetAgentId;
    }
    voiceCredentialInputHandler();
  });

  btnSaveVoiceCredentials?.addEventListener("click", () => {
    saveVoiceCredentials();
  });

  btnClearVoiceCredentials?.addEventListener("click", () => {
    clearStoredVoiceCredentials();
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
      const { characterProfile: incomingProfile, ...stateFields } = parsed;
      runtime.state = sanitizeState(
        runtime.definition,
        { ...runtime.state, ...stateFields },
        runtime.catalog,
        runtime.definition.defaultState,
      );
      if (incomingProfile && typeof incomingProfile === "object") {
        characterProfiles[activeAvatarId] = normalizeCharacterProfile(incomingProfile, activeAvatarId);
        persistCharacterProfiles(characterProfiles);
        syncCharacterProfileInputs();
        realtimeVoice.syncSessionContext();
        elevenLabsVoice.syncSessionContext();
      }
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
    if (worldModeActive) {
      const worldHit = desktopWorld.pickWorldNode(event.clientX, event.clientY);
      if (worldHit) return;
    }

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

  renderer.setAnimationLoop((_time, xrFrame) => {
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
    desktopWorld.setXrPresentationActive?.(XR_WORLD_SHIP_LOCK_ENABLED && renderer.xr.isPresenting);
    const worldViewCamera = renderer.xr.isPresenting ? renderer.xr.getCamera(camera) : camera;
    const viewportHeightPx = canvas.clientHeight || stageEl?.clientHeight || window.innerHeight || 0;
    desktopWorld.update(dt, worldViewCamera, viewportHeightPx);
    if (renderer.xr.isPresenting && xrStartupAlignFrames > 0) {
      const aligned = alignXrRigToDesktopCameraSnapshot(xrFrame);
      if (aligned) {
        xrStartupAlignFrames = 0;
      } else {
        xrStartupAlignFrames -= 1;
      }
    }
    if (XR_WORLD_SHIP_LOCK_ENABLED && renderer.xr.isPresenting) {
      lockXrCameraToWorldShipCockpit();
    }
    updateXrLocomotion(dt);
    updateXrControllerRays();
    if (!renderer.xr.isPresenting) {
      orbit.update();
    }
    renderer.render(scene, camera);
  });
}

function initWsPreview() {
  const panelScroll = document.querySelector(".panel-scroll");
  if (!panelScroll || !controlsEl) return;

  // Create a container div and insert before the controlSections element
  const container = document.createElement("div");
  container.id = "wsPreviewContainer";
  panelScroll.insertBefore(container, controlsEl);

  _wsPreviewInstance = createWsPreview({
    containerEl: container,
    onEvent: handleWsEvent,
  });
}

function init() {
  populateAvatarSelect();
  syncVoiceCredentialInputs();
  applyVoiceCredentialsToProviders();
  const normalizedWorldAction = normalizeWorldAction(worldActionEl?.value);
  const normalizedWorldScaleMode = normalizeWorldScaleMode(worldScaleModeEl?.value);
  if (worldActionEl) {
    worldActionEl.value = normalizedWorldAction;
  }
  if (worldScaleModeEl) {
    worldScaleModeEl.value = normalizedWorldScaleMode;
  }
  desktopWorld.setAction(normalizedWorldAction);
  desktopWorld.setScaleMode(normalizedWorldScaleMode);
  syncWorldToggleButton();
  setWorldSelectionText("No world node selected.");
  refreshWorldStatusPanels();
  realtimeVoice.init();
  elevenLabsVoice.init();
  installGlobalHandlers();
  void initWebXr();
  applyScenePreset();
  createAvatarRuntimes();
  initWsPreview();
  resize();
  loadAvatar(activeAvatarId, { instant: true, silent: true });
  startRenderLoop();
  void runDevVowelDemo();
}

try {
  init();
} catch (err) {
  console.error(err);
  setStatus("Studio failed to initialize", 5000);
}
