import fs from 'fs'
import zlib from 'zlib'

const code = fs.readFileSync('tools/cyclone3.bin')
const LOAD = 0x5fdc
const MAP_OFF = 13092 // $9300
const W = 128
const H = 128
const map = Buffer.from(code.subarray(MAP_OFF, MAP_OFF + W * H))

const hist = new Array(256).fill(0)
for (const b of map) hist[b]++

const classes = { sea: 0, land: 0, structure: 0 }
const byHeight = {}
const byHiNibble = {}
for (const v of map) {
  if (!v) {
    classes.sea++
    continue
  }
  if (v >= 0x80) classes.structure++
  else classes.land++
  const e = (v >> 5) & 7
  byHeight[e] = (byHeight[e] || 0) + 1
  const hi = v >> 4
  byHiNibble[hi] = (byHiNibble[hi] || 0) + 1
}

// structure clusters
function clusters(pred, gap = 2) {
  const pts = []
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (pred(map[y * W + x])) pts.push({ x, y, v: map[y * W + x] })
  const unused = pts.map((_, i) => i)
  const out = []
  while (unused.length) {
    const seed = unused.pop()
    const q = [seed]
    const members = []
    while (q.length) {
      const i = q.pop()
      members.push(pts[i])
      for (let k = unused.length - 1; k >= 0; k--) {
        const j = unused[k]
        if (Math.abs(pts[i].x - pts[j].x) <= gap && Math.abs(pts[i].y - pts[j].y) <= gap) {
          unused.splice(k, 1)
          q.push(j)
        }
      }
    }
    const xs = members.map((m) => m.x)
    const ys = members.map((m) => m.y)
    out.push({
      n: members.length,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      cx: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1),
      cy: +(ys.reduce((a, b) => a + b, 0) / ys.length).toFixed(1),
    })
  }
  return out.sort((a, b) => b.n - a.n)
}

const rgb = Buffer.alloc(W * H * 3)
for (let i = 0; i < W * H; i++) {
  const v = map[i]
  const o = i * 3
  if (!v) {
    rgb[o] = 8
    rgb[o + 1] = 20
    rgb[o + 2] = 50
  } else if (v >= 0x80) {
    // structure: red→magenta by low nibble
    rgb[o] = 200 + (v & 0x0f)
    rgb[o + 1] = 30 + ((v >> 4) & 1) * 80
    rgb[o + 2] = 40
  } else {
    const e = (v >> 5) & 7
    const g = 50 + e * 40
    rgb[o] = g - 10
    rgb[o + 1] = g + 15
    rgb[o + 2] = g - 20
  }
}

function writePng(path, w, h, rgbBuf) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    rgbBuf.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3)
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

fs.mkdirSync('tools/map-previews', { recursive: true })
fs.writeFileSync('tools/map-128.bin', map)
writePng('tools/map-previews/map-128.png', W, H, rgb)
writePng('tools/map-previews/map-specials.png', W, H, rgb)

const meta = {
  spectrumAddress: 0x9300,
  fileOffsetInCyclone3: MAP_OFF,
  width: W,
  height: H,
  size: W * H,
  endAddress: 0x9300 + W * H - 1,
  classes,
  byHeight,
  byHiNibble,
  encoding: {
    sea: '0',
    land: '1..127 — bits 7-5 = elevation (0-3 observed); high nibbles $1/$3/$5 dominate',
    structure: '>= $80 (bit7 set) — game tests CP $80 / JR C at $7e8b; high nibbles $8/$9 common',
    lowBits: 'tile / edge variant within class (not fully mapped to graphics)',
  },
  evidence: [
    'LD HL,$9300 ; LD BC,$48 ; LDIR at $9260 (viewport strip from map base)',
    'LD BC,$80 ; ADD HL,BC at $7846 and $79B3 (row stride 128)',
    '7× ADD HL,HL sites (y<<7) at $776e, $7799, $f45a',
    'LD A,(HL) ; CP $80 ; JR C at $7e8b — structure vs land/sea branch',
    'Land present through row 127 → height 128',
  ],
  structureClusters: clusters((v) => v >= 0x80).slice(0, 25),
  separateObjectTables: {
    status: 'not found in static scan',
    buildingsHelipads: 'encoded in terrain as cells >= $80',
    cratesRefugees:
      'no unique land-coordinate table found before map; likely runtime-generated or alternate encoding — needs emulator watch',
  },
  topBytes: hist
    .map((c, v) => ({ v, hex: '$' + v.toString(16).padStart(2, '0'), c, pct: +((100 * c) / map.length).toFixed(2) }))
    .filter((x) => x.c)
    .sort((a, b) => b.c - a.c)
    .slice(0, 20),
}

fs.writeFileSync('tools/map-128.meta.json', JSON.stringify(meta, null, 2))
console.log(
  JSON.stringify(
    {
      addr: '$9300-$' + meta.endAddress.toString(16),
      size: W * H,
      classes,
      clusters: meta.structureClusters.length,
      top: meta.topBytes.slice(0, 8),
    },
    null,
    2,
  ),
)
