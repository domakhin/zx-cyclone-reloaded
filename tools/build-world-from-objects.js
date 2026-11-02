/**
 * Reconstruct 768×768 world from F230 object windows.
 *
 * Per-object mapping (from $7789 / $775e):
 *   when (wx>>8)==IX+0 and (wy>>8)==IX+1 and wx/wy in AABB(+2..+5):
 *   atlas_addr = mapPtr + ((wy&0xff) - IX+8)*128 + ((wx&0xff) - IX+6)
 *
 * Anchors: BONE sector (3,1); BANANA object centers near (5,3).
 */
import fs from 'fs'

const code = fs.readFileSync('tools/cyclone3.bin')
const LOAD = 0x5fdc
const MAP = 0x9300
const W = 128
const atlas = (() => {
  try {
    return fs.readFileSync('tools/map-128.bin')
  } catch {
    return code.subarray(MAP - LOAD, MAP - LOAD + W * 150)
  }
})()
const AH = (atlas.length / W) | 0

const NAMES = [
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
]

const WORLD = 768
const world = new Uint8Array(WORLD * WORLD) // sea

const objs = []
for (let r = 0; r < 14; r++) {
  const o = 0xf230 - LOAD + r * 0x14
  const b = [...code.subarray(o, o + 0x14)]
  const obj = {
    name: NAMES[r],
    xhi: b[0],
    yhi: b[1],
    xmin: (b[0] << 8) | b[2],
    xmax: (b[0] << 8) | b[3],
    ymin: (b[1] << 8) | b[4],
    ymax: (b[1] << 8) | b[5],
    x0: b[6],
    x1: b[7],
    y0: b[8],
    y1: b[9],
    mapPtr: b[0xa] | (b[0xb] << 8),
    screen: [b[0xc], b[0xd]],
  }
  objs.push(obj)
}

// Label atlas components and assign each to the window with max overlap
const label = new Int32Array(atlas.length).fill(-1)
const compSizes = []
for (let y = 0; y < AH; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x
    if (label[i] >= 0 || !atlas[i]) continue
    const id = compSizes.length
    const q = [i]
    label[i] = id
    let n = 0
    while (q.length) {
      const p = q.pop()
      const px = p % W
      const py = (p / W) | 0
      n++
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = px + dx
        const ny = py + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= AH) continue
        const ni = ny * W + nx
        if (label[ni] >= 0 || !atlas[ni]) continue
        label[ni] = id
        q.push(ni)
      }
    }
    compSizes.push(n)
  }
}

const overlap = compSizes.map(() => new Int32Array(objs.length))
const forward = compSizes.map(() => new Int32Array(objs.length))
for (let r = 0; r < objs.length; r++) {
  const obj = objs[r]
  const ox = (obj.xhi << 8) | obj.x0
  const oy = (obj.yhi << 8) | obj.y0
  for (let wy = obj.ymin; wy <= obj.ymax; wy++) {
    if (wy >> 8 !== obj.yhi) continue
    for (let wx = obj.xmin; wx <= obj.xmax; wx++) {
      if (wx >> 8 !== obj.xhi) continue
      const local = obj.mapPtr + ((wy & 0xff) - obj.y0) * W + ((wx & 0xff) - obj.x0) - MAP
      if (local < 0 || local >= atlas.length || !atlas[local]) continue
      const id = label[local]
      overlap[id][r]++
      if (wx >= ox && wy >= oy) forward[id][r]++
    }
  }
}

const owner = new Int32Array(compSizes.length).fill(-1)
for (let id = 0; id < compSizes.length; id++) {
  let best = -1
  let bestScore = -1
  for (let r = 0; r < objs.length; r++) {
    const score = forward[id][r] * 10000 + overlap[id][r]
    if (score > bestScore) {
      bestScore = score
      best = r
    }
  }
  if (bestScore > 0) owner[id] = best
}

const allow = objs.map(() => new Set())
for (let id = 0; id < compSizes.length; id++) {
  if (owner[id] >= 0) allow[owner[id]].add(id)
}
// No steal-fallback: empty windows (e.g. LUKELAND) must not take LAGOON's 2nd blob.

let painted = 0
let land = 0
let oob = 0
let filtered = 0
const perObj = []

