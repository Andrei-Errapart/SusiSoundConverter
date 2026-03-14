import type { SoundFile, SoundFormat, Track, TrackTable, TrackTableKind } from '../types/sound-file'
import {
  DS3_HEADER_SIZE, DS6_HEADER_SIZE,
  PRIMARY_OFF, PRIMARY_COUNT,
  MIDDLE_OFF, MIDDLE_COUNT, PADDING_END,
  DSU_PTR_OFF, DSU_PTR_END, DSU_SLOT_COUNT,
  EXTENDED_OFF, EXTENDED_COUNT,
  CONFIG_OFF, CONFIG_LEN,
  DS6_PRIMARY_OFF, DS6_PRIMARY_COUNT,
  DS6_EXT1_OFF, DS6_EXT1_COUNT,
  DS6_EXT2_OFF, DS6_EXT2_COUNT,
  DS6_EXT3_OFF, DS6_EXT3_COUNT,
  DS6_NAME_OFF, DS6_NAME_LEN,
  FLASH_32MBIT, FLASH_64MBIT,
} from './constants'
import { xorDecodeAddress, xorDecodeByte, readLE24, xorDecodeBuffer } from './xor'
import { isUnused } from './track-utils'

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

interface RawEntry {
  address: number
  tableKind: TrackTableKind
  slotIndex: number
}

/** XOR-decode a slice of the file (audio data is XOR-encoded in all formats). */
function decodeAudioSlice(data: Uint8Array, start: number, size: number): Uint8Array {
  const out = new Uint8Array(size)
  for (let i = 0; i < size; i++) {
    out[i] = data[start + i] ^ ((start + i) & 0xFF)
  }
  return out
}

export function parseFile(data: Uint8Array, filename: string): SoundFile {
  if (data.length < DS3_HEADER_SIZE) {
    throw new ParseError(`File too small (${data.length} bytes, need at least ${DS3_HEADER_SIZE})`)
  }

  // Check magic
  if (data[0] !== 0xDD || data[1] !== 0x33) {
    if (data[0] === 0x00 && data[1] === 0xFF) {
      throw new ParseError('Encrypted file — not supported')
    }
    throw new ParseError(`Invalid magic: ${hex2(data[0])} ${hex2(data[1])}`)
  }

  // Check format tag
  if (data[2] === 0x25 && data[3] === 0x05) {
    return parseDS6(data, filename)
  }

  return parseDS3Family(data, filename)
}

