// Holt Tagesschlusskurse (7 Monate) + Marktkapitalisierung für das gesamte
// Screening-Universum von Yahoo Finance und schreibt public/data/prices.json.
// Aufruf: npm run fetch
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import YahooFinance from 'yahoo-finance2'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const universe = JSON.parse(await readFile(path.join(root, 'data/universe.json'), 'utf8')).stocks

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })

// 13 Monate, damit die 1J-Chart-Ansicht volle Abdeckung hat
const MONTHS_BACK = 13
const CONCURRENCY = 4
const RETRIES = 3

// FX-Paare für Marktkap-Umrechnung nach EUR (Yahoo-Symbole EUR<CCY>=X → Wert: wie viel CCY pro EUR)
const FX_CURRENCIES = ['USD', 'GBP', 'CHF', 'DKK', 'SEK', 'NOK', 'JPY', 'KRW', 'TWD', 'HKD', 'INR', 'BRL']

// Markt-Benchmarks für den Outperformance-Vergleich (siehe Produktbrief 3.6)
const BENCHMARKS = [
  { ticker: 'IWDA.L', name: 'MSCI World' },
  { ticker: 'EIMI.L', name: 'MSCI EM' },
  { ticker: '^GSPC', name: 'S&P 500' },
]

function periodStart() {
  const d = new Date()
  d.setMonth(d.getMonth() - MONTHS_BACK)
  return d
}

async function withRetry(label, fn) {
  let lastErr
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt < RETRIES) {
        const delay = 1500 * 2 ** attempt
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  console.error(`FEHLER ${label}: ${lastErr?.message ?? lastErr}`)
  return null
}

// Einfacher Worker-Pool
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function fetchFxRates() {
  const symbols = FX_CURRENCIES.map((c) => `EUR${c}=X`)
  const quotes = await withRetry('FX-Kurse', () => yahooFinance.quote(symbols))
  const rates = { EUR: 1 }
  for (const q of quotes ?? []) {
    const ccy = q.symbol.slice(3, 6)
    if (q.regularMarketPrice) rates[ccy] = q.regularMarketPrice
  }
  return rates
}

async function fetchQuotes(tickers) {
  const bySymbol = {}
  for (let i = 0; i < tickers.length; i += 50) {
    const chunk = tickers.slice(i, i + 50)
    const quotes = await withRetry(`Quotes ${i}-${i + chunk.length}`, () => yahooFinance.quote(chunk))
    for (const q of quotes ?? []) bySymbol[q.symbol] = q
  }
  return bySymbol
}

async function fetchHistory(ticker) {
  const res = await withRetry(`Chart ${ticker}`, () =>
    yahooFinance.chart(ticker, { period1: periodStart(), interval: '1d' })
  )
  if (!res?.quotes?.length) return null
  // Forward-Fill: fehlende Schlusskurse mit letztem bekannten Wert fortschreiben
  const history = []
  let lastClose = null
  for (const q of res.quotes) {
    const close = q.close ?? q.adjclose ?? lastClose
    if (close == null) continue
    lastClose = close
    history.push([q.date.toISOString().slice(0, 10), Math.round(close * 10000) / 10000])
  }
  return history
}

function closeOnOrBefore(history, targetDate) {
  const target = targetDate.toISOString().slice(0, 10)
  let candidate = null
  for (const [date, close] of history) {
    if (date <= target) candidate = close
    else break
  }
  return candidate
}

function performance(history, monthsBack) {
  if (!history?.length) return null
  const ref = new Date()
  ref.setMonth(ref.getMonth() - monthsBack)
  const startClose = closeOnOrBefore(history, ref)
  const endClose = history[history.length - 1][1]
  if (!startClose || !endClose) return null
  return (endClose / startClose - 1) * 100
}

