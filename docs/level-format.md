# Cyclone level / map format (working notes)

Source image: [`image/CYCLONE.TAP`](../image/CYCLONE.TAP) (Vortex freeware package).

Status: **terrain map locked**; **buildings/helipads are in-map cells**; **crates and refugees are placed dynamically at runtime** (not static level data). **Atlas → sparse world mapping** reverse-engineered via `$F230` windows (see below).

## TAP layout

| Block | Type | Bytes | Load addr | Notes |
| --- | --- | --- | --- | --- |
| Cyclone1 | BASIC | 76 | LINE 10 | Loader |
| Cyclone2 | CODE | 6912 | `$4000` | Loading screen |
| Cyclone4 | CODE | 512 | `$FE00` | Helper |
| Cyclone3 | CODE | 40630 | `$5FDC` | Game + map |

Extracted: `tools/cyclone3.bin` (offset 0 = `$5FDC`).

---

## Two spaces: dense atlas vs sparse world

Cyclone does **not** store a full 768×768 heightfield. It stores:

1. A **dense atlas** — all island terrain packed into one small grid.
2. A **sparse world** — 768×768 flyable space, mostly ocean, with islands brought in through per-island **windows** at `$F230`.

There is **no** “stamp the 128×150 atlas into every 128×128 sector” rule.

### Dense island atlas

| Field | Value |
| --- | --- |
| Spectrum address | **`$9300`–`$DDFF`** (rows 0..149) |
| Offset in Cyclone3 | **13092** (`$9300 − $5FDC`) |
| Size | **128 × 150** = 19200 bytes |
| Role | Packed island heightfields (authoring / sample source) |
| Cell | 1 byte |
| Sea | **`0`** |
| Row 0 / 149 | All sea (padding) |

Reading only **128×128** (`$9300`–`$D2FF`) **cuts** bottom islands. Contiguous atlas data continues with land bridges across row 127→128; land finishes by row **148**; row **149** is sea; **150+** is other data/code.

**Indexing:** row stride **128** (`LD BC,$0080`). Address of cell `(ax, ay)`:

```text
atlas_addr = $9300 + ay × 128 + ax
```

Islands sit side-by-side in this grid with only **sea (`0`)** between them. The ROM has **no** island-ID field, **no** atlas-local bbox table, and **no** connected-component walk. Separation in the dump is implicit (land surrounded by zeros).

Artifacts: `tools/map-128.bin`, `public/levels/stock-map-128.bin`, `tools/map-128.meta.json`.

### Sparse world playfield

| Field | Value |
| --- | --- |
| World size | **768×768** (`$0300`) |
| Sectors | **6×6** of **128×128** |
| Heli X / Y words | **`$7500` / `$7502`** (lo at +0, hi at +1 of each word) |
| Local cell | `(word % 768) & 127` |
| Sector index | `(word % 768) >> 7` → **0..5** |

Evidence: flying east, local X sawtooths **0→127 six times**; `LD HL/DE,$0300` at `$80e9` / `$92e5` / `$e2d8`; overview `HL >> 5` at `$9038`.

The in-game pause/overview map (names near `$6A50`) is a **labelled schematic** of this sparse world, not a 1:1 paint of the dense atlas.

---

## `$F230` island windows (14 records × `$14`)

Named sites (BANANA, ORTE, … ENTERPRISE) are records at **`$F230`**, stride **`$14`** (20 bytes). Export: [`public/levels/island-windows.json`](../public/levels/island-windows.json), [`tools/island-windows.json`](../tools/island-windows.json). Regen: `node tools/export-island-windows.js`.

### Not part of the atlas

| | Atlas | Island windows |
| --- | --- | --- |
| Where | `$9300`… (Cyclone3 offset **13092**) | `$F230`… (Cyclone3 offset **`$F230 − $5FDC` = 37492**) |
| What | 128×150 **terrain bytes** | 14×20-byte **object / placement records** |
| File | `stock-map-128.bin` / `map-128.bin` | `island-windows.json` |

`island-windows.json` is a **decoded dump of game object table `$F230`**, not tiles from the heightfield. Each record’s `mapPtr` **points into** the atlas; the window data itself lives elsewhere in Cyclone3.

### How `island-windows.json` was extracted

1. Load Cyclone3 as `tools/cyclone3.bin` (TAP CODE block load address **`$5FDC`**).
2. File offset of record `r` (0..13):

   ```text
   offset = ($F230 − $5FDC) + r × $14
          = 37492 + r × 20
   ```

