# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Reusable package entrypoint at `js/index.js` with exports for engines, controllers, and shared config.
- Embeddable `createAvatarViewer` API (`js/lib/avatar-viewer.js`) for quickly mounting avatars in other apps without the studio UI.

### Changed

- Updated package metadata (`main`, `exports`, `files`, keywords) to support direct importing from other projects.
- Expanded README with integration instructions for using the project as a reusable module.

## [2026-02-11]

### Added

- Cyberpunk UI theme with neon palette, atmospheric backgrounds, and animated overlays for the studio surface.
- Enhanced motion details including scanline flow, drifting grid, status pulse, and staggered control section reveals.

### Changed

- Switched typography to `Rajdhani` and `Share Tech Mono` to better match the cyberpunk visual language.
- Retuned Three.js scene lighting, fog, and stage materials to align the 3D viewport with the neon theme.
- Refined panel, control, and button styling for higher contrast and clearer interaction feedback.
- Refreshed `assets/studio-screenshot.png` to match the cyberpunk theme shown in the README preview.
