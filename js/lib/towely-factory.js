import { clamp } from "./utils.js";

const BODY_WIDTH = 2.3;
const BODY_DEPTH = 0.34;
const BODY_TOP_Y = 2.42;
const BODY_BOTTOM_Y = -2.42;
const BODY_HEIGHT = BODY_TOP_Y - BODY_BOTTOM_Y;
const LEG_TOP_Y = -2.58;
const SHOE_RADIUS = 0.19;
const TOWELY_TEXTURE_URL = new URL("../../assets/towely-terry-texture.png", import.meta.url).href;

const TERRY_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;

  uniform float uTime;
  uniform float uFuzziness;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);

    float fuzzAmt = uFuzziness * 0.008;
    float noise = snoise(position * 30.0 + uTime * 0.1);
    float noise2 = snoise(position * 60.0 - uTime * 0.05);
    float displacement = (noise * 0.6 + noise2 * 0.4) * fuzzAmt;

    vec3 newPosition = position + normal * displacement;

    vec4 worldPos = modelMatrix * vec4(newPosition, 1.0);
    vWorldPos = worldPos.xyz;
    vViewDir = normalize(cameraPosition - worldPos.xyz);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

const TERRY_FRAGMENT_SHADER = `
  precision highp float;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;

  uniform vec3 uColor;
  uniform vec3 uStripeColor;
  uniform vec3 uGlowColor;
  uniform float uGlowIntensity;
  uniform float uTime;
  uniform float uFuzziness;
  uniform float uLoopScale;
  uniform float uStripeWidth;
  uniform float uStripeOffset;
  uniform float uSpecularStrength;
  uniform vec3 uLightPos;
  uniform sampler2D uTextureMap;
  uniform vec2 uTextureRepeat;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float hash(float n) {
    return fract(sin(n) * 43758.5453);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 6; i++) {
      v += a * vnoise(p);
      p = rot * p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  float terryLoops(vec2 uv, float scale) {
    vec2 p = uv * scale;
    vec2 cell = floor(p);
    vec2 f = fract(p);

    float minDist = 1.0;

    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 neighbor = vec2(float(x), float(y));
        vec2 point = vec2(
          hash(cell + neighbor),
          hash((cell + neighbor) * 1.37)
        );
        point = 0.5 + 0.4 * sin(point * 6.2831 + uTime * 0.15);
        vec2 diff = neighbor + point - f;
        float dist = length(diff);
        minDist = min(minDist, dist);
      }
    }

    float loop = smoothstep(0.0, 0.15, minDist) * (1.0 - smoothstep(0.15, 0.45, minDist));
    float center = 1.0 - smoothstep(0.0, 0.2, minDist);

    return loop * 0.6 + center * 0.4 + (1.0 - minDist) * 0.3;
  }

  float fiberNoise(vec2 uv, float scale) {
    vec2 p = uv * scale;
    float angle = hash(floor(p)) * 6.2831;
    vec2 dir = vec2(cos(angle), sin(angle));
    vec2 f = fract(p) - 0.5;
    float fiber = abs(dot(f, dir));
    return 1.0 - smoothstep(0.0, 0.3, fiber);
  }

  void main() {
    vec2 uv = vec2(vUv.x, fract(vUv.y + uStripeOffset));
    float loopSc = uLoopScale;

    float loops1 = terryLoops(uv, loopSc);
    float loops2 = terryLoops(uv + 0.33, loopSc * 1.5);
    float loops3 = terryLoops(uv * 1.1 + 0.67, loopSc * 0.7);
    float loopPattern = loops1 * 0.5 + loops2 * 0.3 + loops3 * 0.2;

    float fibers1 = fiberNoise(uv, loopSc * 2.0);
    float fibers2 = fiberNoise(uv + 0.5, loopSc * 3.0);
    float fiberPattern = fibers1 * 0.6 + fibers2 * 0.4;

    float fabricVar = fbm(uv * 4.0 + uTime * 0.02);
    float grain = vnoise(uv * loopSc * 8.0);
    float fineGrain = vnoise(uv * loopSc * 16.0);
    vec2 fabricUv = uv * uTextureRepeat;
    vec3 fabricSample = texture2D(uTextureMap, fabricUv).rgb;
    float fabricLuma = dot(fabricSample, vec3(0.299, 0.587, 0.114));
    float fabricMapDetail = smoothstep(0.18, 0.9, fabricLuma);

    float fuzz = uFuzziness / 100.0;
    float texture = loopPattern * 0.4
                  + fiberPattern * 0.2 * fuzz
                  + fabricVar * 0.15
                  + grain * 0.15 * fuzz
                  + fineGrain * 0.1 * fuzz;
    texture = mix(texture, fabricMapDetail, 0.68);

    float stripeW = uStripeWidth / 100.0;
    float stripePos1 = smoothstep(0.18 - stripeW * 0.06, 0.20 - stripeW * 0.04, uv.y)
                     * (1.0 - smoothstep(0.22 + stripeW * 0.04, 0.24 + stripeW * 0.06, uv.y));
    float stripePos2 = smoothstep(0.26 - stripeW * 0.04, 0.28 - stripeW * 0.02, uv.y)
                     * (1.0 - smoothstep(0.30 + stripeW * 0.02, 0.32 + stripeW * 0.04, uv.y));
    float stripePos3 = smoothstep(0.68 - stripeW * 0.06, 0.70 - stripeW * 0.04, uv.y)
                     * (1.0 - smoothstep(0.72 + stripeW * 0.04, 0.74 + stripeW * 0.06, uv.y));
    float stripePos4 = smoothstep(0.76 - stripeW * 0.04, 0.78 - stripeW * 0.02, uv.y)
                     * (1.0 - smoothstep(0.80 + stripeW * 0.02, 0.82 + stripeW * 0.04, uv.y));

    float stripe = max(max(stripePos1, stripePos2), max(stripePos3, stripePos4));
    float stripeTexture = terryLoops(uv + 0.15, loopSc * 0.9) * 0.3 + 0.7;
    stripe *= stripeTexture;

    vec3 baseColor = mix(fabricSample, fabricSample * uColor, 0.28);
    vec3 colorVar = baseColor * (0.85 + 0.3 * texture);
    colorVar *= (0.8 + 0.4 * loopPattern);
    vec3 stripeColor = uStripeColor * (0.85 + 0.15 * stripeTexture);
    vec3 color = mix(colorVar, stripeColor, stripe * 0.9);

    vec3 normal = normalize(vNormal);

    float bumpStrength = 0.3 * fuzz;
    float dx = terryLoops(uv + vec2(0.001, 0.0), loopSc) - terryLoops(uv - vec2(0.001, 0.0), loopSc);
    float dy = terryLoops(uv + vec2(0.0, 0.001), loopSc) - terryLoops(uv - vec2(0.0, 0.001), loopSc);
    normal = normalize(normal + vec3(dx, dy, 0.0) * bumpStrength * 50.0);

    vec3 lightDir = normalize(uLightPos - vWorldPos);
    vec3 viewDir = normalize(vViewDir);
    vec3 halfDir = normalize(lightDir + viewDir);

    float NdotL = dot(normal, lightDir);
    float diffuse = max(0.0, NdotL * 0.5 + 0.5);
    diffuse = pow(diffuse, 0.8);

    float spec = pow(max(dot(normal, halfDir), 0.0), 8.0) * uSpecularStrength;
    spec *= (1.0 - fuzz * 0.65);

    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
    vec3 rimColor = mix(color, vec3(1.0), 0.3) * fresnel * 0.22;

    float ao = 0.7 + 0.3 * loopPattern;
    vec3 ambient = color * 0.25 * ao;
    vec3 diff = color * diffuse * 0.75;
    vec3 specular = vec3(spec);

    vec3 final = ambient + diff + specular + rimColor;
    final += (fineGrain - 0.5) * 0.03 * fuzz;

    float stripeMask = smoothstep(0.24, 0.78, uv.y) * (1.0 - smoothstep(0.78, 0.92, uv.y));
    final += uGlowColor * uGlowIntensity * (0.12 + fresnel * 0.2 + stripe * 0.16 + stripeMask * 0.06);

    final = final / (final + vec3(1.0));
    final = pow(final, vec3(1.0 / 2.2));

    gl_FragColor = vec4(final, 1.0);
  }
`;

