export interface WatchlistEntry {
  ticker: string
  addedAt: string
  note: string
}

const STORAGE_KEY = 'aktien-watchlist'

export function loadWatchlist(): WatchlistEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveWatchlist(entries: WatchlistEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}
