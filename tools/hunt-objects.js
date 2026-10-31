import fs from 'fs'
import zlib from 'zlib'

const code = fs.readFileSync('tools/cyclone3.bin')
const loadAddr = 24540
const MAP_OFF = 13056
const MAP_W = 128
const MAP_H = 128
const MAP_SIZE = MAP_W * MAP_H
const map = code.subarray(MAP_OFF, MAP_OFF + MAP_SIZE)

function inMapRegion(off) {
  return off >= MAP_OFF && off < MAP_OFF + MAP_SIZE
}

function cellAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null
  return map[y * MAP_W + x]
}

// Mark special cells that might BE objects painted into terrain ($8x, $9x, $Bx...)
function collectSpecialCells(pred) {
  const pts = []
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const v = map[y * MAP_W + x]
      if (pred(v)) pts.push({ x, y, v, hex: '$' + v.toString(16).padStart(2, '0') })
    }
  }
  return pts
}

const special8 = collectSpecialCells((v) => (v >> 4) === 8)
const special9 = collectSpecialCells((v) => (v >> 4) === 9)
const specialB = collectSpecialCells((v) => (v >> 4) === 0xb)
const specialC = collectSpecialCells((v) => (v >> 4) === 0xc)
console.log('special nibble8 count', special8.length, 'sample', special8.slice(0, 20))
console.log('special nibble9 count', special9.length, 'sample', special9.slice(0, 20))
console.log('special nibbleB count', specialB.length, 'sample', specialB.slice(0, 15))
console.log('special nibbleC count', specialC.length, 'sample', specialC.slice(0, 15))

// Render overlay PNG: sea dark, land gray, $8x red, $9x green, $Bx yellow
function writeRgbPng(path, w, h, rgb /* length w*h*3 */) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 3
      const di = y * (w * 3 + 1) + 1 + x * 3
      raw[di] = rgb[si]
      raw[di + 1] = rgb[si + 1]
      raw[di + 2] = rgb[si + 2]
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
  ihdr[9] = 2 // RGB
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
  fs.writeFileSync(path, png)
}

const rgb = Buffer.alloc(MAP_W * MAP_H * 3)
for (let i = 0; i < MAP_SIZE; i++) {
  const v = map[i]
  const o = i * 3
  const hi = v >> 4
  if (v === 0) {
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
  } else if (hi === 0xb) {
    rgb[o] = 230
    rgb[o + 1] = 210
    rgb[o + 2] = 40
  } else if (hi === 0xc) {
    rgb[o] = 200
    rgb[o + 1] = 80
    rgb[o + 2] = 220
  } else {
    const elev = (v >> 5) & 7
    const g = 40 + elev * 28
    rgb[o] = g
    rgb[o + 1] = g + 20
    rgb[o + 2] = g - 10
  }
}
fs.mkdirSync('tools/map-previews', { recursive: true })
writeRgbPng('tools/map-previews/map-specials.png', MAP_W, MAP_H, rgb)
console.log('wrote tools/map-previews/map-specials.png')

// Object tables OUTSIDE map region: x,y in 0..127, prefer on land, distinct points
function huntTables(recordSize, minCount, maxCount = 24) {
  const results = []
  for (let i = 0; i + recordSize * minCount < code.length; i++) {
    if (inMapRegion(i)) continue
    let ok = 0
    const pts = []
    const seen = new Set()
    for (let k = 0; k < maxCount; k++) {
      const base = i + k * recordSize
      if (base + 1 >= code.length || inMapRegion(base)) break
      const x = code[base]
      const y = code[base + 1]
      if (x > 127 || y > 127) break
      const key = x + ',' + y
      // allow duplicates but track uniqueness
      pts.push({
        x,
        y,
        extra: [...code.subarray(base + 2, base + recordSize)],
        cell: cellAt(x, y),
      })
      seen.add(key)
      ok++
    }
    if (ok < minCount) continue
    const unique = seen.size
    if (unique < Math.min(minCount, 4)) continue
    let onLand = 0
    let nearLand = 0
    for (const p of pts) {
      if (p.cell === null) continue
      if (p.cell !== 0) onLand++
      else {
        // check 1-cell neighborhood
        let nl = false
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const c = cellAt(p.x + dx, p.y + dy)
          if (c && c !== 0) nl = true
        }
        if (nl) nearLand++
      }
    }
    const score = onLand + nearLand * 0.5
    if (score < minCount * 0.6) continue
    // next record out of range helps
    const nextX = code[i + ok * recordSize] ?? 255
    const nextY = code[i + ok * recordSize + 1] ?? 255
    const terminated = nextX > 127 || nextY > 127
    results.push({
      off: i,
      addr: loadAddr + i,
      recordSize,
      count: ok,
      unique,
      onLand,
      nearLand,
      terminated,
      score,
      pts,
    })
    i += Math.max(1, ok * recordSize) - 1
  }
  return results.sort((a, b) => b.score - a.score || b.unique - a.unique)
}

for (const rs of [2, 3, 4, 5, 6]) {
  const hits = huntTables(rs, 5).slice(0, 8)
  console.log(`\n=== tables rs=${rs} ===`)
  for (const h of hits) {
    console.log({
      addr: '$' + h.addr.toString(16),
      count: h.count,
      unique: h.unique,
      onLand: h.onLand,
      nearLand: h.nearLand,
      terminated: h.terminated,
      pts: h.pts.map((p) => ({
        x: p.x,
        y: p.y,
        cell: p.cell === null ? null : '$' + p.cell.toString(16).padStart(2, '0'),
        extra: p.extra,
      })),
    })
  }
}

// Cluster special $8C cells as building footprints
function cluster(points, gap = 2) {
  const unused = points.map((p, i) => i)
  const clusters = []
  while (unused.length) {
    const seed = unused.pop()
    const q = [seed]
    const members = []
    while (q.length) {
      const i = q.pop()
      members.push(points[i])
      for (let u = unused.length - 1; u >= 0; u--) {
        const j = unused[u]
        const a = points[i]
        const b = points[j]
        if (Math.abs(a.x - b.x) <= gap && Math.abs(a.y - b.y) <= gap) {
          unused.splice(u, 1)
          q.push(j)
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

console.log('\n$8x clusters', cluster(special8, 2).slice(0, 20))
console.log('$9x clusters', cluster(special9, 2).slice(0, 15))

fs.writeFileSync(
  'tools/_objects_report.json',
  JSON.stringify(
    {
      special8: special8.length,
      special9: special9.length,
      clusters8: cluster(special8, 2),
      clusters9: cluster(special9, 2),
      tables2: huntTables(2, 5).slice(0, 15),
      tables3: huntTables(3, 5).slice(0, 15),
      tables4: huntTables(4, 5).slice(0, 15),
      tables5: huntTables(5, 5).slice(0, 10),
    },
    null,
    2,
  ),
)
console.log('wrote tools/_objects_report.json')
