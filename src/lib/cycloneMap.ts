/** Cyclone terrain — see docs/level-format.md */

/**
 * Dense island atlas at `$9300`: islands packed into 128×150 (not the playfield).
 * Bottom islands are truncated if only 128 rows are read; rows 0 and 149 are sea pads.
 */
export const MAP_WIDTH = 128
export const MAP_HEIGHT = 150
/** Spectrum address of the dense atlas. */
const MAP_BASE = 0x9300

/**
 * Sparse flyable world: 6×6 sectors of 128×128 = 768×768 (`$0300`).
 * Atlas→world via F230 object windows (see `IslandWindow` / `buildWorldFromAtlas`).
 */
export const WORLD_SECTORS = 6
export const SECTOR_SIZE = 128
export const WORLD_WIDTH = WORLD_SECTORS * SECTOR_SIZE
export const WORLD_HEIGHT = WORLD_SECTORS * SECTOR_SIZE

/**
 * One named island / feature window from `$F230` (stride `$14`).
 * When heli is in the AABB with matching high bytes, terrain is sampled as:
 *   atlas_addr = mapPtr + ((wy & 255) - yRef) * 128 + ((wx & 255) - xRef)
 * Evidence: `$775e` / `$7777` / `$7789`, cull `$76e9`.
 */
type IslandWindow = {
  name: string
  xHi: number
  yHi: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  xRef: number
  yRef: number
  /** Edge-flag counterpart of xRef (`IX+7`); optional for overlays. */
  xRef2?: number
  /** Edge-flag counterpart of yRef (`IX+9`); optional for overlays. */
  yRef2?: number
  mapPtr: number
  /** M-map silhouette blit: Spectrum display-file address (`IX+0c`). */
  ovScr?: number
  /** Silhouette width in overview pixels (`IX+0e`). */
  ovW?: number
  /** Silhouette height in overview rows (`IX+0f`). */
  ovH?: number
  /** M-map label glyph destination display-file address (`IX+10`). */
  ovLabel?: number
  /** Attribute-file high byte for label (`IX+12`, `$58`/`$59`/`$5A`). */
  ovAttrHi?: number
}

/** Stock windows from Cyclone3 `$F230` (BANANA→sec 5,3; BONE→sec 3,1). */
const STOCK_ISLAND_WINDOWS: IslandWindow[] = [
  { name: 'BANANA', xHi: 2, yHi: 1, xMin: 604, xMax: 680, yMin: 384, yMax: 440, xRef: 0x72, xRef2: 0x92, yRef: 0x9c, yRef2: 0x9c, mapPtr: 0x9300, ovScr: 0x4894, ovW: 13, ovH: 6, ovLabel: 0x486f, ovAttrHi: 0x59 },
  { name: 'ORTE', xHi: 1, yHi: 2, xMin: 392, xMax: 467, yMin: 512, yMax: 569, xRef: 0x9e, xRef2: 0xbd, yRef: 0x1c, yRef2: 0x1d, mapPtr: 0x9d00, ovScr: 0x530d, ovW: 12, ovH: 7, ovLabel: 0x502e, ovAttrHi: 0x5a },
  { name: 'KOKOLA', xHi: 1, yHi: 0, xMin: 343, xMax: 417, yMin: 148, yMax: 204, xRef: 0x6d, xRef2: 0x8b, yRef: 0xb0, yRef2: 0xaf, mapPtr: 0xa900, ovScr: 0x40ab, ovW: 12, ovH: 7, ovLabel: 0x40c8, ovAttrHi: 0x58 },
  { name: 'LAGOON', xHi: 0, yHi: 0, xMin: 116, xMax: 203, yMin: 184, yMax: 240, xRef: 0x8a, xRef2: 0xb5, yRef: 0xd4, yRef2: 0xd4, mapPtr: 0xb600, ovScr: 0x40c4, ovW: 16, ovH: 7, ovLabel: 0x40e2, ovAttrHi: 0x58 },
  { name: 'PEAK', xHi: 2, yHi: 0, xMin: 552, xMax: 613, yMin: 88, yMax: 144, xRef: 0x3e, xRef2: 0x4f, yRef: 0x74, yRef2: 0x74, mapPtr: 0xc300, ovScr: 0x4072, ovW: 10, ovH: 7, ovLabel: 0x4050, ovAttrHi: 0x58 },
  { name: 'BASE', xHi: 1, yHi: 1, xMin: 284, xMax: 386, yMin: 336, yMax: 392, xRef: 0x32, xRef2: 0x6c, yRef: 0x6c, yRef2: 0x6c, mapPtr: 0xcf80, ovScr: 0x4869, ovW: 20, ovH: 7, ovLabel: 0x4886, ovAttrHi: 0x59 },
  { name: 'GILLIGANS', xHi: 1, yHi: 0, xMin: 284, xMax: 350, yMin: 88, yMax: 145, xRef: 0x32, xRef2: 0x48, yRef: 0x74, yRef2: 0x75, mapPtr: 0x9354, ovScr: 0x4069, ovW: 10, ovH: 7, ovLabel: 0x4042, ovAttrHi: 0x58 },
  { name: 'RED', xHi: 1, yHi: 2, xMin: 376, xMax: 438, yMin: 576, yMax: 632, xRef: 0x8e, xRef2: 0xa0, yRef: 0x5c, yRef2: 0x5c, mapPtr: 0x9fd8, ovScr: 0x534c, ovW: 9, ovH: 7, ovLabel: 0x506d, ovAttrHi: 0x5a },
  { name: 'SKEG', xHi: 0, yHi: 2, xMin: 112, xMax: 173, yMin: 512, yMax: 568, xRef: 0x86, xRef2: 0x97, yRef: 0x1c, yRef2: 0x1c, mapPtr: 0xadd8, ovScr: 0x5504, ovW: 9, ovH: 7, ovLabel: 0x5025, ovAttrHi: 0x5a },
  { name: 'BONE', xHi: 1, yHi: 0, xMin: 428, xMax: 511, yMin: 124, yMax: 180, xRef: 0xc2, xRef2: 0xe9, yRef: 0x98, yRef2: 0x98, mapPtr: 0xb843, ovScr: 0x408e, ovW: 15, ovH: 7, ovLabel: 0x40af, ovAttrHi: 0x58 },
  { name: 'GIANTS', xHi: 1, yHi: 1, xMin: 408, xMax: 459, yMin: 268, yMax: 336, xRef: 0xae, xRef2: 0xb5, yRef: 0x28, yRef2: 0x34, mapPtr: 0x9337, ovScr: 0x482d, ovW: 7, ovH: 10, ovLabel: 0x482e, ovAttrHi: 0x59 },
  { name: 'CLAW', xHi: 1, yHi: 1, xMin: 452, xMax: 509, yMin: 448, yMax: 510, xRef: 0xda, xRef2: 0xe7, yRef: 0xdc, yRef2: 0xe2, mapPtr: 0xa735, ovScr: 0x4bcf, ovW: 8, ovH: 8, ovLabel: 0x48f0, ovAttrHi: 0x59 },
  { name: 'LUKELAND', xHi: 0, yHi: 2, xMin: 48, xMax: 109, yMin: 560, yMax: 620, xRef: 0x46, xRef2: 0x57, yRef: 0x4c, yRef2: 0x50, mapPtr: 0xc628, ovScr: 0x5042, ovW: 9, ovH: 8, ovLabel: 0x5062, ovAttrHi: 0x5a },
  { name: 'ENTERPRISE', xHi: 0, yHi: 1, xMin: 68, xMax: 139, yMin: 432, yMax: 507, xRef: 0x5a, xRef2: 0x75, yRef: 0xcc, yRef2: 0xdf, mapPtr: 0xc64f, ovScr: 0x48c2, ovW: 11, ovH: 12, ovLabel: 0x48c4, ovAttrHi: 0x59 },
]

