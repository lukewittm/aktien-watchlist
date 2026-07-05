// ISIN on-demand über Financial Modeling Prep (kostenloser API-Key nötig).
// Die ISIN ist der universelle Broker-Identifier – funktioniert bei Trade Republic,
// Scalable, ING & Co. in der Suche exakt wie eine WKN. Wird pro Ticker gecacht.

const KEY_STORAGE = 'fmp-api-key'
const CACHE_STORAGE = 'isin-cache'

export function getFmpKey(): string {
  return localStorage.getItem(KEY_STORAGE) ?? ''
}

export function setFmpKey(key: string) {
  if (key) localStorage.setItem(KEY_STORAGE, key.trim())
  else localStorage.removeItem(KEY_STORAGE)
}

function loadCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_STORAGE) ?? '{}')
  } catch {
    return {}
  }
}

export function getCachedIsin(ticker: string): string | null {
  return loadCache()[ticker] ?? null
}

function cacheIsin(ticker: string, isin: string) {
  const cache = loadCache()
  cache[ticker] = isin
  localStorage.setItem(CACHE_STORAGE, JSON.stringify(cache))
}

export type IsinResult = { isin: string } | { error: string }

// Holt die ISIN zum (Primärlisting-)Ticker. Ergebnis wird gecacht.
export async function fetchIsin(ticker: string, key: string): Promise<IsinResult> {
  const cached = getCachedIsin(ticker)
  if (cached) return { isin: cached }
  try {
    const url = `https://financialmodelingprep.com/api/v3/profile/${encodeURIComponent(ticker)}?apikey=${encodeURIComponent(key)}`
    const res = await fetch(url)
    if (res.status === 401 || res.status === 403) return { error: 'Key ungültig oder Endpoint nicht im Gratis-Tarif' }
    if (res.status === 429) return { error: 'Tageslimit erreicht (250/Tag)' }
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const data = await res.json()
    const isin: string | undefined = Array.isArray(data) ? data[0]?.isin : data?.isin
    if (!isin) return { error: 'keine ISIN gefunden' }
    cacheIsin(ticker, isin)
    return { isin }
  } catch (e) {
    return { error: String(e) }
  }
}
