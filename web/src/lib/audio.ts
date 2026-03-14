import { SAMPLE_RATE } from './constants'

let audioCtx: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null

function getContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE })
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
 * Play 8-bit unsigned PCM audio at 13,021 Hz.
 */
export function playTrack(audio: Uint8Array, onEnded?: () => void): void {
  stopPlayback()

  const ctx = getContext()
  if (ctx.state === 'suspended') {
    ctx.resume()
  }

  const buffer = ctx.createBuffer(1, audio.length, SAMPLE_RATE)
  const channel = buffer.getChannelData(0)

  // Convert 8-bit unsigned to float32: (byte - 128) / 128
  for (let i = 0; i < audio.length; i++) {
    channel[i] = (audio[i] - 128) / 128
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