/** In-game M-map display names (from `$6A50` name list). */
const MMAP_DISPLAY_NAMES: Record<string, string> = {
  BANANA: 'BANANA ISLAND',
  ORTE: 'ORTE ROCKS',
  KOKOLA: 'KOKOLA ISLAND',
  LAGOON: 'LAGOON ISLAND',
  PEAK: 'PEAK ISLAND',
  BASE: 'BASE ISLAND',
  GILLIGANS: 'GILLIGANS ISLAND',
  RED: 'RED ISLAND',
  SKEG: 'SKEG ISLAND',
  BONE: 'BONE ISLAND',
  GIANTS: 'GIANTS GATEWAY',
  CLAW: 'CLAW ISLAND',
  LUKELAND: 'LUKELAND ISLES',
  ENTERPRISE: 'ENTERPRISE ISLAND',
}

/** Spectrum display size for the pause/M map. */
export const MMAP_WIDTH = 256
export const MMAP_HEIGHT = 192

/** Spectrum display-file address → pixel top-left of that byte. */
function spectrumDfToXY(addr: number): { x: number; y: number } {
  const y =
    ((addr & 0x0700) >> 8) | ((addr & 0x00e0) >> 2) | ((addr & 0x1800) >> 5)
  const x = (addr & 0x1f) * 8
  return { x, y }
}

/**
 * Label 4-connected land components in the dense atlas.
 * Returns per-cell component id (−1 = sea) and component sizes.
 */
function labelAtlasComponents(atlas: TerrainMap): {
  label: Int32Array
  sizes: number[]
} {
  const w = atlas.width
  const h = atlas.height
  const cells = atlas.cells
  const label = new Int32Array(w * h)
  label.fill(-1)
  const sizes: number[] = []

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (label[i]! >= 0 || !cells[i]) continue
      const id = sizes.length
      const q = [i]
      label[i] = id
      let n = 0
      while (q.length) {
        const p = q.pop()!
        const px = p % w
        const py = (p / w) | 0
        n++
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = px + dx
          const ny = py + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const ni = ny * w + nx
          if (label[ni]! >= 0 || !cells[ni]) continue
          label[ni] = id
          q.push(ni)
        }
      }
      sizes.push(n)
    }
  }
  return { label, sizes }
}

function atlasLocal(
  win: IslandWindow,
  wx: number,
  wy: number,
  atlasLen: number,
): number | null {
  const addr =
    win.mapPtr + ((wy & 0xff) - win.yRef) * MAP_WIDTH + ((wx & 0xff) - win.xRef)
  const local = addr - MAP_BASE
  if (local < 0 || local >= atlasLen) return null
  return local
}

