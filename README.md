# Office Avatar Studio

Bundled Three.js avatar studio featuring:

- Clippy
- Pushy
- Tacky
- Towely

![Avatar Studio preview](./assets/studio-screenshot.png)

## What is included

- `index.html`: single studio page for all avatars
- `css/studio.css`: UI styling
- `js/studio.js`: app runtime + dynamic settings panel
- `js/config/avatars.js`: model definitions, defaults, and control schema
- `js/avatars/clippy-controller.js`: Clippy runtime wrapper
- `js/avatars/thumbtack-controller.js`: Pushy/Tacky runtime wrapper
- `js/avatars/towely-controller.js`: Towely runtime wrapper
- `js/lib/realtime-voice.js`: OpenAI Realtime voice WebRTC client for the studio
- `js/lib/elevenlabs-voice.js`: ElevenLabs Conversational AI voice client for the studio
- `js/lib/visemes.js`: transcript-to-viseme mapping for speech mouth shaping
- `js/lib/clippy-3d.js`: base Clippy model engine
- `js/lib/clippy-3d-plugin-examples.js`: optional Clippy office props plugin
- `js/lib/thumbtack-factory.js`: shared Pushy/Tacky mesh factory
- `js/lib/towely-factory.js`: Towely mesh factory
- `.github/workflows/ci.yml`: CI checks for pull requests and pushes

## Run locally

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Voice sources

Use the voice buttons in the panel header:

- `Voice: Connect` (OpenAI Realtime)
- `EL Voice: Connect` (ElevenLabs agent)

### OpenAI Realtime

- Preferred: provide an app endpoint at `POST /api/realtime/client_secret` that returns a short-lived Realtime client secret.
- Fallback: the app prompts for an OpenAI API key once and uses it to request a client secret directly.
- Optional globals for development: `window.OPENAI_REALTIME_CLIENT_SECRET` or `window.OPENAI_API_KEY`.

### ElevenLabs agent

- Default agent id is `agent_6201kh80gehme6wacehwktq31hsk` (Towelie).
- Optional agent override globals/env: `window.ELEVENLABS_AGENT_ID` or `VITE_ELEVENLABS_AGENT_ID`.
- Default ElevenLabs voice id is `fBD19tfE58bkETeiwUoC`.
- Optional voice override globals/env: `window.ELEVENLABS_VOICE_ID` or `VITE_ELEVENLABS_VOICE_ID`.
- Optional connection type override (`webrtc` or `websocket`): `window.ELEVENLABS_CONNECTION_TYPE` or `VITE_ELEVENLABS_CONNECTION_TYPE`.
- Preferred auth: provide `POST /api/elevenlabs/conversation_token` returning a conversation token.
- Optional fallbacks:
  - `window.ELEVENLABS_CONVERSATION_TOKEN` / `VITE_ELEVENLABS_CONVERSATION_TOKEN`
  - `window.ELEVENLABS_API_KEY` / `VITE_ELEVENLABS_API_KEY` (used client-side to request a token)
  - If neither is set, the app can prompt for an ElevenLabs API key one-time in the browser.
- Note: conversation tokens are short-lived/single-use. Static token env vars can fail after one connection.

## Clippy Presenter + Excalidraw

Open [http://127.0.0.1:4173/clippy-presentation.html](http://127.0.0.1:4173/clippy-presentation.html).

- Use `Load Demo` for the built-in ServiceNow AI risk deck.
- Import your own `.excalidraw` file from `Scene File`.
- If your scene uses Excalidraw frames, each frame becomes a slide that Clippy can present.

## Build and preview

```bash
npm run build
npm run preview
```

## Checks

```bash
npm run check
```

This runs syntax validation, ESLint, and production bundle build.

## Deploy

This is a static site after build.

1. Run `npm run build`.
2. Deploy the `dist/` directory.

Common host settings:

- Netlify: Build command `npm run build`, Publish directory `dist`
- Vercel: Build command `npm run build`, Output directory `dist`
- Cloudflare Pages: Build command `npm run build`, Build output directory `dist`
