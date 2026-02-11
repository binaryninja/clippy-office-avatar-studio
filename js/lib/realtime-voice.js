import { textToVisemeFrames, VISEME_SIL } from "./visemes.js";

const DEFAULT_MODEL = "gpt-realtime";
const DEFAULT_VOICE = "cedar";
const DEFAULT_VOICE_SPEED = 0.9;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRealtimeError(error, fallback = "unknown error") {
  const text = String(error?.message || error || fallback).trim();
  return text || fallback;
}

function averageRange(buffer, start, end) {
  if (!buffer || !buffer.length) return 0;
  const lo = Math.max(0, Math.min(buffer.length, Math.floor(start)));
  const hi = Math.max(lo + 1, Math.min(buffer.length, Math.floor(end)));
  let total = 0;
  let count = 0;

  for (let index = lo; index < hi; index += 1) {
    total += buffer[index];
    count += 1;
  }

  return count ? total / count : 0;
}

function normalizeChunkText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function createRealtimeVoice({
  buttonEl,
  model = DEFAULT_MODEL,
  voice = DEFAULT_VOICE,
  voiceSpeed = DEFAULT_VOICE_SPEED,
  onStatus = () => {},
  onAssistantSpeechLevel = () => {},
  onAssistantViseme = () => {},
  getSessionInstructions = () => "",
  getGreetingInstructions = () =>
    "In one short friendly sentence, introduce yourself and say you're ready to chat by voice.",
} = {}) {
  const state = {
    pc: null,
    dc: null,
    localStream: null,
    localTrack: null,
    remoteAudioEl: null,
    connecting: false,
    sessionReady: false,
    handledBeforeUnload: false,
    remoteAudioContext: null,
    remoteAnalyser: null,
    remoteAudioSource: null,
    remoteAudioBuffer: null,
    remoteFrequencyBuffer: null,
    speechLevel: 0,
    activityRafId: 0,
    lastAssistantAudioAtMs: 0,
    lastActivityTickAtMs: 0,
    visemeQueue: [],
    activeViseme: { viseme: VISEME_SIL, durationMs: 96 },
    activeVisemeElapsedMs: 0,
    lastTranscriptAtMs: 0,
    lastTranscriptChunk: "",
    lastVisemeSentKey: VISEME_SIL,
    lastVisemeSentStrength: 0,
  };

  function isConnected() {
    return Boolean(state.pc);
  }

  function updateButton() {
    if (!buttonEl) return;

    buttonEl.disabled = false;
    buttonEl.dataset.state = "disconnected";
    buttonEl.title = "Connect OpenAI realtime voice";

    if (state.connecting) {
      buttonEl.textContent = "Voice: Connecting...";
      buttonEl.disabled = true;
      buttonEl.dataset.state = "connecting";
      return;
    }

    if (!isConnected()) {
      buttonEl.textContent = "Voice: Connect";
      return;
    }

    if (!state.sessionReady) {
      buttonEl.textContent = "Voice: Syncing...";
      buttonEl.dataset.state = "syncing";
      return;
    }

    buttonEl.textContent = "Voice: Live";
    buttonEl.dataset.state = "live";
    buttonEl.title = "Disconnect OpenAI realtime voice";
  }

  function setSpeechLevel(nextLevel) {
    const clamped = clamp(nextLevel, 0, 1);
    if (Math.abs(clamped - state.speechLevel) < 0.001) return;
    state.speechLevel = clamped;
    onAssistantSpeechLevel(clamped);
  }

  function clearVisemeQueue() {
    state.visemeQueue.length = 0;
    state.activeViseme = { viseme: VISEME_SIL, durationMs: 96 };
    state.activeVisemeElapsedMs = 0;
  }

  function emitViseme(viseme, strength) {
    const key = String(viseme || VISEME_SIL);
    const amount = clamp(Number(strength) || 0, 0, 1);

    if (key === state.lastVisemeSentKey && Math.abs(amount - state.lastVisemeSentStrength) < 0.015) return;

    state.lastVisemeSentKey = key;
    state.lastVisemeSentStrength = amount;
    onAssistantViseme({
      viseme: key,
      strength: amount,
      speechLevel: state.speechLevel,
    });
  }

  function stopActivityLoop() {
    if (state.activityRafId) {
      cancelAnimationFrame(state.activityRafId);
      state.activityRafId = 0;
    }

    setSpeechLevel(0);
    clearVisemeQueue();
    emitViseme(VISEME_SIL, 0);
  }

  function stopRemoteAudioMeter() {
    if (state.remoteAudioSource) {
      try {
        state.remoteAudioSource.disconnect();
      } catch {
        // ignore disconnect race
      }
    }

    state.remoteAudioSource = null;
    state.remoteAnalyser = null;
    state.remoteAudioBuffer = null;
    state.remoteFrequencyBuffer = null;
  }

  function enqueueVisemeFrames(frames) {
    if (!Array.isArray(frames) || frames.length === 0) return;

    for (const frame of frames) {
      if (!frame || typeof frame.viseme !== "string") continue;
      const durationMs = Number(frame.durationMs);
      if (!Number.isFinite(durationMs)) continue;

      const normalized = {
        viseme: frame.viseme,
        durationMs: clamp(durationMs, 44, 280),
      };

      const last = state.visemeQueue[state.visemeQueue.length - 1];
      if (last && last.viseme === normalized.viseme) {
        last.durationMs = clamp(last.durationMs + normalized.durationMs * 0.78, 44, 300);
      } else {
        state.visemeQueue.push(normalized);
      }
    }

    if (state.visemeQueue.length > 180) {
      state.visemeQueue.splice(0, state.visemeQueue.length - 180);
    }
  }

  function inferFallbackViseme() {
    if (state.speechLevel < 0.05) return VISEME_SIL;
    if (!state.remoteAnalyser || !state.remoteFrequencyBuffer) return state.speechLevel > 0.32 ? "aa" : "tn";

    state.remoteAnalyser.getByteFrequencyData(state.remoteFrequencyBuffer);
    const bins = state.remoteFrequencyBuffer.length;

    const low = averageRange(state.remoteFrequencyBuffer, bins * 0.02, bins * 0.16);
    const mid = averageRange(state.remoteFrequencyBuffer, bins * 0.16, bins * 0.42);
    const high = averageRange(state.remoteFrequencyBuffer, bins * 0.42, bins * 0.72);

    if (high > mid * 1.2) return "ee";
    if (low > mid * 1.14) return "oh";
    if (low > high * 1.28) return "ou";
    if (mid > high * 1.2) return "aa";
    return "tn";
  }

  function chooseNextViseme(hasRecentAudio) {
    if (state.visemeQueue.length > 0) {
      return state.visemeQueue.shift();
    }

    if (!hasRecentAudio && state.speechLevel < 0.06) {
      return { viseme: VISEME_SIL, durationMs: 96 };
    }

    return {
      viseme: inferFallbackViseme(),
      durationMs: 94,
    };
  }

  function stepVisemeTimeline(dtMs) {
    const now = performance.now();
    const hasRecentAudio = now - state.lastAssistantAudioAtMs < 280;
    const speaking = hasRecentAudio || state.speechLevel > 0.045;

    if (!speaking && now - state.lastTranscriptAtMs > 860) {
      state.visemeQueue.length = 0;
    }

    if (speaking && state.activeViseme.viseme === VISEME_SIL && state.visemeQueue.length > 0) {
      state.activeViseme = state.visemeQueue.shift();
      state.activeVisemeElapsedMs = 0;
    }

    const pace = 0.62 + state.speechLevel * 1.35;
    state.activeVisemeElapsedMs += dtMs * pace;

    if (state.activeVisemeElapsedMs >= state.activeViseme.durationMs) {
      state.activeViseme = chooseNextViseme(hasRecentAudio);
      state.activeVisemeElapsedMs = 0;
    }

    if (!speaking && state.visemeQueue.length === 0) {
      state.activeViseme = { viseme: VISEME_SIL, durationMs: 96 };
      state.activeVisemeElapsedMs = 0;
    }

    const rawStrength = clamp(state.speechLevel * 1.28 + (hasRecentAudio ? 0.15 : 0), 0, 1);
    const visemeStrength = state.activeViseme.viseme === VISEME_SIL ? rawStrength * 0.22 : rawStrength;
    emitViseme(state.activeViseme.viseme, visemeStrength);
  }

  function startActivityLoop() {
    stopActivityLoop();
    state.lastActivityTickAtMs = performance.now();

    const tick = () => {
      if (!isConnected()) {
        setSpeechLevel(0);
        emitViseme(VISEME_SIL, 0);
        return;
      }

      const now = performance.now();
      const dtMs = clamp(now - state.lastActivityTickAtMs, 1, 120);
      state.lastActivityTickAtMs = now;

      let nextTarget = 0;
      if (state.remoteAnalyser && state.remoteAudioBuffer) {
        state.remoteAnalyser.getByteTimeDomainData(state.remoteAudioBuffer);
        let energy = 0;
        for (const sample of state.remoteAudioBuffer) {
          const centered = (sample - 128) / 128;
          energy += centered * centered;
        }

        const rms = Math.sqrt(energy / state.remoteAudioBuffer.length);
        nextTarget = clamp((rms - 0.014) * 18, 0, 1);
      }

      if (now - state.lastAssistantAudioAtMs < 230) {
        nextTarget = Math.max(nextTarget, 0.18);
      }

      const smoothing = nextTarget > state.speechLevel ? 0.36 : 0.24;
      const smoothed = state.speechLevel + (nextTarget - state.speechLevel) * smoothing;
      setSpeechLevel(smoothed < 0.008 ? 0 : smoothed);

      stepVisemeTimeline(dtMs);
      state.activityRafId = requestAnimationFrame(tick);
    };

    state.activityRafId = requestAnimationFrame(tick);
  }

  function attachRemoteAudioMeter(stream) {
    stopRemoteAudioMeter();

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    try {
      if (!state.remoteAudioContext) {
        state.remoteAudioContext = new AudioCtx();
      }

      if (state.remoteAudioContext.state !== "running") {
        state.remoteAudioContext.resume().catch(() => {});
      }

      const source = state.remoteAudioContext.createMediaStreamSource(stream);
      const analyser = state.remoteAudioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);

      state.remoteAudioSource = source;
      state.remoteAnalyser = analyser;
      state.remoteAudioBuffer = new Uint8Array(analyser.fftSize);
      state.remoteFrequencyBuffer = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      stopRemoteAudioMeter();
    }
  }

  function sendEvent(payload) {
    if (!payload || !state.dc || state.dc.readyState !== "open") return;

    try {
      state.dc.send(JSON.stringify(payload));
    } catch {
      // ignore data channel send races during disconnect
    }
  }

  function setMicEnabled(enabled) {
    if (!state.localTrack) return;

    const shouldEnable = Boolean(enabled && isConnected());
    if (state.localTrack.enabled === shouldEnable) return;
    state.localTrack.enabled = shouldEnable;
  }

  async function readFetchError(res) {
    let detail = "";
    try {
      detail = (await res.text()) || "";
    } catch {
      detail = "";
    }

    detail = detail.replace(/\s+/g, " ").trim();
    if (detail.length > 220) detail = `${detail.slice(0, 217)}...`;
    if (!detail) detail = res.statusText || "request failed";
    return `${res.status} ${detail}`;
  }

  function extractClientSecret(payload) {
    if (!payload || typeof payload !== "object") return "";
    if (typeof payload.value === "string") return payload.value.trim();
    if (typeof payload.client_secret === "string") return payload.client_secret.trim();
    if (typeof payload.secret === "string") return payload.secret.trim();
    if (payload.client_secret && typeof payload.client_secret.value === "string") return payload.client_secret.value.trim();
    if (payload.data && typeof payload.data.value === "string") return payload.data.value.trim();
    return "";
  }

  async function fetchLocalClientSecret() {
    try {
      const res = await fetch("/api/realtime/client_secret", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: {
            type: "realtime",
            model,
            audio: {
              output: { voice, speed: voiceSpeed },
            },
          },
        }),
      });
      if (!res.ok) return "";
      const data = await res.json().catch(() => null);
      return extractClientSecret(data);
    } catch {
      return "";
    }
  }

  async function createClientSecretFromApiKey(apiKey) {
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          audio: {
            output: { voice, speed: voiceSpeed },
          },
        },
      }),
    });

    if (!res.ok) throw new Error(`Failed to create client secret: ${await readFetchError(res)}`);

    const data = await res.json().catch(() => null);
    const secret = extractClientSecret(data);
    if (!secret) throw new Error("Realtime client secret missing from OpenAI response.");
    return secret;
  }

  async function getClientSecret() {
    const localSecret = await fetchLocalClientSecret();
    if (localSecret) return localSecret;

    const publicClientSecret =
      String(window.OPENAI_REALTIME_CLIENT_SECRET || "").trim()
      || String(import.meta.env.VITE_OPENAI_REALTIME_CLIENT_SECRET || "").trim();
    if (publicClientSecret) return publicClientSecret;

    let apiKey = String(window.OPENAI_API_KEY || "").trim() || String(import.meta.env.VITE_OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      apiKey = String(window.prompt("Enter OpenAI API key for realtime voice (used once, not saved):", "") || "").trim();
    }

    if (!apiKey) throw new Error("OpenAI API key is required.");
    return createClientSecretFromApiKey(apiKey);
  }

  function collectTranscriptChunks(evt, lowerType) {
    const isTranscriptEvent =
      lowerType.includes("transcript")
      || lowerType.includes("output_text")
      || lowerType.includes("conversation.item")
      || lowerType === "response.done";

    if (!isTranscriptEvent) {
      return [];
    }

    const chunks = [];

    const maybePush = (value, keyHint = "") => {
      if (typeof value !== "string") return;
      const key = String(keyHint || "").toLowerCase();
      if (key && !["text", "transcript", "delta", "content"].includes(key)) return;
      const normalized = normalizeChunkText(value);
      if (!/[a-z]/i.test(normalized)) return;
      chunks.push(normalized);
    };

    const walk = (value, keyHint = "") => {
      if (value == null) return;
      if (typeof value === "string") {
        maybePush(value, keyHint);
        return;
      }

      if (Array.isArray(value)) {
        for (const item of value) walk(item, keyHint);
        return;
      }

      if (typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) {
          walk(nested, key);
        }
      }
    };

    walk(evt);
    return chunks;
  }

  function handleRealtimeEvent(raw) {
    let evt = null;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }

    const type = String(evt?.type || "");
    const lowerType = type.toLowerCase();

    if (
      lowerType.includes("response.audio")
      || lowerType.includes("output_audio")
      || lowerType.includes("audio.delta")
    ) {
      state.lastAssistantAudioAtMs = performance.now();
    }

    if (type === "error") {
      const msg = normalizeRealtimeError(evt?.error?.message, "unknown realtime error");
      onStatus(`Voice error: ${msg}`, 4200);
      return;
    }

    const chunks = collectTranscriptChunks(evt, lowerType);
    if (!chunks.length) return;

    for (const chunk of chunks) {
      if (chunk === state.lastTranscriptChunk) continue;
      state.lastTranscriptChunk = chunk;

      const frames = textToVisemeFrames(chunk);
      if (!frames.length) continue;

      enqueueVisemeFrames(frames);
      state.lastTranscriptAtMs = performance.now();
    }
  }

  function configureSession() {
    const sessionInstructions = String(getSessionInstructions() || "").trim();
    sendEvent({
      type: "session.update",
      session: {
        type: "realtime",
        model,
        instructions:
          sessionInstructions
          || "You are a friendly office mascot. Keep responses short, clear, and conversational.",
        audio: {
          output: { voice, speed: voiceSpeed },
        },
      },
    });
  }

  function sendGreeting() {
    const instructions = String(getGreetingInstructions() || "").trim();
    if (!instructions) return;

    sendEvent({
      type: "response.create",
      response: {
        instructions,
      },
    });
  }

  function bindDataChannel(dc) {
    dc.addEventListener("open", () => {
      state.sessionReady = true;
      configureSession();
      sendGreeting();
      setMicEnabled(true);
      updateButton();
    });

    dc.addEventListener("close", () => {
      state.sessionReady = false;
      updateButton();
    });

    dc.addEventListener("message", (evt) => {
      handleRealtimeEvent(evt.data);
    });

    dc.addEventListener("error", () => {
      onStatus("Realtime voice data channel error.", 2600);
    });
  }

  async function openRealtimeSession(clientSecret) {
    const pc = new RTCPeerConnection();
    const remoteAudioEl = document.createElement("audio");
    remoteAudioEl.autoplay = true;
    remoteAudioEl.playsInline = true;
    remoteAudioEl.style.display = "none";
    document.body.append(remoteAudioEl);

    state.pc = pc;
    state.remoteAudioEl = remoteAudioEl;

    pc.ontrack = (evt) => {
      const stream = evt.streams && evt.streams[0];
      if (!stream) return;
      remoteAudioEl.srcObject = stream;
      remoteAudioEl.play().catch(() => {});
      attachRemoteAudioMeter(stream);
    };

    pc.onconnectionstatechange = () => {
      const status = pc.connectionState;
      if (status === "failed" || status === "closed") {
        disconnect({ silent: true });
        onStatus("Voice disconnected.", 2200);
        return;
      }

      if (status === "disconnected") {
        setTimeout(() => {
          if (state.pc === pc && pc.connectionState === "disconnected") {
            disconnect({ silent: true });
            onStatus("Voice connection dropped.", 2600);
          }
        }, 1200);
      }

      updateButton();
    };

    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    state.localStream = localStream;
    state.localTrack = localStream.getAudioTracks()[0] || null;
    if (state.localTrack) {
      pc.addTrack(state.localTrack, localStream);
    }

    const dc = pc.createDataChannel("oai-events");
    state.dc = dc;
    bindDataChannel(dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp",
      },
    });
    if (!sdpRes.ok) throw new Error(`Realtime call setup failed: ${await readFetchError(sdpRes)}`);

    const answerSdp = await sdpRes.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    state.sessionReady = false;
    setMicEnabled(true);
    clearVisemeQueue();
    startActivityLoop();
  }

  async function connect() {
    if (state.connecting || isConnected()) return;

    if (!window.RTCPeerConnection) {
      onStatus("Voice is not supported in this browser.", 3200);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      onStatus("Microphone access is not available in this browser.", 3600);
      return;
    }

    state.connecting = true;
    updateButton();

    try {
      const clientSecret = await getClientSecret();
      if (!clientSecret) throw new Error("No realtime client secret returned.");
      await openRealtimeSession(clientSecret);
      onStatus("Voice connected. Start talking.", 2400);
    } catch (error) {
      disconnect({ silent: true });
      onStatus(`Voice connect failed: ${normalizeRealtimeError(error)}`, 5200);
    } finally {
      state.connecting = false;
      updateButton();
    }
  }

  function disconnect({ silent = false } = {}) {
    state.sessionReady = false;

    if (state.dc) {
      try {
        state.dc.close();
      } catch {
        // ignore
      }
    }
    state.dc = null;

    if (state.pc) {
      try {
        state.pc.close();
      } catch {
        // ignore
      }
    }
    state.pc = null;

    if (state.localStream) {
      for (const track of state.localStream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
    }
    state.localStream = null;
    state.localTrack = null;

    if (state.remoteAudioEl) {
      try {
        state.remoteAudioEl.pause();
      } catch {
        // ignore
      }
      state.remoteAudioEl.srcObject = null;
      state.remoteAudioEl.remove();
    }
    state.remoteAudioEl = null;

    stopRemoteAudioMeter();
    stopActivityLoop();

    state.connecting = false;
    updateButton();
    if (!silent) {
      onStatus("Voice disconnected.", 1800);
    }
  }

  function syncSessionContext() {
    if (!state.sessionReady || !isConnected()) return;
    configureSession();
  }

  function init() {
    if (!buttonEl) return;

    buttonEl.addEventListener("click", () => {
      if (state.connecting) return;
      if (isConnected()) {
        disconnect();
      } else {
        void connect();
      }
    });

    if (!state.handledBeforeUnload) {
      state.handledBeforeUnload = true;
      window.addEventListener("beforeunload", () => {
        disconnect({ silent: true });
      });
    }

    updateButton();
  }

  return {
    init,
    connect,
    disconnect,
    isConnected,
    syncSessionContext,
  };
}
