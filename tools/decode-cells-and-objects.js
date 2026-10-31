import fs from 'fs'

const code = fs.readFileSync('tools/cyclone3.bin')
const loadAddr = 24540
const MAP_OFF = 13056
const MAP_W = 128
const MAP_H = 128
const map = code.subarray(MAP_OFF, MAP_OFF + MAP_W * MAP_H)
const mapAddr = loadAddr + MAP_OFF

function addrOf(off) {
  return loadAddr + off
}

function hex(n, w = 4) {
  return '$' + n.toString(16).toUpperCase().padStart(w, '0')
}

// --- 1) Cell value analysis ---
const hist = new Array(256).fill(0)
for (const b of map) hist[b]++
const used = hist
  .map((c, v) => ({ v, c, pct: (100 * c) / map.length }))
  .filter((x) => x.c > 0)
  .sort((a, b) => b.c - a.c)

console.log('=== unique cell values ===')
console.log(
  used.map((x) => ({
    hex: hex(x.v, 2),
    dec: x.v,
    bin: x.v.toString(2).padStart(8, '0'),
    count: x.c,
    pct: +x.pct.toFixed(2),
    hi: (x.v >> 4) & 0xf,
    lo: x.v & 0xf,
    b76: (x.v >> 6) & 3,
    b54: (x.v >> 4) & 3,
    b30: x.v & 0x0f,
    b40: x.v & 0x1f,
    b73: (x.v >> 3) & 0x1f,
  })),
)

// Cluster by bit masks
function groupBy(fn) {
  const g = new Map()
  for (const x of used) {
    if (x.v === 0) continue
    const k = fn(x.v)
    if (!g.has(k)) g.set(k, [])
    g.get(k).push(x)
  }
  return [...g.entries()]
    .map(([k, vals]) => ({
      key: k,
      count: vals.reduce((s, v) => s + v.c, 0),
      values: vals.map((v) => hex(v.v, 2)),
    }))
    .sort((a, b) => b.count - a.count)
}

console.log('\n=== group by high nibble ===')
console.log(groupBy((v) => 'hi=' + ((v >> 4) & 0xf)))
console.log('\n=== group by low nibble ===')
console.log(groupBy((v) => 'lo=' + (v & 0xf)))
console.log('\n=== group by bits7-5 ===')
console.log(groupBy((v) => 'b75=' + ((v >> 5) & 7)))
console.log('\n=== group by bits4-0 (maybe height) ===')
console.log(groupBy((v) => 'b40=' + (v & 0x1f)).slice(0, 20))
console.log('\n=== group by bits7-3 ===')
console.log(groupBy((v) => 'b73=' + ((v >> 3) & 0x1f)).slice(0, 20))

// Neighbor transitions: what values border sea vs land interior
function neighborsOf(targetPred) {
  const next = new Map()
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const v = map[y * MAP_W + x]
      if (!targetPred(v)) continue
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue
        const n = map[ny * MAP_W + nx]
        next.set(n, (next.get(n) || 0) + 1)
      }
    }
  }
  return [...next.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([v, c]) => ({ v: hex(v, 2), c }))
}

console.log('\n=== neighbors of sea(0) ===')
console.log(neighborsOf((v) => v === 0))
console.log('\n=== neighbors of $30 (48) ===')
console.log(neighborsOf((v) => v === 48))
console.log('\n=== neighbors of $58 (88) ===')
console.log(neighborsOf((v) => v === 88))

