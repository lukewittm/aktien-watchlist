// "Neu in den Top-Performern" ohne Backend: statt eines festen Kalender-Zeitraums
// ("diese Woche") vergleichen wir gegen den Stand deines letzten Besuchs – dafür
// braucht es keine Server-Historie, nur ein localStorage-Snapshot pro Sortier-Kontext.
const STORAGE_KEY = 'top-performers-snapshot'

function load(): Record<string, string[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Ticker in currentTop, die beim letzten Besuch unter diesem Key noch nicht vorne waren.
 * Ohne gespeicherten Vorbesuch gibt es keine Basis zum Vergleichen – dann lieber keine
 * Badges zeigen, statt beim allerersten Aufruf gleich alle 20 als "neu" zu markieren. */
export function getNewcomers(key: string, currentTop: string[]): Set<string> {
  const stored = load()
  if (!(key in stored)) return new Set()
  const previous = new Set(stored[key])
  return new Set(currentTop.filter((t) => !previous.has(t)))
}

/** Merkt sich den aktuellen Top-N für den nächsten Besuch. */
export function rememberTop(key: string, currentTop: string[]) {
  const all = load()
  all[key] = currentTop
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}
