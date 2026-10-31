/**
 * Trace structure threshold (>=$80) and height decoding.
 * Also find self-mod writes to the LD HL,$9300 site and map-index math.
 */
import fs from 'fs'

const code = fs.readFileSync('tools/cyclone3.bin')
const LOAD = 0x5fdc
const MAP = 0x9300
const W = 128
const H = 120
const map = code.subarray(MAP - LOAD, MAP - LOAD + W * H)

function disOne(off) {
  // minimal: just dump hex window
  return null
}

function dump(addr, n = 48) {
  let off = addr - LOAD
  const lines = []
  let i = 0
  while (i < n && off < code.length) {
    // reuse simple walk from prior knowledge — print raw+guess
    const b0 = code[off]
    const a = LOAD + off
    let len = 1
    let text = `DB $${b0.toString(16)}`
    const b1 = code[off + 1]
    const b2 = code[off + 2]
    const nn = b1 | (b2 << 8)
    if (b0 === 0x21 || b0 === 0x11 || b0 === 0x01) {
      const rp = { 0x21: 'HL', 0x11: 'DE', 0x01: 'BC' }[b0]
      text = `LD ${rp},$${nn.toString(16)}`
      len = 3
    } else if (b0 === 0xcd || b0 === 0xc3) {
      text = `${b0 === 0xcd ? 'CALL' : 'JP'} $${nn.toString(16)}`
      len = 3
    } else if (b0 === 0xfe) {
      text = `CP $${b1.toString(16)}`
      len = 2
    } else if (b0 === 0xe6) {
      text = `AND $${b1.toString(16)}`
      len = 2
    } else if (b0 === 0xcb) {
      const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][b1 & 7]
      const y = (b1 >> 3) & 7
      if ((b1 & 0xc0) === 0x40) text = `BIT ${y},${r}`
      else if ((b1 & 0xc0) === 0x80) text = `RES ${y},${r}`
      else if ((b1 & 0xc0) === 0xc0) text = `SET ${y},${r}`
      else text = `CB $${b1.toString(16)}`
      len = 2
    } else if (b0 === 0xed && b1 === 0xb0) {
      text = 'LDIR'
      len = 2
    } else if (b0 === 0x28 || b0 === 0x20 || b0 === 0x30 || b0 === 0x38 || b0 === 0x18) {
      const d = (b1 << 24) >> 24
      const cc = { 0x28: 'Z', 0x20: 'NZ', 0x30: 'NC', 0x38: 'C', 0x18: '' }[b0]
      text = `JR ${cc ? cc + ',' : ''}$${(a + 2 + d).toString(16)}`
      len = 2
    } else if (b0 === 0x3a || b0 === 0x32 || b0 === 0x2a || b0 === 0x22) {
      const op = { 0x3a: 'LD A,(nn)', 0x32: 'LD (nn),A', 0x2a: 'LD HL,(nn)', 0x22: 'LD (nn),HL' }[b0]
      text = op.replace('nn', '$' + nn.toString(16))
      len = 3
    } else if (b0 === 0x09) text = 'ADD HL,BC'
    else if (b0 === 0x19) text = 'ADD HL,DE'
    else if (b0 === 0x29) text = 'ADD HL,HL'
    else if (b0 === 0x23) text = 'INC HL'
    else if (b0 === 0x2b) text = 'DEC HL'
    else if (b0 === 0x7e) text = 'LD A,(HL)'
    else if (b0 === 0x46) text = 'LD B,(HL)'
    else if (b0 === 0x4e) text = 'LD C,(HL)'
    else if (b0 === 0x66) text = 'LD H,(HL)'
    else if (b0 === 0x6e) text = 'LD L,(HL)'
    else if (b0 === 0x77) text = 'LD (HL),A'
    else if (b0 === 0xc9) text = 'RET'
    else if (b0 === 0xc5) text = 'PUSH BC'
    else if (b0 === 0xd5) text = 'PUSH DE'
    else if (b0 === 0xe5) text = 'PUSH HL'
    else if (b0 === 0xf5) text = 'PUSH AF'
    else if (b0 === 0xc1) text = 'POP BC'
    else if (b0 === 0xd1) text = 'POP DE'
    else if (b0 === 0xe1) text = 'POP HL'
    else if (b0 === 0xf1) text = 'POP AF'
    else if (b0 === 0xeb) text = 'EX DE,HL'
    else if (b0 === 0xaf) text = 'XOR A'
    else if (b0 === 0xa7) text = 'AND A'
    else if (b0 === 0xb7) text = 'OR A'
    else if (b0 === 0x2f) text = 'CPL'
    else if (b0 === 0x87) text = 'ADD A,A'
    else if (b0 === 0x3c) text = 'INC A'
    else if (b0 === 0x3d) text = 'DEC A'
    else if (b0 === 0x04) text = 'INC B'
    else if (b0 === 0x05) text = 'DEC B'
    else if (b0 === 0x0c) text = 'INC C'
    else if (b0 === 0x0d) text = 'DEC C'
    else if (b0 === 0x47) text = 'LD B,A'
    else if (b0 === 0x4f) text = 'LD C,A'
    else if (b0 === 0x57) text = 'LD D,A'
    else if (b0 === 0x5f) text = 'LD E,A'
    else if (b0 === 0x67) text = 'LD H,A'
    else if (b0 === 0x6f) text = 'LD L,A'
    else if (b0 === 0x78) text = 'LD A,B'
    else if (b0 === 0x79) text = 'LD A,C'
    else if (b0 === 0x7a) text = 'LD A,D'
    else if (b0 === 0x7b) text = 'LD A,E'
    else if (b0 === 0x7c) text = 'LD A,H'
    else if (b0 === 0x7d) text = 'LD A,L'
    else if (b0 === 0x06) {
      text = `LD B,$${b1.toString(16)}`
      len = 2
    } else if (b0 === 0x0e) {
      text = `LD C,$${b1.toString(16)}`
      len = 2
    } else if (b0 === 0x16) {
      text = `LD D,$${b1.toString(16)}`
      len = 2
    } else if (b0 === 0x1e) {
      text = `LD E,$${b1.toString(16)}`
      len = 2
    } else if (b0 === 0x26) {
      text = `LD H,$${b1.toString(16)}`
      len = 2
    } else if (b0 === 0x2e) {
      text = `LD L,$${b1.toString(16)}`
      len = 2
    } else if (b0 === 0x3e) {
      text = `LD A,$${b1.toString(16)}`
      len = 2
    } else if (b0 === 0x10) {
      const d = (b1 << 24) >> 24
      text = `DJNZ $${(a + 2 + d).toString(16)}`
      len = 2
    } else if ((b0 & 0xf8) === 0xa0) text = `AND ${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][b0 & 7]}`
    else if ((b0 & 0xf8) === 0xb8) text = `CP ${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][b0 & 7]}`
    else if ((b0 & 0xf8) === 0x80) text = `ADD A,${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][b0 & 7]}`
    else if ((b0 & 0xf8) === 0x90) text = `SUB ${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][b0 & 7]}`
    else if ((b0 & 0xc0) === 0x40 && b0 !== 0x76)
      text = `LD ${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(b0 >> 3) & 7]},${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][b0 & 7]}`

    const bytes = []
    for (let k = 0; k < len; k++) bytes.push(code[off + k].toString(16).padStart(2, '0'))
    lines.push(`$${a.toString(16).padStart(4, '0')}  ${bytes.join(' ').padEnd(11)} ${text}`)
    off += len
    i++
  }
  return lines
}

