import fs from 'fs'

const code = fs.readFileSync('tools/cyclone3.bin')
const loadAddr = 24540

function findImm16(target) {
  const lo = target & 0xff
  const hi = (target >> 8) & 0xff
  const hits = []
  for (let i = 1; i + 1 < code.length; i++) {
    if (code[i] === lo && code[i + 1] === hi) {
      hits.push({
        off: i - 1,
        addr: loadAddr + i - 1,
        op: code[i - 1],
      })
    }
  }
  return hits
}

// Search for likely map bases around our region and round addresses
const candidates = []
for (let a = 0x8000; a <= 0xb000; a++) {
  const hits = findImm16(a)
  const ldhl = hits.filter((h) => h.op === 0x21)
  if (ldhl.length >= 2) {
    candidates.push({ addr: a, hex: '$' + a.toString(16), total: hits.length, ldhl: ldhl.length })
  }
}
candidates.sort((a, b) => b.ldhl - a.ldhl || b.total - a.total)
console.log('frequent LD HL,nn in $8000-$B000', candidates.slice(0, 40))

// Specifically near map
for (const a of [0x9000, 0x9100, 0x9200, 0x9280, 0x92c0, 0x92d0, 0x92dc, 0x9300, 0x9400, 0xa000]) {
  const hits = findImm16(a)
  console.log(
    '$' + a.toString(16),
    'hits',
    hits.length,
    hits.filter((h) => [0x01, 0x11, 0x21, 0x31].includes(h.op)).map((h) => ({
      addr: '$' + h.addr.toString(16),
      op: '$' + h.op.toString(16),
    })),
  )
}

// Find LD DE,128 / LD BC,128 used with map indexing
const strideHits = findImm16(128).filter((h) => [0x01, 0x11, 0x21].includes(h.op))
console.log('\nLD r,128 count', strideHits.length, strideHits.slice(0, 20))

// Disassemble around any LD HL pointing into 0x9000-0xA800
const mapish = candidates.filter((c) => c.addr >= 0x9000 && c.addr <= 0xa800).slice(0, 15)
for (const c of mapish) {
  const hits = findImm16(c.addr).filter((h) => h.op === 0x21).slice(0, 3)
  for (const h of hits) {
    const start = Math.max(0, h.off - 8)
    const bytes = [...code.subarray(start, h.off + 16)].map((b) => b.toString(16).padStart(2, '0'))
    console.log('ctx', c.hex, '@' + h.addr.toString(16), bytes.join(' '))
  }
}

// Maybe map is not at 13056 - find best 128-wide island region start that IS referenced
// Check if compressed/RLE map lives elsewhere and expands to buffer at runtime.
// Search for pointer tables: sequences of addresses into map region
function findPointerTables(minAddr, maxAddr) {
  const out = []
  for (let i = 0; i + 8 < code.length; i += 2) {
    let n = 0
    const ptrs = []
    for (; n < 32; n++) {
      const p = code[i + n * 2] | (code[i + n * 2 + 1] << 8)
      if (p < minAddr || p > maxAddr) break
      ptrs.push(p)
    }
    if (n >= 4) {
      out.push({ off: i, addr: loadAddr + i, count: n, ptrs: ptrs.slice(0, 8) })
      i += n * 2 - 2
    }
  }
  return out.sort((a, b) => b.count - a.count).slice(0, 20)
}

console.log('\npointer tables into $9000-$D000', findPointerTables(0x9000, 0xd000))
console.log('pointer tables into $5FDC-$FF00', findPointerTables(0x5fdc, 0xff00).slice(0, 10))