3. Read 20 raw bytes per record; map fields as in the layout table below.
4. Names (BANANA, ORTE, …) come from the in-game overview name order (same order as the `$F230` table / labels near `$6A50`) — they are **labels we attach**, not bytes inside the 20-byte record.
5. Derived fields written for convenience (not stored in ROM as such):

   - `xMin`/`xMax`/`yMin`/`yMax` = `(hi<<8)|lo` from `+0..+5`
   - `sector` = AABB centre `>> 7`
   - `mapPtr` as a decimal integer in JSON (`37632` = `$9300`)

6. Script: [`tools/export-island-windows.js`](../tools/export-island-windows.js) → writes `tools/` and `public/levels/island-windows.json`.

Meaning of each field was established by disassembling cull **`$76e9`** and sample **`$775e`/`$7789`**, then checking BANANA → sector **(5,3)** and BONE → **(3,1)**.

### Record layout

| Offset | Name (JSON) | Role |
| --- | --- | --- |
| `+0` | `xHi` | Must equal heli X high `$7501` |
| `+1` | `yHi` | Must equal heli Y high `$7503` |
| `+2` / `+3` | `xMinLo` / `xMaxLo` | Cull vs heli X low `$7500` |
| `+4` / `+5` | `yMinLo` / `yMaxLo` | Cull vs heli Y low `$7502` |
| `+6` | `xRef` | World X **low** of map origin (see sample formula) |
| `+7` | `xRef2` | X blit **edge threshold** (not island right edge) |
| `+8` | `yRef` | World Y **low** of map origin |
| `+9` | `yRef2` | Y blit edge threshold (often **`== yRef`**) |
| `+0a` / `+0b` | `mapPtr` | LE Spectrum address into `$9300` atlas |
| `+0c` / `+0d` | (screen) | Overview label pixel position |
| `+0e` / `+0f` | | Overview name glyph width / height |
| `+10`..`+13` | | Overview-related extras |

Convenience absolutes (also in JSON):

```text
xMin = (xHi << 8) | xMinLo     … same for xMax, yMin, yMax
originX = (xHi << 8) | xRef
originY = (yHi << 8) | yRef
```

`sector` in JSON is **derived** (`center >> 7`) for docs/UI — not stored in the game.

### Activation cull (`$76e9`)

Object is live only when:

1. `$7501 == IX+0` and `$7503 == IX+1` (same 256×256 page), and  
2. heli X low ∈ `[IX+2, IX+3]`, heli Y low ∈ `[IX+4, IX+5]`.

That **AABB** (**axis-aligned bounding box**) is a rectangle whose sides are parallel to the world X/Y axes — defined only by min/max on each axis (no rotation). Example (BANANA): X `604..680`, Y `384..440`. It is a **loose activation / viewport region** (heli inside → this window’s atlas math is used), **not** a tight shoreline outline.

### Terrain sample formula (in-game)

Routines **`$775e` / `$7777` / `$7789`**. When the window is active:

```text
atlas_addr = mapPtr
           + (heliY_lo − IX+8) × 128
           + (heliX_lo − IX+6)
```

Only **low** bytes of heli X/Y enter the formula. High bytes must already match `xHi` / `yHi`.

**Interpretation:**

- At world `(originX, originY)` = `(xHi<<8|xRef, yHi<<8|yRef)`, `atlas_addr == mapPtr`.
- `+1` in X → next atlas byte; `+1` in Y → `+128` (next row).
- The machine never looks up “island rect in atlas”. It asks “heli is here → which atlas byte?” Island shape = nonzero bytes hit while the heli is inside the AABB.

`mapPtr` is an **anchor cell** (often sea at/near the island’s top-left). It is **not** an atlas bbox.

### Worked example: BANANA

| Field | Value |
| --- | --- |
| `mapPtr` | `$9300` → atlas **(0, 0)** |
| `xHi`,`yHi` | 2, 1 |
| `xRef`,`yRef` | 114, 156 → origin world **(626, 412)** |
| AABB | X **604..680**, Y **384..440** → centre sector **(5, 3)** |

| Heli world | `x_lo`,`y_lo` | `atlas_addr` | Atlas `(ax,ay)` |
| --- | --- | --- | --- |
| (626, 412) | 114, 156 | `$9300` | (0, 0) |
| (627, 412) | 115, 156 | `$9301` | (1, 0) |
| (626, 413) | 114, 157 | `$9380` | (0, 1) |
| (640, 420) | 128, 164 | `$970E` | (14, 8) |

**BONE** centre sector **(3, 1)** matches the same rules. Pavero’s BANANA ~**(5, 2)** is off by one row vs RE’d **(5, 3)**.

### Edge thresholds `+6..+9` (`$772b` → `$78cf`)

After cull, the game compares heli lows to `+6/+7/+8/+9` and sets blit-path flags:

