/**
 * Object hunt v2:
 * - locate map-cell compares against $80-$9F (structure tiles)
 * - find short tables of (x,y) that land on $8x/$9x clusters
 * - find terminated records outside the map blob
 */
import fs from 'fs'

const code = fs.readFileSync('tools/cyclone3.bin')
const LOAD = 0x5fdc
const MAP_OFF = 13092
const MAP_ADDR = 0x9300
const W = 128
const H = 120
const MAP_END_OFF = MAP_OFF + W * H
const map = code.subarray(MAP_OFF, MAP_END_OFF)

function at(addr) {
  return addr - LOAD
}
function isMapOff(off) {
  return off >= MAP_OFF && off < MAP_END_OFF
}
function cell(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return -1
  return map[y * W + x]
}
function isStruct(v) {
  const n = v >> 4
  return n === 8 || n === 9
}

// ---- 1) Imm8 compares that look like structure tests ----
const cmpHits = []
for (let i = 0; i < code.length - 2; i++) {
  // CP n  = FE nn
  if (code[i] === 0xfe) {
    const n = code[i + 1]
    if (n >= 0x80 && n <= 0x9f) {
      cmpHits.push({ off: i, addr: LOAD + i, imm: n, kind: 'CP' })
    }
  }
  // AND n = E6 nn  (mask structure bits?)
  if (code[i] === 0xe6) {
    const n = code[i + 1]
    if (n === 0x80 || n === 0xf0 || n === 0xe0 || n === 0xc0) {
      cmpHits.push({ off: i, addr: LOAD + i, imm: n, kind: 'AND' })
    }
  }
}

// ---- 2) Absolute HL/DE/BC loads pointing outside map ----
const absLoads = []
for (let i = 0; i < code.length - 3; i++) {
  const op = code[i]
  if (op === 0x21 || op === 0x11 || op === 0x01) {
    const lo = code[i + 1]
    const hi = code[i + 2]
    const addr = lo | (hi << 8)
    const off = at(addr)
    if (off < 0 || off >= code.length) continue
    if (isMapOff(off)) continue
    // Prefer data-ish regions: before map or after map within cyclone3
    if (off < 0x100) continue // early vectors/code
    absLoads.push({
      at: LOAD + i,
      op: op === 0x21 ? 'HL' : op === 0x11 ? 'DE' : 'BC',
      target: addr,
      targetOff: off,
    })
  }
}

// Score potential tables at each unique target
function scoreTable(off) {
  // Try XY pairs with various encodings
  const results = []
  const encodings = [
    { name: 'xy', stride: 2, read: (p) => ({ x: code[p], y: code[p + 1] }) },
    { name: 'yx', stride: 2, read: (p) => ({ x: code[p + 1], y: code[p] }) },
    {
      name: 'xy_type',
      stride: 3,
      read: (p) => ({ x: code[p], y: code[p + 1], t: code[p + 2] }),
    },
    {
      name: 'type_xy',
      stride: 3,
      read: (p) => ({ t: code[p], x: code[p + 1], y: code[p + 2] }),
    },
    {
      name: 'xy_w',
      stride: 4,
      read: (p) => ({
        x: code[p] | (code[p + 1] << 8),
        y: code[p + 2] | (code[p + 3] << 8),
      }),
    },
  ]
  for (const enc of encodings) {
    for (let count = 4; count <= 40; count++) {
      const end = off + count * enc.stride
      if (end > code.length) break
      if (isMapOff(off) || isMapOff(end - 1)) break
      const pts = []
      let land = 0
      let struct = 0
      let inRange = 0
      let bad = 0
      for (let k = 0; k < count; k++) {
        const p = enc.read(off + k * enc.stride)
        let { x, y } = p
        if (enc.name === 'xy_w') {
          // maybe map address = base + y*128+x → decode
          if (x >= MAP_ADDR && x < MAP_ADDR + W * H) {
            const rel = x - MAP_ADDR
            y = (rel / W) | 0
            x = rel % W
          } else {
            bad++
            continue
          }
        }
        if (x < 0 || x >= W || y < 0 || y >= H) {
          bad++
          continue
        }
        inRange++
        const v = cell(x, y)
        if (v > 0) land++
        if (isStruct(v)) struct++
        pts.push({ x, y, v, t: p.t })
      }
      if (inRange < 4) continue
      if (bad > count * 0.25) continue
      const landRatio = land / inRange
      const structRatio = struct / inRange
      // Prefer points that sit on land, especially structures
      if (landRatio < 0.75) continue
      const score = landRatio * 2 + structRatio * 5 + inRange * 0.05
      results.push({
        off,
        addr: LOAD + off,
        enc: enc.name,
        count,
        landRatio: +landRatio.toFixed(2),
        structRatio: +structRatio.toFixed(2),
        score: +score.toFixed(2),
        sample: pts.slice(0, 8),
      })
    }
  }
  return results
}

