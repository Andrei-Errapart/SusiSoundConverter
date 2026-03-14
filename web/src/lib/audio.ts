import { SAMPLE_RATE } from './constants'

let currentAudio: HTMLAudioElement | null = null
let currentUrl: string | null = null

/** Stop any currently playing audio. */
export function stopPlayback(): void {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.onended = null
    currentAudio = null
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl)
    currentUrl = null
  }
}

/**
 * Build a WAV blob from 8-bit unsigned PCM at 13,021 Hz
 * and play it via an <audio> element (avoids Web Audio API quirks).
 */
export function playTrack(audio: Uint8Array, onEnded?: () => void): void {
  stopPlayback()

  // Build a minimal WAV file: 44-byte header + raw 8-bit PCM data
  const wavLen = 44 + audio.length
  const wav = new Uint8Array(wavLen)
  const view = new DataView(wav.buffer)

  // RIFF header
  wav[0] = 0x52; wav[1] = 0x49; wav[2] = 0x46; wav[3] = 0x46 // "RIFF"
  view.setUint32(4, wavLen - 8, true) // file size - 8
  wav[8] = 0x57; wav[9] = 0x41; wav[10] = 0x56; wav[11] = 0x45 // "WAVE"

  // fmt chunk
  wav[12] = 0x66; wav[13] = 0x6D; wav[14] = 0x74; wav[15] = 0x20 // "fmt "
  view.setUint32(16, 16, true)        // chunk size
  view.setUint16(20, 1, true)         // PCM format
  view.setUint16(22, 1, true)         // mono
  view.setUint32(24, SAMPLE_RATE, true) // sample rate (13021)
  view.setUint32(28, SAMPLE_RATE, true) // byte rate (sampleRate * 1 channel * 1 byte)
  view.setUint16(32, 1, true)         // block align (1 channel * 1 byte)
  view.setUint16(34, 8, true)         // bits per sample

  // data chunk
  wav[36] = 0x64; wav[37] = 0x61; wav[38] = 0x74; wav[39] = 0x61 // "data"
  view.setUint32(40, audio.length, true)

  // Copy PCM samples
  wav.set(audio, 44)

  const blob = new Blob([wav], { type: 'audio/wav' })
  const url = URL.createObjectURL(blob)
  currentUrl = url

  const el = new Audio(url)
  currentAudio = el
  el.onended = () => {
    stopPlayback()
    onEnded?.()
  }
  el.play().catch(() => {
    // Autoplay blocked — ignore
  })
}
