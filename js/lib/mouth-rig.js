/**
 * Universal mouth rig system for viseme-driven lip animation across all avatars.
 *
 * Creates a multi-layer mouth with upper/lower lips, oral cavity, tongue, and shadow.
 * Animates via viseme poses (aa, ee, oh, ou, fv, mbp, th, ch, etc.) blended with
 * voice activity level, providing rich bilabial, aperture, and jaw motion.
 *
 * Usage:
 *   const mouth = createUniversalMouth({ THREE, anchor, options });
 *   anchor.add(mouth.group);
 *   // In animation loop:
 *   mouth.applyVoiceFrame(dt, { viseme, visemeStrength, voiceActivity });
 *   // Cleanup:
 *   mouth.dispose();
 */

import { clamp } from "./utils.js";

const SIL_VISEME = "sil";

/**
 * Viseme pose definitions mapping phoneme groups to mouth shape parameters.
 * Each pose defines:
 *   - open: vertical aperture (jaw drop)
 *   - width: horizontal spread
 *   - round: lip rounding (protrusion)
 *   - press: lip compression (seal strength)
 *   - jaw: additional jaw contribution
 */
export const VISEME_POSES = Object.freeze({
  sil: { open: 0, width: 1, round: 0, press: 1, jaw: 0 },          // silence
  aa: { open: 0.82, width: 1.11, round: 0.08, press: 0.05, jaw: 0.52 },  // "father"
  ee: { open: 0.32, width: 1.3, round: -0.14, press: 0.08, jaw: 0.12 },  // "see"
  oh: { open: 0.66, width: 0.9, round: 0.72, press: 0.09, jaw: 0.32 },   // "go"
  ou: { open: 0.48, width: 0.8, round: 0.84, press: 0.12, jaw: 0.2 },    // "you"
  fv: { open: 0.16, width: 1.02, round: 0.02, press: 0.45, jaw: 0.04 },  // "five"
  mbp: { open: 0, width: 1, round: 0, press: 1, jaw: 0 },          // "map", bilabial
  th: { open: 0.36, width: 1.08, round: 0.1, press: 0.22, jaw: 0.16 },   // "think"
  ch: { open: 0.44, width: 1.01, round: 0.18, press: 0.2, jaw: 0.2 },    // "cheese"
  tn: { open: 0.24, width: 1.08, round: 0.04, press: 0.28, jaw: 0.1 },   // "tan"
  ss: { open: 0.14, width: 1.22, round: -0.04, press: 0.24, jaw: 0.06 }, // "see"
  kk: { open: 0.28, width: 1.02, round: 0.06, press: 0.26, jaw: 0.12 },  // "key"
});

/**
 * Blend two viseme poses by interpolating all parameters.
 */
export function blendPose(base, target, amount) {
  const mix = clamp(amount, 0, 1);
  return {
    open: base.open + (target.open - base.open) * mix,
    width: base.width + (target.width - base.width) * mix,
    round: base.round + (target.round - base.round) * mix,
    press: base.press + (target.press - base.press) * mix,
    jaw: base.jaw + (target.jaw - base.jaw) * mix,
  };
}

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

/**
 * Create a universal mouth rig.
 *
 * @param {object} config
 * @param {THREE} config.THREE - Three.js library
 * @param {THREE.Object3D} config.anchor - Parent anchor (typically faceRoot or head)
 * @param {object} config.options - Configuration options
 * @param {number} config.options.lipColor - Hex color for lips (default: 0xb53b4e)
 * @param {number} config.options.cavityColor - Hex color for oral cavity (default: 0x070b16)
 * @param {number} config.options.tongueColor - Hex color for tongue (default: 0x7d3445)
 * @param {number} config.options.shadowColor - Hex color for cavity shadow (default: 0x02040a)
 * @param {number} config.options.shadowOpacity - Opacity for shadow layer (default: 0.6)
 * @returns {object} Mouth rig instance with { group, applyVoiceFrame, dispose }
 */
