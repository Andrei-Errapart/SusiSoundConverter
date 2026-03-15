/**
 * Fetch a sound file from a URL, with automatic CORS proxy fallback.
 * Pure utility — no Vue imports.
 */

function devProxy(url: string): string {
  return `/cors-proxy/${encodeURIComponent(url)}`
}

const CORS_PROXIES = [
  // In dev mode, Vite serves a local CORS proxy — try it first
  ...(import.meta.env.DEV ? [devProxy] : []),
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
]

export async function fetchSoundUrl(url: string): Promise<{ data: Uint8Array; filename: string }> {
  const parsed = new URL(url) // throws on invalid
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported')
  }

  const filename = decodeURIComponent(parsed.pathname.split('/').pop() || 'download.bin')

  // Try direct fetch first
  const direct = await tryFetch(url)
  if (direct) return { data: direct, filename }

  // Try CORS proxies
  for (const makeProxyUrl of CORS_PROXIES) {
    const proxied = await tryFetch(makeProxyUrl(url))
    if (proxied) return { data: proxied, filename }
  }

  throw new Error(
    'Could not fetch URL. The server does not allow cross-origin requests and CORS proxies are unavailable.'
  )
}

async function tryFetch(url: string): Promise<Uint8Array | null> {
  let response: Response
  try {
    response = await fetch(url)
  } catch {
    return null
  }
  if (!response.ok) return null
  const buffer = await response.arrayBuffer()
  return new Uint8Array(buffer)
}
