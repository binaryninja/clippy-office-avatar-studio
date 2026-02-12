export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function constrainPupilToEyeSurface(
  eye,
  pupil,
  {
    eyeRadius = 0.22,
    pupilRadius = 0.11,
    edgeClamp = 0.8,
    centerProtrusion = 0.08,
    edgeInset = 0.12,
    edgeInsetPower = 1,
  } = {},
) {
  if (!eye || !pupil) return 0;

  const safeEyeRadius = Math.max(0.000001, Math.abs(Number(eyeRadius) || 0.22));
  const safePupilRadius = Math.max(0.000001, Math.abs(Number(pupilRadius) || 0.11));
  const safeEdgeClamp = clamp(Number.isFinite(edgeClamp) ? edgeClamp : 0.8, 0.05, 0.98);
  const safeCenterProtrusion = Math.max(0, Number.isFinite(centerProtrusion) ? centerProtrusion : 0.08);
  const safeEdgeInset = Math.max(0, Number.isFinite(edgeInset) ? edgeInset : 0.12);
  const safeEdgeInsetPower = clamp(Number.isFinite(edgeInsetPower) ? edgeInsetPower : 1, 0.5, 4);

  const eyeRadiusX = Math.max(0.000001, safeEyeRadius * Math.abs(eye.scale.x));
  const eyeRadiusY = Math.max(0.000001, safeEyeRadius * Math.abs(eye.scale.y));
  const eyeRadiusZ = Math.max(0.000001, safeEyeRadius * Math.abs(eye.scale.z));
  const pupilRadiusX = Math.max(0.000001, safePupilRadius * Math.abs(pupil.scale.x));
  const pupilRadiusY = Math.max(0.000001, safePupilRadius * Math.abs(pupil.scale.y));
  const pupilRadiusZ = Math.max(0.000001, safePupilRadius * Math.abs(pupil.scale.z));

  let offsetX = pupil.position.x - eye.position.x;
  let offsetY = pupil.position.y - eye.position.y;

  let normX = offsetX / eyeRadiusX;
  let normY = offsetY / eyeRadiusY;
  let radial = Math.hypot(normX, normY);
  const pupilNormRadius = Math.max(pupilRadiusX / eyeRadiusX, pupilRadiusY / eyeRadiusY);
  const silhouetteLimit = clamp(1 - pupilNormRadius - 0.02, 0.05, 0.98);
  const effectiveEdgeClamp = Math.min(safeEdgeClamp, silhouetteLimit);

  if (radial > effectiveEdgeClamp) {
    const squeeze = effectiveEdgeClamp / radial;
    normX *= squeeze;
    normY *= squeeze;
    offsetX = normX * eyeRadiusX;
    offsetY = normY * eyeRadiusY;
    pupil.position.x = eye.position.x + offsetX;
    pupil.position.y = eye.position.y + offsetY;
    radial = effectiveEdgeClamp;
  }

  const depthTerm = Math.max(0, 1 - normX * normX - normY * normY);
  const eyeSurfaceZ = eyeRadiusZ * Math.sqrt(depthTerm);

  const radialFactor = clamp(radial / effectiveEdgeClamp, 0, 1);
  const insetFactor = Math.pow(radialFactor, safeEdgeInsetPower);
  const surfaceOffset = pupilRadiusZ * (safeCenterProtrusion * (1 - radialFactor) - safeEdgeInset * insetFactor);

  pupil.position.z = eye.position.z + eyeSurfaceZ - pupilRadiusZ + surfaceOffset;
  return radialFactor;
}

export function randomColor() {
  const n = Math.floor(Math.random() * 0xffffff);
  return `#${n.toString(16).padStart(6, "0")}`;
}

export function randomBetween(min, max, precision = 2) {
  return Number((min + Math.random() * (max - min)).toFixed(precision));
}

export function safeDisposeGeometry(geometry) {
  if (geometry && typeof geometry.dispose === "function") {
    geometry.dispose();
  }
}

export function safeDisposeMaterial(material) {
  if (!material) return;
  const materials = Array.isArray(material) ? material : [material];
  for (const entry of materials) {
    if (entry && typeof entry.dispose === "function") {
      entry.dispose();
    }
  }
}

export function safeDisposeObject3D(root) {
  if (!root || typeof root.traverse !== "function") return;
  root.traverse((node) => {
    safeDisposeGeometry(node.geometry);
    safeDisposeMaterial(node.material);
  });
}
