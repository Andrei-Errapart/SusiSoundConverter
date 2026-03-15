import { unzipSync } from 'fflate'

const SOUND_EXTENSIONS = /\.(dsd|ds3|ds4|dsu|dx4|ds6)$/i

/**
 * If the file is a ZIP containing exactly one sound file, extract and return it.
 * Returns { data, filename } or null if not a ZIP / no match / multiple matches.
 */
export function extractSoundFromZip(
  data: Uint8Array,
  _zipFilename: string,
): { data: Uint8Array; filename: string } | null {
  // Quick check for PK\x03\x04 ZIP magic
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4B || data[2] !== 0x03 || data[3] !== 0x04) {
    return null
  }

  const entries = unzipSync(data)
  const soundEntries = Object.entries(entries).filter(([name]) => SOUND_EXTENSIONS.test(name))

  if (soundEntries.length !== 1) {
    return null
  }

  const [path, fileData] = soundEntries[0]
  // Use just the basename (ZIP entries may include directory paths)
  const filename = path.includes('/') ? path.substring(path.lastIndexOf('/') + 1) : path
  return { data: fileData, filename }
}