/**
 * Stamp dense atlas cells into a 768×768 world using F230 windows.
 *
 * Each window’s AABB can sample several packed atlas islands. Cross/mapPtr is
 * the island top-left, so ownership prefers cells with wx≥xRef and wy≥yRef
 * (“forward” of origin); raw max-overlap wrongly gave GILLIGANS a GIANTS blob
 * that sits left of GILLIGANS’s xRef.
 */
function buildWorldFromAtlas(
  atlas: TerrainMap,
  windows: IslandWindow[] = STOCK_ISLAND_WINDOWS,
): Uint8Array {
  const world = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT)
  const atlasLen = atlas.width * atlas.height
  const { label, sizes } = labelAtlasComponents(atlas)
  const nComp = sizes.length
  const nWin = windows.length

  // overlap / forward (SE of origin) counts per component × window
  const overlap: Int32Array[] = Array.from({ length: nComp }, () => new Int32Array(nWin))
  const forward: Int32Array[] = Array.from({ length: nComp }, () => new Int32Array(nWin))

  for (let r = 0; r < nWin; r++) {
    const win = windows[r]!
    const ox = (win.xHi << 8) | win.xRef
    const oy = (win.yHi << 8) | win.yRef
    for (let wy = win.yMin; wy <= win.yMax; wy++) {
      if (wy < 0 || wy >= WORLD_HEIGHT || wy >> 8 !== win.yHi) continue
      for (let wx = win.xMin; wx <= win.xMax; wx++) {
        if (wx < 0 || wx >= WORLD_WIDTH || wx >> 8 !== win.xHi) continue
        const local = atlasLocal(win, wx, wy, atlasLen)
        if (local == null) continue
        const cell = atlas.cells[local]!
        if (!cell) continue
        const id = label[local]!
        if (id < 0) continue
        overlap[id]![r]!++
        if (wx >= ox && wy >= oy) forward[id]![r]!++
      }
    }
  }

  // Prefer forward-of-origin coverage; tie-break with total overlap
  const owner = new Int32Array(nComp)
  owner.fill(-1)
  for (let id = 0; id < nComp; id++) {
    let best = -1
    let bestScore = -1
    for (let r = 0; r < nWin; r++) {
      const score = forward[id]![r]! * 10000 + overlap[id]![r]!
      if (score > bestScore) {
        bestScore = score
        best = r
      }
    }
    if (bestScore > 0) owner[id] = best
  }

  const allow: boolean[][] = Array.from({ length: nWin }, () =>
    Array.from({ length: nComp }, () => false),
  )
  for (let id = 0; id < nComp; id++) {
    const r = owner[id]!
    if (r >= 0) allow[r]![id] = true
  }

  for (let r = 0; r < nWin; r++) {
    const win = windows[r]!
    const mask = allow[r]!
    for (let wy = win.yMin; wy <= win.yMax; wy++) {
      if (wy < 0 || wy >= WORLD_HEIGHT || wy >> 8 !== win.yHi) continue
      for (let wx = win.xMin; wx <= win.xMax; wx++) {
        if (wx < 0 || wx >= WORLD_WIDTH || wx >> 8 !== win.xHi) continue
        const local = atlasLocal(win, wx, wy, atlasLen)
        if (local == null) continue
        const cell = atlas.cells[local]!
        if (!cell) continue
        const id = label[local]!
        if (id < 0 || !mask[id]) continue
        world[wy * WORLD_WIDTH + wx] = cell
      }
    }
  }
  return world
}

const MAP_SIZE = MAP_WIDTH * MAP_HEIGHT
/** Offset of atlas inside Cyclone3 CODE block (Spectrum $9300 − $5FDC). */
const MAP_OFFSET_IN_CYCLONE3 = 13092
/** Offset of `$F230` island windows inside Cyclone3 (`$F230 − $5FDC`). */
const F230_OFFSET_IN_CYCLONE3 = 0xf230 - 0x5fdc
const F230_STRIDE = 0x14
const F230_COUNT = 14
const CYCLONE3_LOAD = 0x5fdc
const CYCLONE3_LENGTH = 40630

const ISLAND_WINDOW_NAMES = [
  'BANANA',
  'ORTE',
  'KOKOLA',
  'LAGOON',
  'PEAK',
  'BASE',
  'GILLIGANS',
  'RED',
  'SKEG',
  'BONE',
  'GIANTS',
  'CLAW',
  'LUKELAND',
  'ENTERPRISE',
] as const

export type TerrainMap = {
  width: number
  height: number
  cells: Uint8Array
  source: string
  /** `$F230` windows from this image (stock if absent). */
  windows?: IslandWindow[]
}

/** atlas = dense $9300 pack; world = 768×768; overview = flat atlas; mmap = in-game M screen */
export type MapViewMode = 'tile' | 'world' | 'overview' | 'mmap'

function elevation(cell: number): number {
  if (cell === 0) return 0
  return (cell >> 5) & 7
}

/**
 * Structure palette — BASE + PEAK calibration.
 * Draw banks `$7e8a`: `>=$80`→`$67`, `>=$B2`→`$68`, `>=$D0`→`$69`.
 *
 * `$8C` is NOT always a house: on BASE it forms building footprints; on PEAK
 * the same bytes paint the rocky high-elev mass (white cliff / plateau rock).
 */
