import fs from 'fs'

const MAP_OFF = 13092
const MAP_SIZE = 16384
const CYCLONE3_LOAD = 0x5fdc
const CYCLONE3_LENGTH = 40630

function parseTap(buf) {
  const blocks = []
  let i = 0
  while (i + 2 <= buf.length) {
    const len = buf[i] | (buf[i + 1] << 8)
    i += 2
    if (len < 2 || i + len > buf.length) break
    const flag = buf[i]
    const payload = buf.subarray(i + 1, i + len - 1)
    i += len
    if (flag === 0 && payload.length >= 17) {
      const name = String.fromCharCode(...payload.subarray(1, 11)).replace(/\0/g, '').trimEnd()
      blocks.push({
        flag,
        data: payload,
        header: {
          type: payload[0],
          name,
          length: payload[11] | (payload[12] << 8),
          param1: payload[13] | (payload[14] << 8),
          param2: payload[15] | (payload[16] << 8),
        },
      })
    } else blocks.push({ flag, data: payload })
  }
  return blocks
}

const tap = fs.readFileSync('image/CYCLONE.TAP')
const blocks = parseTap(tap)
const headers = blocks.filter((b) => b.header).map((b) => b.header)
console.log('headers', headers)

for (let b = 0; b < blocks.length - 1; b++) {
  const hdr = blocks[b]
  const data = blocks[b + 1]
  if (!hdr?.header || data?.flag !== 0xff) continue
  const h = hdr.header
  if (h.type !== 3) continue
  if (/cyclone3/i.test(h.name) || h.length === CYCLONE3_LENGTH || h.param1 === CYCLONE3_LOAD) {
    const map = data.data.subarray(MAP_OFF, MAP_OFF + MAP_SIZE)
    const stock = fs.readFileSync('public/levels/stock-map-128.bin')
    let same = map.length === stock.length
    if (same) for (let i = 0; i < map.length; i++) if (map[i] !== stock[i]) { same = false; break }
    console.log({ name: h.name, len: data.data.length, load: h.param1, matchStock: same })
  }
}