function parseDS3Family(data: Uint8Array, filename: string): SoundFile {
  const headerTemplate = new Uint8Array(data.slice(0, DS3_HEADER_SIZE))
  const allEntries: RawEntry[] = []
  const tables: TrackTable[] = []

  // Parse primary track index
  const primaryAddrs: (number | null)[] = []
  for (let i = 0; i < PRIMARY_COUNT; i++) {
    const off = PRIMARY_OFF + i * 3
    const raw = data.subarray(off, off + 3)
    if (isUnused(raw)) {
      primaryAddrs.push(null)
    } else {
      const addr = xorDecodeAddress(raw, off)
      primaryAddrs.push(addr)
      allEntries.push({ address: addr, tableKind: 'primary', slotIndex: i })
    }
  }

  // Parse extended track index
  const extAddrs: (number | null)[] = []
  for (let i = 0; i < EXTENDED_COUNT; i++) {
    const off = EXTENDED_OFF + i * 3
    const raw = data.subarray(off, off + 3)
    if (isUnused(raw)) {
      extAddrs.push(null)
    } else {
      const addr = xorDecodeAddress(raw, off)
      extAddrs.push(addr)
      // Only A entries (even) participate in size computation; B is a loop point
      if (i % 2 === 0) {
        allEntries.push({ address: addr, tableKind: 'extended', slotIndex: i })
      }
    }
  }

  // Detect sub-format
  let format: SoundFormat = 'DS3'
  let hasMiddle = false
  let hasDsu = false

  for (let i = MIDDLE_OFF; i < PADDING_END; i++) {
    if (data[i] !== 0xFF) { hasMiddle = true; break }
  }
  if (!hasMiddle) {
    for (let i = DSU_PTR_OFF; i < DSU_PTR_END; i++) {
      if (data[i] !== 0xFF) { hasDsu = true; break }
    }
  }

  if (hasMiddle) format = 'DX4'
  else if (hasDsu) format = 'DSU'

  // Parse middle table (DX4)
  const middleAddrs: (number | null)[] = []
  if (hasMiddle) {
    for (let i = 0; i < MIDDLE_COUNT; i++) {
      const off = MIDDLE_OFF + i * 3
      const raw = data.subarray(off, off + 3)
      if (isUnused(raw)) {
        middleAddrs.push(null)
      } else {
        const addr = xorDecodeAddress(raw, off)
        middleAddrs.push(addr)
        // Only A entries (even) participate in size computation; B is a loop point
        if (i % 2 === 0) {
          allEntries.push({ address: addr, tableKind: 'middle', slotIndex: i })
        }
      }
    }
  }

  // Parse DSU pointers
  const dsuAddrs: (number | null)[] = []
  if (hasDsu) {
    for (let i = 0; i < DSU_SLOT_COUNT; i++) {
      const off = DSU_PTR_OFF + i * 3
      const raw = data.subarray(off, off + 3)
      const addr = readLE24(raw) // NOT XOR-encoded
      dsuAddrs.push(addr)
      allEntries.push({ address: addr, tableKind: 'dsu', slotIndex: i })
    }
  }

  // Decode config
  const config = new Uint8Array(CONFIG_LEN)
  for (let i = 0; i < CONFIG_LEN; i++) {
    config[i] = xorDecodeByte(data[CONFIG_OFF + i], CONFIG_OFF + i)
  }

  // Sort all entries by address to compute audio boundaries
  const sorted = [...allEntries].sort((a, b) => a.address - b.address)
  const audioMap = new Map<string, { start: number; size: number }>()

  // Compute sizes, then propagate backward for duplicate addresses
  const sizes: number[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i + 1 < sorted.length) {
      sizes.push(sorted[i + 1].address - sorted[i].address)
    } else {
      sizes.push(sorted[i].address < data.length ? data.length - sorted[i].address : 0)
    }
  }
  // Duplicate addresses: earlier entries get size 0 but should share the next entry's size
  for (let i = sizes.length - 2; i >= 0; i--) {
    if (sizes[i] === 0 && i + 1 < sorted.length && sorted[i].address === sorted[i + 1].address) {
      sizes[i] = sizes[i + 1]
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i]
    const key = `${entry.tableKind}:${entry.slotIndex}`
    let size = sizes[i]

    // DSU slots have a trailing byte — subtract it
    if (entry.tableKind === 'dsu' && size > 0) {
      size = Math.max(0, size - 1)
    }

    audioMap.set(key, { start: entry.address, size: Math.max(0, size) })
  }

  // Build primary table
  const primarySlots: (Track | null)[] = primaryAddrs.map((addr, i) => {
    if (addr === null) return null
    const info = audioMap.get(`primary:${i}`)
    if (!info || info.size === 0) return { index: i, table: 'primary' as TrackTableKind, audio: new Uint8Array(0), loopOffset: 0 }
    return {
      index: i,
      table: 'primary' as TrackTableKind,
      audio: decodeAudioSlice(data, info.start, info.size),
      loopOffset: 0,
    }
  })

  tables.push({
    kind: 'primary',
    label: `Primary (${PRIMARY_COUNT} entries)`,
    entryCount: PRIMARY_COUNT,
    isPaired: false,
    slots: primarySlots,
  })

  // Build middle table (DX4)
  if (hasMiddle) {
    const middleSlots: (Track | null)[] = middleAddrs.map((addr, i) => {
      if (addr === null) return null
      const info = audioMap.get(`middle:${i}`)
      // For pairs: compute loop offset from A/B difference
      let loopOffset = 0
      if (i % 2 === 0 && i + 1 < middleAddrs.length) {
        const addrB = middleAddrs[i + 1]
        if (addrB !== null && addr !== addrB) {
          loopOffset = addrB - addr
        }
      }
      if (!info || info.size === 0) return { index: i, table: 'middle' as TrackTableKind, audio: new Uint8Array(0), loopOffset }
      return {
        index: i,
        table: 'middle' as TrackTableKind,
        audio: decodeAudioSlice(data, info.start, info.size),
        loopOffset,
      }
    })

    tables.push({
      kind: 'middle',
      label: `Middle (${MIDDLE_COUNT / 2} pairs)`,
      entryCount: MIDDLE_COUNT,
      isPaired: true,
      slots: middleSlots,
    })
  }

  // Build extended table
  const extSlots: (Track | null)[] = extAddrs.map((addr, i) => {
    if (addr === null) return null
    const info = audioMap.get(`extended:${i}`)
    let loopOffset = 0
    if (i % 2 === 0 && i + 1 < extAddrs.length) {
      const addrB = extAddrs[i + 1]
      if (addrB !== null && addr !== addrB) {
        loopOffset = addrB - addr
      }
    }
    if (!info || info.size === 0) return { index: i, table: 'extended' as TrackTableKind, audio: new Uint8Array(0), loopOffset }
    return {
      index: i,
      table: 'extended' as TrackTableKind,
      audio: decodeAudioSlice(data, info.start, info.size),
      loopOffset,
    }
  })

  tables.push({
    kind: 'extended',
    label: `Extended (${EXTENDED_COUNT / 2} pairs)`,
    entryCount: EXTENDED_COUNT,
    isPaired: true,
    slots: extSlots,
  })

  // Build DSU table
  if (hasDsu) {
    const dsuSlots: (Track | null)[] = dsuAddrs.map((addr, i) => {
      if (addr === null) return null
      const info = audioMap.get(`dsu:${i}`)
      if (!info || info.size === 0) return { index: i, table: 'dsu' as TrackTableKind, audio: new Uint8Array(0), loopOffset: 0 }
      return {
        index: i,
        table: 'dsu' as TrackTableKind,
        audio: data.slice(info.start, info.start + info.size), // DSU audio is raw (not XOR-encoded)
        loopOffset: 0,
      }
    })

    tables.push({
      kind: 'dsu',
      label: 'User Sounds (4 sounds × 3 segments)',
      entryCount: DSU_SLOT_COUNT,
      isPaired: false,
      slots: dsuSlots,
    })
  }

  return {
    filename,
    format,
    tables,
    config,
    headerTemplate,
    flashSize: FLASH_32MBIT,
    dirty: false,
  }
}

