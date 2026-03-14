// CRC-32/ISO-HDLC (same as zlib/PNG/Ethernet)
const table = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  }
  table[i] = c >>> 0
}

export function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

export function crc32hex(data: Uint8Array): string {
  if (data.length === 0) return ''
  return crc32(data).toString(16).toUpperCase().padStart(8, '0')
}
