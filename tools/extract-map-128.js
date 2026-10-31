import fs from 'fs'
import { createRequire } from 'module'

const code = fs.readFileSync('tools/cyclone3.bin')
const meta = JSON.parse(fs.readFileSync('tools/cyclone3.meta.json', 'utf8'))
const loadAddr = meta.loadAddr
const W = 128

function rowStats(startRowOffset) {
  const rows = []
  const maxRows = Math.floor((code.length - startRowOffset) / W)
  for (let r = 0; r < maxRows; r++) {
    const off = startRowOffset + r * W
    const row = code.subarray(off, off + W)
    let zeros = 0
    const hist = new Array(256).fill(0)
    for (const b of row) {
      hist[b]++
      if (b === 0) zeros++
    }
    const uniq = hist.filter((c) => c > 0).length
    rows.push({ r, off, addr: loadAddr + off, zeros, seaFrac: zeros / W, uniq })
  }
  return rows
}

// Try alignments 0..127 relative to file start for best "island map" stretch
function scoreAlignment(align) {
  const rows = rowStats(align)
  // Find longest stretch where seaFrac is mostly high but not always 1, and uniq modest
  let best = { len: 0, start: 0, end: 0 }
  let i = 0
  while (i < rows.length) {
    if (rows[i].seaFrac < 0.35 || rows[i].seaFrac > 0.98 || rows[i].uniq > 40) {
      i++
      continue
    }
    let j = i
    while (
      j < rows.length &&
      rows[j].seaFrac >= 0.35 &&
      rows[j].seaFrac <= 0.98 &&
      rows[j].uniq <= 40
    ) {
      j++
    }
    const len = j - i
    if (len > best.len) best = { len, start: i, end: j }
    i = Math.max(j, i + 1)
  }
  return { align, ...best, startOff: align + best.start * W, endOff: align + best.end * W }
}

const alignments = []
for (let a = 0; a < W; a++) alignments.push(scoreAlignment(a))
alignments.sort((a, b) => b.len - a.len)
console.log('best alignments', alignments.slice(0, 10))

const best = alignments[0]
const mapOff = best.startOff
const mapH = best.len
const mapSize = W * mapH
const map = code.subarray(mapOff, mapOff + mapSize)

const hist = new Array(256).fill(0)
for (const b of map) hist[b]++
const topBytes = hist
  .map((c, v) => ({ v, c, pct: +((100 * c) / mapSize).toFixed(2) }))
  .filter((x) => x.c)
  .sort((a, b) => b.c - a.c)
  .slice(0, 20)

console.log({
  mapOff,
  mapAddr: loadAddr + mapOff,
  width: W,
  height: mapH,
  size: mapSize,
  endAddr: loadAddr + mapOff + mapSize - 1,
  topBytes,
})

// Write raw + PGM + simple PNG via raw PPM and hope
fs.mkdirSync('tools/map-previews', { recursive: true })
fs.writeFileSync('tools/map-128.bin', map)

const pgmPixels = Buffer.alloc(mapSize)
for (let i = 0; i < mapSize; i++) {
  const v = map[i]
  pgmPixels[i] = v === 0 ? 30 : Math.min(255, 50 + (v & 0x1f) * 8)
}
fs.writeFileSync(
  'tools/map-previews/map128.pgm',
  Buffer.concat([Buffer.from(`P5\n${W} ${mapH}\n255\n`), pgmPixels]),
)

// PPM colorized by high nibble / low nibble guess (attr-ish)
const ppm = Buffer.alloc(mapSize * 3)
for (let i = 0; i < mapSize; i++) {
  const v = map[i]
  if (v === 0) {
    ppm[i * 3] = 10
    ppm[i * 3 + 1] = 40
    ppm[i * 3 + 2] = 90
  } else {
    const h = (v >> 4) & 0x0f
    const l = v & 0x0f
    ppm[i * 3] = 40 + h * 12
    ppm[i * 3 + 1] = 80 + l * 10
    ppm[i * 3 + 2] = 40 + ((v >> 2) & 0x0f) * 8
  }
}
fs.writeFileSync(
  'tools/map-previews/map128.ppm',
  Buffer.concat([Buffer.from(`P6\n${W} ${mapH}\n255\n`), ppm]),
)

// Convert PPM to PNG if sharp/pngjs unavailable - use pure node zlib PNG encoder minimal
function writePngGray(path, width, height, gray) {
  const require = createRequire(import.meta.url)
  let zlib
  try {
    zlib = require('zlib')
  } catch {
    return
  }
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = gray[y * width + x]
  }
  const compressed = zlib.deflateSync(raw)
  function crc32(buf) {
    let c = ~0
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i]
      for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
    }
    return ~c >>> 0
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const t = Buffer.from(type)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
    return Buffer.concat([len, t, data, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 0
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
  fs.writeFileSync(path, png)
}

writePngGray('tools/map-previews/map128.png', W, mapH, pgmPixels)
console.log('wrote tools/map-previews/map128.png')

// Print a few informative rows
const rows = rowStats(mapOff)
console.log(
  'sample rows',
  rows.slice(0, 5).concat(rows.slice(Math.floor(mapH / 2), Math.floor(mapH / 2) + 3), rows.slice(-3)),
)

fs.writeFileSync(
  'tools/map-128.meta.json',
  JSON.stringify(
    {
      width: W,
      height: mapH,
      fileOffsetInCyclone3: mapOff,
      spectrumAddress: loadAddr + mapOff,
      size: mapSize,
      alignmentScore: best,
      note: 'Hypothesis: 1 byte/cell terrain map, width 128, sea mostly 0. Encoding of non-zero cells TBD.',
    },
    null,
    2,
  ),
)
