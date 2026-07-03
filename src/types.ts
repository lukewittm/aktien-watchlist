export type Region = 'EU' | 'US' | 'JP' | 'EM'

export interface Stock {
  ticker: string
  name: string
  region: Region
  sector: string
  currency: string | null
  price: number
  marketCapEUR: number | null
  perf3m: number | null
  perf6m: number | null
  high52w: number | null
  low52w: number | null
  peTrailing: number | null
  peForward: number | null
  divYieldPct: number | null
  avgVolume3m: number | null
  /** [ISO-Datum, Schlusskurs] pro Handelstag, ca. 13 Monate */
  history: [string, number][]
}

export interface PricesFile {
  fetchedAt: string
  stockCount: number
  failedTickers: string[]
  stocks: Stock[]
}