// Height-like: if low bits increase toward island centers
function sampleIslandProfiles() {
  // find land blobs and measure value vs distance-to-sea
  const dist = new Int16Array(MAP_W * MAP_H).fill(-1)
  const q = []
  for (let i = 0; i < map.length; i++) {
    if (map[i] === 0) {
      dist[i] = 0
      q.push(i)
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi]
    const x = i % MAP_W
    const y = (i / MAP_W) | 0
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue
      const ni = ny * MAP_W + nx
      if (dist[ni] !== -1) continue
      dist[ni] = dist[i] + 1
      q.push(ni)
    }
  }
  const byDist = new Map()
  for (let i = 0; i < map.length; i++) {
    if (map[i] === 0) continue
    const d = dist[i]
    if (!byDist.has(d)) byDist.set(d, [])
    byDist.get(d).push(map[i])
  }
  const summary = [...byDist.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, 12)
    .map(([d, vals]) => {
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length
      const avgLo = vals.reduce((s, v) => s + (v & 0x1f), 0) / vals.length
      const avgHi = vals.reduce((s, v) => s + ((v >> 5) & 7), 0) / vals.length
      return {
        dist: d,
        n: vals.length,
        avg: +avg.toFixed(1),
        avgLo5: +avgLo.toFixed(2),
        avgHi3: +avgHi.toFixed(2),
        mode: hex(
          vals.sort(
            (a, b) =>
              vals.filter((x) => x === b).length - vals.filter((x) => x === a).length,
          )[0],
          2,
        ),
      }
    })
  return summary
}

console.log('\n=== land value vs distance-from-sea ===')
console.log(sampleIslandProfiles())

// --- 2) Find code references to map base address ---
// Z80: LD HL,nn ; LD DE,nn ; LD BC,nn  — little endian immediates
function findImm16(target) {
  const lo = target & 0xff
  const hi = (target >> 8) & 0xff
  const hits = []
  for (let i = 0; i + 2 < code.length; i++) {
    if (code[i] === lo && code[i + 1] === hi) {
      const prev = i > 0 ? code[i - 1] : null
      hits.push({
        off: i - (prev !== null ? 1 : 0),
        addr: addrOf(i - (prev !== null ? 1 : 0)),
        opcode: prev,
        opcodeHex: prev !== null ? hex(prev, 2) : null,
        as: hex(target),
      })
    }
  }
  return hits
}

const mapRefs = findImm16(mapAddr)
console.log('\n=== immediates == mapAddr', hex(mapAddr), 'count', mapRefs.length)
console.log(mapRefs.slice(0, 40))

// Also check nearby round addresses often used as map base
for (const a of [mapAddr - 1, mapAddr, mapAddr + 1, 0x9000, 0x9100, 0x9200, 0x92d0, 0x92dc, 0x9300]) {
  const hits = findImm16(a)
  if (hits.length) console.log('imm', hex(a), 'hits', hits.length, 'first', hits.slice(0, 5))
}

// LD HL,nn opcodes: 0x21
const ldHlMap = mapRefs.filter((h) => h.opcode === 0x21)
console.log('\n=== LD HL,mapAddr ===', ldHlMap)

// --- 3) Object table hunt ---
// Look for structured records near map or in low DATA
// Helipad / crate coords often small tables of x,y within 0..127

function scanCoordRecords(recordSize, minCount, maxCoord = 127) {
  const results = []
  for (let i = 0; i + recordSize * minCount < code.length; i++) {
    let ok = 0
    const pts = []
    for (let k = 0; k < 64; k++) {
      const base = i + k * recordSize
      if (base + 1 >= code.length) break
      const x = code[base]
      const y = code[base + 1]
      // remaining bytes of record should not all be random high
      if (x > maxCoord || y > maxCoord) break
      // prefer land or near-land for gameplay objects? optional
      ok++
      pts.push({ x, y, extra: [...code.subarray(base + 2, base + recordSize)] })
      if (ok >= 40) break
    }
    if (ok >= minCount) {
      // score: how many points land on non-sea if inside map
      let onLand = 0
      let inMap = 0
      for (const p of pts) {
        if (p.x < MAP_W && p.y < MAP_H) {
          inMap++
          if (map[p.y * MAP_W + p.x] !== 0) onLand++
        }
      }
      const landRatio = inMap ? onLand / inMap : 0
      if (landRatio >= 0.4 || (ok >= 12 && landRatio >= 0.25)) {
        results.push({
          off: i,
          addr: addrOf(i),
          recordSize,
          count: ok,
          onLand,
          inMap,
          landRatio: +landRatio.toFixed(2),
          pts: pts.slice(0, 16),
        })
      }
      i += ok * recordSize - 1
    }
  }
  return results.sort((a, b) => b.landRatio - a.landRatio || b.count - a.count)
}