function structureRgba(cell: number): [number, number, number, number] {
  // Helipad (compact $82–$86)
  if (cell >= 0x82 && cell <= 0x86) return [235, 235, 245, 255]
  // Yellow path ($9D/$9E)
  if (cell === 0x9d || cell === 0x9e) return [240, 200, 40, 255]
  // Yellow tree (bank $69)
  if (cell >= 0xd0 && cell < 0xe4) return [230, 160, 40, 255]
  // White pillar / rare high
  if (cell >= 0xe4) return [250, 250, 255, 255]
  // Dark tree (bank $68)
  if (cell >= 0xb2 && cell < 0xd0) return [20, 110, 50, 255]
  // Detail tiles in solid-structure footprints ($91…)
  if (cell >= 0x90 && cell < 0xa0) return [160, 70, 90, 255]
  // Solid structure body ($8C…): house OR rocky peak — magenta to avoid “house only”
  if (cell >= 0x80 && cell < 0x90) return [200, 40, 140, 255]
  // Other props ($A0–$B1)
  return [160, 100, 60, 255]
}

function cellRgba(cell: number): [number, number, number, number] {
  if (cell === 0) return [8, 20, 50, 255]
  if (cell >= 0x80) return structureRgba(cell)
  const e = elevation(cell)
  const g = 50 + Math.min(e, 3) * 40
  return [g - 10, g + 15, g - 20, 255]
}

function cellRgbaOverview(cell: number): [number, number, number, number] {
  if (cell === 0) return [255, 255, 255, 255]
  if (cell >= 0x80) return structureRgba(cell)
  return [40, 200, 40, 255]
}

/** Decode 14 `$F230` records from a Cyclone3 CODE image. */
function extractWindowsFromCyclone3(cyclone3: Uint8Array): IslandWindow[] {
  const need = F230_OFFSET_IN_CYCLONE3 + F230_COUNT * F230_STRIDE
  if (cyclone3.length < need) {
    throw new Error(
      `Cyclone3 too short for $F230 (${cyclone3.length}); need ≥ ${need}`,
    )
  }
  const windows: IslandWindow[] = []
  for (let r = 0; r < F230_COUNT; r++) {
    const o = F230_OFFSET_IN_CYCLONE3 + r * F230_STRIDE
    const b = cyclone3.subarray(o, o + F230_STRIDE)
    const xHi = b[0]!
    const yHi = b[1]!
    windows.push({
      name: ISLAND_WINDOW_NAMES[r] ?? `OBJ${r}`,
      xHi,
      yHi,
      xMin: (xHi << 8) | b[2]!,
      xMax: (xHi << 8) | b[3]!,
      yMin: (yHi << 8) | b[4]!,
      yMax: (yHi << 8) | b[5]!,
      xRef: b[6]!,
      xRef2: b[7]!,
      yRef: b[8]!,
      yRef2: b[9]!,
      mapPtr: b[0xa]! | (b[0xb]! << 8),
      ovScr: b[0xc]! | (b[0xd]! << 8),
      ovW: b[0xe]!,
      ovH: b[0xf]!,
      ovLabel: b[0x10]! | (b[0x11]! << 8),
      ovAttrHi: b[0x12]!,
    })
  }
  return windows
}

function extractMapFromCyclone3(
  cyclone3: Uint8Array,
  source = 'Cyclone3',
): TerrainMap {
  if (cyclone3.length < MAP_OFFSET_IN_CYCLONE3 + MAP_SIZE) {
    throw new Error(
      `Cyclone3 too short (${cyclone3.length}); need ≥ ${MAP_OFFSET_IN_CYCLONE3 + MAP_SIZE}`,
    )
  }
  const cells = cyclone3.subarray(
    MAP_OFFSET_IN_CYCLONE3,
    MAP_OFFSET_IN_CYCLONE3 + MAP_SIZE,
  )
  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    cells: new Uint8Array(cells),
    source,
    windows: extractWindowsFromCyclone3(cyclone3),
  }
}

/** Windows attached to a map, or stock `$F230` defaults. */
export function windowsForMap(map: TerrainMap): IslandWindow[] {
  return map.windows ?? STOCK_ISLAND_WINDOWS
}

type TapBlock = {
  flag: number
  data: Uint8Array
  header?: {
    type: number
    name: string
    length: number
    param1: number
    param2: number
  }
}

function parseTap(buf: Uint8Array): TapBlock[] {
  const blocks: TapBlock[] = []
  let i = 0
  while (i + 2 <= buf.length) {
    const len = buf[i]! | (buf[i + 1]! << 8)
    i += 2
    if (len < 2 || i + len > buf.length) break
    const flag = buf[i]!
    const payload = buf.subarray(i + 1, i + len - 1)
    i += len
    if (flag === 0 && payload.length >= 17) {
      const nameBytes = payload.subarray(1, 11)
      const name = String.fromCharCode(...nameBytes).replace(/\u0000/g, '').trimEnd()
      blocks.push({
        flag,
        data: payload,
        header: {
          type: payload[0]!,
          name,
          length: payload[11]! | (payload[12]! << 8),
          param1: payload[13]! | (payload[14]! << 8),
          param2: payload[15]! | (payload[16]! << 8),
        },
      })
    } else {
      blocks.push({ flag, data: payload })
    }
  }
  return blocks
}

