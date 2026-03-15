let audioCtx: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null

function getContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

/** Stop any currently playing audio. */
export function stopPlayback(): void {
  if (currentSource) {
    try { currentSource.stop() } catch { /* already stopped */ }
    currentSource = null
  }
}

/**
 * Play PCM audio.
 * For 8-bit: unsigned PCM (silence = 0x80), 1 byte per sample.
 * For 16-bit: signed LE PCM, 2 bytes per sample.
 */
export function playTrack(
  audio: Uint8Array,
  sampleRate: number,
  bitDepth: number,
  onEnded?: () => void,
): void {
  stopPlayback()

  const ctx = getContext()
  if (ctx.state === 'suspended') {
    ctx.resume()
  }

  const sampleCount = bitDepth === 16 ? Math.floor(audio.length / 2) : audio.length
  if (sampleCount === 0) return

  const buffer = ctx.createBuffer(1, sampleCount, sampleRate)
  const channel = buffer.getChannelData(0)

  if (bitDepth === 16) {
    const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength)
    for (let i = 0; i < sampleCount; i++) {
      channel[i] = view.getInt16(i * 2, true) / 32768
    }
  } else {
    for (let i = 0; i < sampleCount; i++) {
      channel[i] = (audio[i] - 128) / 128
    }
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.onended = () => {
    if (currentSource === source) {
      currentSource = null
    }
    onEnded?.()
  }
  source.start()
  currentSource = source
}
