import type { SoundFile, TrackTable } from '../types/sound-file'
import {
  DS3_HEADER_SIZE, DS6_HEADER_SIZE,
  PRIMARY_OFF, PRIMARY_COUNT,
  MIDDLE_OFF, MIDDLE_COUNT,
  DSU_PTR_OFF, DSU_SLOT_COUNT,
  EXTENDED_OFF, EXTENDED_COUNT,
  CONFIG_OFF, CONFIG_LEN,
  DS6_PRIMARY_OFF, DS6_PRIMARY_COUNT,
  DS6_EXT1_OFF, DS6_EXT1_COUNT,
  DS6_EXT2_OFF, DS6_EXT2_COUNT,
  DS6_EXT3_OFF, DS6_EXT3_COUNT,
  DS6_NAME_OFF, DS6_NAME_LEN,
} from './constants'
import { xorEncodeAddress, xorEncodeByte, writeLE24 } from './xor'

export class SerializeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SerializeError'
  }
}

export function serializeFile(file: SoundFile): Uint8Array {
  if (file.format === 'DS6') {
    return serializeDS6(file)
  }
  return serializeDS3Family(file)
}

function serializeDS3Family(file: SoundFile): Uint8Array {
  const headerSize = DS3_HEADER_SIZE

  // Find tables by kind
  const primaryTable = file.tables.find(t => t.kind === 'primary')
  const middleTable = file.tables.find(t => t.kind === 'middle')
  const extendedTable = file.tables.find(t => t.kind === 'extended')
  const dsuTable = file.tables.find(t => t.kind === 'dsu')

  // Calculate total audio size (primary + middle + extended)
  let totalAudio = 0
  const audioOrder: { table: TrackTable; slotIndex: number }[] = []

  // Primary tracks first
  if (primaryTable) {
    for (let i = 0; i < primaryTable.slots.length; i++) {
      const slot = primaryTable.slots[i]
      if (slot && slot.audio.length > 0) {
        totalAudio += slot.audio.length
        audioOrder.push({ table: primaryTable, slotIndex: i })
      }
    }
  }

  // Middle tracks (DX4)
  if (middleTable) {
    for (let i = 0; i < middleTable.slots.length; i++) {
      const slot = middleTable.slots[i]
      if (slot && slot.audio.length > 0) {
        totalAudio += slot.audio.length
        audioOrder.push({ table: middleTable, slotIndex: i })
      }
    }
  }

  // Extended tracks
  if (extendedTable) {
    for (let i = 0; i < extendedTable.slots.length; i++) {
      const slot = extendedTable.slots[i]
      if (slot && slot.audio.length > 0) {
        totalAudio += slot.audio.length
        audioOrder.push({ table: extendedTable, slotIndex: i })
      }
    }
  }

  // DSU extra: audio + trailing bytes
  let dsuExtra = 0
  if (dsuTable) {
    for (let i = 0; i < dsuTable.slots.length; i++) {
      const slot = dsuTable.slots[i]
      if (slot && slot.audio.length > 0) {
        dsuExtra += slot.audio.length + 1 // audio + trailing byte
      } else {
        dsuExtra += 1 // empty slot marker
      }
    }
  }

  const totalSize = headerSize + totalAudio + dsuExtra
  const output = new Uint8Array(totalSize)

  // Copy header template
  output.set(file.headerTemplate.subarray(0, headerSize))

  // Lay out audio and record addresses
  const addressMap = new Map<string, number>()
  let writePos = headerSize

  // Write primary/middle/extended audio (XOR-encode back to file format)
  for (const { table, slotIndex } of audioOrder) {
    const slot = table.slots[slotIndex]!
    const key = `${table.kind}:${slotIndex}`
    addressMap.set(key, writePos)
    for (let j = 0; j < slot.audio.length; j++) {
      output[writePos + j] = slot.audio[j] ^ ((writePos + j) & 0xFF)
    }
    writePos += slot.audio.length
  }

  // For entries that have the same address as another (e.g., paired entries
  // where A == B, or multiple primary entries sharing an address), we need
  // to handle the case where a slot exists but has no audio of its own
  // (its audio is covered by another entry). Record their addresses too.

  // Write header: primary track entries
  if (primaryTable) {
    // Entries pointing to same audio as previous: reuse their address
    writePrimaryEntries(output, primaryTable, addressMap, PRIMARY_OFF, PRIMARY_COUNT)
  }

  // Write header: middle track entries (DX4)
  if (middleTable) {
    writePairedEntries(output, middleTable, addressMap, MIDDLE_OFF, MIDDLE_COUNT, true)
  }

  // Write header: extended track entries
  if (extendedTable) {
    writePairedEntries(output, extendedTable, addressMap, EXTENDED_OFF, EXTENDED_COUNT, true)
  }

  // Write config (XOR-encoded)
  for (let i = 0; i < CONFIG_LEN; i++) {
    output[CONFIG_OFF + i] = xorEncodeByte(file.config[i], CONFIG_OFF + i)
  }

  // DSU pointers and audio
  if (dsuTable) {
    for (let i = 0; i < DSU_SLOT_COUNT; i++) {
      const slot = dsuTable.slots[i]
      // Write pointer (plain LE24, NOT XOR-encoded)
      const ptrBuf = output.subarray(DSU_PTR_OFF + i * 3, DSU_PTR_OFF + i * 3 + 3)
      writeLE24(ptrBuf, writePos)

      if (slot && slot.audio.length > 0) {
        // Write clamped audio
        for (let j = 0; j < slot.audio.length; j++) {
          let b = slot.audio[j]
          if (b === 0x00) b = 0x01
          else if (b === 0xFF) b = 0xFE
          output[writePos++] = b
        }
        // Trailing byte: End segments (idx 2,5,8,11) get 0x00, others get 0xFF
        output[writePos++] = (i % 3 === 2) ? 0x00 : 0xFF
      } else {
        // Empty slot marker
        output[writePos++] = 0x00
      }
    }
  }

  return output
}