export function createUniversalMouth({ THREE, anchor, options = {} }) {
  if (!THREE || !anchor) {
    console.warn("createUniversalMouth: THREE and anchor are required");
    return null;
  }

  const lipColor = options.lipColor ?? 0xb53b4e;
  const cavityColor = options.cavityColor ?? 0x070b16;
  const tongueColor = options.tongueColor ?? 0x7d3445;
  const shadowColor = options.shadowColor ?? 0x02040a;
  const shadowOpacity = options.shadowOpacity ?? 0.6;

  // Root group for the entire mouth assembly
  const group = new THREE.Group();

  // Create materials
  const lipMaterial = new THREE.MeshStandardMaterial({
    color: lipColor,
    metalness: 0.2,
    roughness: 0.65,
  });

  const cavityMaterial = new THREE.MeshBasicMaterial({ color: cavityColor });

  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: shadowColor,
    transparent: true,
    opacity: shadowOpacity,
    depthWrite: false,
  });

  const tongueMaterial = new THREE.MeshStandardMaterial({
    color: tongueColor,
    metalness: 0.02,
    roughness: 0.88,
  });

  // Create mouth geometry elements
  const upperLip = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.024, 12, 38, Math.PI),
    lipMaterial,
  );
  upperLip.rotation.z = Math.PI;
  upperLip.position.y = 0.008;

  const lowerLip = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.026, 12, 38, Math.PI),
    lipMaterial,
  );
  lowerLip.position.y = -0.008;

  const cavity = new THREE.Mesh(new THREE.CircleGeometry(0.13, 32), cavityMaterial);
  cavity.position.z = -0.008;
  cavity.scale.set(0.84, 0.08, 1);

  const cavityShadow = new THREE.Mesh(new THREE.CircleGeometry(0.136, 32), shadowMaterial);
  cavityShadow.position.set(0, -0.006, -0.018);
  cavityShadow.scale.set(0.92, 0.12, 1);

  const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.078, 24), tongueMaterial);
  tongue.position.set(0, -0.052, -0.014);
  tongue.scale.set(0.72, 0.26, 1);

  // Initially hide all elements (shown when voice activity detected)
  upperLip.visible = false;
  lowerLip.visible = false;
  cavity.visible = false;
  cavityShadow.visible = false;
  tongue.visible = false;

  group.add(cavityShadow, cavity, tongue, upperLip, lowerLip);

  // Voice animation runtime state
  const runtime = {
    voiceTarget: 0,
    voiceCurrent: 0,
    visemeKey: SIL_VISEME,
    visemeStrengthTarget: 0,
    visemeStrengthCurrent: 0,
    poseCurrent: { ...VISEME_POSES[SIL_VISEME] },
    phase: Math.random() * Math.PI * 2,
  };

  /**
   * Apply voice-driven animation frame to the mouth rig.
   *
   * @param {number} dt - Delta time in seconds
   * @param {object} voiceState - Voice state
   * @param {string} voiceState.viseme - Current viseme key (e.g., "aa", "ee", "oh")
   * @param {number} voiceState.visemeStrength - Viseme blend strength (0-1)
   * @param {number} voiceState.voiceActivity - Overall voice activity level (0-1)
   */
  function applyVoiceFrame(dt, voiceState = {}) {
    const { viseme = SIL_VISEME, visemeStrength = 0, voiceActivity = 0 } = voiceState;

    // Update runtime targets
    runtime.voiceTarget = clamp(Number(voiceActivity) || 0, 0, 1);
    runtime.visemeKey = Object.prototype.hasOwnProperty.call(VISEME_POSES, viseme)
      ? viseme
      : SIL_VISEME;
    runtime.visemeStrengthTarget = clamp(Number(visemeStrength) || 0, 0, 1);

    // Smooth voice activity level
    const levelSmoothing = runtime.voiceTarget > runtime.voiceCurrent ? 0.36 : 0.22;
    runtime.voiceCurrent += (runtime.voiceTarget - runtime.voiceCurrent) * levelSmoothing;
    if (runtime.voiceCurrent < 0.004) runtime.voiceCurrent = 0;

    // Smooth viseme strength
    const visemeSmoothing = runtime.visemeStrengthTarget > runtime.visemeStrengthCurrent ? 0.4 : 0.24;
    runtime.visemeStrengthCurrent += (runtime.visemeStrengthTarget - runtime.visemeStrengthCurrent) * visemeSmoothing;
    if (runtime.visemeStrengthCurrent < 0.004) runtime.visemeStrengthCurrent = 0;

    // Blend from silence to target viseme pose
    const targetPose = VISEME_POSES[runtime.visemeKey] || VISEME_POSES[SIL_VISEME];
    const mixedPose = blendPose(VISEME_POSES[SIL_VISEME], targetPose, runtime.visemeStrengthCurrent);

    // Smooth pose transitions
    for (const key of ["open", "width", "round", "press", "jaw"]) {
      const from = runtime.poseCurrent[key];
      const to = mixedPose[key];
      runtime.poseCurrent[key] = from + (to - from) * 0.34;
    }

    // Compute overall activity
    const activity = clamp(
      runtime.voiceCurrent * 0.8 + runtime.visemeStrengthCurrent * 0.64,
      0,
      1,
    );

    // Add micro-flutter for realism
    runtime.phase += dt * (14 + activity * 20);
    const flutter = Math.sin(runtime.phase) * 0.04 * activity;

    // Extract pose parameters
    const openAmount = clamp(
      runtime.poseCurrent.open * (0.14 + activity * 0.66) + flutter,
      0,
      1.1,
    );
    const widthAmount = clamp(runtime.poseCurrent.width + activity * 0.05, 0.74, 1.45);
    const roundAmount = clamp(runtime.poseCurrent.round, -0.22, 0.92);
    const pressAmount = clamp(runtime.poseCurrent.press, 0, 1);
    const jawAmount = clamp(runtime.poseCurrent.jaw, 0, 1);

    const sealAmount = clamp(pressAmount * (1 - activity * 0.28), 0, 1);
    const aperture = clamp(openAmount * (1 - sealAmount * 0.58), 0, 1.2);

    // Bilabial closure (lips fully pressed together)
    const isBilabial = runtime.visemeKey === "mbp";
    const bilabialLock = isBilabial ? runtime.visemeStrengthCurrent : 0;

    // Bridge boost for subtle lip contact during light articulation
    const bridgeBoost =
      clamp((0.24 - aperture) / 0.24, 0, 1) *
      clamp(activity * 0.12 + runtime.voiceCurrent * 0.09, 0, 0.14);
    const bridgeOpen = clamp((aperture + bridgeBoost) * (1 - bilabialLock * 0.95), 0, 1.16);

    // Determine rig visibility
    let useRig =
      aperture > 0.11 || runtime.voiceCurrent > 0.22 || runtime.visemeStrengthCurrent > 0.1;
    if (bilabialLock > 0.36) {
      useRig = false;
    }

    upperLip.visible = useRig;
    lowerLip.visible = useRig;

    if (!useRig) {
      cavity.visible = false;
      cavityShadow.visible = false;
      tongue.visible = false;
      return;
    }

    // Animate lips
    const lipSpread = clamp(1 + (widthAmount - 1) * 0.36 - roundAmount * 0.1, 0.78, 1.48);
    const closedBlend = clamp((bridgeOpen - 0.03) / 0.14, 0, 1);
    const upperLift = 0.004 + bridgeOpen * 0.016 - sealAmount * 0.012;
    const lowerDrop = -0.004 - bridgeOpen * 0.098 - jawAmount * 0.03 + sealAmount * 0.01;

    upperLip.position.y = upperLift;
    lowerLip.position.y = lowerDrop * closedBlend;

    upperLip.scale.x = lipSpread;
    lowerLip.scale.x = clamp(lipSpread * (1 + roundAmount * 0.06), 0.76, 1.56);

    upperLip.scale.y = clamp(1 - sealAmount * 0.28 + roundAmount * 0.08, 0.74, 1.24);
    lowerLip.scale.y = clamp(
      0.7 + closedBlend * (0.3 - sealAmount * 0.32 + roundAmount * 0.1),
      0.7,
      1.28,
    );

    // Animate oral cavity
    const cavityOpen = clamp(
      (bridgeOpen * (0.92 - sealAmount * 0.38) + activity * 0.05) * (1 - bilabialLock * 1.2),
      0,
      1.12,
    );
    cavity.visible = cavityOpen > 0.03;
    cavity.scale.x = clamp(
      1.08 + (lipSpread - 1) * 0.36 + bridgeOpen * 0.06 - roundAmount * 0.04,
      0.96,
      1.28,
    );
    cavity.scale.y = clamp(0.54 + cavityOpen * 0.72 + roundAmount * 0.08, 0.48, 1.28);
    cavity.position.y = -0.002 - cavityOpen * 0.055;

    cavityShadow.visible = cavity.visible;
    cavityShadow.scale.x = clamp(cavity.scale.x * 1.04, 0.96, 1.34);
    cavityShadow.scale.y = clamp(cavity.scale.y * 1.08, 0.5, 1.42);
    cavityShadow.position.y = cavity.position.y - 0.003;

    // Animate tongue
    tongue.visible = cavityOpen > 0.3 && bilabialLock < 0.28;
    tongue.scale.x = clamp(0.52 + lipSpread * 0.2, 0.42, 0.98);
    tongue.scale.y = clamp(0.16 + cavityOpen * 0.42, 0.14, 0.72);
    tongue.position.y = -0.052 - cavityOpen * 0.05;
  }

  /**
   * Cleanup all resources.
   */
  function dispose() {
    disposeObject3D(group);
  }

  return {
    group,
    applyVoiceFrame,
    dispose,
    // Expose individual elements for advanced customization
    elements: {
      upperLip,
      lowerLip,
      cavity,
      cavityShadow,
      tongue,
    },
    materials: {
      lipMaterial,
      cavityMaterial,
      shadowMaterial,
      tongueMaterial,
    },
  };
}
