import { Conversation } from "@elevenlabs/client";
import { textToVisemeFrames, VISEME_SIL } from "./visemes.js";

const DEFAULT_AGENT_ID = "agent_6201kh80gehme6wacehwktq31hsk";
const DEFAULT_CONNECTION_TYPE = "webrtc";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeError(error, fallback = "unknown error") {
  const text = String(error?.message || error || fallback).trim();
  return text || fallback;
}

function formatDisconnectDetails(details) {
  if (!details || typeof details !== "object") return "";

  const reason = String(details.reason || "").trim();
  const closeCode = Number(details.closeCode);
  const closeReason = String(details.closeReason || "").trim();
  const message = String(details.message || "").trim();

  const parts = [];
  if (reason) parts.push(`reason=${reason}`);
  if (Number.isFinite(closeCode)) parts.push(`code=${closeCode}`);
  if (closeReason) parts.push(`close=${closeReason}`);
  if (message) parts.push(`message=${message}`);

  return parts.join(", ");
}

function formatErrorContext(context) {
  if (!context || typeof context !== "object") return "";

  const errorType = String(context.errorType || "").trim();
  const code = Number(context.code);
  const debugMessage = String(context.debugMessage || "").trim();

  const parts = [];
  if (errorType) parts.push(`type=${errorType}`);
  if (Number.isFinite(code)) parts.push(`code=${code}`);
  if (debugMessage) parts.push(`debug=${debugMessage}`);

  return parts.join(", ");
}

function isTokenAuthorizationError(error) {
  const message = normalizeError(error).toLowerCase();
  return (
    message.includes("invalid authorization token")
    || (message.includes("authorization") && message.includes("token"))
    || (message.includes("token") && message.includes("invalid"))
    || (message.includes("token") && message.includes("expired"))
  );
}

function isVoiceOverrideError(error, context = null) {
  const message = normalizeError(error).toLowerCase();
  const contextText = formatErrorContext(context).toLowerCase();
  return (
    message.includes("voice")
    || message.includes("override")
    || contextText.includes("voice")
    || contextText.includes("override")
  );
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

function buildTranscriptChunk(value) {
  const chunk = normalizeChunkText(value);
  if (!/[a-z]/i.test(chunk)) return "";
  return chunk;
}

function extractConversationToken(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.token === "string") return payload.token.trim();
  if (typeof payload.value === "string") return payload.value.trim();
  if (payload.data && typeof payload.data.token === "string") return payload.data.token.trim();
  if (payload.data && typeof payload.data.value === "string") return payload.data.value.trim();
  return "";
}

