import { WORLD_WIDTH } from './cycloneMap'

/** Heli / camera world words (`$7500` / `$7502`). */
const HELI_X_ADDR = 0x7500

/** M-map cyclone icon char cells (`$754b` / `$754c`). */
const CYCLONE_OV_X_ADDR = 0x754b
const CYCLONE_OV_Y_ADDR = 0x754c

/** One contiguous peek covering heli + cyclone state. */
export const MINIMAP_PEEK = { start: HELI_X_ADDR, length: 0x60 } as const

type PeekRange = { start: number; length: number; data: Uint8Array }

type MinimapActors = {
  heli: { globalX: number; globalY: number } | null
  cycloneCell: { x: number; y: number } | null
}

function wrapWorld(word: number): number {
  const w = word & 0xffff
  return ((w % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH
}

function findCovering(
  ranges: PeekRange[],
  addr: number,
): { data: Uint8Array; start: number } | null {
  for (const r of ranges) {
    if (addr >= r.start && addr < r.start + r.length) {
      return { data: r.data, start: r.start }
    }
  }
  return null
}

/** Read heli + cyclone icon positions from a `$7500` probe dump. */
export function readMinimapActors(ranges: PeekRange[]): MinimapActors {
  const cover = findCovering(ranges, HELI_X_ADDR)
  if (!cover || HELI_X_ADDR + 4 > cover.start + cover.data.length) {
    return { heli: null, cycloneCell: null }
  }

  const off = HELI_X_ADDR - cover.start
  const xWord = cover.data[off]! | (cover.data[off + 1]! << 8)
  const yWord = cover.data[off + 2]! | (cover.data[off + 3]! << 8)
  const heli = { globalX: wrapWorld(xWord), globalY: wrapWorld(yWord) }

  let cycloneCell: MinimapActors['cycloneCell'] = null
  if (CYCLONE_OV_Y_ADDR < cover.start + cover.data.length) {
    const ox = CYCLONE_OV_X_ADDR - cover.start
    cycloneCell = { x: cover.data[ox]!, y: cover.data[ox + 1]! }
  }

  return { heli, cycloneCell }
}

/**
 * World cell (0..767) → M-map pixel.
 * Same scale as silhouette blits: `global >> 2` (= `(global >> 5) * 8`).
 */
export function worldToMmapPixel(globalX: number, globalY: number): {
  x: number
  y: number
} {
  return {
    x: wrapWorld(globalX) >> 2,
    y: wrapWorld(globalY) >> 2,
  }
}

/** Overview char cell → M-map pixel (cyclone icon). */
export function overviewCellToMmapPixel(
  cellX: number,
  cellY: number,
): { x: number; y: number } {
  return { x: (cellX & 0xff) << 3, y: (cellY & 0xff) << 3 }
}