function smoothstepJS(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function createBodyGeometry(THREE) {
  const geometry = new THREE.PlaneGeometry(BODY_WIDTH, BODY_HEIGHT, 128, 192);
  const positions = geometry.attributes.position;
  const uv = geometry.attributes.uv;

  const curlStart = 0.75;
  const curlRadius = 0.62;

  for (let i = 0; i < positions.count; i += 1) {
    const uvX = uv.getX(i);
    const uvY = uv.getY(i);

    let x = positions.getX(i);
    let y = positions.getY(i);
    let z = positions.getZ(i);

    if (uvY > curlStart) {
      const t = (uvY - curlStart) / (1 - curlStart);
      const asymX = 1 + 0.6 * (1 - uvX);
      const angle = t * Math.PI * 0.55 * asymX;
      const curlStartY = BODY_BOTTOM_Y + curlStart * BODY_HEIGHT;
      const arcLen = y - curlStartY;
      const maxArc = BODY_HEIGHT * (1 - curlStart);
      const normalizedArc = maxArc > 0 ? arcLen / maxArc : 0;

      const newY = curlStartY + Math.cos(angle) * curlRadius * normalizedArc;
      const newZ = Math.sin(angle) * curlRadius * normalizedArc;
      const sideShift = t * t * (1 - uvX) * 0.15;

      const blend = smoothstepJS(curlStart, curlStart + 0.03, uvY);
      y = y * (1 - blend) + newY * blend;
      z = z * (1 - blend) + (newZ + 0.05) * blend;
      x -= sideShift * blend;
    }

    const bodyCurve = Math.sin(uvX * Math.PI) * 0.08;
    z += bodyCurve;

    if (uvY < 0.1) {
      const t = 1 - uvY / 0.1;
      z -= t * 0.05;
    }

    // Keep Towely's face on +Z while pushing the fabric curl to the back side.
    positions.setXYZ(i, x, y, -z);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function configureShadow(mesh, { cast = true, receive = true } = {}) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
}

function createArm(THREE, material) {
  const shoulder = new THREE.Group();

  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.62, 8, 14), material);
  upper.position.y = -0.36;
  configureShadow(upper, { cast: true, receive: false });
  shoulder.add(upper);

  const elbow = new THREE.Group();
  elbow.position.y = -0.73;
  shoulder.add(elbow);

  const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.086, 0.54, 8, 14), material);
  forearm.position.y = -0.31;
  configureShadow(forearm, { cast: true, receive: false });
  elbow.add(forearm);

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), material);
  hand.position.set(0, -0.67, 0);
  hand.scale.set(1, 1.05, 0.86);
  configureShadow(hand, { cast: true, receive: false });
  elbow.add(hand);

  return {
    shoulder,
    elbow,
  };
}

