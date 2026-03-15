import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { parseFile } from '../parser'
import { serializeFile } from '../serializer'

const testDataDir = resolve(__dirname, '../../../../test_data')
const dheDataDir = resolve(__dirname, '../../../../test_data/DEH')

const files = readdirSync(testDataDir).filter(f =>
  /\.(DS3|DX4|DSU|DS6)$/i.test(f)
)

const dheFiles = readdirSync(dheDataDir).filter(f =>
  /\.DHE$/i.test(f)
)

describe('roundtrip: load → serialize → compare', () => {
  for (const filename of files) {
    it(`${filename} round-trips byte-for-byte`, () => {
      const original = new Uint8Array(readFileSync(resolve(testDataDir, filename)))
      const parsed = parseFile(original, filename)
      const output = serializeFile(parsed)
      expect(output.length).toBe(original.length)
      // Fast byte comparison (avoids vitest's expensive deep-equal diff on large buffers)
      let firstDiff = -1
      for (let i = 0; i < output.length; i++) {
        if (output[i] !== original[i]) { firstDiff = i; break }
      }
      expect(firstDiff).toBe(-1)
    })
  }

  for (const filename of dheFiles) {
    it(`${filename} round-trips byte-for-byte`, () => {
      const original = new Uint8Array(readFileSync(resolve(dheDataDir, filename)))
      const parsed = parseFile(original, filename)
      expect(parsed.format).toBe('DHE')
      expect(parsed.sampleRate).toBe(22050)
      expect(parsed.bitDepth).toBe(16)
      const output = serializeFile(parsed)
      expect(output.length).toBe(original.length)
      let firstDiff = -1
      for (let i = 0; i < output.length; i++) {
        if (output[i] !== original[i]) { firstDiff = i; break }
      }
      expect(firstDiff).toBe(-1)
    })
  }
})