| Condition | Flag | Path |
| --- | --- | --- |
| X &lt; `+6` | bit 2 | Left of origin |
| X ≥ `+7` | bit 3 | Right of `+7` |
| Y &lt; `+8` | bit 4 | Above origin |
| Y ≥ `+9` | bit 5 | Below `+9` |
| none | 0 | “Inside” |

Bits index jump table **`$78cf`** → different viewport copy routines. These are **scroll/edge thresholds**, **not** an island outline. Drawing them as a “surrounding dashed box” is wrong; editor overlays use **threshold lines**. Often `yRef == yRef2` (zero vertical span).

---

## How the editor builds the World map

In-game, only a small viewport around the heli is copied from the atlas via the formula above. The editor builds a **full 768×768 preview** so all named sites are visible at once.

Implementation: `buildWorldFromAtlas()` in [`src/lib/cycloneMap.ts`](../src/lib/cycloneMap.ts). Offline twin: `node tools/build-world-from-objects.js` → `tools/world-768.bin`.

### Step 1 — Start from sea

Allocate `Uint8Array(768×768)` filled with `0`.

### Step 2 — For each of 14 windows, sample the AABB

For every world cell `(wx, wy)` in that window’s AABB (with matching `xHi`/`yHi`):

```text
local = mapPtr + (wy&255 − yRef)×128 + (wx&255 − xRef) − $9300
cell  = atlas[local]   // if in range
```

Naively painting **all** nonzero cells pulls in **neighbouring packed atlas islands** that happen to fall in the same address window (“garbage”).

### Step 3 — Atlas connected components (editor-only)

4-connected flood fill on the atlas (`cell != 0`). This is **not** game code — only a way to name “blobs” of land in the packed dump so we can assign each blob to at most one window.

### Step 4 — Ownership score (editor-only)

For each (component, window), count:

- **`overlap`** — how many of that component’s cells appear when sampling the window AABB  
- **`forward`** — subset with **`wx ≥ originX` and `wy ≥ originY`** (southeast of the map-origin cross)

Assign each component to the window maximizing:

```text
score = forward × 10000 + overlap
```

**Why `forward`?** The map-origin cross sits at the island’s **top-left**. Land belonging to that site lies on/after `xRef`/`yRef`. Max-overlap alone wrongly gave GILLIGANS a blob that sits **left** of its `xRef` (that blob scores `forward` under **GIANTS** instead). Do **not** “steal” components for empty windows (that moved LAGOON’s second piece into LUKELAND).

### Step 5 — Paint

For each window, write atlas cells into the world **only** if their component is owned by that window.

### What the binary does *not* define

| Present in ROM | Absent |
| --- | --- |
| Atlas bytes + `$F230` windows + sample formula | Per-island atlas bbox / ID table |
| World activation AABB + origin + `mapPtr` | Explicit “filter other islands in this window” |
| Sea=`0` as the only atlas separator | Connected-component logic |

Editor component filtering approximates “one named site’s land” for a clean overview; flying in-game still samples raw atlas addresses inside the active window.

### Editor overlays (World view)

Toggle **F230 boxes**:

| Graphic | Meaning |
| --- | --- |
| Solid coloured rect | Activation AABB (`xMin..xMax`, `yMin..yMax`) |
| Dashed lines | `+6` / `+7` vertical and `+8` / `+9` horizontal **edge thresholds** |
| White cross | Map origin — `atlas_addr == mapPtr` |

---

## Named sites (stock sectors)

Centre of each activation AABB (`>> 7`), after RE:

| Name | Sector (cx, cy) | Notes |
| --- | --- | --- |
| BANANA | 5, 3 | |
| ORTE | 3, 4 | Rocks (several small comps) |
| KOKOLA | 2, 1 | |
| LAGOON | 1, 1 | Two main land comps |
| PEAK | 4, 0 | |
| BASE | 2, 2 | |
| GILLIGANS | 2, 0 | |
| RED | 3, 4 | |
| SKEG | 1, 4 | |
| BONE | 3, 1 | |
| GIANTS | 3, 2 | |
| CLAW | 3, 3 | |
| LUKELAND | 0, 4 | |
| ENTERPRISE | 0, 3 | |

---

## Cell byte encoding

| Range | Meaning |
| --- | --- |
| `$00` | Sea |
| `$01`–`$7F` | Land. **Bits 7–5 = elevation** (observed 0–3). High nibbles **`$1` / `$3` / `$5`** = shore → fill → peak bands. |
| **`$80`–`$FF`** | **Structures** painted into the atlas (not a separate XY list). |

Low bits on land = tile / edge variant (graphics mapping still open). Shore→interior modes: `$35` → `$30` → `$58`.

