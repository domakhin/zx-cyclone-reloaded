/**
 * Apply whole-sector island moves (BASE fixed) and write:
 *   - public/levels/island-windows-outer-ring.json
 *   - image/CYCLONE-outer-ring.TAP  (all moved $F230 records + checksum)
 *
 * Usage: node tools/propose-island-rearrange.js
 */
import fs from 'fs'

const LOAD = 0x5fdc
const F230 = 0xf230
const STRIDE = 0x14

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

function xorChecksum(flag, payload) {
  let x = flag
  for (const b of payload) x ^= b
  return x & 0xff
}

function parseTap(buf) {
  const blocks = []
  let i = 0
  while (i + 2 <= buf.length) {
    const len = buf[i] | (buf[i + 1] << 8)
    i += 2
    if (len < 2 || i + len > buf.length) break
    const flag = buf[i]
    const payload = buf.subarray(i + 1, i + len - 1)
    const checksum = buf[i + len - 1]
    let header = null
    if (flag === 0 && payload.length >= 17) {
      const name = String.fromCharCode(...payload.subarray(1, 11))
        .replace(/\0/g, '')
        .trimEnd()
      header = { name }
    }
    blocks.push({
      flag,
      payload,
      checksum,
      header,
      payloadStart: i + 1,
      checksumOffset: i + len - 1,
    })
    i += len
  }
  return blocks
}

function decodeWindow(b, name) {
  const xMin = (b[0] << 8) | b[2]
  const xMax = (b[0] << 8) | b[3]
  const yMin = (b[1] << 8) | b[4]
  const yMax = (b[1] << 8) | b[5]
  const cx = (xMin + xMax) / 2
  const cy = (yMin + yMax) / 2
  return {
    name,
    xHi: b[0],
    yHi: b[1],
    xMinLo: b[2],
    xMaxLo: b[3],
    yMinLo: b[4],
    yMaxLo: b[5],
    xRef: b[6],
    xRef2: b[7],
    yRef: b[8],
    yRef2: b[9],
    mapPtr: b[0xa] | (b[0xb] << 8),
    xMin,
    xMax,
    yMin,
    yMax,
    sector: [cx >> 7, cy >> 7],
  }
}

function dfToXY(addr) {
  const y =
    ((addr & 0x0700) >> 8) | ((addr & 0x00e0) >> 2) | ((addr & 0x1800) >> 5)
  const x = (addr & 0x1f) * 8
  return { x, y }
}

function xyToDf(x, y) {
  const cx = (x >> 3) & 0x1f
  return (
    0x4000 |
    ((y & 0xc0) << 5) |
    ((y & 0x07) << 8) |
    ((y & 0x38) << 2) |
    cx
  )
}

function attrHi(y) {
  return 0x58 + (y >> 6)
}

function translateWindowBytes(b, dSx, dSy) {
  const dx = dSx * 128
  const dy = dSy * 128
  const dpx = dSx * 32
  const dpy = dSy * 32
  const xHi = b[0]
  const yHi = b[1]
  const xMin = ((xHi << 8) | b[2]) + dx
  const xMax = ((xHi << 8) | b[3]) + dx
  const yMin = ((yHi << 8) | b[4]) + dy
  const yMax = ((yHi << 8) | b[5]) + dy
  const ox = ((xHi << 8) | b[6]) + dx
  const oy = ((yHi << 8) | b[8]) + dy
  const ox2 = ((xHi << 8) | b[7]) + dx
  const oy2 = ((yHi << 8) | b[9]) + dy

  if (xMin >> 8 !== xMax >> 8 || yMin >> 8 !== yMax >> 8) {
    throw new Error(
      `AABB crosses page (x ${xMin}..${xMax}, y ${yMin}..${yMax})`,
    )
  }
  if (ox >> 8 !== xMin >> 8 || oy >> 8 !== yMin >> 8) {
    throw new Error('Origin page mismatch')
  }
  if (xMin < 0 || yMin < 0 || xMax >= 768 || yMax >= 768) {
    throw new Error(`World OOB ${xMin}..${xMax},${yMin}..${yMax}`)
  }

  const oldScr = b[0xc] | (b[0xd] << 8)
  const oldLab = b[0x10] | (b[0x11] << 8)
  const scrP = dfToXY(oldScr)
  const labP = dfToXY(oldLab)
  const newScrX = scrP.x + dpx
  const newScrY = scrP.y + dpy
  const newLabX = labP.x + dpx
  const newLabY = labP.y + dpy
  const ovW = b[0xe]
  const ovH = b[0xf]
  if (
    newScrX < 0 ||
    newLabX < 0 ||
    newScrY < 0 ||
    newLabY < 0 ||
    newScrX + ovW > 256 ||
    newLabX + 8 > 256 ||
    newScrY + ovH > 192 ||
    newLabY + 8 > 192
  ) {
    throw new Error(
      `Overview OOB scr(${newScrX},${newScrY}) lab(${newLabX},${newLabY})`,
    )
  }

  const newScr = xyToDf(newScrX, newScrY)
  const newLab = xyToDf(newLabX, newLabY)
  const out = Uint8Array.from(b)
  out[0] = xMin >> 8
  out[1] = yMin >> 8
  out[2] = xMin & 0xff
  out[3] = xMax & 0xff
  out[4] = yMin & 0xff
  out[5] = yMax & 0xff
  out[6] = ox & 0xff
  out[7] = ox2 & 0xff
  out[8] = oy & 0xff
  out[9] = oy2 & 0xff
  out[0xc] = newScr & 0xff
  out[0xd] = newScr >> 8
  out[0x10] = newLab & 0xff
  out[0x11] = newLab >> 8
  out[0x12] = attrHi(newLabY)
  return out
}

