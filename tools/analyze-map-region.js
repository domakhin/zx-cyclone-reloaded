import fs from 'fs'

const tap = fs.readFileSync('image/CYCLONE.TAP')

function parseTap(buf) {
  const blocks = []
  let off = 0
  while (off + 2 <= buf.length) {
    const len = buf.readUInt16LE(off)
    off += 2
    const flag = buf[off]
    const payload = buf.subarray(off + 1, off + len - 1)
    blocks.push({ flag, payload })
    off += len
  }
  return blocks
}

function getMainCode() {
  const blocks = parseTap(tap)
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.flag !== 0 || b.payload.length !== 17) continue
    const name = b.payload.subarray(1, 11).toString('ascii').replace(/\0/g, ' ').trimEnd()
    if (name === 'Cyclone3') {
      return {
        loadAddr: b.payload.readUInt16LE(13),
        code: Buffer.from(blocks[i + 1].payload),
      }
    }
  }
  throw new Error('Cyclone3 not found')
}

function writePgm(path, width, height, pixels /* 0-255 */) {
  const header = `P5\n${width} ${height}\n255\n`
  fs.writeFileSync(path, Buffer.concat([Buffer.from(header), Buffer.from(pixels)]))
}

function autocorrelateWidth(buf, start, length, maxW = 256) {
  const slice = buf.subarray(start, start + length)
  const scores = []
  for (let w = 32; w <= maxW; w++) {
    let same = 0
    let total = 0
    for (let i = 0; i + w < slice.length; i++) {
      if (slice[i] === slice[i + w]) same++
      total++
    }
    scores.push({ w, corr: same / total })
  }
  return scores.sort((a, b) => b.corr - a.corr).slice(0, 15)
}

const { loadAddr, code } = getMainCode()
fs.mkdirSync('tools/map-previews', { recursive: true })

// Focus around the zero-run cluster (~16100)
const focusStarts = [14000, 14500, 15000, 15500, 16000, 16500, 17000, 17500, 18000]
for (const start of focusStarts) {
  const len = Math.min(20000, code.length - start)
  console.log(
    `\ncorr @${start} (addr ${loadAddr + start}):`,
    autocorrelateWidth(code, start, len).slice(0, 8),
  )
}

// Also global best widths by sampling every 1k
const global = []
for (let start = 0; start + 8000 < code.length; start += 1024) {
  const top = autocorrelateWidth(code, start, 8000, 200)[0]
  if (top) global.push({ start, addr: loadAddr + start, ...top })
}
global.sort((a, b) => b.corr - a.corr)
console.log('\nglobal best width samples', global.slice(0, 20))

// Render several width hypotheses around zero-run area
const renderStart = 14656
const renderHeights = [64, 80, 96, 112, 120, 128, 140]
const renderWidths = [64, 80, 96, 100, 112, 120, 128, 130, 132, 140, 160]

for (const w of renderWidths) {
  for (const h of renderHeights) {
    const size = w * h
    if (renderStart + size > code.length) continue
    const pixels = new Uint8Array(size)
    for (let i = 0; i < size; i++) {
      const v = code[renderStart + i]
      // emphasize non-zero as land
      pixels[i] = v === 0 ? 20 : Math.min(255, 40 + (v % 32) * 7)
    }
    writePgm(
      `tools/map-previews/s${renderStart}_w${w}_h${h}.pgm`,
      w,
      h,
      pixels,
    )
  }
}

// Also dump byte frequency in a likely map window and first differing rows
function dumpRows(start, w, rows) {
  console.log(`\nrows start=${start} w=${w}`)
  for (let r = 0; r < rows; r++) {
    const row = code.subarray(start + r * w, start + (r + 1) * w)
    const nonzero = [...row].filter((b) => b !== 0).length
    const uniq = new Set(row).size
    // compact: show runs
    const runs = []
    let i = 0
    while (i < row.length) {
      let j = i + 1
      while (j < row.length && row[j] === row[i]) j++
      runs.push(`${row[i]}x${j - i}`)
      i = j
    }
    console.log(
      `r${r} nz=${nonzero} uniq=${uniq} runs=${runs.slice(0, 12).join(',')}${runs.length > 12 ? '...' : ''}`,
    )
  }
}

for (const w of [128, 130, 132, 160]) {
  dumpRows(14656, w, 8)
  dumpRows(16000, w, 8)
}

// Search for overview/radar mini-map: small island bitmask or coords
// Look for sequences of coordinate pairs that might mark island centers
function findCoordTables(buf, loadAddr) {
  const hits = []
  // look for repeating (x,y) with x,y in 0..200
  for (let i = 0; i + 40 < buf.length; i++) {
    let ok = 0
    const pts = []
    for (let k = 0; k < 14; k++) {
      const x = buf[i + k * 2]
      const y = buf[i + k * 2 + 1]
      if (x > 0 && x < 200 && y > 0 && y < 200) {
        ok++
        pts.push([x, y])
      } else break
    }
    if (ok >= 10) {
      hits.push({ start: i, addr: loadAddr + i, count: ok, pts: pts.slice(0, 14) })
      i += ok * 2
    }
  }
  return hits.slice(0, 30)
}

console.log('\ncoord-pair table candidates', findCoordTables(code, loadAddr).slice(0, 15))

// Save extracted CODE for further work
fs.writeFileSync('tools/cyclone3.bin', code)
fs.writeFileSync(
  'tools/cyclone3.meta.json',
  JSON.stringify(
    {
      loadAddr,
      length: code.length,
      endAddr: loadAddr + code.length - 1,
      source: 'image/CYCLONE.TAP block Cyclone3',
    },
    null,
    2,
  ),
)
console.log('\nwrote tools/cyclone3.bin')
