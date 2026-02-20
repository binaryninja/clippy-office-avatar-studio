import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { convertToExcalidrawElements, exportToCanvas, loadFromBlob } from "@excalidraw/excalidraw";
import { createClippyController } from "./avatars/clippy-controller.js";
import { AVATAR_DEFINITIONS, NO_PROP_VALUE } from "./config/avatars.js";

const DEMO_RISK_STEPS = [
  {
    title: "Threat Risk Assessment Demo",
    line: "We assess a ServiceNow AI agent app that triages cases, summarizes context, and triggers workflow actions.",
    points: [
      "Scope: ITSM and employee support workflows using a tool-calling LLM agent.",
      "Method: STRIDE-inspired threat model plus likelihood-impact scoring.",
      "Goal: prioritize controls required for a safe production rollout.",
    ],
  },
  {
    title: "Architecture and Trust Boundaries",
    line: "The highest-risk boundaries are user prompts, retrieval content, tool execution, and privileged ServiceNow APIs.",
    points: [
      "Components: chat UI, orchestrator, LLM, retrieval index, ServiceNow adapters.",
      "Untrusted inputs: user prompts and externally sourced knowledge content.",
      "High-trust surface: write-capable APIs for incident and change updates.",
    ],
  },
  {
    title: "Threat Actors and Abuse Paths",
    line: "We model insider misuse, external account compromise, and poisoned integrations.",
    points: [
      "Actor A: low-privilege user trying to exfiltrate restricted case data.",
      "Actor B: attacker with stolen session token or leaked API credential.",
      "Actor C: compromised connector injecting malicious retrieval instructions.",
    ],
  },
  {
    title: "Top Risk R1: Prompt Injection to Tool Misuse",
    line: "Critical risk: injected instructions coerce unauthorized tool calls and sensitive data access.",
    points: [
      "Scenario: ticket text asks the agent to ignore policy and run privileged actions.",
      "Score: Likelihood 4 x Impact 5 = 20 (Critical).",
      "Controls: policy engine, tool allowlists, authorization per call, output filtering.",
    ],
  },
  {
    title: "Top Risk R2: Data Leakage Across Contexts",
    line: "High risk: retrieval or memory scoping failures leak records across teams, roles, or tenants.",
    points: [
      "Scenario: summarization pulls records outside caller authorization scope.",
      "Score: Likelihood 3 x Impact 5 = 15 (High).",
      "Controls: tenant-scoped indexes, row ACL checks, redaction and egress policy.",
    ],
  },
  {
    title: "Top Risk R3: Over-Privileged Agent Identity",
    line: "High risk: broad integration roles amplify impact when one guardrail is bypassed.",
    points: [
      "Scenario: agent identity can approve changes or alter priority without review.",
      "Score: Likelihood 3 x Impact 4 = 12 (High).",
      "Controls: least privilege, just-in-time elevation, approval gates for risky actions.",
    ],
  },
  {
    title: "Top Risk R4: Availability and Cost Abuse",
    line: "High risk: recursive loops and unbounded prompts create denial-of-wallet and service degradation.",
    points: [
      "Scenario: adversary triggers retries and expensive model/tool loops.",
      "Score: Likelihood 4 x Impact 3 = 12 (High).",
      "Controls: request budgets, loop detection, circuit breakers, and rate limits.",
    ],
  },
  {
    title: "Control Plan: 30/60/90 Days",
    line: "Sequence controls from prevention to detection to governance for sustained operation.",
    points: [
      "30 days: tool allowlists, prompt-injection tests, logging baseline, kill switch.",
      "60 days: tenant isolation validation, red-team scenarios, secret hardening.",
      "90 days: continuous adversarial tests, risk KPIs, formal go-live gate.",
    ],
  },
  {
    title: "Residual Risk and Go-Live Decision",
    line: "Recommendation: conditional go-live after critical controls close and high-risk simulations pass.",
    points: [
      "Go-live criteria: no unresolved critical findings and approved compensating controls.",
      "Evidence: test reports, audit logs, access matrix, and rollback runbook.",
      "Operating model: phased rollout with weekly risk review cadence.",
    ],
  },
];

