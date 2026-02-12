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