function seededNoise(x, y) {
  let value = Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

function createFabricMaps(THREE) {
  const size = 128;
  const roughnessData = new Uint8Array(size * size * 4);
  const normalData = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const warpBand = x % 8 < 2 ? 14 : 0;
      const weftBand = y % 8 < 2 ? 10 : 0;
      const roughNoise = (seededNoise(x, y) - 0.5) * 26;
      const roughValue = clamp(176 + warpBand + weftBand + roughNoise, 0, 255);

      roughnessData[index] = roughValue;
      roughnessData[index + 1] = roughValue;
      roughnessData[index + 2] = roughValue;
      roughnessData[index + 3] = 255;

      const nxDirection = x % 8 < 4 ? 1 : -1;
      const nyDirection = y % 8 < 4 ? -1 : 1;
      const normalNoise = (seededNoise(y, x) - 0.5) * 3;
      const nx = clamp(128 + nxDirection * (8 + normalNoise), 0, 255);
      const ny = clamp(128 + nyDirection * (6 + normalNoise), 0, 255);

      normalData[index] = nx;
      normalData[index + 1] = ny;
      normalData[index + 2] = 255;
      normalData[index + 3] = 255;
    }
  }

  const roughnessMap = new THREE.DataTexture(roughnessData, size, size, THREE.RGBAFormat);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(4.6, 11.8);
  roughnessMap.needsUpdate = true;

  const normalMap = new THREE.DataTexture(normalData, size, size, THREE.RGBAFormat);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.copy(roughnessMap.repeat);
  normalMap.needsUpdate = true;

  if (THREE.NoColorSpace) {
    roughnessMap.colorSpace = THREE.NoColorSpace;
    normalMap.colorSpace = THREE.NoColorSpace;
  }

  return {
    roughnessMap,
    normalMap,
  };
}

