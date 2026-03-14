import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { parseFile } from '../parser'
import { serializeFile } from '../serializer'

const testDataDir = resolve(__dirname, '../../../../test_data')

const files = readdirSync(testDataDir).filter(f =>
  /\.(DS3|DX4|DSU|DS6)$/i.test(f)
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
})