// Find writes targeting $9261 (low byte of map ptr) or $9262
const patchHits = []
for (let i = 0; i < code.length - 3; i++) {
  // LD (nn),A / LD (nn),HL
  if (code[i] === 0x32 || code[i] === 0x22) {
    const nn = code[i + 1] | (code[i + 2] << 8)
    if (nn >= 0x925d && nn <= 0x9265) {
      patchHits.push({ at: LOAD + i, target: nn, op: code[i] === 0x32 ? 'LD(nn),A' : 'LD(nn),HL' })
    }
  }
}

// Routine $7e10 — called from map strip loop; contains CP $80
const r7e10 = dump(0x7e10, 80)
const r7e64 = dump(0x7e64, 40)

// Find ADD HL,HL sequences that build y*128 (y<<7)
const y128 = []
for (let i = 0; i < code.length - 6; i++) {
  // ADD HL,HL ; ADD HL,HL ; ADD HL,HL ; ADD HL,HL ; ADD HL,HL ; ADD HL,HL ; ADD HL,HL  = *128
  let adds = 0
  let j = i
  while (j < code.length && code[j] === 0x29 && adds < 8) {
    adds++
    j++
  }
  if (adds >= 7) {
    y128.push({ at: LOAD + i, adds })
  }
}

// Also: LD HL,$9300 variants via LD H,$93 / LD L,x
const ldH93 = []
for (let i = 0; i < code.length - 1; i++) {
  if (code[i] === 0x26 && code[i + 1] === 0x93) ldH93.push(LOAD + i)
}

// Count cells by threshold classes used by CP $80
let ge80 = 0
let lt80land = 0
let sea = 0
const lowNibbleWhenGe80 = {}
const bitsWhenLand = { b7: 0, b6: 0, b5: 0, b4: 0 }
for (const v of map) {
  if (!v) {
    sea++
    continue
  }
  if (v >= 0x80) {
    ge80++
    const lo = v & 0x0f
    lowNibbleWhenGe80[lo] = (lowNibbleWhenGe80[lo] || 0) + 1
  } else {
    lt80land++
    if (v & 0x80) bitsWhenLand.b7++
    if (v & 0x40) bitsWhenLand.b6++
    if (v & 0x20) bitsWhenLand.b5++
    if (v & 0x10) bitsWhenLand.b4++
  }
}

// Exact height: bits 7-5 for land < $80, and for all land
function heightHist(pred) {
  const h = {}
  for (const v of map) {
    if (!pred(v)) continue
    const e = (v >> 5) & 7
    h[e] = (h[e] || 0) + 1
  }
  return h
}

const report = {
  patchHits,
  y128Sites: y128.slice(0, 20),
  ldH93: ldH93.slice(0, 20),
  classes: { sea, landBelow80: lt80land, structureGe80: ge80 },
  lowNibbleWhenGe80,
  heightAllLand: heightHist((v) => v > 0),
  heightLandOnly: heightHist((v) => v > 0 && v < 0x80),
  heightStruct: heightHist((v) => v >= 0x80),
  bit4OnLandBelow80: bitsWhenLand.b4,
  routines: {
    '7e10': r7e10,
    '7e64': r7e64,
  },
}

fs.writeFileSync('tools/_struct_trace.json', JSON.stringify(report, null, 2))
console.log(
  JSON.stringify(
    {
      patchHits,
      y128: y128.length,
      ldH93: ldH93.length,
      classes: report.classes,
      lowNibbleWhenGe80,
      heightLandOnly: report.heightLandOnly,
      heightStruct: report.heightStruct,
    },
    null,
    2,
  ),
)
console.log('\n--- $7e10 ---')
console.log(r7e10.join('\n'))
