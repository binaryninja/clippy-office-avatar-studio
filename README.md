# Office Avatar Studio (Public Release)

Public-ready starter for a combined avatar studio featuring:

- Clippy
- Pushy
- Tacky

## What is included

- `index.html`: single studio page for all avatars
- `css/studio.css`: UI styling
- `js/studio.js`: app runtime + dynamic settings panel
- `js/config/avatars.js`: model definitions, defaults, and control schema
- `js/avatars/clippy-controller.js`: Clippy runtime wrapper
- `js/avatars/thumbtack-controller.js`: Pushy/Tacky runtime wrapper
- `js/lib/clippy-3d.js`: base Clippy model engine
- `js/lib/clippy-3d-plugin-examples.js`: optional Clippy office props plugin
- `js/lib/thumbtack-factory.js`: shared Pushy/Tacky mesh factory

## Run locally

From this folder:

```bash
python3 -m http.server 4173
```

Open [http://localhost:4173](http://localhost:4173).

## Publish as a new GitHub repo

From this folder (`release/`):

```bash
git init
git add .
git commit -m "Initial public release: Clippy, Pushy, Tacky avatar studio"
gh repo create clippy-office-avatar-studio --public --source=. --remote=origin --push
```

Change the repo name in the last command if you want a different slug.
