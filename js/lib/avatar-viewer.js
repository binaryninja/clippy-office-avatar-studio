import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createClippyController } from "../avatars/clippy-controller.js";
import { createThumbtackController } from "../avatars/thumbtack-controller.js";
import { AVATAR_DEFINITIONS, NO_PROP_VALUE } from "../config/avatars.js";
import { clamp, randomBetween, randomColor } from "./utils.js";

const DEFAULT_CAMERA = Object.freeze({
  fov: 45,
  near: 0.1,
  far: 100,
  position: [0.22, 0.45, 8.4],
  target: [0, 0.15, 0],
  minDistance: 3.4,
  maxDistance: 16,
});

function flattenControlFields(definition) {
  const fields = [];
  for (const section of definition.controls || []) {
    for (const field of section.fields || []) {
      fields.push(field);
    }
  }
  return fields;
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
    const values = new Set(dynamicOptions);
    values.add(NO_PROP_VALUE);
    return [...values];
  }

  return [...dynamicOptions];
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
    if (typeof source[field.key] === "undefined") continue;
    sanitized[field.key] = coerceFieldValue(field, source[field.key], catalog);
  }

  return sanitized;
}

function decimalsFromStep(step) {
  const value = String(step);
  const dot = value.indexOf(".");
  return dot >= 0 ? value.length - dot - 1 : 0;
}

function randomizeState(definition, catalog, baseState) {
  const randomized = { ...baseState };

  for (const field of flattenControlFields(definition)) {
    if (field.type === "color") {
      randomized[field.key] = randomColor();
      continue;
    }

    if (field.type === "select") {
      const options = resolveOptions(field, catalog);
      if (!options.length) continue;

      if (field.key === "propName") {
        randomized[field.key] = options[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * options.length)];
      } else {
        randomized[field.key] = options[Math.floor(Math.random() * options.length)];
      }
      continue;
    }

    const precision = decimalsFromStep(field.step ?? 0.01);
    randomized[field.key] = randomBetween(field.min, field.max, precision);
  }

  return randomized;
}

function createController(definition, scene, initialState, stageTopY) {
  if (definition.engine === "clippy") {
    return createClippyController({
      THREE,
      scene,
      initialState,
    });
  }

  if (definition.engine === "thumbtack") {
    return createThumbtackController({
      THREE,
      scene,
      initialState,
      profile: definition.profile,
      stageTopY,
    });
  }

  throw new Error(`Unknown avatar engine "${definition.engine}" for "${definition.id}".`);
}

function normalizeVector3(values, fallback) {
  if (!Array.isArray(values) || values.length < 3) return [...fallback];
  const parsed = values.slice(0, 3).map((entry, index) => {
    const next = Number(entry);
    return Number.isFinite(next) ? next : fallback[index];
  });
  return parsed;
}

function inferCanvasSize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || canvas.clientWidth || canvas.width || 1;
  const height = rect.height || canvas.clientHeight || canvas.height || 1;
  return [Math.max(1, Math.round(width)), Math.max(1, Math.round(height))];
}

function parseSceneBackground(sceneBackground) {
  if (sceneBackground === null || typeof sceneBackground === "undefined") return null;
  if (sceneBackground instanceof THREE.Color) return sceneBackground;
  return new THREE.Color(sceneBackground);
}

