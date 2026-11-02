/**
 * Disassemble routines that load object mapPtr (IX+0a/0b)
 * and nearby heli / world math.
 */
import fs from 'fs'

const code = fs.readFileSync('tools/cyclone3.bin')
const LOAD = 0x5fdc

const RP = ['BC', 'DE', 'HL', 'SP']
const R = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A']
const CC = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M']

function disOne(i) {
  const a = LOAD + i
  const b0 = code[i]
  const b1 = code[i + 1]
  const b2 = code[i + 2]
  const b3 = code[i + 3]
  const hex = (...bs) => bs.map((b) => b.toString(16).padStart(2, '0')).join(' ')
  const nn = (lo, hi) => `$${(lo | (hi << 8)).toString(16)}`
  const rel = (d) => `$${(a + 2 + ((d << 24) >> 24)) & 0xffff}`

  // DD / FD prefixed
  if (b0 === 0xdd || b0 === 0xfd) {
    const ix = b0 === 0xdd ? 'IX' : 'IY'
    if (b1 === 0x21) return { len: 4, text: `LD ${ix},${nn(b2, b3)}`, bytes: hex(b0, b1, b2, b3) }
    if (b1 === 0x2a) return { len: 4, text: `LD ${ix},(${nn(b2, b3)})`, bytes: hex(b0, b1, b2, b3) }
    if (b1 === 0x22) return { len: 4, text: `LD (${nn(b2, b3)}),${ix}`, bytes: hex(b0, b1, b2, b3) }
    if (b1 === 0xe5) return { len: 2, text: `PUSH ${ix}`, bytes: hex(b0, b1) }
    if (b1 === 0xe1) return { len: 2, text: `POP ${ix}`, bytes: hex(b0, b1) }
    if (b1 === 0xe9) return { len: 2, text: `JP (${ix})`, bytes: hex(b0, b1) }
    if (b1 === 0x09 || b1 === 0x19 || b1 === 0x29 || b1 === 0x39)
      return { len: 2, text: `ADD ${ix},${RP[(b1 >> 4) & 3]}`, bytes: hex(b0, b1) }
    if (b1 === 0x23) return { len: 2, text: `INC ${ix}`, bytes: hex(b0, b1) }
    if (b1 === 0x2b) return { len: 2, text: `DEC ${ix}`, bytes: hex(b0, b1) }
    if (b1 === 0x34) return { len: 3, text: `INC (${ix}+$${b2.toString(16)})`, bytes: hex(b0, b1, b2) }
    if (b1 === 0x35) return { len: 3, text: `DEC (${ix}+$${b2.toString(16)})`, bytes: hex(b0, b1, b2) }
    if (b1 === 0x46 || b1 === 0x4e || b1 === 0x56 || b1 === 0x5e || b1 === 0x66 || b1 === 0x6e || b1 === 0x7e)
      return {
        len: 3,
        text: `LD ${R[(b1 >> 3) & 7]},(${ix}+$${b2.toString(16)})`,
        bytes: hex(b0, b1, b2),
      }
    if (b1 === 0x70 || (b1 >= 0x71 && b1 <= 0x77))
      return {
        len: 3,
        text: `LD (${ix}+$${b2.toString(16)}),${R[b1 & 7]}`,
        bytes: hex(b0, b1, b2),
      }
    if (b1 === 0x36)
      return { len: 4, text: `LD (${ix}+$${b2.toString(16)}),$${b3.toString(16)}`, bytes: hex(b0, b1, b2, b3) }
    if (b1 === 0xbe) return { len: 3, text: `CP (${ix}+$${b2.toString(16)})`, bytes: hex(b0, b1, b2) }
    if (b1 === 0x86) return { len: 3, text: `ADD A,(${ix}+$${b2.toString(16)})`, bytes: hex(b0, b1, b2) }
    if (b1 === 0x96) return { len: 3, text: `SUB (${ix}+$${b2.toString(16)})`, bytes: hex(b0, b1, b2) }
    if (b1 === 0xcb) {
      const d = b2
      const b = b3
      const y = (b >> 3) & 7
      const z = b & 7
      const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y]
      if (b < 0x40) return { len: 4, text: `${rot} (${ix}+$${d.toString(16)})`, bytes: hex(b0, b1, b2, b3) }
      if (b < 0x80) return { len: 4, text: `BIT ${y},(${ix}+$${d.toString(16)})`, bytes: hex(b0, b1, b2, b3) }
      if (b < 0xc0) return { len: 4, text: `RES ${y},(${ix}+$${d.toString(16)})`, bytes: hex(b0, b1, b2, b3) }
      return { len: 4, text: `SET ${y},(${ix}+$${d.toString(16)})`, bytes: hex(b0, b1, b2, b3) }
    }
    return { len: 2, text: `DD/FD $${b1.toString(16)}`, bytes: hex(b0, b1) }
  }

  if (b0 === 0xcb) {
    const y = (b1 >> 3) & 7
    const z = b1 & 7
    const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y]
    if (b1 < 0x40) return { len: 2, text: `${rot} ${R[z]}`, bytes: hex(b0, b1) }
    if (b1 < 0x80) return { len: 2, text: `BIT ${y},${R[z]}`, bytes: hex(b0, b1) }
    if (b1 < 0xc0) return { len: 2, text: `RES ${y},${R[z]}`, bytes: hex(b0, b1) }
    return { len: 2, text: `SET ${y},${R[z]}`, bytes: hex(b0, b1) }
  }

  if (b0 === 0xed) {
    if (b1 === 0xb0) return { len: 2, text: 'LDIR', bytes: hex(b0, b1) }
    if (b1 === 0xb8) return { len: 2, text: 'LDDR', bytes: hex(b0, b1) }
    if (b1 === 0xa0) return { len: 2, text: 'LDI', bytes: hex(b0, b1) }
    if ((b1 & 0xcf) === 0x43) return { len: 4, text: `LD (${nn(b2, b3)}),${RP[(b1 >> 4) & 3]}`, bytes: hex(b0, b1, b2, b3) }
    if ((b1 & 0xcf) === 0x4b) return { len: 4, text: `LD ${RP[(b1 >> 4) & 3]},(${nn(b2, b3)})`, bytes: hex(b0, b1, b2, b3) }
    return { len: 2, text: `ED $${b1.toString(16)}`, bytes: hex(b0, b1) }
  }

  // unprefixed
  if (b0 === 0x00) return { len: 1, text: 'NOP', bytes: hex(b0) }
  if (b0 === 0xc9) return { len: 1, text: 'RET', bytes: hex(b0) }
  if (b0 === 0xc3) return { len: 3, text: `JP ${nn(b1, b2)}`, bytes: hex(b0, b1, b2) }
  if (b0 === 0xcd) return { len: 3, text: `CALL ${nn(b1, b2)}`, bytes: hex(b0, b1, b2) }
  if ((b0 & 0xc7) === 0xc4) return { len: 3, text: `CALL ${CC[(b0 >> 3) & 7]},${nn(b1, b2)}`, bytes: hex(b0, b1, b2) }
  if ((b0 & 0xc7) === 0xc2) return { len: 3, text: `JP ${CC[(b0 >> 3) & 7]},${nn(b1, b2)}`, bytes: hex(b0, b1, b2) }
  if ((b0 & 0xc7) === 0xc0) return { len: 1, text: `RET ${CC[(b0 >> 3) & 7]}`, bytes: hex(b0) }
  if (b0 === 0x18) return { len: 2, text: `JR ${rel(b1)}`, bytes: hex(b0, b1) }
  if (b0 === 0x20) return { len: 2, text: `JR NZ,${rel(b1)}`, bytes: hex(b0, b1) }
  if (b0 === 0x28) return { len: 2, text: `JR Z,${rel(b1)}`, bytes: hex(b0, b1) }
  if (b0 === 0x30) return { len: 2, text: `JR NC,${rel(b1)}`, bytes: hex(b0, b1) }
  if (b0 === 0x38) return { len: 2, text: `JR C,${rel(b1)}`, bytes: hex(b0, b1) }
  if (b0 === 0x10) return { len: 2, text: `DJNZ ${rel(b1)}`, bytes: hex(b0, b1) }

  if ((b0 & 0xcf) === 0x01) return { len: 3, text: `LD ${RP[(b0 >> 4) & 3]},${nn(b1, b2)}`, bytes: hex(b0, b1, b2) }
  if ((b0 & 0xcf) === 0x09) return { len: 1, text: `ADD HL,${RP[(b0 >> 4) & 3]}`, bytes: hex(b0) }
  if ((b0 & 0xcf) === 0x03) return { len: 1, text: `INC ${RP[(b0 >> 4) & 3]}`, bytes: hex(b0) }
  if ((b0 & 0xcf) === 0x0b) return { len: 1, text: `DEC ${RP[(b0 >> 4) & 3]}`, bytes: hex(b0) }
  if ((b0 & 0xc7) === 0x04) return { len: 1, text: `INC ${R[(b0 >> 3) & 7]}`, bytes: hex(b0) }
  if ((b0 & 0xc7) === 0x05) return { len: 1, text: `DEC ${R[(b0 >> 3) & 7]}`, bytes: hex(b0) }
  if ((b0 & 0xc7) === 0x06) return { len: 2, text: `LD ${R[(b0 >> 3) & 7]},$${b1.toString(16)}`, bytes: hex(b0, b1) }
  if (b0 === 0x22) return { len: 3, text: `LD (${nn(b1, b2)}),HL`, bytes: hex(b0, b1, b2) }
  if (b0 === 0x2a) return { len: 3, text: `LD HL,(${nn(b1, b2)})`, bytes: hex(b0, b1, b2) }
  if (b0 === 0x32) return { len: 3, text: `LD (${nn(b1, b2)}),A`, bytes: hex(b0, b1, b2) }
  if (b0 === 0x3a) return { len: 3, text: `LD A,(${nn(b1, b2)})`, bytes: hex(b0, b1, b2) }
  if (b0 === 0x21) return { len: 3, text: `LD HL,${nn(b1, b2)}`, bytes: hex(b0, b1, b2) }
  if (b0 === 0x11) return { len: 3, text: `LD DE,${nn(b1, b2)}`, bytes: hex(b0, b1, b2) }
  if (b0 === 0x01) return { len: 3, text: `LD BC,${nn(b1, b2)}`, bytes: hex(b0, b1, b2) }
  if (b0 === 0x31) return { len: 3, text: `LD SP,${nn(b1, b2)}`, bytes: hex(b0, b1, b2) }

  if (b0 >= 0x40 && b0 < 0x80 && b0 !== 0x76) {
    return { len: 1, text: `LD ${R[(b0 >> 3) & 7]},${R[b0 & 7]}`, bytes: hex(b0) }
  }
  if (b0 === 0x76) return { len: 1, text: 'HALT', bytes: hex(b0) }
  if (b0 >= 0x80 && b0 < 0x88) return { len: 1, text: `ADD A,${R[b0 & 7]}`, bytes: hex(b0) }
  if (b0 >= 0x88 && b0 < 0x90) return { len: 1, text: `ADC A,${R[b0 & 7]}`, bytes: hex(b0) }
  if (b0 >= 0x90 && b0 < 0x98) return { len: 1, text: `SUB ${R[b0 & 7]}`, bytes: hex(b0) }
  if (b0 >= 0x98 && b0 < 0xa0) return { len: 1, text: `SBC A,${R[b0 & 7]}`, bytes: hex(b0) }
  if (b0 >= 0xa0 && b0 < 0xa8) return { len: 1, text: `AND ${R[b0 & 7]}`, bytes: hex(b0) }
  if (b0 >= 0xa8 && b0 < 0xb0) return { len: 1, text: `XOR ${R[b0 & 7]}`, bytes: hex(b0) }
  if (b0 >= 0xb0 && b0 < 0xb8) return { len: 1, text: `OR ${R[b0 & 7]}`, bytes: hex(b0) }
  if (b0 >= 0xb8 && b0 < 0xc0) return { len: 1, text: `CP ${R[b0 & 7]}`, bytes: hex(b0) }

  if (b0 === 0xc6) return { len: 2, text: `ADD A,$${b1.toString(16)}`, bytes: hex(b0, b1) }
  if (b0 === 0xd6) return { len: 2, text: `SUB $${b1.toString(16)}`, bytes: hex(b0, b1) }
  if (b0 === 0xe6) return { len: 2, text: `AND $${b1.toString(16)}`, bytes: hex(b0, b1) }
  if (b0 === 0xee) return { len: 2, text: `XOR $${b1.toString(16)}`, bytes: hex(b0, b1) }
  if (b0 === 0xf6) return { len: 2, text: `OR $${b1.toString(16)}`, bytes: hex(b0, b1) }
  if (b0 === 0xfe) return { len: 2, text: `CP $${b1.toString(16)}`, bytes: hex(b0, b1) }
  if (b0 === 0xd9) return { len: 1, text: 'EXX', bytes: hex(b0) }
  if (b0 === 0xeb) return { len: 1, text: 'EX DE,HL', bytes: hex(b0) }
  if (b0 === 0x08) return { len: 1, text: "EX AF,AF'", bytes: hex(b0) }
  if (b0 === 0xe3) return { len: 1, text: 'EX (SP),HL', bytes: hex(b0) }
  if (b0 === 0xf3) return { len: 1, text: 'DI', bytes: hex(b0) }
  if (b0 === 0xfb) return { len: 1, text: 'EI', bytes: hex(b0) }
  if ((b0 & 0xc7) === 0xc5) return { len: 1, text: `PUSH ${RP[(b0 >> 4) & 3]}`, bytes: hex(b0) }
  if ((b0 & 0xc7) === 0xc1) return { len: 1, text: `POP ${RP[(b0 >> 4) & 3]}`, bytes: hex(b0) }
  if (b0 === 0x2f) return { len: 1, text: 'CPL', bytes: hex(b0) }
  if (b0 === 0x37) return { len: 1, text: 'SCF', bytes: hex(b0) }
  if (b0 === 0x3f) return { len: 1, text: 'CCF', bytes: hex(b0) }
  if (b0 === 0x27) return { len: 1, text: 'DAA', bytes: hex(b0) }
  if (b0 === 0x17) return { len: 1, text: 'RLA', bytes: hex(b0) }
  if (b0 === 0x07) return { len: 1, text: 'RLCA', bytes: hex(b0) }
  if (b0 === 0x1f) return { len: 1, text: 'RRA', bytes: hex(b0) }
  if (b0 === 0x0f) return { len: 1, text: 'RRCA', bytes: hex(b0) }

  return { len: 1, text: `DB $${b0.toString(16)}`, bytes: hex(b0) }
}

function disRange(addr, n) {
  let i = addr - LOAD
  const end = i + n
  const lines = []
  while (i < end && i < code.length) {
    const d = disOne(i)
    lines.push(`$${(LOAD + i).toString(16)}  ${d.bytes.padEnd(11)} ${d.text}`)
    i += d.len
  }
  return lines.join('\n')
}

for (const [label, addr, n] of [
  ['cull+map near 76e9', 0x76e9, 0x120],
  ['map use 7830', 0x7820, 0x80],
  ['map use 79a0', 0x7980, 0xa0],
  ['map use 8d60', 0x8d50, 0x80],
  ['map use f440', 0xf430, 0x60],
]) {
  console.log(`\n===== ${label} =====`)
  console.log(disRange(addr, n))
}
