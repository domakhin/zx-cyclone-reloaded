import fs from 'fs'
import zlib from 'zlib'

const code = fs.readFileSync('tools/cyclone3.bin')
const loadAddr = 24540
const MAP_OFF = 13092 // $9300
const W = 128
const H = 120
const map = code.subarray(MAP_OFF, MAP_OFF + W * H)

const hist = new Array(256).fill(0)
for (const b of map) hist[b]++
const used = hist
  .map((c, v) => ({ v, c, pct: +((100 * c) / map.length).toFixed(2) }))
  .filter((x) => x.c)
  .sort((a, b) => b.c - a.c)

const dist = new Int16Array(W * H).fill(-1)
const q = []
for (let i = 0; i < map.length; i++) {
  if (map[i] === 0) {
    dist[i] = 0
    q.push(i)
  }
}
for (let qi = 0; qi < q.length; qi++) {
  const i = q[qi]
  const x = i % W
  const y = (i / W) | 0
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
    const ni = ny * W + nx
    if (dist[ni] !== -1) continue
    dist[ni] = dist[i] + 1
    q.push(ni)
  }
}

const byDist = []
for (let d = 1; d <= 12; d++) {
  const vals = []
  for (let i = 0; i < map.length; i++) if (map[i] && dist[i] === d) vals.push(map[i])
  if (!vals.length) continue
  const avgHi3 = vals.reduce((s, v) => s + ((v >> 5) & 7), 0) / vals.length
  const mode = vals.sort(
    (a, b) => vals.filter((x) => x === b).length - vals.filter((x) => x === a).length,
  )[0]
  byDist.push({
    dist: d,
    n: vals.length,
    avgBits75: +avgHi3.toFixed(2),
    mode: '$' + mode.toString(16).padStart(2, '0'),
  })
}

function specials(pred) {
  const p = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = map[y * W + x]
      if (pred(v)) p.push({ x, y, v })
    }
  }
  return p
}

function cluster(points, gap = 2) {
  const unused = points.map((_, i) => i)
  const clusters = []
  while (unused.length) {
    const seed = unused.pop()
    const qq = [seed]
    const members = []
    while (qq.length) {
      const i = qq.pop()
      members.push(points[i])
      for (let k = unused.length - 1; k >= 0; k--) {
        const j = unused[k]
        const a = points[i]
        const b = points[j]
        if (Math.abs(a.x - b.x) <= gap && Math.abs(a.y - b.y) <= gap) {
          unused.splice(k, 1)
          qq.push(j)
        }
      }
    }
    const xs = members.map((m) => m.x)
    const ys = members.map((m) => m.y)
    clusters.push({
      n: members.length,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      cx: +(xs.reduce((s, v) => s + v, 0) / xs.length).toFixed(1),
      cy: +(ys.reduce((s, v) => s + v, 0) / ys.length).toFixed(1),
    })
  }
  return clusters.sort((a, b) => b.n - a.n)
}

const c8 = cluster(specials((v) => (v >> 4) === 8))
const c9 = cluster(specials((v) => (v >> 4) === 9))

const rgb = Buffer.alloc(W * H * 3)
for (let i = 0; i < W * H; i++) {
  const v = map[i]
  const o = i * 3
  const hi = v >> 4
  if (!v) {
    rgb[o] = 8
    rgb[o + 1] = 20
    rgb[o + 2] = 50
  } else if (hi === 8) {
    rgb[o] = 220
    rgb[o + 1] = 40
    rgb[o + 2] = 40
  } else if (hi === 9) {
    rgb[o] = 40
    rgb[o + 1] = 200
    rgb[o + 2] = 60
  } else {
    const e = (v >> 5) & 7
    const g = 40 + e * 28
    rgb[o] = g
    rgb[o + 1] = g + 20
    rgb[o + 2] = g - 10
  }
}

function writePng(path, w, h, rgbBuf) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 3
      const di = y * (w * 3 + 1) + 1 + x * 3
      raw[di] = rgbBuf[si]
      raw[di + 1] = rgbBuf[si + 1]
      raw[di + 2] = rgbBuf[si + 2]
    }
  }
  const compressed = zlib.deflateSync(raw)
  const crc32 = (buf) => {
    let c = ~0
    for (const b of buf) {
      c ^= b
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    return ~c >>> 0
  }
  const chunk = (t, d) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(d.length)
    const tb = Buffer.from(t)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([tb, d])))
    return Buffer.concat([len, tb, d, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  fs.writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', compressed),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

fs.writeFileSync('tools/map-128.bin', map)
writePng('tools/map-previews/map-specials.png', W, H, rgb)

const meta = {
  spectrumAddress: 0x9300,
  fileOffsetInCyclone3: MAP_OFF,
  width: W,
  height: H,
  size: W * H,
  endAddress: loadAddr + MAP_OFF + W * H - 1,
  evidence: [
    'LD HL,$9300 ; LD BC,72 ; LDIR at $9260',
    'ADD HL,BC with BC=128 at $7846 and $79B3 (row stride)',
    'bits 7-5 increase with distance-from-sea',
    'high-nibble $8/$9 form compact structure footprints on islands',
  ],
  topBytes: used.slice(0, 15),
  elevationByDistance: byDist,
  cellEncoding: {
    sea: 0,
    bits75: 'height / relief class (rises toward island interiors)',
    nibble1: 'low shore band ($10..)',
    nibble3: 'mid land fill ($30..) — most common land',
    nibble5: 'higher relief ($58..)',
    nibble8: 'structures embedded in terrain (buildings) — red overlay',
    nibble9: 'structure rim / pad-like cells — green overlay',
    lowBits: 'pattern / edge variant within class (not fully decoded)',
  },
  embeddedStructureClusters: {
    nibble8: c8.slice(0, 20),
    nibble9: c9.slice(0, 15),
  },
  separateObjectTables: {
    status: 'not confirmed',
    note: 'Coord-table heuristics mostly hit false positives (code patterns or map bytes). Buildings/pads appear painted into the terrain grid via high nibbles $8/$9 rather than a separate XY list. Crate/refugee tables may be generated at runtime or use a different encoding.',
  },
}

fs.writeFileSync('tools/map-128.meta.json', JSON.stringify(meta, null, 2))
console.log(
  JSON.stringify(
    {
      addr: '0x9300',
      size: W * H,
      clusters8: c8.length,
      clusters9: c9.length,
      elev: byDist.slice(0, 6),
      top: used.slice(0, 8),
    },
    null,
    2,
  ),
)