/** Find Cyclone3 CODE in a TAP and extract the terrain map. */
export function extractMapFromTap(
  tap: ArrayBuffer | Uint8Array,
  fileName?: string,
): TerrainMap {
  const buf = tap instanceof Uint8Array ? tap : new Uint8Array(tap)
  const blocks = parseTap(buf)

  for (let b = 0; b < blocks.length - 1; b++) {
    const hdr = blocks[b]
    const data = blocks[b + 1]
    if (!hdr?.header || data?.flag !== 0xff) continue
    const h = hdr.header
    if (h.type !== 3) continue
    const nameHit = /cyclone3/i.test(h.name)
    const sizeHit =
      h.length === CYCLONE3_LENGTH || data.data.length === CYCLONE3_LENGTH
    const loadHit = h.param1 === CYCLONE3_LOAD
    if (
      nameHit ||
      (sizeHit && loadHit) ||
      (sizeHit && data.data.length >= MAP_OFFSET_IN_CYCLONE3 + MAP_SIZE)
    ) {
      return extractMapFromCyclone3(
        data.data,
        fileName ? `${fileName} → ${h.name || 'CODE'}` : h.name || 'TAP CODE',
      )
    }
  }

  let best: Uint8Array | null = null
  for (const block of blocks) {
    if (block.flag !== 0xff) continue
    if (block.data.length < MAP_OFFSET_IN_CYCLONE3 + MAP_SIZE) continue
    if (!best || block.data.length > best.length) best = block.data
  }
  if (best) {
    return extractMapFromCyclone3(
      best,
      fileName ? `${fileName} (largest CODE)` : 'TAP CODE',
    )
  }

  throw new Error('No Cyclone3 CODE block with terrain map found in TAP')
}

export async function loadStockMap(): Promise<TerrainMap> {
  const res = await fetch(`${import.meta.env.BASE_URL}levels/stock-map-128.bin`)
  if (!res.ok) throw new Error(`Failed to load stock map (${res.status})`)
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.length !== MAP_SIZE) {
    throw new Error(`Stock map size ${buf.length}, expected ${MAP_SIZE}`)
  }
  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    cells: buf,
    source: 'stock-map-128.bin (128×150 extract from CYCLONE.TAP)',
  }
}

function rasterizeTile(
  map: TerrainMap,
  mode: Exclude<MapViewMode, 'world' | 'mmap'>,
): HTMLCanvasElement {
  const w = map.width
  const h = map.height
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const offCtx = off.getContext('2d')!
  const data = offCtx.createImageData(w, h)
  const d = data.data
  const color = mode === 'overview' ? cellRgbaOverview : cellRgba
  for (let i = 0; i < map.cells.length; i++) {
    const [r, g, b, a] = color(map.cells[i]!)
    const o = i * 4
    d[o] = r
    d[o + 1] = g
    d[o + 2] = b
    d[o + 3] = a
  }
  offCtx.putImageData(data, 0, 0)
  return off
}

type PaintMapOptions = {
  /** Pixels per local map cell. */
  scale?: number
  mode?: MapViewMode
  /** Highlighted sector (world view), 0..5 each. */
  focusSector?: { sx: number; sy: number } | null
  /** Draw sector grid + labels in world view. */
  showSectorGrid?: boolean
  /** Draw F230 world AABBs + map-origin markers. */
  showIslandWindows?: boolean
  islandWindows?: IslandWindow[]
}

/**
 * Draw F230 activation AABBs, map-origin cross, and +6..+9 edge thresholds.
 *
 * IX+6/+7/+8/+9 are NOT an island footprint. Cull code at $772b sets blit-path
 * flags: X&lt;+6, X≥+7, Y&lt;+8, Y≥+9 → jump table $78cf (viewport edge copy).
 * Often yRef==yRef2 (zero-height “box”). Cross = world cell where addr==mapPtr.
 */