function parseDS6(data: Uint8Array, filename: string): SoundFile {
  if (data.length < DS6_HEADER_SIZE) {
    throw new ParseError(`DS6 file too small (${data.length} bytes, need at least ${DS6_HEADER_SIZE})`)
  }

  // DS6: XOR-decode the entire file into a working buffer
  const decoded = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    decoded[i] = xorDecodeByte(data[i], i)
  }

  // Save the original raw header as template (for re-encoding on export)
  const headerTemplate = new Uint8Array(data.slice(0, DS6_HEADER_SIZE))

  const allEntries: RawEntry[] = []
  const tables: TrackTable[] = []

  // Read sound name
  const nameBytes = decoded.subarray(DS6_NAME_OFF, DS6_NAME_OFF + DS6_NAME_LEN)
  let soundName = ''
  for (let i = 0; i < DS6_NAME_LEN; i++) {
    if (nameBytes[i] === 0) break
    soundName += String.fromCharCode(nameBytes[i])
  }
  soundName = soundName.trimEnd()

  // Parse primary track index (54 entries)
  // In the decoded buffer, addresses are already decoded
  const primaryAddrs: (number | null)[] = []
  for (let i = 0; i < DS6_PRIMARY_COUNT; i++) {
    const off = DS6_PRIMARY_OFF + i * 3
    // Check the ORIGINAL raw data for FF FF FF
    const raw = data.subarray(off, off + 3)
    if (isUnused(raw)) {
      primaryAddrs.push(null)
    } else {
      // Read decoded address from decoded buffer (plain LE24 after XOR decode)
      const addr = decoded[off] | (decoded[off + 1] << 8) | (decoded[off + 2] << 16)
      primaryAddrs.push(addr)
      allEntries.push({ address: addr, tableKind: 'primary', slotIndex: i })
    }
  }

  // Helper to parse a DS6 extended pair table
  function parsePairTable(
    baseOff: number, count: number, kind: TrackTableKind
  ): (number | null)[] {
    const addrs: (number | null)[] = []
    for (let i = 0; i < count; i++) {
      const off = baseOff + i * 3
      const raw = data.subarray(off, off + 3)
      if (isUnused(raw)) {
        addrs.push(null)
      } else {
        const addr = decoded[off] | (decoded[off + 1] << 8) | (decoded[off + 2] << 16)
        addrs.push(addr)
        // Only A entries (even) participate in size computation; B is a loop point
        if (i % 2 === 0) {
          allEntries.push({ address: addr, tableKind: kind, slotIndex: i })
        }
      }
    }
    return addrs
  }

  const ext1Addrs = parsePairTable(DS6_EXT1_OFF, DS6_EXT1_COUNT, 'ds6_ext1')
  const ext2Addrs = parsePairTable(DS6_EXT2_OFF, DS6_EXT2_COUNT, 'ds6_ext2')
  const ext3Addrs = parsePairTable(DS6_EXT3_OFF, DS6_EXT3_COUNT, 'ds6_ext3')

  // Decode config (from the already-decoded buffer)
  const config = new Uint8Array(CONFIG_LEN)
  for (let i = 0; i < CONFIG_LEN; i++) {
    config[i] = decoded[CONFIG_OFF + i]
  }

  // Sort all entries by address to compute audio boundaries
  const sorted = [...allEntries].sort((a, b) => a.address - b.address)
  const audioMap = new Map<string, { start: number; size: number }>()

  // Compute sizes, then propagate backward for duplicate addresses
  const sizes: number[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i + 1 < sorted.length) {
      sizes.push(sorted[i + 1].address - sorted[i].address)
    } else {
      sizes.push(sorted[i].address < data.length ? data.length - sorted[i].address : 0)
    }
  }
  for (let i = sizes.length - 2; i >= 0; i--) {
    if (sizes[i] === 0 && i + 1 < sorted.length && sorted[i].address === sorted[i + 1].address) {
      sizes[i] = sizes[i + 1]
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i]
    const key = `${entry.tableKind}:${entry.slotIndex}`
    const size = sizes[i]
    audioMap.set(key, { start: entry.address, size: Math.max(0, size) })
  }

  // Build tables — audio for DS6 comes from the decoded buffer
  function buildSlots(
    addrs: (number | null)[], kind: TrackTableKind
  ): (Track | null)[] {
    return addrs.map((addr, i) => {
      if (addr === null) return null
      const info = audioMap.get(`${kind}:${i}`)
      let loopOffset = 0
      // For pair tables, check A vs B
      if (kind !== 'primary' && i % 2 === 0 && i + 1 < addrs.length) {
        const addrB = addrs[i + 1]
        if (addrB !== null && addr !== addrB) {
          loopOffset = addrB - addr
        }
      }
      if (!info || info.size === 0) {
        return { index: i, table: kind, audio: new Uint8Array(0), loopOffset }
      }
      return {
        index: i,
        table: kind,
        audio: decoded.slice(info.start, info.start + info.size),
        loopOffset,
      }
    })
  }

  tables.push({
    kind: 'primary',
    label: `Primary (${DS6_PRIMARY_COUNT} entries)`,
    entryCount: DS6_PRIMARY_COUNT,
    isPaired: false,
    slots: buildSlots(primaryAddrs, 'primary'),
  })

  tables.push({
    kind: 'ds6_ext1',
    label: `Extended 1 (${DS6_EXT1_COUNT / 2} pairs)`,
    entryCount: DS6_EXT1_COUNT,
    isPaired: true,
    slots: buildSlots(ext1Addrs, 'ds6_ext1'),
  })

  tables.push({
    kind: 'ds6_ext2',
    label: `Extended 2 (${DS6_EXT2_COUNT / 2} pairs)`,
    entryCount: DS6_EXT2_COUNT,
    isPaired: true,
    slots: buildSlots(ext2Addrs, 'ds6_ext2'),
  })

  tables.push({
    kind: 'ds6_ext3',
    label: `Extended 3 (${DS6_EXT3_COUNT / 2} pairs)`,
    entryCount: DS6_EXT3_COUNT,
    isPaired: true,
    slots: buildSlots(ext3Addrs, 'ds6_ext3'),
  })

  return {
    filename,
    format: 'DS6',
    tables,
    config,
    soundName,
    headerTemplate,
    flashSize: FLASH_64MBIT,
    dirty: false,
  }
}

function hex2(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, '0')
}