const uniqueTargets = [...new Set(absLoads.map((a) => a.targetOff))]
const tableCandidates = []
for (const off of uniqueTargets) {
  // skip dense code: require some zero-ish or low entropy? Just score
  const scored = scoreTable(off)
  tableCandidates.push(...scored)
}
tableCandidates.sort((a, b) => b.score - a.score)

// Also brute-force scan outside map for high structRatio tables (limited)
const brute = []
const scanRegions = [
  [0x800, MAP_OFF], // before map
  [MAP_END_OFF, Math.min(code.length, MAP_END_OFF + 8000)],
]
for (const [start, end] of scanRegions) {
  for (let off = start; off < end - 16; off += 1) {
    // cheap filter: first byte looks like x coord
    const x0 = code[off]
    const y0 = code[off + 1]
    if (x0 >= W || y0 >= H) continue
    if (cell(x0, y0) <= 0) continue
    for (const stride of [2, 3]) {
      let n = 0
      let land = 0
      let struct = 0
      const pts = []
      for (; n < 32; n++) {
        const p = off + n * stride
        if (p + stride > end) break
        const x = code[p]
        const y = code[p + 1]
        if (x >= W || y >= H) break
        const v = cell(x, y)
        if (v < 0) break
        if (v > 0) land++
        if (isStruct(v)) struct++
        pts.push({ x, y, v, t: stride === 3 ? code[p + 2] : undefined })
      }
      if (n < 6) continue
      const landRatio = land / n
      const structRatio = struct / n
      if (landRatio < 0.85) continue
      if (structRatio < 0.4 && landRatio < 0.95) continue
      const score = landRatio * 2 + structRatio * 6 + n * 0.08
      if (score < 4) continue
      brute.push({
        off,
        addr: LOAD + off,
        enc: stride === 2 ? 'xy' : 'xy_type',
        count: n,
        landRatio: +landRatio.toFixed(2),
        structRatio: +structRatio.toFixed(2),
        score: +score.toFixed(2),
        sample: pts.slice(0, 10),
        via: 'brute',
      })
    }
  }
}
brute.sort((a, b) => b.score - a.score)

// Dedup nearby brute hits
const bruteBest = []
for (const c of brute) {
  if (bruteBest.some((b) => Math.abs(b.off - c.off) < 4 && b.enc === c.enc)) continue
  bruteBest.push(c)
  if (bruteBest.length >= 25) break
}

// ---- 3) Structure cell low-bit analysis ----
const structStats = { n8: {}, n9: {}, neighbors: {} }
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const v = cell(x, y)
    const hi = v >> 4
    if (hi !== 8 && hi !== 9) continue
    const key = '$' + v.toString(16).padStart(2, '0')
    const bucket = hi === 8 ? structStats.n8 : structStats.n9
    bucket[key] = (bucket[key] || 0) + 1
  }
}

// ---- 4) Which abs loads point at top table candidates? ----
const topTables = [...tableCandidates.slice(0, 20), ...bruteBest.slice(0, 15)]
const refsToTop = topTables.map((t) => ({
  ...t,
  refs: absLoads
    .filter((a) => Math.abs(a.targetOff - t.off) <= 2)
    .slice(0, 8)
    .map((a) => ({ at: '0x' + a.at.toString(16), op: a.op })),
}))

const report = {
  cmpHits: cmpHits.slice(0, 40),
  cmpHitCount: cmpHits.length,
  absLoadCount: absLoads.length,
  topFromAbsLoads: tableCandidates.slice(0, 15),
  topFromBrute: bruteBest,
  withRefs: refsToTop.filter((t) => t.refs.length).slice(0, 20),
  structByteHist: structStats,
}

fs.writeFileSync('tools/_objects_v2_report.json', JSON.stringify(report, null, 2))
console.log(
  JSON.stringify(
    {
      cmpHits: cmpHits.length,
      absLoads: absLoads.length,
      tableFromLoads: tableCandidates.length,
      topLoads: tableCandidates.slice(0, 5),
      topBrute: bruteBest.slice(0, 5),
      withRefs: refsToTop.filter((t) => t.refs.length).length,
      n8keys: Object.keys(structStats.n8).length,
      n9keys: Object.keys(structStats.n9).length,
    },
    null,
    2,
  ),
)
