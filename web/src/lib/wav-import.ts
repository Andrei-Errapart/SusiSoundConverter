import { SAMPLE_RATE } from './constants'

/**
 * Resample Float32 mono audio to targetRate, then convert to target bit depth.
 * Returns Uint8Array: for 8-bit unsigned PCM, or 16-bit signed LE PCM.
 */
function floatMonoToTarget(
  mono: Float32Array,
  srcRate: number,
  targetRate: number,
  targetBitDepth: number,
): Uint8Array {
  // Resample
  let resampled: Float32Array
  if (srcRate === targetRate) {
    resampled = mono
  } else {
    const ratio = srcRate / targetRate
    const outLen = Math.round(mono.length / ratio)
    resampled = new Float32Array(outLen)
    for (let i = 0; i < outLen; i++) {
      const srcIdx = i * ratio
      const idx0 = Math.floor(srcIdx)
      const idx1 = Math.min(idx0 + 1, mono.length - 1)
      const frac = srcIdx - idx0
      resampled[i] = mono[idx0] * (1 - frac) + mono[idx1] * frac
    }
  }

  if (targetBitDepth === 16) {
    // 16-bit signed LE
    const result = new Uint8Array(resampled.length * 2)
    const view = new DataView(result.buffer)
    for (let i = 0; i < resampled.length; i++) {
      const clamped = Math.max(-1, Math.min(1, resampled[i]))
      const sample = Math.max(-32768, Math.min(32767, Math.round(clamped * 32768)))
      view.setInt16(i * 2, sample, true)
    }
    return result
  } else {
    // 8-bit unsigned
    const result = new Uint8Array(resampled.length)
    for (let i = 0; i < resampled.length; i++) {
      const clamped = Math.max(-1, Math.min(1, resampled[i]))
      result[i] = Math.max(0, Math.min(255, Math.round(clamped * 128 + 128)))
    }
    return result
  }
}

/**
 * Parse a WAV file and convert to target format PCM.
 * Default: 8-bit unsigned mono at 13,021 Hz.
 */
export function importWav(
  buffer: ArrayBuffer,
  targetRate: number = SAMPLE_RATE,
  targetBitDepth: number = 8,
): Uint8Array {
  const view = new DataView(buffer)

  // --- Parse WAV header ---
  if (view.getUint32(0, false) !== 0x52494646) { // "RIFF"
    throw new Error('Not a WAV file (missing RIFF header)')
  }
  if (view.getUint32(8, false) !== 0x57415645) { // "WAVE"
    throw new Error('Not a WAV file (missing WAVE marker)')
  }

  // Find fmt and data chunks
  let sampleRate = 0
  let bitsPerSample = 0
  let numChannels = 0
  let audioFormat = 0
  let dataOffset = 0
  let dataSize = 0

  let offset = 12
  while (offset < buffer.byteLength - 8) {
    const chunkId = view.getUint32(offset, false)
    const chunkSize = view.getUint32(offset + 4, true)

    if (chunkId === 0x666D7420) { // "fmt "
      audioFormat = view.getUint16(offset + 8, true)
      numChannels = view.getUint16(offset + 10, true)
      sampleRate = view.getUint32(offset + 12, true)
      bitsPerSample = view.getUint16(offset + 22, true)
    } else if (chunkId === 0x64617461) { // "data"
      dataOffset = offset + 8
      dataSize = chunkSize
    }

    offset += 8 + chunkSize
    // Chunks are word-aligned
    if (chunkSize % 2 !== 0) offset++
  }

  if (audioFormat !== 1) {
    throw new Error(`Unsupported WAV format (audioFormat=${audioFormat}, expected PCM=1)`)
  }
  if (dataOffset === 0 || dataSize === 0) {
    throw new Error('WAV file has no data chunk')
  }
  if (numChannels < 1 || numChannels > 2) {
    throw new Error(`Unsupported channel count: ${numChannels}`)
  }
  if (![8, 16, 24].includes(bitsPerSample)) {
    throw new Error(`Unsupported bit depth: ${bitsPerSample}`)
  }

  // Already in target format — return raw data directly
  if (sampleRate === targetRate && bitsPerSample === targetBitDepth && numChannels === 1) {
    return new Uint8Array(buffer, dataOffset, dataSize)
  }

  // Decode to Float32 mono
  const bytesPerSample = bitsPerSample / 8
  const frameSize = bytesPerSample * numChannels
  const frameCount = Math.floor(dataSize / frameSize)
  const mono = new Float32Array(frameCount)

  for (let i = 0; i < frameCount; i++) {
    let sum = 0
    for (let ch = 0; ch < numChannels; ch++) {
      const pos = dataOffset + i * frameSize + ch * bytesPerSample
      let sample: number
      if (bitsPerSample === 8) {
        sample = (view.getUint8(pos) - 128) / 128
      } else if (bitsPerSample === 16) {
        sample = view.getInt16(pos, true) / 32768
      } else { // 24-bit
        const lo = view.getUint8(pos)
        const mid = view.getUint8(pos + 1)
        const hi = view.getInt8(pos + 2)
        sample = ((hi << 16) | (mid << 8) | lo) / 8388608
      }
      sum += sample
    }
    mono[i] = sum / numChannels
  }

  return floatMonoToTarget(mono, sampleRate, targetRate, targetBitDepth)
}

/**
 * Import any browser-supported audio format (MP3, OGG, FLAC, WAV, etc.)
 * using the Web Audio API, and convert to target format PCM.
 * Default: 8-bit unsigned mono at 13,021 Hz.
 */
export async function importAudioFile(
  buffer: ArrayBuffer,
  targetRate: number = SAMPLE_RATE,
  targetBitDepth: number = 8,
): Promise<Uint8Array> {
  const ctx = new OfflineAudioContext(1, 1, targetRate)
  const audioBuffer = await ctx.decodeAudioData(buffer)

  // Mix down to mono
  const length = audioBuffer.length
  const mono = new Float32Array(length)
  const nChannels = audioBuffer.numberOfChannels
  for (let ch = 0; ch < nChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i]
    }
  }
  if (nChannels > 1) {
    for (let i = 0; i < length; i++) {
      mono[i] /= nChannels
    }
  }

  return floatMonoToTarget(mono, audioBuffer.sampleRate, targetRate, targetBitDepth)
}

/**
 * Convert audio data between formats (for cross-format track copying).
 * srcAudio bytes: 8-bit unsigned PCM or 16-bit signed LE PCM.
 */
export function convertTrackAudio(
  srcAudio: Uint8Array,
  srcRate: number,
  srcBitDepth: number,
  dstRate: number,
  dstBitDepth: number,
): Uint8Array {
  if (srcRate === dstRate && srcBitDepth === dstBitDepth) {
    return new Uint8Array(srcAudio) // copy
  }

  // Decode source to float32 mono
  let mono: Float32Array
  if (srcBitDepth === 16) {
    const view = new DataView(srcAudio.buffer, srcAudio.byteOffset, srcAudio.byteLength)
    const sampleCount = Math.floor(srcAudio.length / 2)
    mono = new Float32Array(sampleCount)
    for (let i = 0; i < sampleCount; i++) {
      mono[i] = view.getInt16(i * 2, true) / 32768
    }
  } else {
    mono = new Float32Array(srcAudio.length)
    for (let i = 0; i < srcAudio.length; i++) {
      mono[i] = (srcAudio[i] - 128) / 128
    }
  }

  return floatMonoToTarget(mono, srcRate, dstRate, dstBitDepth)
}
