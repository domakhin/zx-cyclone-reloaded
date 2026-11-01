# Cyclone level / map format (working notes)

Source image: [`image/CYCLONE.TAP`](../image/CYCLONE.TAP) (Vortex freeware package).

Status: **terrain map locked**; **buildings/helipads are in-map cells**; **crates and refugees are placed dynamically at runtime** (not static level data).

## TAP layout

| Block | Type | Bytes | Load addr | Notes |
| --- | --- | --- | --- | --- |
| Cyclone1 | BASIC | 76 | LINE 10 | Loader |
| Cyclone2 | CODE | 6912 | `$4000` | Loading screen |
| Cyclone4 | CODE | 512 | `$FE00` | Helper |
| Cyclone3 | CODE | 40630 | `$5FDC` | Game + map |

Extracted: `tools/cyclone3.bin` (offset 0 = `$5FDC`).

## Terrain map (confirmed)

| Field | Value |
| --- | --- |
| Spectrum address | **`$9300`–`$D2FF`** |
| Offset in Cyclone3 | **13092** |
| Size | **128 × 128** = 16384 bytes |
| Cell size | **1 byte** |
| Sea | **`0`** |
| Row 0 | all sea (padding / wrap) |

Evidence:

- `$9260`: `LD HL,$9300` / `LD BC,$0048` / `LDIR` — copies a strip from map base into a viewport buffer at `$6950`.
- `$7846`, `$79B3`: `LD BC,$0080` / `ADD HL,BC` — **row stride 128**.
- `$776e`, `$7799`: seven `ADD HL,HL` — **y × 128** index math.
- Land non-zero cells run through **row 127** → height is 128 (not 120).
- Candidate `$92DC` discarded: bytes before `$9300` are code.

Artifacts: `tools/map-128.bin`, `tools/map-128.meta.json`, `tools/map-previews/map-specials.png`.

### In-game map screen vs terrain grid

The pause/overview map (white background, island **names**, H / cyclone icons, compass) is a **labelled schematic**, not a 1:1 paint of `$9300`. Island name strings live near `$6A50` (`GILLIGANS`, `BASE`, `PEAK`, …).

Relative island positions match the 128×128 heightfield (~14 major landmasses); the overview draws tiny icons and leaves more ocean for labels. The editor heightfield looks “busier” because it shows every land cell at full size.

### Cell byte encoding

| Range | Meaning |
| --- | --- |
| `$00` | Sea |
| `$01`–`$7F` | Land. **Bits 7–5 = elevation** (observed 0–3). High nibbles **`$1` / `$3` / `$5`** are the main shore → fill → peak bands. |
| **`$80`–`$FF`** | **Structure** (buildings / pads). Game branches with `LD A,(HL)` / **`CP $80` / `JR C`** at **`$7e8b`**. High nibbles **`$8` / `$9`** dominate (~997 cells). |

Low bits = tile / edge variant (graphics mapping still open).

Shore→interior modes: `$35` → `$30` → `$58`. Elevation average rises with distance-from-sea.

Rough counts (stock map): ~57% sea, ~36% land, ~6% structure.

### Built-in “objects”

**Helipads / buildings are painted into the terrain** as cells `>= $80`, not a separate XY list.

`map-128.meta.json` → `structureClusters` lists bounding boxes / centers of structure footprints for an editor building layer.

## Crates / refugees (dynamic)

**Confirmed: placed dynamically at runtime**, not authored as static XY tables in the TAP.

Implications:

- Level packs edit **terrain + in-map structures** (`$9300` grid). Crates/refugees are **not** part of the static patch.
- Spawn rules live in game code (land-valid cells, loop reset, etc.). Optional later work: find/hook the spawner if we want custom densities or forced positions.
- Static XY scans returning nothing was expected, not a miss.

## Patching implication

1. Replace the **16384-byte** grid at Cyclone3 offset **13092** (`$9300`).
2. Paint land with `$1x`/`$3x`/`$5x`; paint buildings/pads with `$8x`/`$9x` (any `>= $80`).
3. Keep size exactly 128×128; rewrite TAP checksums or patch post-load.

## Tools

```bash
node tools/scan-map.js
node tools/analyze-map-region.js
node tools/decode-cells-and-objects.js
node tools/find-map-refs.js
node tools/hunt-objects.js
node tools/hunt-objects-v2.js
node tools/disasm-map-access.js
node tools/trace-struct-and-height.js
node tools/find-map-index.js
node tools/finalize-map-128.js
```

## Open questions

1. Exact low-bit → graphic tile mapping.
2. Whether `$8x` vs `$9x` distinguishes building vs helipad (or only tile art).
3. Spawn algorithm for crates/refugees (which land cells are eligible; counts per loop) — only needed if we want to tune spawns.
4. Whether the `$9261` map pointer is self-modified at runtime for scrolling (no static write sites found).
