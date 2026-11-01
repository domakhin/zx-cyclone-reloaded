/** Cyclone terrain map ($9300, 128×128) — see docs/level-format.md */

export const MAP_WIDTH = 128
export const MAP_HEIGHT = 128

const MAP_SIZE = MAP_WIDTH * MAP_HEIGHT
/** Offset of map inside Cyclone3 CODE block (Spectrum $9300 − $5FDC). */
const MAP_OFFSET_IN_CYCLONE3 = 13092
const CYCLONE3_LOAD = 0x5fdc
const CYCLONE3_LENGTH = 40630

export type TerrainMap = {
  width: number
  height: number
  cells: Uint8Array
  source: string
}

export type MapViewMode = 'heightfield' | 'overview'

function elevation(cell: number): number {
  if (cell === 0) return 0
  return (cell >> 5) & 7
}

function cellRgba(cell: number): [number, number, number, number] {
  if (cell === 0) return [8, 20, 50, 255]
  if (cell >= 0x80) {
    const rim = (cell >> 4) === 0x9
    return rim ? [40, 200, 60, 255] : [220, 40, 40, 255]
  }
  const e = elevation(cell)
  const g = 50 + Math.min(e, 3) * 40
  return [g - 10, g + 15, g - 20, 255]
}

function cellRgbaOverview(cell: number): [number, number, number, number] {
  if (cell === 0) return [255, 255, 255, 255]
  if (cell >= 0x80) return [0, 160, 0, 255]
  return [40, 200, 40, 255]
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
  }
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
  const res = await fetch('/levels/stock-map-128.bin')
  if (!res.ok) throw new Error(`Failed to load stock map (${res.status})`)
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.length !== MAP_SIZE) {
    throw new Error(`Stock map size ${buf.length}, expected ${MAP_SIZE}`)
  }
  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    cells: buf,
    source: 'stock-map-128.bin (extracted from CYCLONE.TAP)',
  }
}

export function paintTerrainMap(
  ctx: CanvasRenderingContext2D,
  map: TerrainMap,
  scale = 4,
  mode: MapViewMode = 'heightfield',
): void {
  const w = map.width
  const h = map.height
  const img = ctx.createImageData(w, h)
  const d = img.data
  const color = mode === 'overview' ? cellRgbaOverview : cellRgba
  for (let i = 0; i < map.cells.length; i++) {
    const [r, g, b, a] = color(map.cells[i]!)
    const o = i * 4
    d[o] = r
    d[o + 1] = g
    d[o + 2] = b
    d[o + 3] = a
  }

  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const offCtx = off.getContext('2d')!
  offCtx.putImageData(img, 0, 0)

  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  if (mode === 'overview') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  }
  ctx.drawImage(off, 0, 0, w * scale, h * scale)
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
