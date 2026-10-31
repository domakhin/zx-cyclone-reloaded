# Cyclone Reloaded

Run the original **ZX Spectrum Cyclone** (Vortex Software / Costa Panayi) in the browser via [JSSpeccy 3](https://github.com/gasman/jsspeccy3), and (in later phases) edit / patch custom island level packs into a user-supplied game image.

This repo does **not** include the commercial game. You must supply a legal TAP / TZX / Z80 dump yourself.

## Setup

```bash
npm install
npm run dev
```

Open the printed local URL. Use **Play** to load your Cyclone image; it is stored in IndexedDB for the next visit.

Optional: drop files under `public/roms/` for local static hosting experiments — keep dumps out of git (see `.gitignore`).

## Routes

| Route | Purpose |
| --- | --- |
| `#/play` | JSSpeccy 48K embed + load / reload / clear game image |
| `#/editor` | Level editor shell (full tools after map RE + codec) |

## Licence notes

- App code in this repository: project licence as you choose / add later.
- Vendored emulator under `public/jsspeccy/`: **GPLv3** (see `public/jsspeccy/COPYING`).
- Cyclone game data: remains copyright of its owners; not redistributed here.

## Roadmap

0. ~~Scaffold (Play + Editor shells, IndexedDB loader)~~
1. Reverse-engineer Cyclone level format
2. Patch TAP/Z80 with encoded level packs
3. Full level-pack editor
4. Play patched maps end-to-end
