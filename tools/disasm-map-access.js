/**
 * Disassemble around:
 * - CP/AND immediates that look like structure-bit tests
 * - LD HL,$9300 / stride-128 sites
 * - HL = mapBase + y*128 + x style sequences
 */
import fs from 'fs'

const code = fs.readFileSync('tools/cyclone3.bin')
const LOAD = 0x5fdc

const OP1 = {
  0x00: 'NOP',
  0x07: 'RLCA',
  0x0f: 'RRCA',
  0x17: 'RLA',
  0x1f: 'RRA',
  0x27: 'DAA',
  0x2f: 'CPL',
  0x37: 'SCF',
  0x3f: 'CCF',
  0x76: 'HALT',
  0xc9: 'RET',
  0xd9: 'EXX',
  0xeb: 'EX DE,HL',
  0xf9: 'LD SP,HL',
  0xe9: 'JP (HL)',
  0x08: "EX AF,AF'",
}
const R = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A']
const RP = ['BC', 'DE', 'HL', 'SP']
const RP2 = ['BC', 'DE', 'HL', 'AF']
const CC = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M']

function disOne(off) {
  if (off < 0 || off >= code.length) return null
  const b0 = code[off]
  const a = LOAD + off
  const hex = (...bs) => bs.map((b) => b.toString(16).padStart(2, '0')).join(' ')
  const imm8 = () => code[off + 1]
  const imm16 = () => code[off + 1] | (code[off + 2] << 8)

  if (OP1[b0]) return { len: 1, text: OP1[b0], bytes: hex(b0), addr: a }
  if (b0 === 0xcd) return { len: 3, text: `CALL $${imm16().toString(16)}`, bytes: hex(b0, code[off + 1], code[off + 2]), addr: a }
  if (b0 === 0xc3) return { len: 3, text: `JP $${imm16().toString(16)}`, bytes: hex(b0, code[off + 1], code[off + 2]), addr: a }
  if ((b0 & 0xc7) === 0xc2) return { len: 3, text: `JP ${CC[(b0 >> 3) & 7]},$${imm16().toString(16)}`, bytes: hex(b0, code[off + 1], code[off + 2]), addr: a }
  if ((b0 & 0xc7) === 0xc4) return { len: 3, text: `CALL ${CC[(b0 >> 3) & 7]},$${imm16().toString(16)}`, bytes: hex(b0, code[off + 1], code[off + 2]), addr: a }
  if ((b0 & 0xc7) === 0xc0) return { len: 1, text: `RET ${CC[(b0 >> 3) & 7]}`, bytes: hex(b0), addr: a }
  if ((b0 & 0xcf) === 0x01) return { len: 3, text: `LD ${RP[(b0 >> 4) & 3]},$${imm16().toString(16)}`, bytes: hex(b0, code[off + 1], code[off + 2]), addr: a }
  if (b0 === 0x21 || b0 === 0x11 || b0 === 0x01) {
    /* covered */
  }
  if ((b0 & 0xcf) === 0x03) return { len: 1, text: `INC ${RP[(b0 >> 4) & 3]}`, bytes: hex(b0), addr: a }
  if ((b0 & 0xcf) === 0x0b) return { len: 1, text: `DEC ${RP[(b0 >> 4) & 3]}`, bytes: hex(b0), addr: a }
  if ((b0 & 0xcf) === 0x09) return { len: 1, text: `ADD HL,${RP[(b0 >> 4) & 3]}`, bytes: hex(b0), addr: a }
  if ((b0 & 0xc7) === 0x04) return { len: 1, text: `INC ${R[(b0 >> 3) & 7]}`, bytes: hex(b0), addr: a }
  if ((b0 & 0xc7) === 0x05) return { len: 1, text: `DEC ${R[(b0 >> 3) & 7]}`, bytes: hex(b0), addr: a }
  if ((b0 & 0xc7) === 0x06) return { len: 2, text: `LD ${R[(b0 >> 3) & 7]},$${imm8().toString(16)}`, bytes: hex(b0, imm8()), addr: a }
  if (b0 === 0x36) return { len: 2, text: `LD (HL),$${imm8().toString(16)}`, bytes: hex(b0, imm8()), addr: a }
  if ((b0 & 0xf8) === 0x40 && b0 !== 0x76) return { len: 1, text: `LD ${R[(b0 >> 3) & 7]},${R[b0 & 7]}`, bytes: hex(b0), addr: a }
  if ((b0 & 0xf8) === 0x80) return { len: 1, text: `ADD A,${R[b0 & 7]}`, bytes: hex(b0), addr: a }
  if ((b0 & 0xf8) === 0x88) return { len: 1, text: `ADC A,${R[b0 & 7]}`, bytes: hex(b0), addr: a }
  if ((b0 & 0xf8) === 0x90) return { len: 1, text: `SUB ${R[b0 & 7]}`, bytes: hex(b0), addr: a }
  if ((b0 & 0xf8) === 0x98) return { len: 1, text: `SBC A,${R[b0 & 7]}`, bytes: hex(b0), addr: a }
  if ((b0 & 0xf8) === 0xa0) return { len: 1, text: `AND ${R[b0 & 7]}`, bytes: hex(b0), addr: a }
  if ((b0 & 0xf8) === 0xa8) return { len: 1, text: `XOR ${R[b0 & 7]}`, bytes: hex(b0), addr: a }
  if ((b0 & 0xf8) === 0xb0) return { len: 1, text: `OR ${R[b0 & 7]}`, bytes: hex(b0), addr: a }
  if ((b0 & 0xf8) === 0xb8) return { len: 1, text: `CP ${R[b0 & 7]}`, bytes: hex(b0), addr: a }
  if (b0 === 0xc6) return { len: 2, text: `ADD A,$${imm8().toString(16)}`, bytes: hex(b0, imm8()), addr: a }
  if (b0 === 0xd6) return { len: 2, text: `SUB $${imm8().toString(16)}`, bytes: hex(b0, imm8()), addr: a }
  if (b0 === 0xe6) return { len: 2, text: `AND $${imm8().toString(16)}`, bytes: hex(b0, imm8()), addr: a }
  if (b0 === 0xee) return { len: 2, text: `XOR $${imm8().toString(16)}`, bytes: hex(b0, imm8()), addr: a }
  if (b0 === 0xf6) return { len: 2, text: `OR $${imm8().toString(16)}`, bytes: hex(b0, imm8()), addr: a }
  if (b0 === 0xfe) return { len: 2, text: `CP $${imm8().toString(16)}`, bytes: hex(b0, imm8()), addr: a }
  if (b0 === 0x22) return { len: 3, text: `LD ($${imm16().toString(16)}),HL`, bytes: hex(b0, code[off + 1], code[off + 2]), addr: a }
  if (b0 === 0x2a) return { len: 3, text: `LD HL,($${imm16().toString(16)})`, bytes: hex(b0, code[off + 1], code[off + 2]), addr: a }
  if (b0 === 0x32) return { len: 3, text: `LD ($${imm16().toString(16)}),A`, bytes: hex(b0, code[off + 1], code[off + 2]), addr: a }
  if (b0 === 0x3a) return { len: 3, text: `LD A,($${imm16().toString(16)})`, bytes: hex(b0, code[off + 1], code[off + 2]), addr: a }
  if (b0 === 0xed) {
    const b1 = code[off + 1]
    if (b1 === 0xb0) return { len: 2, text: 'LDIR', bytes: hex(b0, b1), addr: a }
    if (b1 === 0xb8) return { len: 2, text: 'LDDR', bytes: hex(b0, b1), addr: a }
    if (b1 === 0xa0) return { len: 2, text: 'LDI', bytes: hex(b0, b1), addr: a }
    if ((b1 & 0xcf) === 0x43) {
      const nn = code[off + 2] | (code[off + 3] << 8)
      const rp = RP[(b1 >> 4) & 3]
      return { len: 4, text: `LD ($${nn.toString(16)}),${rp}`, bytes: hex(b0, b1, code[off + 2], code[off + 3]), addr: a }
    }
    if ((b1 & 0xcf) === 0x4b) {
      const nn = code[off + 2] | (code[off + 3] << 8)
      const rp = RP[(b1 >> 4) & 3]
      return { len: 4, text: `LD ${rp},($${nn.toString(16)})`, bytes: hex(b0, b1, code[off + 2], code[off + 3]), addr: a }
    }
    return { len: 2, text: `ED $${b1.toString(16)}`, bytes: hex(b0, b1), addr: a }
  }
  if (b0 === 0xcb) {
    const b1 = code[off + 1]
    const r = R[b1 & 7]
    const y = (b1 >> 3) & 7
    if ((b1 & 0xc0) === 0x40) return { len: 2, text: `BIT ${y},${r}`, bytes: hex(b0, b1), addr: a }
    if ((b1 & 0xc0) === 0x80) return { len: 2, text: `RES ${y},${r}`, bytes: hex(b0, b1), addr: a }
    if ((b1 & 0xc0) === 0xc0) return { len: 2, text: `SET ${y},${r}`, bytes: hex(b0, b1), addr: a }
    const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y]
    return { len: 2, text: `${rot} ${r}`, bytes: hex(b0, b1), addr: a }
  }
  if (b0 === 0x18) {
    const d = (imm8() << 24) >> 24
    return { len: 2, text: `JR $${(a + 2 + d).toString(16)}`, bytes: hex(b0, imm8()), addr: a }
  }
  if (b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38) {
    const d = (imm8() << 24) >> 24
    const cc = { 0x20: 'NZ', 0x28: 'Z', 0x30: 'NC', 0x38: 'C' }[b0]
    return { len: 2, text: `JR ${cc},$${(a + 2 + d).toString(16)}`, bytes: hex(b0, imm8()), addr: a }
  }
  if (b0 === 0x10) {
    const d = (imm8() << 24) >> 24
    return { len: 2, text: `DJNZ $${(a + 2 + d).toString(16)}`, bytes: hex(b0, imm8()), addr: a }
  }
  if ((b0 & 0xc7) === 0xc7) return { len: 1, text: `RST $${(b0 & 0x38).toString(16)}`, bytes: hex(b0), addr: a }
  if (b0 === 0xd3) return { len: 2, text: `OUT ($${imm8().toString(16)}),A`, bytes: hex(b0, imm8()), addr: a }
  if (b0 === 0xdb) return { len: 2, text: `IN A,($${imm8().toString(16)})`, bytes: hex(b0, imm8()), addr: a }
  return { len: 1, text: `DB $${b0.toString(16)}`, bytes: hex(b0), addr: a }
}