const MODE_CYCLE = ["wave", "thinking", "point", "idle", "celebrate"];
const EXPRESSION_CYCLE = ["happy", "focused", "neutral", "surprised"];

const canvas = document.getElementById("presenterCanvas");
const stageEl = document.querySelector(".stage");
const talkTitleEl = document.getElementById("talkTitle");
const talkLineEl = document.getElementById("talkLine");
const sceneFileEl = document.getElementById("sceneFile");
const boardViewportEl = document.getElementById("boardViewport");
const stepListEl = document.getElementById("stepList");
const stepMetaEl = document.getElementById("stepMeta");
const keyPointsEl = document.getElementById("keyPoints");
const statusEl = document.getElementById("status");
const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const btnAutoplay = document.getElementById("btnAutoplay");
const btnLoadDemo = document.getElementById("btnLoadDemo");
const btnFit = document.getElementById("btnFit");
const btnResetLine = document.getElementById("btnResetLine");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0f2231, 7.5, 20);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(0.25, 0.88, 8.7);

const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.enablePan = false;
orbit.enableZoom = false;
orbit.target.set(0, 0.28, 0);
orbit.minPolarAngle = Math.PI * 0.33;
orbit.maxPolarAngle = Math.PI * 0.62;

const hemi = new THREE.HemisphereLight(0x80deff, 0x1a2a3b, 1.14);
const fill = new THREE.DirectionalLight(0x4ac7ff, 1.08);
fill.position.set(3.2, 4.4, 5.4);
fill.castShadow = true;
fill.shadow.mapSize.set(1024, 1024);
const rim = new THREE.PointLight(0xffbd5f, 0.92, 16, 2);
rim.position.set(-3.2, 2.6, -2.2);
const ambient = new THREE.AmbientLight(0x20384f, 0.54);
scene.add(hemi, fill, rim, ambient);

const stage = new THREE.Mesh(
  new THREE.CylinderGeometry(4.4, 4.8, 0.5, 72),
  new THREE.MeshStandardMaterial({
    color: 0x142b3c,
    metalness: 0.46,
    roughness: 0.34,
    emissive: 0x0d2a3f,
    emissiveIntensity: 0.18,
  }),
);
stage.position.y = -2.36;
stage.receiveShadow = true;
scene.add(stage);

const ring = new THREE.Mesh(
  new THREE.TorusGeometry(3.9, 0.075, 18, 160),
  new THREE.MeshStandardMaterial({
    color: 0x5ed2ff,
    emissive: 0x5ed2ff,
    emissiveIntensity: 0.54,
    metalness: 0.82,
    roughness: 0.18,
  }),
);
ring.rotation.x = Math.PI / 2;
ring.position.y = -2.08;
scene.add(ring);

const pointer = { x: 0, y: 0 };
const neutralPointer = { x: 0.22, y: 0.07 };
const clippyStateBase = { ...AVATAR_DEFINITIONS.clippy.defaultState };

let clippyRuntime = null;
let activeStep = 0;
let autoplayTimer = null;
let renderToken = 0;
let presentationSteps = [];
let activeSceneData = {
  elements: [],
  appState: {
    viewBackgroundColor: "#ffffff",
  },
  files: {},
};

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function normalizeStepIndex(value) {
  const total = presentationSteps.length;
  if (!total) return 0;
  return ((value % total) + total) % total;
}

function normalizeState(overrides = {}) {
  const merged = { ...clippyStateBase, ...overrides };
  if (!merged.propName) {
    merged.propName = NO_PROP_VALUE;
  }
  return merged;
}

function stepStateForIndex(index, title = "", total = 1) {
  const mode = MODE_CYCLE[index % MODE_CYCLE.length];
  let expression = EXPRESSION_CYCLE[index % EXPRESSION_CYCLE.length];

  if (/risk|critical|abuse|attack/i.test(title)) {
    expression = "focused";
  } else if (/decision|close|go-live/i.test(title)) {
    expression = "happy";
  }

  return {
    mode,
    expression,
    propName: index === 0 || index === total - 1 ? "topHat" : NO_PROP_VALUE,
  };
}

function escapeExcalidrawText(value) {
  return String(value ?? "").replace(/\n+/g, "\n").trim();
}