for (let r = 0; r < objs.length; r++) {
  const obj = objs[r]
  let cells = 0
  let landCells = 0
  let minWx = 9999,
    maxWx = -1,
    minWy = 9999,
    maxWy = -1
  let minAx = 9999,
    maxAx = -1,
    minAy = 9999,
    maxAy = -1

  for (let wy = obj.ymin; wy <= obj.ymax; wy++) {
    for (let wx = obj.xmin; wx <= obj.xmax; wx++) {
      if (wx >= WORLD || wy >= WORLD) continue
      if (wx >> 8 !== obj.xhi || wy >> 8 !== obj.yhi) continue

      const axOff = (wx & 0xff) - obj.x0
      const ayOff = (wy & 0xff) - obj.y0
      const addr = obj.mapPtr + ayOff * W + axOff
      const local = addr - MAP
      if (local < 0 || local >= atlas.length) {
        oob++
        continue
      }
      const ax = local % W
      const ay = (local / W) | 0
      const cell = atlas[local]
      cells++
      painted++
      if (!cell) continue
      if (!allow[r].has(label[local])) {
        filtered++
        continue
      }
      world[wy * WORLD + wx] = cell
      landCells++
      land++
      minWx = Math.min(minWx, wx)
      maxWx = Math.max(maxWx, wx)
      minWy = Math.min(minWy, wy)
      maxWy = Math.max(maxWy, wy)
      minAx = Math.min(minAx, ax)
      maxAx = Math.max(maxAx, ax)
      minAy = Math.min(minAy, ay)
      maxAy = Math.max(maxAy, ay)
    }
  }

  const cx = (obj.xmin + obj.xmax) / 2
  const cy = (obj.ymin + obj.ymax) / 2
  perObj.push({
    name: obj.name,
    aabb: `${obj.xmin}-${obj.xmax},${obj.ymin}-${obj.ymax}`,
    sector: `${cx >> 7},${cy >> 7}`,
    anchorWorld: `${(obj.xhi << 8) | obj.x0},${(obj.yhi << 8) | obj.y0}`,
    mapPtr: `$${obj.mapPtr.toString(16)}`,
    cells,
    landCells,
    comps: [...allow[r]].map((id) => `c${id}(n=${compSizes[id]})`).join(','),
    landWorld:
      landCells > 0
        ? `(${minWx}-${maxWx},${minWy}-${maxWy}) sec(${minWx >> 7}-${maxWx >> 7},${minWy >> 7}-${maxWy >> 7})`
        : '-',
    landAtlas: landCells > 0 ? `(${minAx}-${maxAx},${minAy}-${maxAy})` : '-',
  })
}

console.log('=== per-object window paint (component-filtered) ===')
for (const p of perObj) {
  console.log(
    p.name.padEnd(12),
    `sec(${p.sector})`,
    `aabb ${p.aabb}`,
    `anchor ${p.anchorWorld}`,
    p.mapPtr,
    `cells=${p.cells} land=${p.landCells}`,
    `owned ${p.comps || '-'}`,
    `landW ${p.landWorld}`,
    `atlas ${p.landAtlas}`,
  )
}

console.log('\npainted', painted, 'land', land, 'filtered', filtered, 'oob', oob)

// Sector occupancy
console.log('\n=== sector land counts ===')
for (let sy = 0; sy < 6; sy++) {
  const row = []
  for (let sx = 0; sx < 6; sx++) {
    let n = 0
    for (let y = sy * 128; y < sy * 128 + 128; y++)
      for (let x = sx * 128; x < sx * 128 + 128; x++) if (world[y * WORLD + x]) n++
    row.push(String(n).padStart(5))
  }
  console.log(`sy=${sy}`, row.join(' '))
}

// Check anchors
const banana = perObj.find((p) => p.name === 'BANANA')
const bone = perObj.find((p) => p.name === 'BONE')
console.log('\nBANANA sector center', banana.sector, 'land', banana.landWorld)
console.log('BONE sector center', bone.sector, 'land', bone.landWorld)

// Write world bin + simple PPM preview (downscaled)
fs.writeFileSync('tools/world-768.bin', world)
console.log('wrote tools/world-768.bin')

const SCALE = 4
const pw = WORLD / SCALE
const ph = WORLD / SCALE
const ppm = Buffer.alloc(pw * ph * 3)
for (let y = 0; y < ph; y++) {
  for (let x = 0; x < pw; x++) {
    let v = 0
    for (let dy = 0; dy < SCALE; dy++)
      for (let dx = 0; dx < SCALE; dx++) {
        const c = world[(y * SCALE + dy) * WORLD + (x * SCALE + dx)]
        if (c > v) v = c
      }
    const i = (y * pw + x) * 3
    if (v === 0) {
      ppm[i] = 20
      ppm[i + 1] = 40
      ppm[i + 2] = 80
    } else if (v >= 0x80) {
      ppm[i] = 220
      ppm[i + 1] = 60
      ppm[i + 2] = 60
    } else {
      const e = (v >> 5) & 7
      ppm[i] = 40 + e * 30
      ppm[i + 1] = 100 + e * 25
      ppm[i + 2] = 40
    }
  }
}
// draw sector grid faintly
fs.writeFileSync(
  'tools/world-768.ppm',
  Buffer.concat([Buffer.from(`P6\n${pw} ${ph}\n255\n`), ppm]),
)
console.log('wrote tools/world-768.ppm')

// Also: does expanding beyond AABB (full 256 strip) add more land?
console.log('\n=== expand to full hi-byte strip land probe ===')
for (const obj of objs) {
  let extra = 0
  for (let wy = obj.yhi << 8; wy < (obj.yhi << 8) + 256 && wy < WORLD; wy++) {
    for (let wx = obj.xhi << 8; wx < (obj.xhi << 8) + 256 && wx < WORLD; wx++) {
      if (wx >= obj.xmin && wx <= obj.xmax && wy >= obj.ymin && wy <= obj.ymax) continue
      const axOff = (wx & 0xff) - obj.x0
      const ayOff = (wy & 0xff) - obj.y0
      const local = obj.mapPtr + ayOff * W + axOff - MAP
      if (local < 0 || local >= atlas.length) continue
      if (atlas[local]) extra++
    }
  }
  if (extra) console.log(obj.name, 'extra land outside AABB but in hi-strip:', extra)
}