function disRange(startAddr, count = 32) {
  let off = startAddr - LOAD
  const lines = []
  for (let n = 0; n < count; n++) {
    const ins = disOne(off)
    if (!ins) break
    lines.push(
      `$${ins.addr.toString(16).padStart(4, '0')}  ${ins.bytes.padEnd(11)} ${ins.text}`,
    )
    off += ins.len
  }
  return lines
}

// Find interesting sites
const sites = []

// LD HL,$9300
for (let i = 0; i < code.length - 2; i++) {
  if (code[i] === 0x21 && code[i + 1] === 0x00 && code[i + 2] === 0x93) {
    sites.push({ label: 'LD HL,$9300', addr: LOAD + i })
  }
}
// LD BC,$0080
for (let i = 0; i < code.length - 2; i++) {
  if (code[i] === 0x01 && code[i + 1] === 0x80 && code[i + 2] === 0x00) {
    sites.push({ label: 'LD BC,$0080', addr: LOAD + i })
  }
}
// CP $80..$9F
for (let i = 0; i < code.length - 1; i++) {
  if (code[i] === 0xfe && code[i + 1] >= 0x80 && code[i + 1] <= 0x9f) {
    sites.push({ label: `CP $${code[i + 1].toString(16)}`, addr: LOAD + i })
  }
}
// AND $F0 / $E0 / $80 near map usage
for (let i = 0; i < code.length - 1; i++) {
  if (code[i] === 0xe6 && [0xf0, 0xe0, 0x80, 0xc0].includes(code[i + 1])) {
    sites.push({ label: `AND $${code[i + 1].toString(16)}`, addr: LOAD + i })
  }
}
// BIT 7,A / BIT 7,(HL) — height bit?
for (let i = 0; i < code.length - 1; i++) {
  if (code[i] === 0xcb && (code[i + 1] === 0x7f || code[i + 1] === 0x7e)) {
    // too many; skip bulk
  }
}

// Dedup and disassemble windows
const seen = new Set()
const windows = []
for (const s of sites) {
  const key = s.addr
  if (seen.has(key)) continue
  seen.add(key)
  // start a bit earlier
  const start = Math.max(LOAD, s.addr - 12)
  windows.push({
    site: s,
    listing: disRange(start, 28),
  })
}

const out = {
  siteCount: sites.length,
  windows: windows.slice(0, 40),
}

fs.writeFileSync('tools/_map_access_disasm.json', JSON.stringify(out, null, 2))

// Also print human-readable for key sites
const keyLabels = new Set(['LD HL,$9300', 'LD BC,$0080'])
for (const w of windows) {
  if (keyLabels.has(w.site.label) || w.site.label.startsWith('CP $')) {
    console.log('\n===', w.site.label, `@ $${w.site.addr.toString(16)} ===`)
    console.log(w.listing.join('\n'))
  }
}
console.log('\nTotal sites:', sites.length, 'windows dumped:', windows.length)
