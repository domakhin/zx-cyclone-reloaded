/**
 * Decode F230 object records as world AABB + atlas map pointer.
 * Validate against BANANA@(5,2) and BONE@(3,1).
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

// Disassemble the visibility test at $76e9 carefully
function disRange(addr, n) {
  let i = addr - LOAD
  const end = i + n
  const lines = []
  while (i < end) {
    const a = LOAD + i
    const b0 = code[i]
    let t = `DB $${b0.toString(16)}`
    let len = 1
    if (b0 === 0x3a) {
      t = `LD A,($${(code[i + 1] | (code[i + 2] << 8)).toString(16)})`
      len = 3
    } else if (b0 === 0xdd && code[i + 1] === 0xbe) {
      t = `CP (IX+$${code[i + 2].toString(16)})`
      len = 3
    } else if (b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38) {
      const d = (code[i + 1] << 24) >> 24
      t = `JR ${{ 0x20: 'NZ', 0x28: 'Z', 0x30: 'NC', 0x38: 'C' }[b0]} $${(a + 2 + d) & 0xffff}`
      len = 2
    } else if (b0 === 0x18) {
      const d = (code[i + 1] << 24) >> 24
      t = `JR $${(a + 2 + d) & 0xffff}`
      len = 2
    } else if (b0 === 0x3d) t = 'DEC A'
    else if (b0 === 0x3c) t = 'INC A'
    else if (b0 === 0xcb && code[i + 1] === 0xd1) {
      t = 'SET 2,C'
      len = 2
    } else if (b0 === 0xcb && code[i + 1] === 0xd9) {
      t = 'SET 3,C'
      len = 2
    } else if (b0 === 0xcb && code[i + 1] === 0xe1) {
      t = 'SET 4,C'
      len = 2
    } else if (b0 === 0xcb && code[i + 1] === 0xe9) {
      t = 'SET 5,C'
      len = 2
    } else if (b0 === 0x01) {
      t = `LD BC,$${(code[i + 1] | (code[i + 2] << 8)).toString(16)}`
      len = 3
    } else if (b0 === 0xdd && code[i + 1] === 0x09) {
      t = 'ADD IX,BC'
      len = 2
    } else if (b0 === 0x3e) {
      t = `LD A,$${code[i + 1].toString(16)}`
      len = 2
    } else if (b0 === 0xdd && code[i + 1] === 0x77) {
      t = `LD (IX+$${code[i + 2].toString(16)}),A`
      len = 3
    } else if (b0 === 0xc9) t = 'RET'
    lines.push(`$${a.toString(16)}  ${t}`)
    i += len
  }
  return lines.join('\n')
}

console.log('=== object cull / bounds test ===')
console.log(disRange(0x76e9, 90))

console.log('\n=== object records ===')
for (let r = 0; r < 14; r++) {
  const o = 0xf230 - LOAD + r * 0x14
  const b = [...code.subarray(o, o + 0x14)]
  const hex = b.map((x) => x.toString(16).padStart(2, '0')).join(' ')

  // Hypothesis: +0 Xhi, +1 Yhi are MSBs of world position;
  // +2,+3 X range lows; +4,+5 Y range lows — OR full LE words at +2 and +4
  const xWordA = b[2] | (b[0] << 8) // lo at +2, hi at +0
  const yWordA = b[4] | (b[1] << 8)
  const xWordB = b[3] | (b[0] << 8)
  const yWordB = b[5] | (b[1] << 8)
  const xLE = b[2] | (b[3] << 8)
  const yLE = b[4] | (b[5] << 8)
  const mapPtr = b[0x0a] | (b[0x0b] << 8)

  const sec = (w) => `${w >> 7},${(w >> 7)}`.replace(/(\d+),\1/, (_, s) => {
    void _
    return String(w >> 7)
  })
  // fix
  const sx = (w) => w >> 7
  const sy = (w) => w >> 7

  console.log(
    `\n${NAMES[r]}  ${hex}`,
  )
  console.log(
    `  hi(${b[0]},${b[1]})  ` +
      `x@+2hi0=${xWordA} secX=${xWordA >> 7}  y@+4hi1=${yWordA} secY=${yWordA >> 7}  |  ` +
      `x@+3hi0=${xWordB} secX=${xWordB >> 7}  y@+5hi1=${yWordB} secY=${yWordB >> 7}`,
  )
  console.log(
    `  LE +2/+4: x=${xLE}(${xLE >> 7}) y=${yLE}(${yLE >> 7})  mapPtr=$${mapPtr.toString(16)}`,
  )
  console.log(
    `  +6=${b[6]} +7=${b[7]} +8=${b[8]} +9=${b[9]}  screen(+0c)=(${b[0xc]},${b[0xd]}) (+10)=(${b[0x10]},${b[0x11]})`,
  )
}

// Try: world X = (IX+0)<<8 | IX+2, world Y = (IX+1)<<8 | IX+4  — centers?
// Or min corner: and max = (IX+0)<<8|IX+3 etc.
console.log('\n=== sector from (hi<<8|lo) candidates for BANANA/BONE ===')
function show(name, r) {
  const o = 0xf230 - LOAD + r * 0x14
  const b = [...code.subarray(o, o + 0x14)]
  const combos = [
    ['X=0<<8|2 Y=1<<8|4', (b[0] << 8) | b[2], (b[1] << 8) | b[4]],
    ['X=0<<8|3 Y=1<<8|5', (b[0] << 8) | b[3], (b[1] << 8) | b[5]],
    ['X=0<<8|2 Y=1<<8|5', (b[0] << 8) | b[2], (b[1] << 8) | b[5]],
    ['X=0<<8|3 Y=1<<8|4', (b[0] << 8) | b[3], (b[1] << 8) | b[4]],
    ['X=2|0<<8 Y=4|1<<8', b[2] | (b[0] << 8), b[4] | (b[1] << 8)],
    ['X=3|0<<8 Y=5|1<<8', b[3] | (b[0] << 8), b[5] | (b[1] << 8)],
  ]
  console.log(name)
  for (const [label, x, y] of combos) {
    if (x >= 768 || y >= 768) {
      console.log(' ', label, x, y, 'OOR')
      continue
    }
    console.log(' ', label, `world(${x},${y}) sector(${x >> 7},${y >> 7})`)
  }
}
show('BANANA want 5,2', 0)
show('BONE want 3,1', 9)

// Box interpretation: minX=(0<<8)|2 maxX=(0<<8)|3 minY=(1<<8)|4 maxY=(1<<8)|5
console.log('\n=== AABB sector coverage ===')
for (let r = 0; r < 14; r++) {
  const o = 0xf230 - LOAD + r * 0x14
  const b = [...code.subarray(o, o + 0x14)]
  const minX = (b[0] << 8) | b[2]
  const maxX = (b[0] << 8) | b[3]
  const minY = (b[1] << 8) | b[4]
  const maxY = (b[1] << 8) | b[5]
  // also try lo/hi swapped within same high
  const minX2 = b[2] | (b[0] << 8)
  const maxX2 = b[3] | (b[0] << 8)
  const minY2 = b[4] | (b[1] << 8)
  const maxY2 = b[5] | (b[1] << 8)

  const ok = (a, b) => a < 768 && b < 768 && a <= b
  if (ok(minX2, maxX2) && ok(minY2, maxY2)) {
    const cx = (minX2 + maxX2) / 2
    const cy = (minY2 + maxY2) / 2
    console.log(
      NAMES[r].padEnd(12),
      `box(${minX2}-${maxX2},${minY2}-${maxY2})`,
      `center sec(${cx >> 7},${cy >> 7})`,
      `center(${cx|0},${cy|0})`,
    )
  } else {
    console.log(NAMES[r].padEnd(12), 'box2 invalid', minX2, maxX2, minY2, maxY2)
  }
}
