/**
 * Export F230 island/object windows used for atlas→world mapping.
 */
import fs from 'fs'

const code = fs.readFileSync('tools/cyclone3.bin')
const LOAD = 0x5fdc
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

const windows = []
for (let r = 0; r < 14; r++) {
  const o = 0xf230 - LOAD + r * 0x14
  const b = [...code.subarray(o, o + 0x14)]
  const xMin = (b[0] << 8) | b[2]
  const xMax = (b[0] << 8) | b[3]
  const yMin = (b[1] << 8) | b[4]
  const yMax = (b[1] << 8) | b[5]
  const cx = (xMin + xMax) / 2
  const cy = (yMin + yMax) / 2
  windows.push({
    name: NAMES[r],
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
  })
}

const doc = {
  source: 'Cyclone3 $F230 stride $14',
  base: 0xf230,
  stride: 0x14,
  formula:
    'atlas_addr = mapPtr + ((wy&255)-yRef)*128 + ((wx&255)-xRef) when (wx>>8)==xHi && (wy>>8)==yHi && xMin..xMax,yMin..yMax',
  evidence: 'routines $775e/$7777/$7789; cull $76e9; BONE sector (3,1), BANANA center sector (5,3)',
  windows,
}

fs.writeFileSync('tools/island-windows.json', JSON.stringify(doc, null, 2))
fs.writeFileSync('public/levels/island-windows.json', JSON.stringify(doc, null, 2))
console.log('wrote tools/island-windows.json and public/levels/island-windows.json')
for (const w of windows) {
  console.log(
    w.name.padEnd(12),
    `sec(${w.sector})`,
    `box(${w.xMin}-${w.xMax},${w.yMin}-${w.yMax})`,
    `ref(${(w.xHi << 8) | w.xRef},${(w.yHi << 8) | w.yRef})`,
    `map$${w.mapPtr.toString(16)}`,
  )
}
