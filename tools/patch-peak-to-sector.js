/**
 * Move PEAK island window from sector (4,0) → (1,2) and write:
 *   - public/levels/island-windows-peak-1-2.json
 *   - image/CYCLONE-peak-1-2.TAP  (F230 record patched + checksum)
 *
 * Atlas bytes / mapPtr are unchanged — only world placement fields.
 *
 * Usage: node tools/patch-peak-to-sector.js
 */
import fs from 'fs'

const LOAD = 0x5fdc
const F230 = 0xf230
const STRIDE = 0x14
const PEAK_INDEX = 4 // BANANA.. order
const FROM_SECTOR = [4, 0]
const TO_SECTOR = [1, 2]

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
    const start = i
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
      header = {
        type: payload[0],
        name,
        length: payload[11] | (payload[12] << 8),
        param1: payload[13] | (payload[14] << 8),
        param2: payload[15] | (payload[16] << 8),
      }
    }
    blocks.push({
      start,
      len,
      flag,
      payloadStart: i + 1,
      checksumOffset: i + len - 1,
      payload,
      checksum,
      header,
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
    // overview / extras left as raw for round-trip
    overview: [...b.subarray(0xc, 0x14)],
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

/**
 * Translate activation/origin by whole sectors.
 * M-map: silhouette (+0c) and label (+10) screen addresses shift by
 * (dSx,dSy)*32 pixels (world/4); +12 attr high follows label Y.
 * mapPtr / ovW / ovH unchanged.
 */
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
      `Translated AABB crosses 256-page boundary (x ${xMin}..${xMax}, y ${yMin}..${yMax})`,
    )
  }
  if (ox >> 8 !== xMin >> 8 || oy >> 8 !== yMin >> 8) {
    throw new Error('Origin page mismatch after translate')
  }

  const oldScr = b[0xc] | (b[0xd] << 8)
  const oldLab = b[0x10] | (b[0x11] << 8)
  const scrP = dfToXY(oldScr)
  const labP = dfToXY(oldLab)
  const newScr = xyToDf(scrP.x + dpx, scrP.y + dpy)
  const newLabY = labP.y + dpy
  const newLab = xyToDf(labP.x + dpx, newLabY)

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
  // mapPtr +0a/+0b unchanged
  out[0xc] = newScr & 0xff
  out[0xd] = newScr >> 8
  // +0e/+0f silhouette size unchanged
  out[0x10] = newLab & 0xff
  out[0x11] = newLab >> 8
  out[0x12] = attrHi(newLabY)
  return out
}

function windowJson(b, name) {
  const w = decodeWindow(b, name)
  const scr = b[0xc] | (b[0xd] << 8)
  const lab = b[0x10] | (b[0x11] << 8)
  const { overview: _o, ...rest } = w
  return {
    ...rest,
    ovScr: scr,
    ovW: b[0xe],
    ovH: b[0xf],
    ovLabel: lab,
    ovAttrHi: b[0x12],
    ovScrPix: dfToXY(scr),
    ovLabelPix: dfToXY(lab),
  }
}

// --- main ---
const tapPath = 'image/CYCLONE.TAP'
const tap = Uint8Array.from(fs.readFileSync(tapPath))
const blocks = parseTap(tap)

const hdrIdx = blocks.findIndex(
  (b) => b.header && /cyclone3/i.test(b.header.name),
)
if (hdrIdx < 0 || !blocks[hdrIdx + 1] || blocks[hdrIdx + 1].flag !== 0xff) {
  throw new Error('Cyclone3 CODE block not found in TAP')
}
const dataBlock = blocks[hdrIdx + 1]
const code = Uint8Array.from(dataBlock.payload)

const peakOff = F230 - LOAD + PEAK_INDEX * STRIDE
const stockPeak = code.subarray(peakOff, peakOff + STRIDE)
const stockDecoded = decodeWindow(stockPeak, 'PEAK')
if (
  stockDecoded.sector[0] !== FROM_SECTOR[0] ||
  stockDecoded.sector[1] !== FROM_SECTOR[1]
) {
  throw new Error(
    `Expected stock PEAK sector (${FROM_SECTOR}), got (${stockDecoded.sector})`,
  )
}