function wrapTextByWords(value, maxCharsPerLine, maxLines = 3) {
  const words = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (!words.length) return "";

  const lines = [];
  let current = words.shift() || "";

  for (const word of words) {
    const candidate = `${current} ${word}`;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length >= maxLines - 1) break;
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  } else if (current) {
    const last = lines[lines.length - 1] || "";
    lines[lines.length - 1] = `${last.replace(/\.\.\.$/, "")}...`.trim();
  }

  return lines.slice(0, maxLines).join("\n");
}

function createDemoSlideElements(step) {
  const isRiskSlide = /risk|critical|high/i.test(step.title);
  const shellColor = "#071a2c";
  const shellBorder = "#2f8fbe";
  const headerColor = isRiskSlide ? "#3d1421" : "#10344f";
  const borderColor = isRiskSlide ? "#ff6b72" : "#61d5ff";
  const titleColor = "#eaf7ff";
  const bodyColor = "#c8dfef";
  const bulletColor = "#d8ecff";
  const wrappedTitle = wrapTextByWords(step.title, 28, 2);
  const wrappedLine = wrapTextByWords(step.line, 54, 3);
  const titleLineCount = Math.max(1, wrappedTitle.split("\n").length);
  const lineLineCount = Math.max(1, wrappedLine.split("\n").length);
  const headerHeight = 108 + (titleLineCount - 1) * 42;
  const frameWidth = 1320;
  const frameHeight = 760;
  const frameX = 36;
  const frameY = 30;
  const contentLeft = 86;
  const lineStartY = frameY + headerHeight + 86;
  const bulletStartY = lineStartY + lineLineCount * 38 + 44;

  const skeleton = [
    {
      type: "rectangle",
      x: frameX,
      y: frameY,
      width: frameWidth,
      height: frameHeight,
      strokeColor: shellBorder,
      backgroundColor: shellColor,
      strokeWidth: 2,
      roughness: 0,
    },
    {
      type: "rectangle",
      x: frameX + 34,
      y: frameY + 36,
      width: frameWidth - 68,
      height: headerHeight,
      strokeColor: borderColor,
      backgroundColor: headerColor,
      strokeWidth: 2,
      roughness: 0,
    },
    {
      type: "text",
      x: contentLeft,
      y: frameY + 74,
      text: escapeExcalidrawText(wrappedTitle),
      strokeColor: titleColor,
      fontSize: 38,
    },
    {
      type: "text",
      x: contentLeft,
      y: lineStartY,
      text: escapeExcalidrawText(wrappedLine),
      strokeColor: bodyColor,
      fontSize: 29,
    },
  ];

  const bullets = (step.points || []).slice(0, 4);
  bullets.forEach((point, index, list) => {
    const maxLines = index === list.length - 1 ? 3 : 2;
    const wrappedBullet = wrapTextByWords(point, 62, maxLines);
    skeleton.push({
      type: "text",
      x: contentLeft + 12,
      y: bulletStartY + index * 86,
      text: `- ${escapeExcalidrawText(wrappedBullet)}`,
      strokeColor: bulletColor,
      fontSize: 27,
    });
  });

  return convertToExcalidrawElements(skeleton);
}

function createDemoDeck() {
  const total = DEMO_RISK_STEPS.length;
  return DEMO_RISK_STEPS.map((step, index) => ({
    ...step,
    sceneElements: createDemoSlideElements(step),
    state: normalizeState(stepStateForIndex(index, step.title, total)),
  }));
}

function toRenderableSceneData(rawScene) {
  return {
    elements: Array.isArray(rawScene?.elements) ? rawScene.elements.filter(Boolean) : [],
    appState: rawScene?.appState && typeof rawScene.appState === "object" ? rawScene.appState : {},
    files: rawScene?.files && typeof rawScene.files === "object" ? rawScene.files : {},
  };
}

function elementBounds(element) {
  const x1 = Number(element?.x) || 0;
  const y1 = Number(element?.y) || 0;
  const x2 = x1 + (Number(element?.width) || 0);
  const y2 = y1 + (Number(element?.height) || 0);
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
  };
}

