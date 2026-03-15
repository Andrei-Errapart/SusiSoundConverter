import type { SoundFile, TrackTable } from '../types/sound-file'
import {
  DS3_HEADER_SIZE, DS6_HEADER_SIZE, DHE_HEADER_SIZE,
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
  DHE_TABLE_OFF, DHE_RECORD_SIZE,
} from './constants'
import { xorEncodeAddress, xorEncodeByte, writeLE24 } from './xor'

export class SerializeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SerializeError'
  }
}

export function serializeFile(file: SoundFile): Uint8Array {
  if (file.format === 'DS6') return serializeDS6(file)
  if (file.format === 'DHE') return serializeDHE(file)
  return serializeDS3Family(file)
}

interface AudioEntry { table: TrackTable; slotIndex: number }

/** Deduplicate audio blocks: within each table, find slots that shared the same
 *  original address (i.e. pointed to the same audio block in the source file)
 *  and return only unique blocks plus a map from duplicate keys to canonical keys. */
function deduplicateAudio(
  audioOrder: AudioEntry[]
): { uniqueOrder: AudioEntry[]; sharedWith: Map<string, string> } {
  const uniqueOrder: AudioEntry[] = []
  const sharedWith = new Map<string, string>()
  // Map from "tableKind:originalAddress" to the canonical key
  const addrToCanon = new Map<string, string>()

  for (const entry of audioOrder) {
    const { table, slotIndex } = entry
    const slot = table.slots[slotIndex]!
    const key = `${table.kind}:${slotIndex}`
    const origAddr = slot.originalAddress

    if (origAddr !== undefined) {
      const addrKey = `${table.kind}:@${origAddr}`
      const canonKey = addrToCanon.get(addrKey)
      if (canonKey !== undefined) {
        sharedWith.set(key, canonKey)
        continue
      }
      addrToCanon.set(addrKey, key)
    }

    uniqueOrder.push(entry)
  }

  return { uniqueOrder, sharedWith }
}