const dSx = TO_SECTOR[0] - FROM_SECTOR[0]
const dSy = TO_SECTOR[1] - FROM_SECTOR[1]
const patchedPeak = translateWindowBytes(stockPeak, dSx, dSy)
const patchedDecoded = decodeWindow(patchedPeak, 'PEAK')
if (
  patchedDecoded.sector[0] !== TO_SECTOR[0] ||
  patchedDecoded.sector[1] !== TO_SECTOR[1]
) {
  throw new Error(
    `Patch failed: expected sector (${TO_SECTOR}), got (${patchedDecoded.sector})`,
  )
}

// Build full windows JSON from patched cyclone3 image
const patchedCode = Uint8Array.from(code)
patchedCode.set(patchedPeak, peakOff)

const windows = []
for (let r = 0; r < 14; r++) {
  const o = F230 - LOAD + r * STRIDE
  const bytes =
    r === PEAK_INDEX ? patchedPeak : patchedCode.subarray(o, o + STRIDE)
  windows.push(windowJson(bytes, NAMES[r]))
}

const doc = {
  source: 'Cyclone3 $F230 stride $14 (patched)',
  patch: {
    island: 'PEAK',
    fromSector: FROM_SECTOR,
    toSector: TO_SECTOR,
    deltaWorld: [dSx * 128, dSy * 128],
    mapPtrUnchanged: true,
    overviewTranslated: true,
    overviewPixelScale: 4,
    note: 'AABB/origin + M-map silhouette/label DF addresses translated by whole sectors; atlas mapPtr/ovW/ovH unchanged.',
  },
  base: F230,
  stride: STRIDE,
  formula:
    'atlas_addr = mapPtr + ((wy&255)-yRef)*128 + ((wx&255)-xRef) when (wx>>8)==xHi && (wy>>8)==yHi && xMin..xMax,yMin..yMax',
  evidence:
    'routines $775e/$7777/$7789; cull $76e9; BONE sector (3,1), BANANA center sector (5,3)',
  windows,
}

const jsonOut = 'public/levels/island-windows-peak-1-2.json'
fs.writeFileSync(jsonOut, JSON.stringify(doc, null, 2))
fs.writeFileSync(
  'tools/island-windows-peak-1-2.json',
  JSON.stringify(doc, null, 2),
)

// Patch TAP payload + checksum
const outTap = Uint8Array.from(tap)
outTap.set(patchedPeak, dataBlock.payloadStart + peakOff)
const newPayload = outTap.subarray(
  dataBlock.payloadStart,
  dataBlock.payloadStart + dataBlock.payload.length,
)
outTap[dataBlock.checksumOffset] = xorChecksum(dataBlock.flag, newPayload)

const tapOut = 'image/CYCLONE-peak-1-2.TAP'
fs.writeFileSync(tapOut, outTap)

// Verify checksum + decode
const verify = parseTap(outTap)
const vData = verify[hdrIdx + 1]
const vCk = xorChecksum(vData.flag, vData.payload)
if (vCk !== vData.checksum) throw new Error('Patched TAP checksum mismatch')
const vPeak = vData.payload.subarray(peakOff, peakOff + STRIDE)
const vDec = decodeWindow(vPeak, 'PEAK')

console.log('stock PEAK', {
  sector: stockDecoded.sector,
  box: [stockDecoded.xMin, stockDecoded.xMax, stockDecoded.yMin, stockDecoded.yMax],
  ref: [
    (stockDecoded.xHi << 8) | stockDecoded.xRef,
    (stockDecoded.yHi << 8) | stockDecoded.yRef,
  ],
  mapPtr: `$${stockDecoded.mapPtr.toString(16)}`,
})
console.log('patched PEAK', {
  sector: vDec.sector,
  box: [vDec.xMin, vDec.xMax, vDec.yMin, vDec.yMax],
  ref: [(vDec.xHi << 8) | vDec.xRef, (vDec.yHi << 8) | vDec.yRef],
  mapPtr: `$${vDec.mapPtr.toString(16)}`,
  bytes: [...vPeak].map((x) => x.toString(16).padStart(2, '0')).join(' '),
})
console.log('wrote', jsonOut)
console.log('wrote', tapOut)
console.log('TAP size', outTap.length, '(stock', tap.length, ')')
