/**
 * Find map cell lookup: HL = $9300 + y*128 + x
 * Pattern: load base, shift y by 7, add x.
 */
import fs from 'fs'

const code = fs.readFileSync('tools/cyclone3.bin')
const LOAD = 0x5fdc
const MAP_OFF = 13092
const W = 128
const map = code.subarray(MAP_OFF, MAP_OFF + W * 128)

function dump(addr, n = 36) {
  let off = addr - LOAD
  const lines = []
  for (let i = 0; i < n && off >= 0 && off < code.length; i++) {
    const a = LOAD + off
    const b0 = code[off]
    let len = 1
    let text = `DB $${b0.toString(16)}`
    const b1 = code[off + 1]
    const nn = b1 | (code[off + 2] << 8)
    if ([0x21, 0x11, 0x01].includes(b0)) {
      text = `LD ${{ 0x21: 'HL', 0x11: 'DE', 0x01: 'BC' }[b0]},$${nn.toString(16)}`
      len = 3
    } else if (b0 === 0xcd || b0 === 0xc3) {
      text = `${b0 === 0xcd ? 'CALL' : 'JP'} $${nn.toString(16)}`
      len = 3
    } else if (b0 === 0x29) text = 'ADD HL,HL'
    else if (b0 === 0x09) text = 'ADD HL,BC'
    else if (b0 === 0x19) text = 'ADD HL,DE'
    else if (b0 === 0x7e) text = 'LD A,(HL)'
    else if (b0 === 0x23) text = 'INC HL'
    else if (b0 === 0xc9) text = 'RET'
    else if (b0 === 0xe5) text = 'PUSH HL'
    else if (b0 === 0xe1) text = 'POP HL'
    else if (b0 === 0xd5) text = 'PUSH DE'
    else if (b0 === 0xd1) text = 'POP DE'
    else if (b0 === 0xc5) text = 'PUSH BC'
    else if (b0 === 0xc1) text = 'POP BC'
    else if (b0 === 0xf5) text = 'PUSH AF'
    else if (b0 === 0xf1) text = 'POP AF'
    else if (b0 === 0xeb) text = 'EX DE,HL'
    else if (b0 === 0x6f) text = 'LD L,A'
    else if (b0 === 0x67) text = 'LD H,A'
    else if (b0 === 0x5f) text = 'LD E,A'
    else if (b0 === 0x57) text = 'LD D,A'
    else if (b0 === 0x4f) text = 'LD C,A'
    else if (b0 === 0x47) text = 'LD B,A'
    else if (b0 === 0x7d) text = 'LD A,L'
    else if (b0 === 0x7c) text = 'LD A,H'
    else if (b0 === 0x7b) text = 'LD A,E'
    else if (b0 === 0x7a) text = 'LD A,D'
    else if (b0 === 0x79) text = 'LD A,C'
    else if (b0 === 0x78) text = 'LD A,B'
    else if (b0 === 0xaf) text = 'XOR A'
    else if (b0 === 0x87) text = 'ADD A,A'
    else if (b0 === 0xfe) {
      text = `CP $${b1.toString(16)}`
      len = 2
    } else if (b0 === 0xe6) {
      text = `AND $${b1.toString(16)}`
      len = 2
    } else if (b0 === 0xcb) {
      text = `CB $${b1.toString(16)}`
      len = 2
    } else if (b0 === 0x3e) {
      text = `LD A,$${b1.toString(16)}`
      len = 2
    } else if (b0 === 0x06) {
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
    } else if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(b0)) {
      const d = (b1 << 24) >> 24
      const cc = { 0x18: '', 0x20: 'NZ,', 0x28: 'Z,', 0x30: 'NC,', 0x38: 'C,' }[b0]
      text = `JR ${cc}$${(a + 2 + d).toString(16)}`
      len = 2
    } else if ((b0 & 0xc0) === 0x40 && b0 !== 0x76) {
      const R = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A']
      text = `LD ${R[(b0 >> 3) & 7]},${R[b0 & 7]}`
    }
    const bytes = []
    for (let k = 0; k < len; k++) bytes.push(code[off + k].toString(16).padStart(2, '0'))
    lines.push(`$${a.toString(16)}  ${bytes.join(' ').padEnd(11)} ${text}`)
    off += len
  }
  return lines
}

// Find 7x ADD HL,HL
const sites = []
for (let i = 0; i < code.length - 8; i++) {
  let n = 0
  while (code[i + n] === 0x29 && n < 8) n++
  if (n >= 7) sites.push({ addr: LOAD + i, adds: n })
}

console.log('y<<7 sites:', sites)

// Measure usable map height: last row with any non-zero
let lastLand = 0
let firstLand = -1
const rowFill = []
for (let y = 0; y < 128; y++) {
  let nz = 0
  for (let x = 0; x < W; x++) if (map[y * W + x]) nz++
  rowFill.push(nz)
  if (nz) {
    if (firstLand < 0) firstLand = y
    lastLand = y
  }
}

// What follows map? look at bytes after lastLand
const afterOff = MAP_OFF + (lastLand + 1) * W
const after = code.subarray(afterOff, Math.min(afterOff + 64, code.length))

// Search for small fixed-count tables of unique land coords (crates often ~10-20)
const crateLike = []
for (let off = 0x200; off < MAP_OFF - 40; off++) {
  for (const stride of [2, 3, 4]) {
    const pts = []
    const seen = new Set()
    let ok = true
    for (let k = 0; k < 16; k++) {
      const p = off + k * stride
      if (p + 1 >= MAP_OFF) {
        ok = false
        break
      }
      const x = code[p]
      const y = code[p + 1]
      if (x >= W || y > lastLand) {
        ok = false
        break
      }
      const v = map[y * W + x]
      if (v === 0) {
        ok = false
        break
      } // crates on land
      const key = x + ',' + y
      if (seen.has(key)) {
        ok = false
        break
      }
      seen.add(key)
      pts.push({ x, y, v, extra: stride > 2 ? [...code.subarray(p + 2, p + stride)] : [] })
    }
    if (!ok || pts.length < 8) continue
    // require geographic spread
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const spread =
      Math.max(...xs) - Math.min(...xs) + (Math.max(...ys) - Math.min(...ys))
    if (spread < 40) continue
    // prefer points not all on structures (crates are on open ground)
    const structN = pts.filter((p) => p.v >= 0x80).length
    if (structN > pts.length * 0.5) continue
    crateLike.push({
      off,
      addr: LOAD + off,
      stride,
      n: pts.length,
      spread,
      structN,
      sample: pts.slice(0, 8),
    })
  }
}
crateLike.sort((a, b) => b.spread - a.spread || b.n - a.n)

// Dedup
const best = []
for (const c of crateLike) {
  if (best.some((b) => Math.abs(b.off - c.off) < 8)) continue
  best.push(c)
  if (best.length >= 15) break
}

const out = {
  mapExtent: { firstLand, lastLand, height: lastLand - firstLand + 1, rowFill: rowFill.slice(0, lastLand + 2) },
  afterMapHex: [...after].map((b) => b.toString(16).padStart(2, '0')).join(' '),
  yShiftSites: sites.map((s) => ({ ...s, listing: dump(s.addr - 16, 40) })),
  crateLike: best,
}
fs.writeFileSync('tools/_map_index_report.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify({ mapExtent: out.mapExtent, crateLike: best.slice(0, 5), after: out.afterMapHex }, null, 2))
for (const s of sites) {
  console.log('\n=== y<<7 @ $' + s.addr.toString(16) + ' ===')
  console.log(dump(s.addr - 12, 32).join('\n'))
}
