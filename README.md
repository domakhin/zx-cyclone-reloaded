# Cyclone Reloaded

Run the original **ZX Spectrum Cyclone** (Vortex Software / Costa Panayi) in the browser via [JSSpeccy 3](https://github.com/gasman/jsspeccy3), and (in later phases) edit / patch custom island level packs into a user-supplied game image.

Stack: **Vite + React + Tailwind CSS**. This repo does **not** include the commercial game — supply a legal TAP / TZX / Z80 dump yourself.

## Setup

```bash
npm install
npm run dev
```

Open the printed local URL. Use **Play** to load your Cyclone image; it is stored in IndexedDB for the next visit.

## Routes

| Route | Purpose |
| --- | --- |
| `#/play` | JSSpeccy Spectrum 128 embed (emulator persists when switching tabs) |
| `#/editor` | Terrain map preview from TAP / stock extract |

## Licence notes

- App code in this repository: project licence as you choose / add later.
- Vendored emulator under `public/jsspeccy/`: **GPLv3** (see `public/jsspeccy/COPYING`).
- Cyclone game data: remains copyright of its owners; not redistributed here.

## Roadmap

0. ~~Scaffold (Play + Editor, IndexedDB loader)~~
1. ~~React + Tailwind rewrite~~
2. Reverse-engineer Cyclone level format (terrain locked — see `docs/level-format.md`)
3. Patch TAP/Z80 with encoded level packs
4. Full level-pack editor
5. Play patched maps end-to-end