Rough atlas counts: ~57% sea, ~36% land, ~6% structure.

### Structure classes — draw passes at `$7e8a` + BASE / PEAK calibration

The strip renderer runs **several passes** over map cells (`LD E,A` / `LD D,$6x` → graphic bank by cell byte).

**Important:** **`$8C` is not uniquely “house”.**  
- On **BASE**: large `$8C` footprints = **buildings** (red roofs).  
- On **PEAK**: the same `$8C` mass sits on **elev-2 land** and is the **rocky high plateau / cliff** (in-game white high-elev face), not a house.  
Underlying green tiers on PEAK are normal land bytes (`$10`/`$30`/`$58`…, elev 0–3).

| Cell range | Graphic bank | Role | Editor colour |
| --- | --- | --- | --- |
| **`$82`–`$86`** | `$67` | **Helipad** | Light gray |
| **`$8C` / `$8D` / `$8F`…** (other `$8x`) | `$67` | **Solid structure** — house **or** rocky peak mass | Magenta |
| **`$91` / `$93`…** (most `$9x`) | `$67` | Detail tiles inside solid-structure footprints | Dark rose |
| **`$9D` / `$9E`** | `$67` | **Yellow path / taxiway** (BASE) | Yellow |
| **`$B2`–`$CF`** (e.g. `$B4`/`$B5`) | **`$68`** | **Dark tree** | Dark green |
| **`$D0`–`$E3`** (e.g. `$D2`/`$D3`) | **`$69`** | **Yellow tree** | Amber |
| **`$E4+`** / `$E3`/`$E8` | next | **White pillar / rare** | Near-white |
| **`$A0`–`$B1`** | `$67` | Other small props | Brown |
| **`$01`–`$7F`** | (land) | Shore / fill / **high elev** terrain | Green ramp |

Pass thresholds: `CP $80` → `$67`; `CP $B2` → `$68`; `CP $D0` → `$69`; `CP $E4` → next.

No separate helipad XY table — all of the above are atlas cells. Derived blobs: `map-128.meta.json` → `structureClusters`.

---

## Crates / refugees (dynamic)

**Confirmed: placed at runtime**, not as static XY tables in the TAP. Level packs edit **terrain + structures** in the `$9300` atlas; crates/refugees are not part of that static patch.

---

## Patching implication

1. Replace the **19200-byte** atlas at Cyclone3 offset **13092** (`$9300`).
2. Paint land `$1x`/`$3x`/`$5x` (incl. high elev); solid struct **`$8C`…** (house or rock); helipad **`$82`–`$86`**; path **`$9D`/`$9E`**; trees **`$B2+`** / **`$D0+`**.
3. Keep size **128×150**; rewrite TAP checksums or patch post-load.
4. Island **world** placement for a custom layout also requires updating the **`$F230`** window records (AABB, origin, `mapPtr`), not only the atlas pixels.

---

## Code & tools

| Path | Role |
| --- | --- |
| `src/lib/cycloneMap.ts` | Atlas constants, `STOCK_ISLAND_WINDOWS`, `buildWorldFromAtlas`, world paint + F230 overlays |
| `src/pages/EditorPage.tsx` | Atlas / world / overview views |
| `public/levels/stock-map-128.bin` | Stock 128×150 atlas |
| `public/levels/island-windows.json` | Exported `$F230` windows |
| `tools/cyclone3.bin` | Extracted Cyclone3 CODE (`$5FDC`) |
| `tools/map-128.bin` | Dense atlas extract (128×150) |
| `tools/export-island-windows.js` | Regenerate `$F230` window JSON |
| `tools/build-world-from-objects.js` | Offline 768×768 world + PPM |
| `tools/patch-peak-to-sector.js` | Example: move PEAK sector + patch TAP |
| `tools/patch-jsspeccy-peek.js` | Vendored JSSpeccy `peekMemory` bridge |
| `tools/verify-tap-extract.js` | Check TAP ↔ atlas extract |
| `tools/decode-object-world.js` | AABB / cull disasm helpers |
| `tools/dis-map-from-obj.js` | MapPtr sample routine disasm |

```bash
node tools/export-island-windows.js
node tools/build-world-from-objects.js
node tools/patch-peak-to-sector.js
node tools/verify-tap-extract.js
```

---

## Open questions

1. Exact low-bit → graphic tile mapping (land and within each structure bank).
2. Fine tile art within solid-structure footprints; how `$8C` chooses house vs rock graphic (same bank index).
3. Crate/refugee spawn algorithm (land eligibility, counts per loop).
4. Whether any runtime patch of the map base pointer is used beyond object-relative sampling (historical `$9261` note).