function serializeDS3Family(file: SoundFile): Uint8Array {
  const headerSize = DS3_HEADER_SIZE

  // Find tables by kind
  const primaryTable = file.tables.find(t => t.kind === 'primary')
  const middleTable = file.tables.find(t => t.kind === 'middle')
  const extendedTable = file.tables.find(t => t.kind === 'extended')
  const dsuTable = file.tables.find(t => t.kind === 'dsu')

  // Collect all slots with audio
  const audioOrder: AudioEntry[] = []

  // Primary tracks first
  if (primaryTable) {
    for (let i = 0; i < primaryTable.slots.length; i++) {
      const slot = primaryTable.slots[i]
      if (slot && slot.audio.length > 0) {
        audioOrder.push({ table: primaryTable, slotIndex: i })
      }
    }
  }

  // Middle tracks (DX4)
  if (middleTable) {
    for (let i = 0; i < middleTable.slots.length; i++) {
      const slot = middleTable.slots[i]
      if (slot && slot.audio.length > 0) {
        audioOrder.push({ table: middleTable, slotIndex: i })
      }
    }
  }

  // Extended tracks
  if (extendedTable) {
    for (let i = 0; i < extendedTable.slots.length; i++) {
      const slot = extendedTable.slots[i]
      if (slot && slot.audio.length > 0) {
        audioOrder.push({ table: extendedTable, slotIndex: i })
      }
    }
  }

  // Sort by original address to preserve original disk layout
  audioOrder.sort((a, b) => {
    const addrA = a.table.slots[a.slotIndex]!.originalAddress ?? Infinity
    const addrB = b.table.slots[b.slotIndex]!.originalAddress ?? Infinity
    return addrA - addrB
  })

  // Deduplicate audio blocks within each table
  const { uniqueOrder, sharedWith } = deduplicateAudio(audioOrder)

  let totalAudio = 0
  for (const { table, slotIndex } of uniqueOrder) {
    totalAudio += table.slots[slotIndex]!.audio.length
  }

  const gap = !file.dirty ? file.preAudioGap : undefined
  const gapSize = gap ? gap.length : 0

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

  const totalSize = headerSize + gapSize + totalAudio + dsuExtra
  const output = new Uint8Array(totalSize)

  // Copy header template
  output.set(file.headerTemplate.subarray(0, headerSize))

  // Write pre-audio gap if present
  let writePos = headerSize
  if (gap) {
    output.set(gap, writePos)
    writePos += gap.length
  }

  // Lay out audio and record addresses
  const addressMap = new Map<string, number>()

  // Write unique audio blocks (XOR-encode back to file format)
  for (const { table, slotIndex } of uniqueOrder) {
    const slot = table.slots[slotIndex]!
    const key = `${table.kind}:${slotIndex}`
    addressMap.set(key, writePos)
    for (let j = 0; j < slot.audio.length; j++) {
      output[writePos + j] = slot.audio[j] ^ ((writePos + j) & 0xFF)
    }
    writePos += slot.audio.length
  }

  // Point duplicate slots to their canonical block's address
  for (const [dupKey, canonKey] of sharedWith) {
    addressMap.set(dupKey, addressMap.get(canonKey)!)
  }

  // Write header: primary track entries
  if (primaryTable) {
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

      // For B entry in a pair, compute B address from A address + loop offset
      if (i % 2 === 1) {
        const aSlot = table.slots[i - 1]
        if (aSlot) {
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

  // Collect all slots with audio
  const audioOrder: AudioEntry[] = []

  for (const table of [primaryTable, ext1Table, ext2Table, ext3Table]) {
    if (!table) continue
    for (let i = 0; i < table.slots.length; i++) {
      const slot = table.slots[i]
      if (slot && slot.audio.length > 0) {
        audioOrder.push({ table, slotIndex: i })
      }
    }
  }

  // Sort by original address to preserve original disk layout
  audioOrder.sort((a, b) => {
    const addrA = a.table.slots[a.slotIndex]!.originalAddress ?? Infinity
    const addrB = b.table.slots[b.slotIndex]!.originalAddress ?? Infinity
    return addrA - addrB
  })

  // Deduplicate audio blocks within each table
  const { uniqueOrder, sharedWith } = deduplicateAudio(audioOrder)

  let totalAudio = 0
  for (const { table, slotIndex } of uniqueOrder) {
    totalAudio += table.slots[slotIndex]!.audio.length
  }

  const gap = !file.dirty ? file.preAudioGap : undefined
  const gapSize = gap ? gap.length : 0

  const totalSize = headerSize + gapSize + totalAudio
  const output = new Uint8Array(totalSize)

  // Decode the raw header template to get plain bytes
  const decoded = new Uint8Array(headerSize)
  for (let i = 0; i < headerSize; i++) {
    decoded[i] = xorEncodeByte(file.headerTemplate[i], i)
  }

  // Copy decoded header into output
  output.set(decoded)

  // Write pre-audio gap if present (decoded bytes — will be XOR'd with the rest)
  let writePos = headerSize
  if (gap) {
    output.set(gap, writePos)
    writePos += gap.length
  }

  // Lay out audio (decoded) and record addresses
  const addressMap = new Map<string, number>()

  for (const { table, slotIndex } of uniqueOrder) {
    const slot = table.slots[slotIndex]!
    addressMap.set(`${table.kind}:${slotIndex}`, writePos)
    output.set(slot.audio, writePos) // audio is already decoded in DS6
    writePos += slot.audio.length
  }

  // Point duplicate slots to their canonical block's address
  for (const [dupKey, canonKey] of sharedWith) {
    addressMap.set(dupKey, addressMap.get(canonKey)!)
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

        // B entry in pair: compute from A address + loop offset
        if (i % 2 === 1) {
          const aSlot = table.slots[i - 1]
          if (aSlot) {
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

function serializeDHE(file: SoundFile): Uint8Array {
  const headerSize = DHE_HEADER_SIZE
  const dheTable = file.tables.find(t => t.kind === 'dhe_tracks')

  // Collect non-null slots with audio
  const audioOrder: AudioEntry[] = []
  if (dheTable) {
    for (let i = 0; i < dheTable.slots.length; i++) {
      const slot = dheTable.slots[i]
      if (slot && slot.audio.length > 0) {
        audioOrder.push({ table: dheTable, slotIndex: i })
      }
    }
  }

  // Sort by original address to preserve original disk layout
  audioOrder.sort((a, b) => {
    const addrA = a.table.slots[a.slotIndex]!.originalAddress ?? Infinity
    const addrB = b.table.slots[b.slotIndex]!.originalAddress ?? Infinity
    return addrA - addrB
  })

  // Deduplicate audio blocks
  const { uniqueOrder, sharedWith } = deduplicateAudio(audioOrder)

  let totalAudio = 0
  for (const { table, slotIndex } of uniqueOrder) {
    totalAudio += table.slots[slotIndex]!.audio.length
  }

  const gap = !file.dirty ? file.preAudioGap : undefined
  const gapSize = gap ? gap.length : 0

  const totalSize = headerSize + gapSize + totalAudio
  const output = new Uint8Array(totalSize)

  // Decode the raw header template to get plain bytes
  const decodedHeader = new Uint8Array(headerSize)
  for (let i = 0; i < headerSize; i++) {
    decodedHeader[i] = file.headerTemplate[i] ^ (i & 0xFF)
  }
  output.set(decodedHeader)

  // Write gap (decoded space)
  let writePos = headerSize
  if (gap) {
    output.set(gap, writePos)
    writePos += gap.length
  }

  // Write audio: convert signed 16-bit back to unsigned (flip MSB of high bytes)
  const addressMap = new Map<string, number>()

  for (const { table, slotIndex } of uniqueOrder) {
    const slot = table.slots[slotIndex]!
    addressMap.set(`${table.kind}:${slotIndex}`, writePos)

    for (let j = 0; j < slot.audio.length; j++) {
      let b = slot.audio[j]
      if (j % 2 === 1) b ^= 0x80 // signed → unsigned
      output[writePos + j] = b
    }
    writePos += slot.audio.length
  }

  // Point duplicates
  for (const [dupKey, canonKey] of sharedWith) {
    addressMap.set(dupKey, addressMap.get(canonKey)!)
  }

  // Rewrite record table addresses
  if (file.dheRecords && dheTable) {
    // Build map from original address to new address
    const origToNew = new Map<number, { newAddr: number; audioLen: number }>()
    for (let i = 0; i < dheTable.slots.length; i++) {
      const slot = dheTable.slots[i]
      if (!slot) continue
      const key = `dhe_tracks:${i}`
      const newAddr = addressMap.get(key)
      if (newAddr !== undefined && slot.originalAddress !== undefined) {
        origToNew.set(slot.originalAddress, { newAddr, audioLen: slot.audio.length })
      }
    }

    for (let i = 0; i < file.dheRecords.length; i++) {
      const rec = file.dheRecords[i]
      const off = DHE_TABLE_OFF + i * DHE_RECORD_SIZE

      let newA: number
      const mapped = origToNew.get(rec.addrA)
      if (mapped !== undefined) {
        newA = mapped.newAddr
      } else {
        // Sentinel: find the previous real track and place after its audio
        newA = rec.addrA // fallback
        for (let j = i - 1; j >= 0; j--) {
          const prev = origToNew.get(file.dheRecords[j].addrA)
          if (prev !== undefined) {
            newA = prev.newAddr + prev.audioLen
            break
          }
        }
      }

      const delta = newA - rec.addrA
      const newB = rec.addrB + delta
      const newC = rec.addrC + delta

      // Write LE24 addresses in decoded space
      output[off] = newA & 0xFF
      output[off + 1] = (newA >> 8) & 0xFF
      output[off + 2] = (newA >> 16) & 0xFF
      output[off + 3] = newB & 0xFF
      output[off + 4] = (newB >> 8) & 0xFF
      output[off + 5] = (newB >> 16) & 0xFF
      output[off + 6] = newC & 0xFF
      output[off + 7] = (newC >> 8) & 0xFF
      output[off + 8] = (newC >> 16) & 0xFF
      // flags (bytes 9-10) preserved from decoded header
    }
  }

  // XOR-encode entire output
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
