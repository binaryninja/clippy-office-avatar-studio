/**
 * Maps WebSocket bridge events from the Claude Agent SDK
 * to avatar animation modes and expressions.
 */

const TOOL_CATEGORY_MAP = {
  terminal: "typing",
  bash: "typing",
  file: "file",
  read: "reading",
  write: "typing",
  edit: "typing",
  search: "searching",
  grep: "searching",
  glob: "searching",
  web: "searching",
  webfetch: "searching",
  websearch: "searching",
  subagent: "thinking",
  task: "thinking",
  mcp: "typing",
};

function classifyTool(toolName) {
  if (!toolName) return "typing";
  const lower = String(toolName).toLowerCase();

  for (const [key, mode] of Object.entries(TOOL_CATEGORY_MAP)) {
    if (lower.includes(key)) return mode;
  }

  return "typing";
}

/**
 * Map a WS bridge event to an avatar animation descriptor.
 *
 * Accepts both real WS bridge events (with tool_category, tool_name)
 * and synthetic preview events (with category, tool).
 *
 * @param {object} event - WS bridge event with at minimum a `type` field
 * @returns {{ mode: string, fallbackMode?: string, sustainedMode?: string, sustainedFallbackMode?: string, expression?: string, transient?: boolean, durationMs?: number } | null}
 */
export function mapWsEventToAnimation(event) {
  if (!event || !event.type) return null;

  switch (event.type) {
    case "session.ready":
      return { mode: "wave" };

    case "session.error":
      return { mode: "error", transient: true, durationMs: 1500 };

    case "agent.thinking_start":
      return { mode: "thinking" };

    case "agent.thinking_token":
    case "agent.thinking_done":
      return null; // no change — next event transitions

    case "agent.text_token":
      return { mode: "listening" };

    case "agent.text_done":
      return { mode: "idle" };

    case "agent.tool_use_start": {
      // Real bridge sends tool_category + tool_name; preview sends category + tool
      const category = event.tool_category || event.category || classifyTool(event.tool_name || event.tool);
      if (category === "file") {
        return { mode: "file", fallbackMode: "reading" };
      }
      return { mode: category };
    }

    case "agent.tool_use_end":
      return { mode: "success", transient: true, durationMs: 1000, sustainedMode: "thinking" };

    case "agent.tool_use_error":
      return { mode: "error", transient: true, durationMs: 1500, sustainedMode: "thinking" };

    case "agent.subagent_start":
    case "agent.subagent_stop":
      return null; // subagent activity is secondary; do not interrupt primary mode

    case "agent.response_complete":
      return { mode: "idle" };

    case "agent.notification":
    case "agent.system":
      return null; // informational only

    default:
      return null;
  }
}

/**
 * List of all WS event types for the preview UI.
 */
export const WS_EVENT_GROUPS = [
  {
    label: "Session",
    events: [
      { type: "session.ready", label: "Ready" },
      { type: "session.error", label: "Error" },
    ],
  },
  {
    label: "Thinking",
    events: [
      { type: "agent.thinking_start", label: "Start" },
      { type: "agent.thinking_token", label: "Token" },
      { type: "agent.thinking_done", label: "Done" },
    ],
  },
  {
    label: "Text",
    events: [
      { type: "agent.text_token", label: "Token" },
      { type: "agent.text_done", label: "Done" },
    ],
  },
  {
    label: "Tools",
    events: [
      { type: "agent.tool_use_start", label: "Terminal", category: "terminal" },
      { type: "agent.tool_use_start", label: "File", category: "file" },
      { type: "agent.tool_use_start", label: "Search", category: "search" },
      { type: "agent.tool_use_start", label: "Web", category: "web" },
      { type: "agent.tool_use_start", label: "MCP", category: "mcp" },
      { type: "agent.tool_use_end", label: "End" },
      { type: "agent.tool_use_error", label: "Error" },
    ],
  },
  {
    label: "SubAgent",
    events: [
      { type: "agent.subagent_start", label: "Start" },
      { type: "agent.subagent_stop", label: "Stop" },
    ],
  },
  {
    label: "Done",
    events: [
      { type: "agent.response_complete", label: "Complete" },
    ],
  },
];

/**
 * A scripted demo sequence simulating a typical agent interaction.
 */
export const DEMO_SEQUENCE = [
  { event: { type: "session.ready" }, delayMs: 800 },
  { event: { type: "agent.thinking_start" }, delayMs: 500 },
  { event: { type: "agent.thinking_token", token: "Reviewing avatar state..." }, delayMs: 700 },
  { event: { type: "agent.thinking_token", token: " calibrating eye and brow placement..." }, delayMs: 900 },
  { event: { type: "agent.thinking_token", token: " preparing safe patch." }, delayMs: 700 },
  { event: { type: "agent.thinking_done" }, delayMs: 200 },
  { event: { type: "agent.text_token" }, delayMs: 2500 },
  { event: { type: "agent.text_done" }, delayMs: 600 },
  { event: { type: "agent.tool_use_start", category: "search" }, delayMs: 1800 },
  { event: { type: "agent.tool_use_end" }, delayMs: 800 },
  { event: { type: "agent.tool_use_start", category: "file" }, delayMs: 1500 },
  { event: { type: "agent.tool_use_end" }, delayMs: 800 },
  { event: { type: "agent.tool_use_start", category: "terminal" }, delayMs: 2200 },
  { event: { type: "agent.tool_use_error" }, delayMs: 1200 },
  { event: { type: "agent.thinking_start" }, delayMs: 500 },
  { event: { type: "agent.thinking_token", token: "Re-checking lint and build results..." }, delayMs: 700 },
  { event: { type: "agent.thinking_token", token: " summarizing findings for handoff." }, delayMs: 600 },
  { event: { type: "agent.thinking_done" }, delayMs: 200 },
  { event: { type: "agent.text_token" }, delayMs: 3000 },
  { event: { type: "agent.text_done" }, delayMs: 400 },
  { event: { type: "agent.response_complete" }, delayMs: 0 },
];
