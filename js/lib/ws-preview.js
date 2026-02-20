/**
 * WS Bridge Preview panel — provides a live WebSocket connection to the
 * Claude Agent SDK bridge, plus a manual button grid for testing.
 */

import { WS_EVENT_GROUPS, DEMO_SEQUENCE } from "./ws-event-mapper.js";

const DEFAULT_WS_URL = "ws://localhost:8765/ws";
const MAX_LOG_LINES = 60;
const SAMPLE_THINKING_TOKENS = [
  "Reviewing request...",
  " checking controller contract...",
  " verifying render loop integration...",
  " drafting patch.",
];
const SAMPLE_TEXT_TOKENS = [
  "Done.",
  " Changes are ready.",
];

/**
 * @param {{ containerEl: HTMLElement, onEvent: (event: object) => void }} options
 * @returns {{ destroy: () => void }}
 */
export function createWsPreview({ containerEl, onEvent }) {
  let demoRunId = 0;
  let demoRunning = false;
  let ws = null;
  let reconnectTimer = null;
  let manualTokenCursor = 0;

  // Root section
  const section = document.createElement("section");
  section.className = "control-group ws-preview";

  // Collapsible header
  const header = document.createElement("div");
  header.className = "ws-preview-header";

  const title = document.createElement("h3");
  title.className = "group-title ws-preview-title";
  title.textContent = "WS Bridge";

  const toggle = document.createElement("button");
  toggle.className = "ws-preview-toggle";
  toggle.textContent = "\u25BC";
  toggle.type = "button";

  header.append(title, toggle);
  section.append(header);

  // Body (collapsible)
  const body = document.createElement("div");
  body.className = "ws-preview-body";

  let collapsed = false;
  toggle.addEventListener("click", () => {
    collapsed = !collapsed;
    body.style.display = collapsed ? "none" : "";
    toggle.textContent = collapsed ? "\u25B6" : "\u25BC";
  });

  // ── Connection controls ──
  const connGroup = document.createElement("div");
  connGroup.className = "ws-preview-conn";

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.className = "ws-preview-url";
  urlInput.value = DEFAULT_WS_URL;
  urlInput.placeholder = "ws://host:port/ws";

  const connBtn = document.createElement("button");
  connBtn.className = "ws-preview-conn-btn";
  connBtn.type = "button";
  connBtn.textContent = "Connect";

  connGroup.append(urlInput, connBtn);
  body.append(connGroup);

  // Status line
  const statusLine = document.createElement("div");
  statusLine.className = "ws-preview-status";
  statusLine.textContent = "Disconnected";
  body.append(statusLine);

  // Event log
  const logEl = document.createElement("div");
  logEl.className = "ws-preview-log";
  body.append(logEl);

  function appendLog(text, className) {
    const line = document.createElement("div");
    line.className = "ws-log-line" + (className ? ` ${className}` : "");
    line.textContent = text;
    logEl.append(line);
    // Trim old lines
    while (logEl.children.length > MAX_LOG_LINES) {
      logEl.removeChild(logEl.firstChild);
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setConnState(state) {
    if (state === "connected") {
      connBtn.textContent = "Disconnect";
      connBtn.classList.add("ws-connected");
      statusLine.textContent = "Connected";
      statusLine.classList.add("ws-status-live");
      urlInput.disabled = true;
    } else if (state === "connecting") {
      connBtn.textContent = "Connecting\u2026";
      connBtn.disabled = true;
      statusLine.textContent = "Connecting\u2026";
      statusLine.classList.remove("ws-status-live");
    } else {
      connBtn.textContent = "Connect";
      connBtn.classList.remove("ws-connected");
      connBtn.disabled = false;
      statusLine.textContent = "Disconnected";
      statusLine.classList.remove("ws-status-live");
      urlInput.disabled = false;
    }
  }

  function formatEvent(event) {
    let label = event.type;
    if (event.tool_category) label += `:${event.tool_category}`;
    else if (event.tool_name) label += ` (${event.tool_name})`;
    if (event.token) label += ` "${event.token.slice(0, 30)}"`;
    return label;
  }

  // ── WebSocket connection ──
  function connect() {
    if (ws) disconnect();

    const url = urlInput.value.trim();
    if (!url) return;

    setConnState("connecting");
    appendLog(`Connecting to ${url}\u2026`, "ws-log-sys");

    try {
      ws = new WebSocket(url);
    } catch (err) {
      appendLog(`Connection failed: ${err.message}`, "ws-log-err");
      setConnState("disconnected");
      return;
    }

    ws.addEventListener("open", () => {
      setConnState("connected");
      appendLog("Connected", "ws-log-sys");
    });

    ws.addEventListener("message", (msgEvent) => {
      let event;
      try {
        event = JSON.parse(msgEvent.data);
      } catch {
        appendLog(`Non-JSON: ${String(msgEvent.data).slice(0, 80)}`, "ws-log-err");
        return;
      }

      if (!event || !event.type) return;

      const label = formatEvent(event);
      appendLog(`\u25B8 ${label}`, "ws-log-event");
      statusLine.textContent = label;

      onEvent(event);
    });

    ws.addEventListener("error", () => {
      appendLog("WebSocket error", "ws-log-err");
    });

    ws.addEventListener("close", (e) => {
      const reason = e.reason ? `: ${e.reason}` : "";
      appendLog(`Disconnected (${e.code}${reason})`, "ws-log-sys");
      ws = null;
      setConnState("disconnected");
    });
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    setConnState("disconnected");
  }

  connBtn.addEventListener("click", () => {
    if (ws) {
      disconnect();
    } else {
      connect();
    }
  });

  // Allow Enter key in URL input to connect
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!ws) connect();
    }
  });

  // ── Manual event buttons ──
  const manualHeader = document.createElement("div");
  manualHeader.className = "ws-preview-section-label";
  manualHeader.textContent = "Manual Triggers";
  body.append(manualHeader);

  for (const group of WS_EVENT_GROUPS) {
    const groupEl = document.createElement("div");
    groupEl.className = "ws-preview-group";

    const groupLabel = document.createElement("span");
    groupLabel.className = "ws-preview-group-label";
    groupLabel.textContent = group.label;
    groupEl.append(groupLabel);

    const btnRow = document.createElement("div");
    btnRow.className = "ws-preview-btn-row";

    for (const evt of group.events) {
      const btn = document.createElement("button");
      btn.className = "ws-preview-btn";
      btn.type = "button";
      btn.textContent = evt.label;
      btn.title = evt.type + (evt.category ? `:${evt.category}` : "");

      btn.addEventListener("click", () => {
        const fakeEvent = { type: evt.type };
        if (evt.category) fakeEvent.category = evt.category;
        if (evt.type === "agent.thinking_token") {
          fakeEvent.token = SAMPLE_THINKING_TOKENS[manualTokenCursor % SAMPLE_THINKING_TOKENS.length];
          manualTokenCursor += 1;
        } else if (evt.type === "agent.text_token") {
          fakeEvent.token = SAMPLE_TEXT_TOKENS[manualTokenCursor % SAMPLE_TEXT_TOKENS.length];
          manualTokenCursor += 1;
        }
        const label = btn.title;
        appendLog(`\u25B9 ${label} (manual)`, "ws-log-manual");
        statusLine.textContent = label;
        onEvent(fakeEvent);
      });

      btnRow.append(btn);
    }

    groupEl.append(btnRow);
    body.append(groupEl);
  }

  // Demo sequence button
  const demoBtn = document.createElement("button");
  demoBtn.className = "ws-preview-demo-btn";
  demoBtn.type = "button";
  demoBtn.textContent = "\u25B6 Play Demo Sequence";

  demoBtn.addEventListener("click", () => {
    if (demoRunning) {
      demoRunId++;
      demoRunning = false;
      demoBtn.textContent = "\u25B6 Play Demo Sequence";
      statusLine.textContent = "Demo stopped";
      return;
    }
    runDemo();
  });

  body.append(demoBtn);
  section.append(body);
  containerEl.append(section);

  async function runDemo() {
    const runId = ++demoRunId;
    demoRunning = true;
    demoBtn.textContent = "\u25A0 Stop Demo";

    for (const step of DEMO_SEQUENCE) {
      if (runId !== demoRunId) return;

      const label = step.event.type + (step.event.category ? `:${step.event.category}` : "");
      appendLog(`\u25B9 ${label} (demo)`, "ws-log-manual");
      statusLine.textContent = label;
      onEvent(step.event);

      if (step.delayMs > 0) {
        await new Promise((r) => setTimeout(r, step.delayMs));
      }
      if (runId !== demoRunId) return;
    }

    demoRunning = false;
    demoBtn.textContent = "\u25B6 Play Demo Sequence";
    statusLine.textContent = "Demo complete";
  }

  function destroy() {
    demoRunId++;
    demoRunning = false;
    disconnect();
    section.remove();
  }

  return { destroy };
}