function createTowelyTextureMap(THREE) {
  const textureMap = new THREE.TextureLoader().load(TOWELY_TEXTURE_URL);
  textureMap.wrapS = THREE.RepeatWrapping;
  textureMap.wrapT = THREE.RepeatWrapping;
  textureMap.repeat.set(3.2, 7.2);
  textureMap.needsUpdate = true;

  if (THREE.SRGBColorSpace) {
    textureMap.colorSpace = THREE.SRGBColorSpace;
  } else if (THREE.sRGBEncoding !== undefined) {
    textureMap.encoding = THREE.sRGBEncoding;
  }

  return textureMap;
}

function createTerryMaterial(THREE, currentState, textureMap) {
  const roughness = clamp(currentState.roughness ?? 0.62, 0, 1);
  const metalness = clamp(currentState.metalness ?? 0.14, 0, 1);
  const clearcoat = clamp(currentState.clearcoat ?? 0.24, 0, 1);

  const uniforms = {
    uColor: { value: new THREE.Color(currentState.bodyColor || "#8b8fbe") },
    uStripeColor: { value: new THREE.Color(currentState.stripeColor || "#dcdcf2") },
    uGlowColor: { value: new THREE.Color(currentState.glowColor || "#4f5da1") },
    uGlowIntensity: { value: clamp((currentState.glowIntensity ?? 0.1) * 0.2, 0, 1) },
    uTime: { value: 0 },
    uFuzziness: { value: clamp(currentState.fuzziness ?? 35 + roughness * 65, 0, 100) },
    uLoopScale: { value: clamp(currentState.loopScale ?? 42 + (currentState.bodyDepth ?? 1) * 8, 10, 100) },
    uStripeWidth: { value: clamp(30 + clearcoat * 28, 0, 100) },
    uStripeOffset: {
      value: clamp((currentState.stripeOffset ?? 0) / BODY_HEIGHT, -0.35, 0.35),
    },
    uSpecularStrength: {
      value: clamp(0.09 + (1 - roughness) * 0.18 + clearcoat * 0.1 + metalness * 0.08, 0.03, 0.5),
    },
    uLightPos: { value: new THREE.Vector3(3.2, 5.8, 4.6) },
    uTextureMap: { value: textureMap },
    uTextureRepeat: { value: textureMap.repeat.clone() },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: TERRY_VERTEX_SHADER,
    fragmentShader: TERRY_FRAGMENT_SHADER,
    uniforms,
    side: THREE.DoubleSide,
  });

  material.toneMapped = false;
  return material;
}