function windowJson(b, name) {
  const w = decodeWindow(b, name)
  const scr = b[0xc] | (b[0xd] << 8)
  const lab = b[0x10] | (b[0x11] << 8)
  return {
    ...w,
    ovScr: scr,
    ovW: b[0xe],
    ovH: b[0xf],
    ovLabel: lab,
    ovAttrHi: b[0x12],
    ovScrPix: dfToXY(scr),
    ovLabelPix: dfToXY(lab),
  }
}

/**
 * Outer Ring Rescue — BASE stays hub; other islands pushed toward rim.
 * Longer ferry hops, more open-water cyclone exposure, clearer NW/SE chains.
 */
const TARGETS = {
  BANANA: [5, 4], // deep SE outpost (was 5,3)
  ORTE: [4, 4], // south rim (was 3,4; one sector up from 4,5)
  KOKOLA: [0, 2], // west of BASE (was 2,1)
  LAGOON: [1, 0], // north-west station (was 1,1; x=0 illegal for AABB)
  PEAK: [5, 0], // NE tip (was 4,0)
  BASE: [2, 2], // fixed hub
  GILLIGANS: [3, 0], // north rim (was 2,0; west moves break M-map)
  RED: [3, 4], // south (was 3,4 stock; one sector up from 3,5)
  SKEG: [1, 4], // SW column (stock 1,4; one sector up from 1,5)
  BONE: [4, 1], // NE mid (was 3,1)
  GIANTS: [4, 2], // due east of BASE (was 3,2)
  CLAW: [4, 3], // SE mid (was 3,3)
  LUKELAND: [0, 4], // SW (stock 0,4; one sector up from 0,5)
  ENTERPRISE: [0, 1], // NW approach west of BASE (was 0,3)
}

const CONCEPT = {
  id: 'outer-ring',
  title: 'Outer Ring Rescue',
  summary:
    'BASE stays the hub. Every other island is pushed toward the map rim so ferry legs are longer, the inner sea around BASE opens up for cyclone drama, and islands form clearer NW / SE chains.',
  whyInteresting: [
    'BASE is the only safe center — refuel/drop-off trips cross empty water.',
    'NW chain (KOKOLA→ENTERPRISE→LAGOON) vs east spine (BONE→GIANTS→CLAW→BANANA) forces route choices.',
    'Corner outposts (PEAK NE, LUKELAND/SKEG SW, BANANA SE, KOKOLA NW) stretch the search pattern.',
    'South rim (ORTE/RED/SKEG) sits far from BASE so late crates are a fuel/cyclone gamble.',
    'Whole-sector moves keep atlas mapPtrs valid; M-map silhouettes track the new layout.',
  ],
}

const tap = Uint8Array.from(fs.readFileSync('image/CYCLONE.TAP'))
const blocks = parseTap(tap)
const hdrIdx = blocks.findIndex(
  (b) => b.header && /cyclone3/i.test(b.header.name),
)
if (hdrIdx < 0 || blocks[hdrIdx + 1]?.flag !== 0xff) {
  throw new Error('Cyclone3 CODE block not found')
}
const code = Uint8Array.from(blocks[hdrIdx + 1].payload)

const stockBytes = []
const stockMeta = []
for (let r = 0; r < 14; r++) {
  const o = F230 - LOAD + r * STRIDE
  const b = Uint8Array.from(code.subarray(o, o + STRIDE))
  stockBytes.push(b)
  stockMeta.push(decodeWindow(b, NAMES[r]))
}

