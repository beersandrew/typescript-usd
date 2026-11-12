// Minimal PNG reader/writer for the asset-acceptance comparison: 8-bit,
// non-interlaced grey/grey+alpha/RGB/RGBA (what usdrecord and a WebGPU
// canvas's toBlob write). Tooling only.
import { inflateSync, deflateSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'

/** Returns { width, height, data } with data as RGBA8, top row first. */
export function readPng(path) {
  const buf = readFileSync(path)
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path}: not a PNG`)
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('latin1', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  if (bitDepth !== 8 || interlace) throw new Error(`${path}: unsupported PNG (bit depth ${bitDepth}, interlace ${interlace})`)
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`${path}: unsupported PNG colour type ${colorType}`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels, out = new Uint8Array(width * height * 4)
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      cur[i] = v & 255
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4, s = x * channels
      if (channels <= 2) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = channels === 2 ? cur[s + 1] : 255 }
      else { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = channels === 4 ? cur[s + 3] : 255 }
    }
    ;[prev, cur] = [cur, prev]
  }
  return { width, height, data: out }
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = bytes => { let c = 0xffffffff; for (const x of bytes) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}

/** Writes RGBA8 ({ width, height, data }) as a PNG. */
export function writePng(path, { width, height, data }) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1)
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}
