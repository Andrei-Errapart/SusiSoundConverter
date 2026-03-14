import { SAMPLE_RATE } from './constants'

/** Format a byte count as a duration string like "5.123s". */
export function formatDuration(bytes: number): string {
  const msTotal = Math.round((bytes * 1000) / SAMPLE_RATE)
  const secs = Math.floor(msTotal / 1000)
  const ms = msTotal % 1000
  return `${secs}.${String(ms).padStart(3, '0')}s`
}

/** Compute total audio size across all tables in a file. */
export function computeTotalAudioSize(
  tables: { slots: ({ audio: Uint8Array } | null)[] }[]
): number {
  let total = 0
  for (const table of tables) {
    for (const slot of table.slots) {
      if (slot) total += slot.audio.length
    }
  }
  return total
}

/**
 * Given an array of {address, index} entries sorted by address,
 * compute sizes using the "next address minus current" algorithm.
 * The last entry extends to fileSize.
 */
export function computeTrackSizes(
  entries: { address: number; tableIndex: number; slotIndex: number }[],
  fileSize: number
): Map<string, number> {
  const sorted = [...entries].sort((a, b) => a.address - b.address)
  const sizes = new Map<string, number>()

  for (let i = 0; i < sorted.length; i++) {
    const key = `${sorted[i].tableIndex}:${sorted[i].slotIndex}`
    const current = sorted[i].address
    let size: number

    if (i + 1 < sorted.length) {
      size = sorted[i + 1].address - current
    } else {
      size = current < fileSize ? fileSize - current : 0
    }
    sizes.set(key, Math.max(0, size))
  }

  return sizes
}

/** Check if 3 raw bytes are the "unused" marker FF FF FF. */
export function isUnused(data: Uint8Array): boolean {
  return data[0] === 0xFF && data[1] === 0xFF && data[2] === 0xFF
}