function writePrimaryEntries(
  output: Uint8Array,
  table: TrackTable,
  addressMap: Map<string, number>,
  tableOff: number,
  count: number
): void {
  for (let i = 0; i < count; i++) {
    const off = tableOff + i * 3
    const slot = i < table.slots.length ? table.slots[i] : null
    if (!slot) {
      // Unused: write raw FF FF FF
      output[off] = 0xFF
      output[off + 1] = 0xFF
      output[off + 2] = 0xFF
    } else {
      const key = `${table.kind}:${i}`
      const addr = addressMap.get(key)
      if (addr !== undefined) {
        xorEncodeAddress(output.subarray(off, off + 3), off, addr)
      } else {
        // Track exists but has no own audio block — find the address
        // of the next entry that does have audio, or use the current write position
        // This handles the case of zero-length tracks that share an address
        const nextAddr = findNextAddress(table, i, addressMap)
        xorEncodeAddress(output.subarray(off, off + 3), off, nextAddr)
      }
    }
  }
}

function writePairedEntries(
  output: Uint8Array,
  table: TrackTable,
  addressMap: Map<string, number>,
  tableOff: number,
  count: number,
  xorEncode: boolean
): void {
  for (let i = 0; i < count; i++) {
    const off = tableOff + i * 3
    const slot = i < table.slots.length ? table.slots[i] : null
    if (!slot) {
      output[off] = 0xFF
      output[off + 1] = 0xFF
      output[off + 2] = 0xFF
    } else {
      const key = `${table.kind}:${i}`
      let addr = addressMap.get(key)
      if (addr === undefined) {
        addr = findNextAddress(table, i, addressMap)
      }

      // For B entry in a pair where A != B, compute B address from loop offset
      if (i % 2 === 1) {
        const aSlot = table.slots[i - 1]
        if (aSlot && aSlot.loopOffset > 0) {
          const aKey = `${table.kind}:${i - 1}`
          const aAddr = addressMap.get(aKey)
          if (aAddr !== undefined) {
            addr = aAddr + aSlot.loopOffset
          }
        }
      }

      if (xorEncode) {
        xorEncodeAddress(output.subarray(off, off + 3), off, addr)
      } else {
        writeLE24(output.subarray(off, off + 3), addr)
      }
    }
  }
}

function findNextAddress(
  table: TrackTable,
  fromIndex: number,
  addressMap: Map<string, number>
): number {
  // Find the next slot that has an address
  for (let j = fromIndex + 1; j < table.slots.length; j++) {
    const key = `${table.kind}:${j}`
    const addr = addressMap.get(key)
    if (addr !== undefined) return addr
  }
  // Fall back: use the address of the first slot (shouldn't happen in practice)
  for (let j = 0; j < table.slots.length; j++) {
    const key = `${table.kind}:${j}`
    const addr = addressMap.get(key)
    if (addr !== undefined) return addr
  }
  return DS3_HEADER_SIZE
}