export function createAvatarViewer({
  canvas,
  avatarId = "clippy",
  definitions = AVATAR_DEFINITIONS,
  initialState = null,
  stageTopY = 0,
  enableOrbit = true,
  enablePointerTracking = true,
  autoResize = true,
  pixelRatioCap = 2,
  sceneBackground = null,
  camera: cameraOverrides = {},
} = {}) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new Error("createAvatarViewer requires a canvas element.");
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: sceneBackground === null || typeof sceneBackground === "undefined",
  });
  renderer.setPixelRatio(Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, pixelRatioCap));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = parseSceneBackground(sceneBackground);

  const cameraConfig = {
    ...DEFAULT_CAMERA,
    ...cameraOverrides,
    position: normalizeVector3(cameraOverrides.position, DEFAULT_CAMERA.position),
    target: normalizeVector3(cameraOverrides.target, DEFAULT_CAMERA.target),
  };
  const camera = new THREE.PerspectiveCamera(cameraConfig.fov, 1, cameraConfig.near, cameraConfig.far);
  camera.position.set(...cameraConfig.position);

  const orbit = enableOrbit ? new OrbitControls(camera, canvas) : null;
  if (orbit) {
    orbit.enableDamping = true;
    orbit.minDistance = cameraConfig.minDistance;
    orbit.maxDistance = cameraConfig.maxDistance;
    orbit.target.set(...cameraConfig.target);
    orbit.update();
  }

  const hemi = new THREE.HemisphereLight(0xe8f3ff, 0x1d2940, 1.1);
  const ambient = new THREE.AmbientLight(0x24324a, 0.52);
  const key = new THREE.DirectionalLight(0xffffff, 1.16);
  const fill = new THREE.DirectionalLight(0x90b4ff, 0.52);
  const rim = new THREE.PointLight(0x9bfff6, 0.48, 16, 2);
  key.position.set(3.1, 5.2, 4.8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  fill.position.set(-3.8, 2.6, 5.4);
  rim.position.set(-4.2, 1.3, -3.1);
  scene.add(hemi, ambient, key, fill, rim);

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x202d43,
    metalness: 0.12,
    roughness: 0.82,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.9, 56), floorMaterial);
  floor.position.y = stageTopY - 0.015;
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const pointer = { x: 0, y: 0 };
  const clock = new THREE.Clock();

  let activeAvatarId = "";
  let activeRuntime = null;
  let activeDefinition = null;
  let resizeObserver = null;
  let raf = 0;
  let disposed = false;

  function getDefinition(id) {
    const definition = definitions[id];
    if (definition) return definition;
    const available = Object.keys(definitions);
    throw new Error(`Unknown avatar "${id}". Available avatars: ${available.join(", ") || "(none)"}`);
  }

  function replaceRuntime(nextAvatarId, seedState) {
    const definition = getDefinition(nextAvatarId);

    if (activeRuntime) {
      activeRuntime.controller.dispose();
    }

    const mergedState = {
      ...definition.defaultState,
      ...(seedState || {}),
    };
    const controller = createController(definition, scene, mergedState, stageTopY);
    const catalog = controller.getCatalog?.() || {};
    const state = sanitizeState(definition, mergedState, catalog, definition.defaultState);
    controller.setState(state, { force: true });

    activeAvatarId = nextAvatarId;
    activeDefinition = definition;
    activeRuntime = {
      controller,
      catalog,
      state,
    };
  }

  function updatePointerFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function resetPointer() {
    pointer.x = 0;
    pointer.y = 0;
  }

  function setState(nextState = {}, { force = false } = {}) {
    if (!activeRuntime || !activeDefinition) return null;
    activeRuntime.state = sanitizeState(
      activeDefinition,
      { ...activeRuntime.state, ...nextState },
      activeRuntime.catalog,
      activeDefinition.defaultState,
    );
    activeRuntime.controller.setState(activeRuntime.state, { force });
    return { ...activeRuntime.state };
  }

  function getState() {
    return activeRuntime ? { ...activeRuntime.state } : null;
  }

  function getCatalog() {
    if (!activeRuntime) return null;
    const catalog = {};
    for (const [key, value] of Object.entries(activeRuntime.catalog)) {
      catalog[key] = Array.isArray(value) ? [...value] : value;
    }
    return catalog;
  }

  function reset({ force = true } = {}) {
    if (!activeDefinition) return null;
    return setState({ ...activeDefinition.defaultState }, { force });
  }

  function randomize({ force = true } = {}) {
    if (!activeRuntime || !activeDefinition) return null;
    const nextState = randomizeState(activeDefinition, activeRuntime.catalog, activeRuntime.state);
    return setState(nextState, { force });
  }

  function setAvatar(nextAvatarId, { state = null, carryState = false } = {}) {
    const nextState = state || (carryState ? activeRuntime?.state : null);
    replaceRuntime(nextAvatarId, nextState);
    return getState();
  }

  function resize(width, height) {
    const [nextWidth, nextHeight] = width && height ? [width, height] : inferCanvasSize(canvas);
    renderer.setSize(nextWidth, nextHeight, false);
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
  }

  const onResize = () => {
    resize();
  };

  if (enablePointerTracking) {
    canvas.addEventListener("pointermove", updatePointerFromEvent);
    canvas.addEventListener("pointerleave", resetPointer);
  }

  if (autoResize) {
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(canvas);
    } else if (typeof window !== "undefined") {
      window.addEventListener("resize", onResize);
    }
  }

  function frame() {
    if (disposed) return;

    const dt = clock.getDelta();
    if (activeRuntime) {
      activeRuntime.controller.update(dt, pointer);
    }

    if (orbit) {
      orbit.update();
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  replaceRuntime(avatarId, initialState);
  resize();
  frame();

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);

    if (enablePointerTracking) {
      canvas.removeEventListener("pointermove", updatePointerFromEvent);
      canvas.removeEventListener("pointerleave", resetPointer);
    }

    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    } else if (autoResize && typeof window !== "undefined") {
      window.removeEventListener("resize", onResize);
    }

    if (activeRuntime) {
      activeRuntime.controller.dispose();
      activeRuntime = null;
    }

    scene.remove(floor);
    floor.geometry.dispose();
    floorMaterial.dispose();

    if (orbit) {
      orbit.dispose();
    }
    renderer.dispose();
    if (typeof renderer.forceContextLoss === "function") {
      renderer.forceContextLoss();
    }
  }

  return {
    renderer,
    scene,
    camera,
    orbit,
    resize,
    reset,
    randomize,
    setAvatar,
    setState,
    getState,
    getCatalog,
    getAvatarId() {
      return activeAvatarId;
    },
    dispose,
  };
}