function isElementInsideFrame(element, frame, margin = 3) {
  if (!element || element.isDeleted) return false;
  if (element.id === frame.id) return true;
  if (element.frameId && element.frameId === frame.id) return true;

  const box = elementBounds(element);
  const centerX = (box.left + box.right) / 2;
  const centerY = (box.top + box.bottom) / 2;
  return (
    centerX >= frame.x - margin &&
    centerX <= frame.x + frame.width + margin &&
    centerY >= frame.y - margin &&
    centerY <= frame.y + frame.height + margin
  );
}

function textBlocksFromElements(elements) {
  return elements
    .filter((element) => element.type === "text" && typeof element.text === "string" && element.text.trim())
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .map((element) => element.text.trim());
}

function pointsFromTextBlocks(blocks) {
  const points = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const cleaned = line.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "");
      points.push(cleaned);
      if (points.length >= 4) return points;
    }
  }
  return points;
}

function buildDeckFromScene(sceneData, sourceLabel = "Imported Scene") {
  const elements = sceneData.elements.filter((element) => !element.isDeleted);
  const frames = elements
    .filter(
      (element) =>
        element.type === "frame" &&
        Number.isFinite(element.x) &&
        Number.isFinite(element.y) &&
        Number.isFinite(element.width) &&
        Number.isFinite(element.height) &&
        element.width > 16 &&
        element.height > 16,
    )
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));

  if (!frames.length) {
    const title = `Scene Overview: ${sourceLabel}`;
    return [
      {
        title,
        line: "No Excalidraw frames detected. Presenting the full scene as a single slide.",
        points: [
          "Tip: add Excalidraw frames to turn one scene into multiple presentation slides.",
          "This mode still supports Clippy narration, controls, and autoplay.",
        ],
        sceneElements: elements,
        state: normalizeState(stepStateForIndex(0, title, 1)),
      },
    ];
  }

  const total = frames.length;
  return frames.map((frame, index) => {
    const frameElements = elements.filter((element) => isElementInsideFrame(element, frame));
    const textBlocks = textBlocksFromElements(frameElements).slice(0, 8);
    const title = String(frame.name || "").trim() || textBlocks[0]?.split("\n")[0] || `Frame ${index + 1}`;
    const points = pointsFromTextBlocks(textBlocks.slice(1));
    const line = points[0] || textBlocks[1] || `Reviewing ${title}.`;

    return {
      title,
      line,
      points: points.slice(0, 3),
      sceneElements: frameElements.length ? frameElements : elements,
      state: normalizeState(stepStateForIndex(index, title, total)),
    };
  });
}

function showBoardPlaceholder(message) {
  const text = document.createElement("p");
  text.className = "board-empty";
  text.textContent = message;
  boardViewportEl.replaceChildren(text);
}

async function renderSceneForStep(step) {
  if (!step?.sceneElements?.length) {
    showBoardPlaceholder("No renderable elements for this slide.");
    return;
  }

  const localToken = ++renderToken;
  const viewportWidth = Math.max(260, Math.floor(boardViewportEl.clientWidth || 260));
  const viewportHeight = Math.max(220, Math.floor(boardViewportEl.clientHeight || 220));
  const viewportInnerWidth = Math.max(180, viewportWidth - 8);
  const viewportInnerHeight = Math.max(160, viewportHeight - 8);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  try {
    const sourceCanvas = await exportToCanvas({
      elements: step.sceneElements,
      appState: {
        ...activeSceneData.appState,
        exportBackground: true,
        exportWithDarkMode: false,
        viewBackgroundColor: activeSceneData.appState?.viewBackgroundColor || "#ffffff",
      },
      files: activeSceneData.files || {},
    });

    if (localToken !== renderToken) return;

    const fittedCanvas = document.createElement("canvas");
    fittedCanvas.width = Math.max(64, Math.round(viewportInnerWidth * dpr));
    fittedCanvas.height = Math.max(64, Math.round(viewportInnerHeight * dpr));
    fittedCanvas.style.width = `${viewportInnerWidth}px`;
    fittedCanvas.style.height = `${viewportInnerHeight}px`;
    fittedCanvas.className = "board-canvas";

    const context = fittedCanvas.getContext("2d");
    if (!context) {
      showBoardPlaceholder("Canvas context unavailable.");
      return;
    }

    context.save();
    context.fillStyle = activeSceneData.appState?.viewBackgroundColor || "#ffffff";
    context.fillRect(0, 0, fittedCanvas.width, fittedCanvas.height);

    const sourceWidth = Math.max(1, sourceCanvas.width);
    const sourceHeight = Math.max(1, sourceCanvas.height);
    const fitScale = Math.min(
      fittedCanvas.width / sourceWidth,
      fittedCanvas.height / sourceHeight,
    );
    const drawWidth = Math.max(1, Math.round(sourceWidth * fitScale));
    const drawHeight = Math.max(1, Math.round(sourceHeight * fitScale));
    const offsetX = Math.round((fittedCanvas.width - drawWidth) / 2);
    const offsetY = Math.round((fittedCanvas.height - drawHeight) / 2);

    context.drawImage(sourceCanvas, offsetX, offsetY, drawWidth, drawHeight);
    context.restore();
    boardViewportEl.replaceChildren(fittedCanvas);
  } catch (err) {
    console.error(err);
    showBoardPlaceholder("Failed to render Excalidraw scene.");
    setStatus("Rendering error while drawing Excalidraw content.", true);
  }
}

