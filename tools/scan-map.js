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

const blocks = parseTap(tap)
const headers = []
for (let i = 0; i < blocks.length; i++) {
  const b = blocks[i]
  if (b.flag === 0 && b.payload.length === 17) {
    headers.push({
      i,
      type: b.payload[0],
      name: b.payload.subarray(1, 11).toString('ascii').replace(/\0/g, ' ').trimEnd(),
      dataLen: b.payload.readUInt16LE(11),
      param1: b.payload.readUInt16LE(13),
      param2: b.payload.readUInt16LE(15),
      data: blocks[i + 1]?.payload,
    })
  }
}

console.log(
  'headers',
  headers.map((h) => ({
    name: h.name,
    type: h.type,
    dataLen: h.dataLen,
    load: h.param1,
    autostart: h.param2,
  })),
)

const main = headers.find((h) => h.name === 'Cyclone3')
const code = Buffer.from(main.data)
const loadAddr = main.param1
console.log(
  'main CODE',
  code.length,
  'at',
  loadAddr,
  '($' + loadAddr.toString(16) + ')',
)

const hist = new Array(256).fill(0)
for (const v of code) hist[v]++
const top = hist
  .map((c, v) => ({ v, c }))
  .sort((a, b) => b.c - a.c)
  .slice(0, 15)
console.log('top bytes', top)

function findRuns(buf, minLen = 80) {
  const runs = []
  let i = 0
  while (i < buf.length) {
    let j = i + 1
    while (j < buf.length && buf[j] === buf[i]) j++
    const len = j - i
    if (len >= minLen) runs.push({ start: i, addr: loadAddr + i, len, byte: buf[i] })
    i = j
  }
  return runs.sort((a, b) => b.len - a.len)
}
console.log('long runs', findRuns(code).slice(0, 20))

function entropy(arr) {
  const h = new Array(256).fill(0)
  for (const v of arr) h[v]++
  let e = 0
  const n = arr.length
  for (const c of h) {
    if (c) {
      const p = c / n
      e -= p * Math.log2(p)
    }
  }
  return e
}

const widths = [
  64, 80, 96, 100, 112, 120, 128, 140, 150, 160, 168, 176, 180, 192, 200, 224,
  240, 256,
]
const heights = [
  64, 80, 96, 100, 112, 120, 128, 140, 150, 160, 168, 176, 180, 192, 200,
]
const sizes = []
for (const w of widths) {
  for (const h of heights) sizes.push({ w, h, size: w * h })
}

const scored = []
for (const { w, h, size } of sizes) {
  if (size > code.length - 100) continue
  const stride = size > 15000 ? 128 : 64
  for (let start = 0; start + size <= code.length; start += stride) {
    const slice = code.subarray(start, start + size)
    const lh = new Array(256).fill(0)
    for (const v of slice) lh[v]++
    let maxC = 0
    let maxV = 0
    for (let v = 0; v < 256; v++) {
      if (lh[v] > maxC) {
        maxC = lh[v]
        maxV = v
      }
    }
    const seaFrac = maxC / size
    const uniq = lh.filter((c) => c > 0).length
    if (seaFrac < 0.25 || seaFrac > 0.95) continue
    if (uniq < 8 || uniq > 120) continue
    const e = entropy(slice)
    if (e < 1.5 || e > 6.5) continue

    const rowSeas = []
    for (let r = 0; r < h; r++) {
      let sea = 0
      for (let c = 0; c < w; c++) if (slice[r * w + c] === maxV) sea++
      rowSeas.push(sea / w)
    }
    const mean = rowSeas.reduce((a, b) => a + b, 0) / h
    const rowSeaVar =
      rowSeas.reduce((a, b) => a + (b - mean) ** 2, 0) / h
    const score =
      seaFrac * 2 +
      (1 - Math.min(rowSeaVar * 8, 1)) +
      uniq / 50 -
      Math.abs(e - 3.5) * 0.2
    scored.push({
      start,
      addr: loadAddr + start,
      w,
      h,
      size,
      sea: maxV,
      seaFrac: +seaFrac.toFixed(3),
      uniq,
      e: +e.toFixed(2),
      rowSeaVar: +rowSeaVar.toFixed(4),
      score: +score.toFixed(3),
    })
  }
}

scored.sort((a, b) => b.score - a.score)
console.log('top map candidates', scored.slice(0, 25))
console.log(
  '160x140 candidates',
  scored.filter((s) => s.w === 160 && s.h === 140).slice(0, 10),
)

fs.mkdirSync('tools', { recursive: true })
fs.writeFileSync(
  'tools/_map_candidates.json',
  JSON.stringify({ top: scored.slice(0, 80), tll: scored.filter((s) => s.w === 160 && s.h === 140).slice(0, 20) }, null, 2),
)
console.log('wrote tools/_map_candidates.json')
