export const VISEME_SIL = "sil";

const DIGRAPH_RULES = [
  { pattern: "tion", viseme: "ch", durationMs: 124 },
  { pattern: "sion", viseme: "ch", durationMs: 118 },
  { pattern: "dge", viseme: "ch", durationMs: 108 },
  { pattern: "ch", viseme: "ch", durationMs: 102 },
  { pattern: "sh", viseme: "ch", durationMs: 98 },
  { pattern: "th", viseme: "th", durationMs: 96 },
  { pattern: "ph", viseme: "fv", durationMs: 90 },
  { pattern: "oo", viseme: "ou", durationMs: 120 },
  { pattern: "ou", viseme: "ou", durationMs: 116 },
  { pattern: "ow", viseme: "oh", durationMs: 116 },
  { pattern: "oa", viseme: "oh", durationMs: 112 },
  { pattern: "aw", viseme: "oh", durationMs: 112 },
  { pattern: "au", viseme: "oh", durationMs: 112 },
  { pattern: "ee", viseme: "ee", durationMs: 106 },
  { pattern: "ea", viseme: "ee", durationMs: 104 },
  { pattern: "ie", viseme: "ee", durationMs: 102 },
  { pattern: "ei", viseme: "ee", durationMs: 102 },
  { pattern: "ai", viseme: "aa", durationMs: 104 },
  { pattern: "ay", viseme: "aa", durationMs: 104 },
];

const SINGLE_RULES = {
  a: { viseme: "aa", durationMs: 98 },
  e: { viseme: "aa", durationMs: 90 },
  i: { viseme: "ee", durationMs: 96 },
  o: { viseme: "oh", durationMs: 100 },
  u: { viseme: "ou", durationMs: 100 },
  y: { viseme: "ee", durationMs: 86 },
  w: { viseme: "ou", durationMs: 92 },
  r: { viseme: "ou", durationMs: 90 },
  m: { viseme: "mbp", durationMs: 84 },
  b: { viseme: "mbp", durationMs: 86 },
  p: { viseme: "mbp", durationMs: 88 },
  f: { viseme: "fv", durationMs: 82 },
  v: { viseme: "fv", durationMs: 82 },
  t: { viseme: "tn", durationMs: 78 },
  d: { viseme: "tn", durationMs: 76 },
  n: { viseme: "tn", durationMs: 80 },
  l: { viseme: "tn", durationMs: 78 },
  s: { viseme: "ss", durationMs: 74 },
  z: { viseme: "ss", durationMs: 76 },
  c: { viseme: "ss", durationMs: 74 },
  x: { viseme: "ss", durationMs: 74 },
  k: { viseme: "kk", durationMs: 80 },
  g: { viseme: "kk", durationMs: 80 },
  q: { viseme: "kk", durationMs: 82 },
  h: { viseme: "kk", durationMs: 76 },
  j: { viseme: "ch", durationMs: 90 },
};

function coalesce(frames) {
  const out = [];
  for (const frame of frames) {
    if (!frame || !frame.viseme || !Number.isFinite(frame.durationMs)) continue;
    const previous = out[out.length - 1];
    if (previous && previous.viseme === frame.viseme) {
      previous.durationMs = Math.min(260, previous.durationMs + frame.durationMs * 0.82);
      continue;
    }
    out.push({
      viseme: frame.viseme,
      durationMs: Math.max(48, Math.min(280, frame.durationMs)),
    });
  }
  return out;
}

function parseWord(word) {
  const result = [];
  let cursor = 0;
  const normalized = String(word || "")
    .toLowerCase()
    .replace(/[^a-z']/g, "");

  while (cursor < normalized.length) {
    let consumed = false;

    for (const rule of DIGRAPH_RULES) {
      if (!normalized.startsWith(rule.pattern, cursor)) continue;
      result.push({ viseme: rule.viseme, durationMs: rule.durationMs });
      cursor += rule.pattern.length;
      consumed = true;
      break;
    }

    if (consumed) continue;

    const char = normalized[cursor];
    if (char === "'") {
      cursor += 1;
      continue;
    }

    const single = SINGLE_RULES[char];
    if (single) {
      result.push({ viseme: single.viseme, durationMs: single.durationMs });
    }
    cursor += 1;
  }

  return coalesce(result);
}

export function textToVisemeFrames(text) {
  const source = String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!source) return [];

  const parts = source.match(/[a-z']+|[.,!?;:]/g) || [];
  const frames = [];

  for (const part of parts) {
    if (/^[.,!?;:]$/.test(part)) {
      frames.push({ viseme: VISEME_SIL, durationMs: part === "," || part === ";" ? 92 : 124 });
      continue;
    }

    const wordFrames = parseWord(part);
    frames.push(...wordFrames);
    frames.push({ viseme: VISEME_SIL, durationMs: 64 });
  }

  return coalesce(frames);
}