function disposeObject3D(root) {
  const materialSet = new Set();

  root.traverse((node) => {
    if (!node.isMesh) return;

    if (node.geometry) {
      node.geometry.dispose();
    }

    if (Array.isArray(node.material)) {
      for (const material of node.material) {
        if (material) materialSet.add(material);
      }
      return;
    }

    if (node.material) {
      materialSet.add(node.material);
    }
  });

  for (const material of materialSet) {
    material.dispose();
  }
}

export function createTowelyAvatar(THREE, currentState = {}) {
  const group = new THREE.Group();
  group.name = "towely-avatar";

  const bodyRoot = new THREE.Group();
  bodyRoot.name = "towely-body-root";

  const bodyShell = new THREE.Group();
  bodyShell.name = "towely-body-shell";

  const faceRoot = new THREE.Group();
  faceRoot.name = "towely-face-root";

  const limbRoot = new THREE.Group();
  limbRoot.name = "towely-limbs";

  const legRoot = new THREE.Group();
  legRoot.name = "towely-legs";

  group.add(bodyRoot, limbRoot, legRoot);
  bodyRoot.add(bodyShell, faceRoot);

  const fabricMaps = createFabricMaps(THREE);
  const textureMap = createTowelyTextureMap(THREE);
  const generatedTextures = [fabricMaps.roughnessMap, fabricMaps.normalMap, textureMap];

  const materials = {
    cloth: createTerryMaterial(THREE, currentState, textureMap),
    stripe: new THREE.MeshStandardMaterial({
      color: currentState.stripeColor || "#d9dcf2",
      metalness: 0.01,
      roughness: 0.8,
      roughnessMap: fabricMaps.roughnessMap,
      normalMap: fabricMaps.normalMap,
      normalScale: new THREE.Vector2(0.13, 0.15),
      emissive: new THREE.Color(currentState.glowColor || "#2f3048"),
      emissiveIntensity: clamp((currentState.glowIntensity ?? 0.08) * 0.24, 0, 1),
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    skin: new THREE.MeshStandardMaterial({
      color: currentState.skinColor || "#e8d2b0",
      metalness: 0.02,
      roughness: 0.74,
    }),
    hair: new THREE.MeshStandardMaterial({
      color: currentState.hairColor || "#8e90be",
      metalness: 0.02,
      roughness: 0.62,
    }),
    eyeWhite: new THREE.MeshStandardMaterial({
      color: currentState.eyeColor || "#f5f7ff",
      metalness: 0,
      roughness: 0.46,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: currentState.darkColor || "#111318",
      metalness: 0.1,
      roughness: 0.5,
    }),
    tooth: new THREE.MeshStandardMaterial({
      color: "#f4f7ff",
      metalness: 0.02,
      roughness: 0.34,
    }),
    tongue: new THREE.MeshStandardMaterial({
      color: "#cc474f",
      metalness: 0,
      roughness: 0.62,
    }),
    shoe: new THREE.MeshStandardMaterial({
      color: currentState.shoeColor || "#111318",
      metalness: 0.22,
      roughness: 0.34,
      emissive: new THREE.Color(currentState.glowColor || "#2f3048"),
      emissiveIntensity: clamp((currentState.glowIntensity ?? 0.08) * 0.16, 0, 1),
    }),
  };

  const bodyMesh = new THREE.Mesh(createBodyGeometry(THREE), materials.cloth);
  configureShadow(bodyMesh);
  bodyShell.add(bodyMesh);

  const stripes = [];

  faceRoot.position.set(0, 0.2, BODY_DEPTH * 0.67);

  const leftEyeRoot = new THREE.Group();
  leftEyeRoot.position.set(-0.2, 0.06, 0.21);
  const leftEye = new THREE.Mesh(new THREE.CircleGeometry(0.13, 30), materials.eyeWhite);
  leftEye.scale.set(0.86, 1.24, 1);
  const leftPupil = new THREE.Mesh(new THREE.CircleGeometry(0.022, 18), materials.dark);
  leftPupil.position.set(0, 0, 0.002);
  configureShadow(leftEye, { cast: false, receive: false });
  configureShadow(leftPupil, { cast: false, receive: false });
  leftEyeRoot.add(leftEye, leftPupil);

  const rightEyeRoot = new THREE.Group();
  rightEyeRoot.position.set(0.2, 0.06, 0.21);
  const rightEye = new THREE.Mesh(new THREE.CircleGeometry(0.13, 30), materials.eyeWhite);
  rightEye.scale.set(0.86, 1.24, 1);
  const rightPupil = new THREE.Mesh(new THREE.CircleGeometry(0.022, 18), materials.dark);
  rightPupil.position.set(0, 0, 0.002);
  configureShadow(rightEye, { cast: false, receive: false });
  configureShadow(rightPupil, { cast: false, receive: false });
  rightEyeRoot.add(rightEye, rightPupil);

  const leftBrow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.028, 0.012), materials.dark);
  leftBrow.position.set(-0.3, 0.31, 0.2);
  configureShadow(leftBrow, { cast: false, receive: false });

  const rightBrow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.028, 0.012), materials.dark);
  rightBrow.position.set(0.3, 0.31, 0.2);
  configureShadow(rightBrow, { cast: false, receive: false });

  const mouthRoot = new THREE.Group();
  mouthRoot.position.set(0, -0.18, 0.2);
  const smile = new THREE.Mesh(
    new THREE.RingGeometry(0.046, 0.058, 24, 1, Math.PI * 0.06, Math.PI * 0.88),
    materials.dark,
  );
  smile.rotation.z = Math.PI;
  configureShadow(smile, { cast: false, receive: false });
  mouthRoot.add(smile);

  faceRoot.add(leftEyeRoot, rightEyeRoot, leftBrow, rightBrow, mouthRoot);

  const leftArm = createArm(THREE, materials.skin);
  const rightArm = createArm(THREE, materials.skin);
  limbRoot.add(leftArm.shoulder, rightArm.shoulder);

  const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.085, 1, 14), materials.skin);
  configureShadow(leftLeg, { cast: true, receive: false });

  const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.085, 1, 14), materials.skin);
  configureShadow(rightLeg, { cast: true, receive: false });

  const leftShoe = new THREE.Mesh(new THREE.SphereGeometry(SHOE_RADIUS, 18, 16), materials.shoe);
  leftShoe.scale.set(1.24, 0.9, 1.22);
  configureShadow(leftShoe, { cast: true, receive: true });

  const rightShoe = new THREE.Mesh(new THREE.SphereGeometry(SHOE_RADIUS, 18, 16), materials.shoe);
  rightShoe.scale.set(1.24, 0.9, 1.22);
  configureShadow(rightShoe, { cast: true, receive: true });

  legRoot.add(leftLeg, rightLeg, leftShoe, rightShoe);

  return {
    group,
    materials,
    bodyRoot,
    bodyShell,
    bodyMesh,
    faceRoot,
    stripes,
    leftEyeRoot,
    rightEyeRoot,
    leftEye,
    rightEye,
    leftSclera: leftEye,
    rightSclera: rightEye,
    leftPupil,
    rightPupil,
    leftBrow,
    rightBrow,
    mouthRoot,
    smile,
    mouthCavity: smile,
    mouthShell: smile,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    leftShoe,
    rightShoe,
    metrics: {
      bodyTopY: BODY_TOP_Y,
      bodyBottomY: BODY_BOTTOM_Y,
      bodyHeight: BODY_HEIGHT,
      legTopY: LEG_TOP_Y,
      shoeRadius: SHOE_RADIUS,
    },
    dispose() {
      disposeObject3D(group);
      for (const texture of generatedTextures) {
        texture.dispose();
      }
    },
  };
}