console.log('\n=== coord tables recordSize=2 ===')
console.log(scanCoordRecords(2, 8).slice(0, 12))
console.log('\n=== coord tables recordSize=3 ===')
console.log(scanCoordRecords(3, 6).slice(0, 12))
console.log('\n=== coord tables recordSize=4 ===')
console.log(scanCoordRecords(4, 5).slice(0, 12))
console.log('\n=== coord tables recordSize=5 ===')
console.log(scanCoordRecords(5, 5).slice(0, 8))

// Fixed-count tables: exactly 5 crates, ~14 islands, etc.
function findExactCountTables(recordSize, count, maxCoord = 127) {
  const out = []
  const need = recordSize * count
  for (let i = 0; i + need <= code.length; i++) {
    let ok = true
    const pts = []
    for (let k = 0; k < count; k++) {
      const x = code[i + k * recordSize]
      const y = code[i + k * recordSize + 1]
      if (x > maxCoord || y > maxCoord) {
        ok = false
        break
      }
      pts.push({
        x,
        y,
        extra: [...code.subarray(i + k * recordSize + 2, i + (k + 1) * recordSize)],
      })
    }
    if (!ok) continue
    // terminator-ish next byte often 0xff or out of range
    const nextX = code[i + need] ?? 255
    const nextY = code[i + need + 1] ?? 255
    const terminated = nextX > maxCoord || nextY > maxCoord || nextX === 0xff
    let onLand = 0
    for (const p of pts) {
      if (p.x < MAP_W && p.y < MAP_H && map[p.y * MAP_W + p.x] !== 0) onLand++
    }
    if (onLand >= Math.ceil(count * 0.5)) {
      out.push({
        off: i,
        addr: addrOf(i),
        recordSize,
        count,
        onLand,
        terminated,
        pts,
      })
    }
  }
  return out.sort((a, b) => b.onLand - a.onLand).slice(0, 20)
}

console.log('\n=== exact 5-point tables (crates?) rs=2..4 ===')
for (const rs of [2, 3, 4]) {
  console.log('rs', rs, findExactCountTables(rs, 5).slice(0, 6))
}
console.log('\n=== exact 14-point tables (islands?) rs=2..4 ===')
for (const rs of [2, 3, 4]) {
  console.log('rs', rs, findExactCountTables(rs, 14).slice(0, 4))
}

// Save JSON report
const report = {
  mapAddr: hex(mapAddr),
  mapOff: MAP_OFF,
  cellValues: used.slice(0, 40),
  byHighNibble: groupBy((v) => (v >> 4) & 0xf),
  byLowNibble: groupBy((v) => v & 0xf),
  byBits75: groupBy((v) => (v >> 5) & 7),
  distanceProfiles: sampleIslandProfiles(),
  mapImmRefs: mapRefs.slice(0, 50),
  ldHlMap,
  coords2: scanCoordRecords(2, 8).slice(0, 15),
  coords3: scanCoordRecords(3, 6).slice(0, 15),
  coords4: scanCoordRecords(4, 5).slice(0, 15),
  crates5: {
    rs2: findExactCountTables(2, 5).slice(0, 10),
    rs3: findExactCountTables(3, 5).slice(0, 10),
    rs4: findExactCountTables(4, 5).slice(0, 10),
  },
  islands14: {
    rs2: findExactCountTables(2, 14).slice(0, 8),
    rs3: findExactCountTables(3, 14).slice(0, 8),
    rs4: findExactCountTables(4, 14).slice(0, 8),
  },
}

fs.writeFileSync('tools/_decode_report.json', JSON.stringify(report, null, 2))
console.log('\nwrote tools/_decode_report.json')