function paintIslandWindows(
  ctx: CanvasRenderingContext2D,
  scale: number,
  windows: IslandWindow[] = STOCK_ISLAND_WINDOWS,
): void {
  ctx.save()
  ctx.lineJoin = 'miter'
  const fontPx = Math.max(9, scale * 2.5)
  ctx.font = `bold ${fontPx}px ${typeof document !== 'undefined' ? getComputedStyle(document.body).fontFamily : 'sans-serif'}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  for (let i = 0; i < windows.length; i++) {
    const win = windows[i]!
    const hue = (i * 47) % 360
    const stroke = `hsl(${hue} 85% 60%)`
    const x = win.xMin * scale
    const y = win.yMin * scale
    const w = (win.xMax - win.xMin + 1) * scale
    const h = (win.yMax - win.yMin + 1) * scale

    ctx.strokeStyle = stroke
    ctx.lineWidth = Math.max(1, scale)
    ctx.globalAlpha = 0.95
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

    // Edge thresholds as dashed lines clipped to the AABB (not a surrounding rect)
    if (win.xRef2 != null && win.yRef2 != null) {
      const xL = ((win.xHi << 8) | win.xRef) * scale
      const xR = ((win.xHi << 8) | win.xRef2) * scale + scale
      const yT = ((win.yHi << 8) | win.yRef) * scale
      const yB = ((win.yHi << 8) | win.yRef2) * scale + scale
      ctx.strokeStyle = `hsl(${hue} 70% 75%)`
      ctx.lineWidth = Math.max(1, scale * 0.75)
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      // vertical: X = +6 and X = +7
      ctx.moveTo(xL + 0.5, y)
      ctx.lineTo(xL + 0.5, y + h)
      ctx.moveTo(xR - 0.5, y)
      ctx.lineTo(xR - 0.5, y + h)
      // horizontal: Y = +8 and Y = +9 (may coincide)
      ctx.moveTo(x, yT + 0.5)
      ctx.lineTo(x + w, yT + 0.5)
      ctx.moveTo(x, yB - 0.5)
      ctx.lineTo(x + w, yB - 0.5)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Map-origin (xRef,yRef) — atlas_addr == mapPtr here
    const ox = ((win.xHi << 8) | win.xRef) * scale + scale / 2
    const oy = ((win.yHi << 8) | win.yRef) * scale + scale / 2
    const arm = Math.max(3, scale * 2)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = Math.max(1, scale)
    ctx.beginPath()
    ctx.moveTo(ox - arm, oy)
    ctx.lineTo(ox + arm, oy)
    ctx.moveTo(ox, oy - arm)
    ctx.lineTo(ox, oy + arm)
    ctx.stroke()
    ctx.fillStyle = stroke
    ctx.beginPath()
    ctx.arc(ox, oy, Math.max(1.5, scale * 0.75), 0, Math.PI * 2)
    ctx.fill()

    const label = win.name
    const lx = x + 2
    const ly = y + 2
    ctx.fillStyle = '#000000cc'
    ctx.fillRect(lx, ly, ctx.measureText(label).width + 4, fontPx + 3)
    ctx.fillStyle = stroke
    ctx.fillText(label, lx + 2, ly + 1)
  }
  ctx.restore()
}

type PaintInGameMapOptions = {
  scale?: number
  /** Grey Spectrum-style frame. Default true. */
  border?: boolean
  /**
   * Visible width in map pixels (crops right-hand whitespace).
   * Default {@link MMAP_WIDTH} (256). Content + labels fit ~200.
   */
  width?: number
}

/**
 * Paint the in-game pause/M map (routine `$8d5d`).
 * Silhouettes: 4:1 atlas samples (`cell ≥ $0F`) blitted to `ovScr`.
 * Labels: names at `ovLabel` pixel positions.
 */
export function paintInGameMap(
  ctx: CanvasRenderingContext2D,
  map: TerrainMap,
  windows: IslandWindow[] = STOCK_ISLAND_WINDOWS,
  scaleOrOpts: number | PaintInGameMapOptions = 2,
): void {
  const opts: PaintInGameMapOptions =
    typeof scaleOrOpts === 'number' ? { scale: scaleOrOpts } : scaleOrOpts
  const scale = opts.scale ?? 2
  const border = opts.border !== false
  const viewW = Math.min(MMAP_WIDTH, Math.max(1, opts.width ?? MMAP_WIDTH))
  const w = MMAP_WIDTH
  const h = MMAP_HEIGHT
  const img = ctx.createImageData(w, h)
  const d = img.data
  // White paper
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255
    d[i + 1] = 255
    d[i + 2] = 255
    d[i + 3] = 255
  }

  const setGreen = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const o = (y * w + x) * 4
    d[o] = 0
    d[o + 1] = 0xd7
    d[o + 2] = 0
    d[o + 3] = 255
  }

  const atlasLen = map.width * map.height
  for (const win of windows) {
    if (
      win.ovScr == null ||
      win.ovW == null ||
      win.ovH == null ||
      win.ovW <= 0 ||
      win.ovH <= 0
    ) {
      continue
    }
    const { x: sx, y: sy } = spectrumDfToXY(win.ovScr)
    // Game: HL = mapPtr; INC H; INC HL; INC HL → mapPtr+$102
    let rowOff = win.mapPtr + 0x102 - MAP_BASE
    for (let row = 0; row < win.ovH; row++) {
      let left = win.ovW
      let ax = rowOff
      let px = sx
      while (left > 0) {
        let byte = 0
        for (let bit = 0; bit < 8; bit++) {
          byte <<= 1
          if (left > 0) {
            if (ax >= 0 && ax < atlasLen && map.cells[ax]! >= 0x0f) byte |= 1
            ax += 4
            left--
          }
        }
        for (let b = 0; b < 8; b++) {
          if (byte & (0x80 >> b)) setGreen(px + b, sy + row)
        }
        px += 8
      }
      rowOff += 512 // INC H × 2 → +4 atlas rows
    }
  }

  if (border) {
    // Grey border (approx of frame blit)
    for (let x = 0; x < w; x++) {
      for (const y of [0, 1, 2, h - 3, h - 2, h - 1]) {
        const o = (y * w + x) * 4
        d[o] = 0xc0
        d[o + 1] = 0xc0
        d[o + 2] = 0xc0
      }
    }
    for (let y = 0; y < h; y++) {
      for (const x of [0, 1, 2, w - 3, w - 2, w - 1]) {
        const o = (y * w + x) * 4
        d[o] = 0xc0
        d[o + 1] = 0xc0
        d[o + 2] = 0xc0
      }
    }
  }

  const tmp = document.createElement('canvas')
  tmp.width = w
  tmp.height = h
  tmp.getContext('2d')!.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = false
  // Crop right whitespace when viewW < full Spectrum width
  ctx.drawImage(
    tmp,
    0,
    0,
    viewW,
    h,
    0,
    0,
    viewW * scale,
    h * scale,
  )

  // Labels + compass (canvas space)
  ctx.save()
  ctx.imageSmoothingEnabled = false
  const fontPx = Math.max(8, 5 * scale)
  ctx.font = `${fontPx}px monospace`
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#000'
  for (const win of windows) {
    if (win.ovLabel == null) continue
    const { x, y } = spectrumDfToXY(win.ovLabel)
    if (x >= viewW) continue
    const label = MMAP_DISPLAY_NAMES[win.name] ?? win.name
    ctx.fillText(label, x * scale, y * scale)
  }
  // Compass rose (bottom-right of visible area)
  const cx = (viewW - 24) * scale
  const cy = (h - 28) * scale
  ctx.strokeStyle = '#000'
  ctx.fillStyle = '#000'
  ctx.lineWidth = Math.max(1, scale)
  ctx.beginPath()
  ctx.moveTo(cx, cy + 16 * scale)
  ctx.lineTo(cx, cy)
  ctx.lineTo(cx - 4 * scale, cy + 6 * scale)
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + 4 * scale, cy + 6 * scale)
  ctx.stroke()
  ctx.font = `bold ${fontPx}px monospace`
  ctx.fillText('N', cx - 3 * scale, cy - fontPx - 2)
  ctx.restore()
}

/** Paint one tile, or the full 6×6 world with the tile repeated. */
export function paintTerrainMap(
  ctx: CanvasRenderingContext2D,
  map: TerrainMap,
  options: PaintMapOptions = {},
): void {
  const scale = options.scale ?? 4
  const mode = options.mode ?? 'tile'
  const showGrid = options.showSectorGrid ?? true
  const showWindows = options.showIslandWindows ?? mode === 'world'
  const windows = options.islandWindows ?? windowsForMap(map)
  const focus = options.focusSector ?? null

  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  if (mode === 'mmap') {
    paintInGameMap(ctx, map, windows, scale)
    return
  }

  const tileMode: Exclude<MapViewMode, 'world' | 'mmap'> =
    mode === 'overview' ? 'overview' : 'tile'
  const tile = rasterizeTile(map, tileMode)

  if (mode === 'overview') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  }

  if (mode !== 'world') {
    ctx.drawImage(tile, 0, 0, map.width * scale, map.height * scale)
    return
  }

  // Sparse world: paint atlas through F230 island windows (not 36× tile stamp).
  const worldCells = buildWorldFromAtlas(map, windows)
  const sectorPx = SECTOR_SIZE * scale
  ctx.fillStyle = '#081432'
  ctx.fillRect(0, 0, WORLD_WIDTH * scale, WORLD_HEIGHT * scale)

  if (scale === 1) {
    const img = ctx.createImageData(WORLD_WIDTH, WORLD_HEIGHT)
    const d = img.data
    for (let i = 0; i < worldCells.length; i++) {
      const [r, g, b, a] = cellRgba(worldCells[i]!)
      const o = i * 4
      d[o] = r
      d[o + 1] = g
      d[o + 2] = b
      d[o + 3] = a
    }
    ctx.putImageData(img, 0, 0)
  } else {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        const c = worldCells[y * WORLD_WIDTH + x]!
        if (!c) continue
        const [r, g, b] = cellRgba(c)
        ctx.fillStyle = `rgb(${r},${g},${b})`
        ctx.fillRect(x * scale, y * scale, scale, scale)
      }
    }
  }

  if (showGrid) {
    ctx.save()
    for (let i = 0; i <= WORLD_SECTORS; i++) {
      const p = i * sectorPx
      ctx.strokeStyle = i === 0 || i === WORLD_SECTORS ? '#3db8a0' : '#3db8a066'
      ctx.lineWidth = i === 0 || i === WORLD_SECTORS ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(p, 0)
      ctx.lineTo(p, WORLD_SECTORS * sectorPx)
      ctx.moveTo(0, p)
      ctx.lineTo(WORLD_SECTORS * sectorPx, p)
      ctx.stroke()
    }

    ctx.font = `${Math.max(10, scale * 3)}px ${getComputedStyle(document.body).fontFamily}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    for (let sy = 0; sy < WORLD_SECTORS; sy++) {
      for (let sx = 0; sx < WORLD_SECTORS; sx++) {
        const label = `${sx},${sy}`
        const x = sx * sectorPx + 4
        const y = sy * sectorPx + 4
        ctx.fillStyle = '#000000aa'
        ctx.fillRect(x - 2, y - 1, ctx.measureText(label).width + 6, scale * 3 + 4)
        ctx.fillStyle = '#e6eef5'
        ctx.fillText(label, x, y)
      }
    }
    ctx.restore()
  }

  if (showWindows) {
    paintIslandWindows(ctx, scale, windows)
  }

  if (focus) {
    const { sx, sy } = focus
    if (sx >= 0 && sx < WORLD_SECTORS && sy >= 0 && sy < WORLD_SECTORS) {
      ctx.strokeStyle = '#f0c14a'
      ctx.lineWidth = 3
      ctx.strokeRect(sx * sectorPx + 1.5, sy * sectorPx + 1.5, sectorPx - 3, sectorPx - 3)
    }
  }
}