export function createElevenLabsVoice({
  buttonEl,
  agentId = DEFAULT_AGENT_ID,
  voiceId = "",
  connectionType = DEFAULT_CONNECTION_TYPE,
  onStatus = () => {},
  onAssistantSpeechLevel = () => {},
  onAssistantViseme = () => {},
  onConnectionStateChange = () => {},
  getSessionInstructions = () => "",
} = {}) {
  const state = {
    conversation: null,
    connecting: false,
    connectedNotified: false,
    handledBeforeUnload: false,
    speechLevel: 0,
    mode: "listening",
    activityRafId: 0,
    lastActivityTickAtMs: 0,
    lastAssistantAudioAtMs: 0,
    visemeQueue: [],
    activeViseme: { viseme: VISEME_SIL, durationMs: 96 },
    activeVisemeElapsedMs: 0,
    lastTranscriptAtMs: 0,
    lastTranscriptChunk: "",
    lastVisemeSentKey: VISEME_SIL,
    lastVisemeSentStrength: 0,
    lastContextSyncText: "",
  };

  function isConnected() {
    if (!state.conversation) return false;
    try {
      if (typeof state.conversation.isOpen === "function") {
        return Boolean(state.conversation.isOpen());
      }
    } catch {
      return true;
    }
    return true;
  }

  function notifyConnectionState(connected) {
    if (state.connectedNotified === connected) return;
    state.connectedNotified = connected;
    onConnectionStateChange({ connected });
  }

  function updateButton() {
    if (!buttonEl) return;

    buttonEl.disabled = false;
    buttonEl.dataset.state = "disconnected";
    buttonEl.title = "Connect ElevenLabs voice";

    if (state.connecting) {
      buttonEl.textContent = "EL Voice: Connecting...";
      buttonEl.disabled = true;
      buttonEl.dataset.state = "connecting";
      return;
    }

    if (!isConnected()) {
      buttonEl.textContent = "EL Voice: Connect";
      return;
    }

    buttonEl.textContent = "EL Voice: Live";
    buttonEl.dataset.state = "live";
    buttonEl.title = "Disconnect ElevenLabs voice";
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

  function getOutputFrequencyBuffer() {
    if (!state.conversation || typeof state.conversation.getOutputByteFrequencyData !== "function") return null;
    try {
      const data = state.conversation.getOutputByteFrequencyData();
      if (!data || !data.length) return null;
      return data;
    } catch {
      return null;
    }
  }

  function inferFallbackViseme() {
    if (state.speechLevel < 0.05) return VISEME_SIL;

    const frequencyBuffer = getOutputFrequencyBuffer();
    if (!frequencyBuffer) {
      return state.speechLevel > 0.32 ? "aa" : "tn";
    }

    const bins = frequencyBuffer.length;
    const low = averageRange(frequencyBuffer, bins * 0.02, bins * 0.16);
    const mid = averageRange(frequencyBuffer, bins * 0.16, bins * 0.42);
    const high = averageRange(frequencyBuffer, bins * 0.42, bins * 0.72);

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

    const rawStrength = clamp(state.speechLevel * 1.24 + (hasRecentAudio ? 0.18 : 0), 0, 1);
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
      if (state.conversation && typeof state.conversation.getOutputVolume === "function") {
        try {
          const outputVolume = Number(state.conversation.getOutputVolume());
          if (Number.isFinite(outputVolume)) {
            nextTarget = clamp((outputVolume - 0.008) * 1.48, 0, 1);
          }
        } catch {
          nextTarget = 0;
        }
      }

      if (state.mode === "speaking") {
        state.lastAssistantAudioAtMs = now;
        nextTarget = Math.max(nextTarget, 0.17);
      }

      const smoothing = nextTarget > state.speechLevel ? 0.38 : 0.24;
      const smoothed = state.speechLevel + (nextTarget - state.speechLevel) * smoothing;
      setSpeechLevel(smoothed < 0.008 ? 0 : smoothed);

      stepVisemeTimeline(dtMs);
      state.activityRafId = requestAnimationFrame(tick);
    };

    state.activityRafId = requestAnimationFrame(tick);
  }

  function handleTranscriptChunk(value) {
    const chunk = buildTranscriptChunk(value);
    if (!chunk || chunk === state.lastTranscriptChunk) return;

    state.lastTranscriptChunk = chunk;
    const frames = textToVisemeFrames(chunk);
    if (!frames.length) return;
    enqueueVisemeFrames(frames);
    state.lastTranscriptAtMs = performance.now();
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

  async function fetchTokenFromLocalEndpoint(url, init = {}) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) return "";

      const contentType = String(res.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("application/json")) {
        const data = await res.json().catch(() => null);
        return extractConversationToken(data);
      }

      return String(await res.text()).trim();
    } catch {
      return "";
    }
  }

  async function fetchLocalConversationToken() {
    const body = JSON.stringify({
      agent_id: agentId,
      agentId,
      connection_type: connectionType,
      connectionType,
    });

    const candidates = [
      () =>
        fetchTokenFromLocalEndpoint("/api/elevenlabs/conversation_token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        }),
      () => fetchTokenFromLocalEndpoint(`/api/elevenlabs/conversation/token?agent_id=${encodeURIComponent(agentId)}`),
      () =>
        fetchTokenFromLocalEndpoint("/api/elevenlabs/conversation/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        }),
    ];

    for (const run of candidates) {
      const token = String(await run() || "").trim();
      if (token) return token;
    }

    return "";
  }

  async function createConversationTokenFromApiKey(apiKey) {
    const encodedAgentId = encodeURIComponent(agentId);
    const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodedAgentId}`, {
      headers: {
        "xi-api-key": apiKey,
      },
    });

    if (!res.ok) throw new Error(`Failed to create ElevenLabs conversation token: ${await readFetchError(res)}`);

    const data = await res.json().catch(() => null);
    const token = extractConversationToken(data);
    if (!token) throw new Error("ElevenLabs conversation token missing from response.");
    return token;
  }

  async function getConversationToken() {
    const localToken = await fetchLocalConversationToken();
    if (localToken) return localToken;

    const publicToken =
      String(window.ELEVENLABS_CONVERSATION_TOKEN || "").trim()
      || String(import.meta.env.VITE_ELEVENLABS_CONVERSATION_TOKEN || "").trim();
    if (publicToken) return publicToken;

    let apiKey = String(window.ELEVENLABS_API_KEY || "").trim() || String(import.meta.env.VITE_ELEVENLABS_API_KEY || "").trim();
    if (!apiKey) {
      apiKey = String(window.prompt("Enter ElevenLabs API key for a conversation token (used once, not saved):", "") || "").trim();
    }

    apiKey = String(apiKey || "").trim();
    if (!apiKey) return "";
    return createConversationTokenFromApiKey(apiKey);
  }

  function syncSessionContext() {
    if (!isConnected() || !state.conversation || typeof state.conversation.sendContextualUpdate !== "function") return;

    const context = String(getSessionInstructions() || "").trim();
    if (!context || context === state.lastContextSyncText) return;

    state.lastContextSyncText = context;
    try {
      state.conversation.sendContextualUpdate(context);
    } catch {
      // ignore contextual update races
    }
  }

  function teardownSession({ silent = false, statusMessage = "" } = {}) {
    state.mode = "listening";
    state.conversation = null;
    stopActivityLoop();
    state.connecting = false;
    notifyConnectionState(false);
    updateButton();

    if (!silent && statusMessage) {
      onStatus(statusMessage, 2200);
    }
  }

  async function connect() {
    if (state.connecting || isConnected()) return;

    const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!window.isSecureContext && !isLocalhost) {
      onStatus("ElevenLabs voice requires HTTPS or localhost for microphone access.", 5200);
      return;
    }

    if (!window.MediaStream) {
      onStatus("ElevenLabs voice is not supported in this browser.", 3200);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      onStatus("Microphone API unavailable. Use HTTPS or localhost.", 5200);
      return;
    }

    state.connecting = true;
    updateButton();

    try {
      const token = await getConversationToken();
      const normalizedVoiceId = String(voiceId || "").trim();
      let lastServerError = { message: "", context: null };
      const baseOptions = {
        connectionType,
        onConnect: () => {
          notifyConnectionState(true);
          updateButton();
        },
        onDisconnect: (details) => {
          if (!state.conversation) return;
          const detailText = formatDisconnectDetails(details);
          teardownSession({
            silent: false,
            statusMessage: detailText ? `ElevenLabs disconnected (${detailText}).` : "ElevenLabs voice disconnected.",
          });
        },
        onError: (message, context) => {
          lastServerError = {
            message: normalizeError(message),
            context,
          };
          const detailText = formatErrorContext(context);
          onStatus(
            detailText
              ? `ElevenLabs voice error: ${lastServerError.message} (${detailText})`
              : `ElevenLabs voice error: ${lastServerError.message}`,
            5600,
          );
        },
        onAudio: () => {
          state.lastAssistantAudioAtMs = performance.now();
        },
        onModeChange: ({ mode } = {}) => {
          state.mode = mode === "speaking" ? "speaking" : "listening";
        },
        onMessage: ({ message, role } = {}) => {
          if (role !== "agent") return;
          handleTranscriptChunk(message);
        },
        onAgentChatResponsePart: ({ text, type } = {}) => {
          if (!text || type === "stop") return;
          handleTranscriptChunk(text);
        },
      };

      const withVoiceOverride = normalizedVoiceId
        ? {
          ...baseOptions,
          overrides: {
            ...(baseOptions.overrides || {}),
            tts: {
              ...((baseOptions.overrides && baseOptions.overrides.tts) || {}),
              voiceId: normalizedVoiceId,
            },
          },
        }
        : baseOptions;
      const withoutVoiceOverride = baseOptions;

      let usedAgentFallback = false;
      let usedVoiceFallback = false;
      if (token) {
        try {
          state.conversation = await Conversation.startSession({
            ...withVoiceOverride,
            conversationToken: token,
          });
        } catch (tokenError) {
          if (!isTokenAuthorizationError(tokenError)) throw tokenError;

          usedAgentFallback = true;
          try {
            state.conversation = await Conversation.startSession({
              ...withVoiceOverride,
              agentId,
            });
          } catch (agentError) {
            if (!(normalizedVoiceId && isVoiceOverrideError(agentError, lastServerError.context))) throw agentError;
            usedVoiceFallback = true;
            state.conversation = await Conversation.startSession({
              ...withoutVoiceOverride,
              agentId,
            });
          }
        }
      } else {
        try {
          state.conversation = await Conversation.startSession({
            ...withVoiceOverride,
            agentId,
          });
        } catch (agentError) {
          if (!(normalizedVoiceId && isVoiceOverrideError(agentError, lastServerError.context))) throw agentError;
          usedVoiceFallback = true;
          state.conversation = await Conversation.startSession({
            ...withoutVoiceOverride,
            agentId,
          });
        }
      }

      state.lastContextSyncText = "";
      clearVisemeQueue();
      syncSessionContext();
      startActivityLoop();

      if (usedAgentFallback) {
        if (usedVoiceFallback) {
          onStatus("ElevenLabs connected via agentId; token was invalid and voice override was rejected.", 5600);
        } else {
          onStatus("ElevenLabs connected via agentId (token was invalid/stale).", 3600);
        }
      } else if (usedVoiceFallback) {
        onStatus("ElevenLabs connected using agent default voice (override was rejected).", 5200);
      } else {
        onStatus("ElevenLabs voice connected. Start talking.", 2400);
      }
    } catch (error) {
      teardownSession({ silent: true });
      if (isTokenAuthorizationError(error)) {
        onStatus("ElevenLabs token rejected. Use a fresh token or remove static token env vars.", 6200);
      } else {
        onStatus(`ElevenLabs connect failed: ${normalizeError(error)}`, 5200);
      }
    } finally {
      state.connecting = false;
      updateButton();
    }
  }

  function disconnect({ silent = false } = {}) {
    const conversation = state.conversation;
    if (!conversation && !state.connecting) return;

    teardownSession({
      silent,
      statusMessage: "ElevenLabs voice disconnected.",
    });

    if (conversation) {
      conversation.endSession().catch(() => {});
    }
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