function serializeDS6(file: SoundFile): Uint8Array {
  const headerSize = DS6_HEADER_SIZE

  const primaryTable = file.tables.find(t => t.kind === 'primary')
  const ext1Table = file.tables.find(t => t.kind === 'ds6_ext1')
  const ext2Table = file.tables.find(t => t.kind === 'ds6_ext2')
  const ext3Table = file.tables.find(t => t.kind === 'ds6_ext3')

  // Calculate total audio
  let totalAudio = 0
  const audioOrder: { table: TrackTable; slotIndex: number }[] = []

  for (const table of [primaryTable, ext1Table, ext2Table, ext3Table]) {
    if (!table) continue
    for (let i = 0; i < table.slots.length; i++) {
      const slot = table.slots[i]
      if (slot && slot.audio.length > 0) {
        totalAudio += slot.audio.length
        audioOrder.push({ table, slotIndex: i })
      }
    }
  }

  const totalSize = headerSize + totalAudio
  const output = new Uint8Array(totalSize)

  // Start with the decoded header template: XOR-decode the raw template
  // so we can work with decoded bytes, then XOR-encode the entire output at the end
  for (let i = 0; i < headerSize; i++) {
    output[i] = xorEncodeByte(file.headerTemplate[i], i)
    // headerTemplate stores the ORIGINAL raw bytes, so XOR-decoding gives decoded.
    // Wait — headerTemplate for DS6 stores raw bytes from the original file.
    // We XOR-decode to get the decoded form, modify it, then XOR-encode everything.
  }
  // Actually: let's decode the template first to get plain bytes
  const decoded = new Uint8Array(headerSize)
  for (let i = 0; i < headerSize; i++) {
    decoded[i] = xorEncodeByte(file.headerTemplate[i], i)
  }

  // Copy decoded header into output
  output.set(decoded)

  // Lay out audio (decoded) and record addresses
  const addressMap = new Map<string, number>()
  let writePos = headerSize

  for (const { table, slotIndex } of audioOrder) {
    const slot = table.slots[slotIndex]!
    addressMap.set(`${table.kind}:${slotIndex}`, writePos)
    output.set(slot.audio, writePos) // audio is already decoded in DS6
    writePos += slot.audio.length
  }

  // Write primary entries (decoded LE24)
  if (primaryTable) {
    for (let i = 0; i < DS6_PRIMARY_COUNT; i++) {
      const off = DS6_PRIMARY_OFF + i * 3
      const slot = i < primaryTable.slots.length ? primaryTable.slots[i] : null
      if (!slot) {
        // Must write decoded FF FF FF equivalent — but since we'll XOR-encode
        // the entire file at the end, we need raw FF FF FF to appear in the
        // final output. So we write the XOR-decoded form of FF FF FF.
        // decoded[off] should produce raw FF when XOR'd with offset.
        // raw = decoded ^ offset, we want raw = FF, so decoded = FF ^ offset
        // But actually, we want the raw output (after final XOR) to be FF FF FF.
        // Since we'll XOR the entire output at the end:
        //   final_raw[off] = output[off] ^ (off & 0xFF)
        // We want final_raw = FF, so output[off] = FF ^ (off & 0xFF)
        // That's the "decoded" form of FF. Let's just set decoded bytes.
        output[off] = 0xFF ^ (off & 0xFF)
        output[off + 1] = 0xFF ^ ((off + 1) & 0xFF)
        output[off + 2] = 0xFF ^ ((off + 2) & 0xFF)
      } else {
        const key = `primary:${i}`
        let addr = addressMap.get(key)
        if (addr === undefined) addr = findNextAddress(primaryTable, i, addressMap)
        // Write plain LE24 — the whole file gets XOR'd at the end
        output[off] = addr & 0xFF
        output[off + 1] = (addr >> 8) & 0xFF
        output[off + 2] = (addr >> 16) & 0xFF
      }
    }
  }

  // Helper for DS6 pair tables
  function writeDS6PairEntries(table: TrackTable | undefined, tableOff: number, count: number): void {
    if (!table) return
    for (let i = 0; i < count; i++) {
      const off = tableOff + i * 3
      const slot = i < table.slots.length ? table.slots[i] : null
      if (!slot) {
        output[off] = 0xFF ^ (off & 0xFF)
        output[off + 1] = 0xFF ^ ((off + 1) & 0xFF)
        output[off + 2] = 0xFF ^ ((off + 2) & 0xFF)
      } else {
        const key = `${table.kind}:${i}`
        let addr = addressMap.get(key)
        if (addr === undefined) addr = findNextAddress(table, i, addressMap)

        // B entry in pair: adjust for loop offset
        if (i % 2 === 1) {
          const aSlot = table.slots[i - 1]
          if (aSlot && aSlot.loopOffset > 0) {
            const aAddr = addressMap.get(`${table.kind}:${i - 1}`)
            if (aAddr !== undefined) addr = aAddr + aSlot.loopOffset
          }
        }

        output[off] = addr & 0xFF
        output[off + 1] = (addr >> 8) & 0xFF
        output[off + 2] = (addr >> 16) & 0xFF
      }
    }
  }

  writeDS6PairEntries(ext1Table, DS6_EXT1_OFF, DS6_EXT1_COUNT)
  writeDS6PairEntries(ext2Table, DS6_EXT2_OFF, DS6_EXT2_COUNT)
  writeDS6PairEntries(ext3Table, DS6_EXT3_OFF, DS6_EXT3_COUNT)

  // Write config (plain decoded bytes — will be XOR'd with the rest)
  for (let i = 0; i < CONFIG_LEN; i++) {
    output[CONFIG_OFF + i] = file.config[i]
  }

  // Write sound name
  if (file.soundName !== undefined) {
    const nameBytes = new Uint8Array(DS6_NAME_LEN).fill(0x20) // space-padded
    for (let i = 0; i < Math.min(file.soundName.length, DS6_NAME_LEN); i++) {
      nameBytes[i] = file.soundName.charCodeAt(i)
    }
    output.set(nameBytes, DS6_NAME_OFF)
  }

  // XOR-encode the ENTIRE output (header + audio)
  for (let i = 0; i < output.length; i++) {
    output[i] = output[i] ^ (i & 0xFF)
  }

  return output
}

/** Trigger a file download in the browser. */
export function downloadFile(data: Uint8Array, filename: string): void {
  const blob = new Blob([data], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
