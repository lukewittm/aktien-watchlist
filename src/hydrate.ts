import type { Stock, Benchmark, PricesFile } from './types'

type RawStock = Omit<Stock, 'history'> & { closes: (number | null)[] }
type RawBenchmark = Omit<Benchmark, 'history'> & { closes: (number | null)[] }

/** Wire-Format aus prices.json: gemeinsame Datums-Achse statt History pro Ticker. */
export type RawPricesFile = Omit<PricesFile, 'stocks' | 'benchmarks'> & {
  dates: string[]
  stocks: RawStock[]
  benchmarks: RawBenchmark[]
}

function zip(dates: string[], closes: (number | null)[]): [string, number][] {
  const out: [string, number][] = []
  for (let i = 0; i < dates.length; i++) {
    const c = closes[i]
    if (c != null) out.push([dates[i], c])
  }
  return out
}

/** Baut aus der gemeinsamen Datums-Achse wieder [Datum, Kurs]-Paare pro Ticker, damit
 * der Rest der App (Sparkline, StockDetail, Perf-Berechnungen) unverändert bleibt. */
export function hydrate(raw: RawPricesFile): PricesFile {
  const { dates, stocks, benchmarks, ...rest } = raw
  return {
    ...rest,
    stocks: stocks.map(({ closes, ...s }) => ({ ...s, history: zip(dates, closes) })),
    benchmarks: benchmarks.map(({ closes, ...b }) => ({ ...b, history: zip(dates, closes) })),
  }
}
