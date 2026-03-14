/** XOR-decode a single byte at the given file offset. */
export function xorDecodeByte(raw: number, fileOffset: number): number {
  return (raw ^ (fileOffset & 0xFF)) & 0xFF
}

/** XOR-encode a single byte at the given file offset (same operation as decode). */
export const xorEncodeByte = xorDecodeByte

/** Read a 3-byte LE24 XOR-decoded address from data at the given file offset. */
export function xorDecodeAddress(data: Uint8Array, fileOffset: number): number {
  const b0 = data[0] ^ (fileOffset & 0xFF)
  const b1 = data[1] ^ ((fileOffset + 1) & 0xFF)
  const b2 = data[2] ^ ((fileOffset + 2) & 0xFF)
  return (b0 & 0xFF) | ((b1 & 0xFF) << 8) | ((b2 & 0xFF) << 16)
}

/** Write a 3-byte LE24 XOR-encoded address into buf at the given file offset. */
export function xorEncodeAddress(buf: Uint8Array, fileOffset: number, address: number): void {
  buf[0] = ((address & 0xFF) ^ (fileOffset & 0xFF)) & 0xFF
  buf[1] = (((address >> 8) & 0xFF) ^ ((fileOffset + 1) & 0xFF)) & 0xFF
  buf[2] = (((address >> 16) & 0xFF) ^ ((fileOffset + 2) & 0xFF)) & 0xFF
}

/** Read a 3-byte plain LE24 address (not XOR'd — used for DSU pointers). */
export function readLE24(data: Uint8Array): number {
  return data[0] | (data[1] << 8) | (data[2] << 16)
}

/** Write a 3-byte plain LE24 address. */
export function writeLE24(buf: Uint8Array, address: number): void {
  buf[0] = address & 0xFF
  buf[1] = (address >> 8) & 0xFF
  buf[2] = (address >> 16) & 0xFF
}

/** XOR-decode a buffer region in place. */
export function xorDecodeBuffer(buf: Uint8Array, startOffset: number, length: number): void {
  for (let i = 0; i < length; i++) {
    buf[i] = xorDecodeByte(buf[i], startOffset + i)
  }
}

/** XOR-encode a buffer region in place (same as decode). */
export const xorEncodeBuffer = xorDecodeBuffer