const moves = []
const windows = []
const patchedBytes = []
const failures = []

for (let r = 0; r < 14; r++) {
  const name = NAMES[r]
  const from = stockMeta[r].sector
  const to = TARGETS[name]
  if (!to) throw new Error(`Missing target for ${name}`)
  const dSx = to[0] - from[0]
  const dSy = to[1] - from[1]

  if (name === 'BASE' && (dSx !== 0 || dSy !== 0)) {
    throw new Error('BASE must stay fixed')
  }

  try {
    const out =
      dSx === 0 && dSy === 0
        ? stockBytes[r]
        : translateWindowBytes(stockBytes[r], dSx, dSy)
    const json = windowJson(out, name)
    if (json.sector[0] !== to[0] || json.sector[1] !== to[1]) {
      throw new Error(
        `Sector mismatch expected ${to}, got ${json.sector}`,
      )
    }
    patchedBytes.push(out)
    windows.push(json)
    moves.push({
      island: name,
      fromSector: from,
      toSector: to,
      deltaSectors: [dSx, dSy],
      deltaWorld: [dSx * 128, dSy * 128],
      moved: dSx !== 0 || dSy !== 0,
    })
    console.log(
      `${name.padEnd(11)} ${from} -> ${to}  ${dSx === 0 && dSy === 0 ? 'STAY' : 'OK'}`,
    )
  } catch (err) {
    failures.push({ name, from, to, error: String(err.message || err) })
    console.log(`${name.padEnd(11)} ${from} -> ${to}  FAIL ${err.message}`)
  }
}

if (failures.length) {
  console.error('\nFix targets; aborted write.')
  process.exit(1)
}

const dataBlock = blocks[hdrIdx + 1]
const outTap = Uint8Array.from(tap)
for (let r = 0; r < 14; r++) {
  const o = F230 - LOAD + r * STRIDE
  outTap.set(patchedBytes[r], dataBlock.payloadStart + o)
}
const newPayload = outTap.subarray(
  dataBlock.payloadStart,
  dataBlock.payloadStart + dataBlock.payload.length,
)
outTap[dataBlock.checksumOffset] = xorChecksum(dataBlock.flag, newPayload)

const verify = parseTap(outTap)
const vData = verify[hdrIdx + 1]
const vCk = xorChecksum(vData.flag, vData.payload)
if (vCk !== vData.checksum) throw new Error('Patched TAP checksum mismatch')
for (let r = 0; r < 14; r++) {
  const o = F230 - LOAD + r * STRIDE
  const dec = decodeWindow(vData.payload.subarray(o, o + STRIDE), NAMES[r])
  const to = TARGETS[NAMES[r]]
  if (dec.sector[0] !== to[0] || dec.sector[1] !== to[1]) {
    throw new Error(
      `TAP verify ${NAMES[r]}: expected sector ${to}, got ${dec.sector}`,
    )
  }
}

const doc = {
  source: 'Cyclone3 $F230 stride $14 (patched)',
  concept: CONCEPT,
  patch: {
    kind: 'multi-island-sector-translate',
    baseFixed: true,
    mapPtrUnchanged: true,
    overviewTranslated: true,
    overviewPixelScale: 4,
    tap: 'image/CYCLONE-outer-ring.TAP',
    publicTap: 'public/taps/CYCLONE-outer-ring.TAP',
    note: 'AABB/origin + M-map silhouette/label DF addresses translated by whole sectors; atlas mapPtr/ovW/ovH unchanged. BASE unmoved.',
    moves: moves.filter((m) => m.moved),
  },
  base: F230,
  stride: STRIDE,
  formula:
    'atlas_addr = mapPtr + ((wy&255)-yRef)*128 + ((wx&255)-xRef) when (wx>>8)==xHi && (wy>>8)==yHi && xMin..xMax,yMin..yMax',
  evidence:
    'routines $775e/$7777/$7789; cull $76e9; BONE sector (3,1), BANANA center sector (5,3)',
  windows,
}

const outPath = 'public/levels/island-windows-outer-ring.json'
const tapOut = 'image/CYCLONE-outer-ring.TAP'
const tapPublic = 'public/taps/CYCLONE-outer-ring.TAP'
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2))
fs.writeFileSync(
  'tools/island-windows-outer-ring.json',
  JSON.stringify(doc, null, 2),
)
fs.writeFileSync(tapOut, outTap)
fs.writeFileSync(tapPublic, outTap)
console.log('\nwrote', outPath)
console.log('wrote', tapOut, `(${outTap.length} bytes)`)
console.log('wrote', tapPublic)
console.log('moved', moves.filter((m) => m.moved).length, 'islands; BASE fixed')