function renderKeyPoints(points = []) {
  keyPointsEl.textContent = "";
  if (!Array.isArray(points) || !points.length) {
    const item = document.createElement("li");
    item.textContent = "No key points for this slide.";
    keyPointsEl.append(item);
    return;
  }

  for (const point of points) {
    const item = document.createElement("li");
    item.textContent = point;
    keyPointsEl.append(item);
  }
}

function updateStepListUI() {
  const buttons = stepListEl.querySelectorAll("button");
  for (const [index, button] of buttons.entries()) {
    button.classList.toggle("current", index === activeStep);
  }
}

function buildStepList() {
  stepListEl.textContent = "";
  for (const [index, step] of presentationSteps.entries()) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${index + 1}. ${step.title}`;
    button.addEventListener("click", () => {
      void applyStep(index);
    });
    li.append(button);
    stepListEl.append(li);
  }
}

function setPresentation(steps, sceneData, sourceLabel = "") {
  if (!Array.isArray(steps) || !steps.length) {
    setStatus("No slides available in this scene.", true);
    return false;
  }

  presentationSteps = steps.map((step, index) => ({
    title: String(step.title || `Slide ${index + 1}`),
    line: String(step.line || `Reviewing slide ${index + 1}.`),
    points: Array.isArray(step.points) ? step.points.map(String) : [],
    sceneElements: Array.isArray(step.sceneElements) ? step.sceneElements : [],
    state: normalizeState(step.state || stepStateForIndex(index, step.title || "", steps.length)),
  }));

  activeSceneData = sceneData;
  buildStepList();
  void applyStep(0, { setMessage: false });

  const label = sourceLabel ? ` (${sourceLabel})` : "";
  setStatus(`Loaded ${presentationSteps.length} slide${presentationSteps.length === 1 ? "" : "s"}${label}.`);
  return true;
}

async function applyStep(index, { setMessage = true } = {}) {
  activeStep = normalizeStepIndex(index);
  const step = presentationSteps[activeStep];
  if (!step) return;

  talkTitleEl.textContent = step.title;
  talkLineEl.textContent = step.line;
  renderKeyPoints(step.points);
  stepMetaEl.textContent = `Step ${activeStep + 1} of ${presentationSteps.length}`;
  updateStepListUI();

  if (clippyRuntime) {
    clippyRuntime.setState(normalizeState(step.state), { force: true });
  }

  await renderSceneForStep(step);

  if (setMessage) {
    setStatus(`Showing "${step.title}"`);
  }
}

function setAutoplay(enabled) {
  if (autoplayTimer !== null) {
    clearInterval(autoplayTimer);
    autoplayTimer = null;
  }

  if (enabled) {
    autoplayTimer = setInterval(() => {
      void applyStep(activeStep + 1, { setMessage: false });
    }, 6500);
    btnAutoplay.textContent = "Stop";
    btnAutoplay.classList.add("active");
    setStatus("Autoplay started");
  } else {
    btnAutoplay.textContent = "Autoplay";
    btnAutoplay.classList.remove("active");
    setStatus("Autoplay stopped");
  }
}

function createPresenter() {
  const initialStep = presentationSteps[0] || {
    title: "Opening",
    line: "Welcome.",
    state: {},
  };
  const initialState = normalizeState(initialStep.state);

  clippyRuntime = createClippyController({
    THREE,
    scene,
    initialState,
  });

  clippyRuntime.group.position.set(0, -0.18, 0);
  clippyRuntime.group.rotation.y = -0.14;
  clippyRuntime.setState(initialState, { force: true });
}

function resize() {
  const width = stageEl.clientWidth || window.innerWidth;
  const height = stageEl.clientHeight || window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  const step = presentationSteps[activeStep];
  if (step) {
    void renderSceneForStep(step);
  }
}

async function parseSceneFromFile(file) {
  try {
    return toRenderableSceneData(await loadFromBlob(file, null, null));
  } catch (primaryErr) {
    try {
      const text = await file.text();
      return toRenderableSceneData(JSON.parse(text));
    } catch (fallbackErr) {
      fallbackErr.cause = primaryErr;
      throw fallbackErr;
    }
  }
}

async function loadSceneFile(file) {
  if (!file) return;

  try {
    const sceneData = await parseSceneFromFile(file);
    if (!sceneData.elements.length) {
      setStatus("No elements found in this file.", true);
      return;
    }

    const deck = buildDeckFromScene(sceneData, file.name);
    setPresentation(deck, sceneData, file.name);
  } catch (err) {
    console.error(err);
    setStatus("Failed to parse .excalidraw file. Confirm it is valid Excalidraw JSON.", true);
  }
}

function installHandlers() {
  btnPrev.addEventListener("click", () => {
    void applyStep(activeStep - 1);
  });
  btnNext.addEventListener("click", () => {
    void applyStep(activeStep + 1);
  });
  btnAutoplay.addEventListener("click", () => {
    setAutoplay(autoplayTimer === null);
  });
  btnLoadDemo.addEventListener("click", () => {
    const demoDeck = createDemoDeck();
    const demoSceneData = {
      elements: demoDeck.flatMap((step) => step.sceneElements),
      appState: {
        viewBackgroundColor: "#071523",
      },
      files: {},
    };
    setPresentation(demoDeck, demoSceneData, "ServiceNow AI Risk Demo");
  });
  btnFit.addEventListener("click", () => {
    const current = presentationSteps[activeStep];
    if (!current) return;
    void renderSceneForStep(current);
    setStatus("Scene refit");
  });
  btnResetLine.addEventListener("click", () => {
    const current = presentationSteps[activeStep];
    talkLineEl.textContent = current?.line || "";
    renderKeyPoints(current?.points || []);
    setStatus("Slide notes reset");
  });
  sceneFileEl.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
      void loadSceneFile(file);
    }
  });
  window.addEventListener("resize", resize);

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  });

  canvas.addEventListener("pointerleave", () => {
    pointer.x = neutralPointer.x;
    pointer.y = neutralPointer.y;
  });
}

function startLoop() {
  const clock = new THREE.Clock();

  function animate() {
    const dt = clock.getDelta();
    ring.rotation.z += dt * 0.22;
    stage.rotation.y -= dt * 0.08;

    if (clippyRuntime) {
      clippyRuntime.update(dt, pointer);
    }

    orbit.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();
}

function init() {
  pointer.x = neutralPointer.x;
  pointer.y = neutralPointer.y;

  const demoDeck = createDemoDeck();
  activeSceneData = {
    elements: demoDeck.flatMap((step) => step.sceneElements),
    appState: {
      viewBackgroundColor: "#071523",
    },
    files: {},
  };
  presentationSteps = demoDeck;

  buildStepList();
  createPresenter();
  resize();
  installHandlers();
  void applyStep(0, { setMessage: false });
  startLoop();
  setStatus("Loaded built-in demo. Import a .excalidraw file to present your own scene.");
}

try {
  init();
} catch (err) {
  console.error(err);
  setStatus("Presenter failed to initialize", true);
}
