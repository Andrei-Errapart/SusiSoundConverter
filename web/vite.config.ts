/// <reference types="vitest" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import type { IncomingMessage, ServerResponse } from 'http'

export default defineConfig({
  base: '/SusiSoundConverter/',
  plugins: [
    vue(),
    {
      name: 'cors-proxy',
      configureServer(server) {
        server.middlewares.use('/cors-proxy/', (req: IncomingMessage, res: ServerResponse) => {
          // URL is everything after /cors-proxy/
          const targetUrl = decodeURIComponent(req.url?.slice(1) || '')
          if (!targetUrl) {
            res.statusCode = 400
            res.end('Missing URL')
            return
          }
          console.log(`[cors-proxy] ${targetUrl}`)
          fetch(targetUrl)
            .then(async (upstream) => {
              res.statusCode = upstream.status
              res.setHeader('Access-Control-Allow-Origin', '*')
              const buffer = Buffer.from(await upstream.arrayBuffer())
              console.log(`[cors-proxy] ${targetUrl} → ${upstream.status} (${buffer.length} bytes)`)
              res.end(buffer)
            })
            .catch((err) => {
              console.log(`[cors-proxy] ${targetUrl} → ERROR: ${err}`)
              res.statusCode = 502
              res.end(`Proxy error: ${err}`)
            })
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    testTimeout: 30000,
  },
})