function marketCapEUR(quote, fxRates) {
  if (!quote?.marketCap) return null
  let currency = quote.currency ?? 'USD'
  // LSE notiert Kurse in Pence, marketCap liefert Yahoo aber in GBP
  if (currency === 'GBp') currency = 'GBP'
  const rate = fxRates[currency]
  if (!rate) {
    console.warn(`Keine FX-Rate für ${currency} (${quote.symbol}) – Marktkap bleibt leer`)
    return null
  }
  return quote.marketCap / rate
}

console.log(`Universum: ${universe.length} Ticker. Hole FX + Quotes ...`)
const fxRates = await fetchFxRates()
console.log('FX (pro EUR):', Object.entries(fxRates).map(([c, r]) => `${c}=${r.toFixed(2)}`).join(' '))
const quotes = await fetchQuotes(universe.map((s) => s.ticker))

console.log('Hole Kurshistorien ...')
let done = 0
const stocks = (
  await mapLimit(universe, CONCURRENCY, async (stock) => {
    let history = await fetchHistory(stock.ticker)
    done++
    if (done % 25 === 0) console.log(`  ${done}/${universe.length}`)
    if (!history) return { ...stock, failed: true }
    const quote = quotes[stock.ticker]
    let currency = quote?.currency ?? null
    const inPence = currency === 'GBp'
    if (inPence) {
      // LSE liefert Kurse in Pence → komplette Historie nach Pfund normalisieren
      currency = 'GBP'
      history = history.map(([d, c]) => [d, Math.round(c) / 100])
    }
    const penceAdj = (v) => (v == null ? null : inPence ? v / 100 : v)
    return {
      ...stock,
      currency,
      price: history[history.length - 1][1],
      marketCapEUR: marketCapEUR(quote, fxRates),
      perf3m: performance(history, 3),
      perf6m: performance(history, 6),
      high52w: penceAdj(quote?.fiftyTwoWeekHigh ?? null),
      low52w: penceAdj(quote?.fiftyTwoWeekLow ?? null),
      peTrailing: quote?.trailingPE ?? null,
      peForward: quote?.forwardPE ?? null,
      divYieldPct: quote?.trailingAnnualDividendYield != null ? quote.trailingAnnualDividendYield * 100 : null,
      avgVolume3m: quote?.averageDailyVolume3Month ?? null,
      history,
    }
  })
)

console.log('Hole Benchmarks ...')
const benchmarks = []
for (const b of BENCHMARKS) {
  const history = await fetchHistory(b.ticker)
  if (!history) continue
  benchmarks.push({ ...b, perf3m: performance(history, 3), perf6m: performance(history, 6), history })
}

const failed = stocks.filter((s) => s.failed)
const ok = stocks.filter((s) => !s.failed)

const out = {
  fetchedAt: new Date().toISOString(),
  stockCount: ok.length,
  failedTickers: failed.map((s) => s.ticker),
  benchmarks,
  stocks: ok,
}

const outDir = path.join(root, 'public/data')
await mkdir(outDir, { recursive: true })
await writeFile(path.join(outDir, 'prices.json'), JSON.stringify(out))

console.log(`\nFertig: ${ok.length}/${universe.length} Ticker OK, ${benchmarks.length}/${BENCHMARKS.length} Benchmarks.`)
for (const b of benchmarks) console.log(`  ${b.name}: 3M ${b.perf3m?.toFixed(1)}% | 6M ${b.perf6m?.toFixed(1)}%`)
if (failed.length) console.log(`Fehlgeschlagen: ${failed.map((s) => s.ticker).join(', ')}`)

// Plausibilitäts-Stichprobe für Marktkap-Umrechnung
for (const t of ['AAPL', 'SAP.DE', 'AZN.L', '7203.T', '2330.TW']) {
  const s = ok.find((x) => x.ticker === t)
  if (s?.marketCapEUR) console.log(`  ${t}: ${(s.marketCapEUR / 1e9).toFixed(0)} Mrd € | 3M ${s.perf3m?.toFixed(1)}% | 6M ${s.perf6m?.toFixed(1)}%`)
}