/** Map canvas click (CSS pixels relative to canvas) → sector + local cell. */
export function pickWorldCell(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  scale: number,
  mode: MapViewMode,
): { sx: number; sy: number; localX: number; localY: number; globalX: number; globalY: number } | null {
  const rect = canvas.getBoundingClientRect()
  const x = ((clientX - rect.left) / rect.width) * canvas.width
  const y = ((clientY - rect.top) / rect.height) * canvas.height
  const cellX = Math.floor(x / scale)
  const cellY = Math.floor(y / scale)

  if (mode === 'world') {
    if (cellX < 0 || cellY < 0 || cellX >= WORLD_WIDTH || cellY >= WORLD_HEIGHT) {
      return null
    }
    const sx = Math.floor(cellX / SECTOR_SIZE)
    const sy = Math.floor(cellY / SECTOR_SIZE)
    const localX = cellX & 0x7f
    const localY = cellY & 0x7f
    return { sx, sy, localX, localY, globalX: cellX, globalY: cellY }
  }

  if (mode === 'mmap') {
    if (cellX < 0 || cellY < 0 || cellX >= MMAP_WIDTH || cellY >= MMAP_HEIGHT) {
      return null
    }
    return {
      sx: 0,
      sy: 0,
      localX: cellX,
      localY: cellY,
      globalX: cellX,
      globalY: cellY,
    }
  }

  if (cellX < 0 || cellY < 0 || cellX >= MAP_WIDTH || cellY >= MAP_HEIGHT) {
    return null
  }
  return {
    sx: 0,
    sy: 0,
    localX: cellX,
    localY: cellY,
    globalX: cellX,
    globalY: cellY,
  }
}

