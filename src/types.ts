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
  /** [ISO-Datum, Schlusskurs] pro Handelstag, ca. 7 Monate */
  history: [string, number][]
}

export interface PricesFile {
  fetchedAt: string
  stockCount: number
  failedTickers: string[]
  stocks: Stock[]
}