type AtlasPeek = {
  /** Raw atlas / stamped terrain byte. */
  byte: number
  /** Spectrum address in the dense atlas (`$9300`…). */
  addr: number
  atlasX: number
  atlasY: number
  /** F230 window name when resolved from world coords. */
  island: string | null
}

function hexByte(n: number): string {
  return `$${n.toString(16).toUpperCase().padStart(2, '0')}`
}

function hexWord(n: number): string {
  return `$${n.toString(16).toUpperCase().padStart(4, '0')}`
}

/** Format atlas peek for the editor cursor HUD. */
export function formatAtlasPeek(peek: AtlasPeek): string {
  const where = peek.island
    ? `${peek.island} atlas (${peek.atlasX},${peek.atlasY}) ${hexWord(peek.addr)}`
    : `atlas (${peek.atlasX},${peek.atlasY}) ${hexWord(peek.addr)}`
  return `${hexByte(peek.byte)} · ${where}`
}

/**
 * Resolve the dense-atlas byte under a cursor cell.
 * Tile/overview: direct atlas index. World: F230 sample formula (same as game).
 */
export function peekAtlasUnderCursor(
  atlas: TerrainMap,
  mode: MapViewMode,
  globalX: number,
  globalY: number,
  windows: IslandWindow[] = STOCK_ISLAND_WINDOWS,
): AtlasPeek | null {
  const atlasLen = atlas.width * atlas.height

  if (mode !== 'world') {
    if (
      globalX < 0 ||
      globalY < 0 ||
      globalX >= atlas.width ||
      globalY >= atlas.height
    ) {
      return null
    }
    const local = globalY * atlas.width + globalX
    return {
      byte: atlas.cells[local]!,
      addr: MAP_BASE + local,
      atlasX: globalX,
      atlasY: globalY,
      island: null,
    }
  }

  // Prefer a window whose AABB contains the point and yields a non-sea sample;
  // fall back to first in-bounds sample (sea) so coords still show $00.
  let fallback: AtlasPeek | null = null
  for (const win of windows) {
    if (globalX < win.xMin || globalX > win.xMax) continue
    if (globalY < win.yMin || globalY > win.yMax) continue
    if ((globalX >> 8) !== win.xHi || (globalY >> 8) !== win.yHi) continue
    const local = atlasLocal(win, globalX, globalY, atlasLen)
    if (local == null) continue
    const byte = atlas.cells[local]!
    const peek: AtlasPeek = {
      byte,
      addr: MAP_BASE + local,
      atlasX: local % MAP_WIDTH,
      atlasY: (local / MAP_WIDTH) | 0,
      island: win.name,
    }
    if (byte !== 0) return peek
    if (!fallback) fallback = peek
  }
  return fallback
}

export function mapStats(map: TerrainMap): {
  sea: number
  land: number
  structure: number
} {
  let sea = 0
  let land = 0
  let structure = 0
  for (const c of map.cells) {
    if (c === 0) sea++
    else if (c >= 0x80) structure++
    else land++
  }
  return { sea, land, structure }
}
