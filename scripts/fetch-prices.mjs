// Holt Tagesschlusskurse (13 Monate) + Kennzahlen für das Screening-Universum
// von Yahoo Finance und schreibt public/data/prices.json.
//
// ALLE Kurse/Performance werden nach EUR umgerechnet (historische Wechselkurse),
// weil der Nutzer in EUR kauft – die EUR-Rendite inkl. Wechselkurs ist die
// relevante Größe. Datenbasis bleibt das saubere Primärlisting.
//
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
const CONCURRENCY = 6
const RETRIES = 3

// Währungen, für die wir historische EUR-Wechselkurse brauchen (EUR<CCY>=X: CCY pro 1 EUR)
const FX_CURRENCIES = ['USD', 'GBP', 'CHF', 'DKK', 'SEK', 'NOK', 'JPY', 'KRW', 'TWD', 'HKD', 'INR', 'BRL']

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

// --- Historische Wechselkurse (CCY pro 1 EUR) -----------------------------
async function fetchFxHistory() {
  const fx = { EUR: [['1970-01-01', 1]] }
  await mapLimit(FX_CURRENCIES, 4, async (ccy) => {
    const hist = await fetchHistory(`EUR${ccy}=X`)
    if (hist) fx[ccy] = hist
    else console.warn(`Keine FX-Historie für ${ccy}`)
  })
  return fx
}

// Letzter FX-Kurs am/​vor dem Datum (Forward-Fill, da FX- und Börsentage abweichen)
function fxOn(series, date) {
  let rate = null
  for (const [d, r] of series) {
    if (d <= date) rate = r
    else break
  }
  return rate ?? series[series.length - 1]?.[1] ?? null
}

// Kurshistorie (in ccy) → EUR-Historie
function toEUR(history, ccy, fxHist) {
  if (ccy === 'EUR') return history
  const series = fxHist[ccy]
  if (!series) return null
  const out = []
  for (const [date, close] of history) {
    const rate = fxOn(series, date)
    if (!rate) continue
    out.push([date, Math.round((close / rate) * 10000) / 10000])
  }
  return out
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

function marketCapEUR(quote, fxHist) {
  if (!quote?.marketCap) return null
  let currency = quote.currency ?? 'USD'
  if (currency === 'GBp') currency = 'GBP'
  const rate = currency === 'EUR' ? 1 : fxOn(fxHist[currency] ?? [], new Date().toISOString().slice(0, 10))
  if (!rate) return null
  return quote.marketCap / rate
}

console.log(`Universum: ${universe.length} Ticker. Hole FX-Historien + Quotes ...`)
const fxHist = await fetchFxHistory()
const quotes = await fetchQuotes(universe.map((s) => s.ticker))

console.log('Hole Kurshistorien (Umrechnung nach EUR) ...')
let done = 0
const stocks = await mapLimit(universe, CONCURRENCY, async (stock) => {
  let history = await fetchHistory(stock.ticker)
  done++
  if (done % 50 === 0) console.log(`  ${done}/${universe.length}`)
  if (!history) return { ...stock, failed: true }

  const quote = quotes[stock.ticker]
  let localCcy = quote?.currency ?? 'USD'
  if (localCcy === 'GBp') {
    // LSE: Pence → Pfund, komplette Historie normalisieren
    localCcy = 'GBP'
    history = history.map(([d, c]) => [d, Math.round(c) / 100])
  }
  const localPrice = history[history.length - 1][1]

  const eur = toEUR(history, localCcy, fxHist)
  if (!eur) return { ...stock, failed: true }
  const closes = eur.map((h) => h[1])

  return {
    ...stock,
    currency: 'EUR',
    localCcy,
    localPrice: Math.round(localPrice * 100) / 100,
    price: Math.round(eur[eur.length - 1][1] * 100) / 100,
    marketCapEUR: marketCapEUR(quote, fxHist),
    perf3m: performance(eur, 3),
    perf6m: performance(eur, 6),
    perf12m: performance(eur, 12),
    // 52W-Hoch/Tief aus der EUR-Historie (13 Monate ≈ 52 Wochen)
    high52w: Math.round(Math.max(...closes) * 100) / 100,
    low52w: Math.round(Math.min(...closes) * 100) / 100,
    peTrailing: quote?.trailingPE ?? null,
    peForward: quote?.forwardPE ?? null,
    divYieldPct: quote?.trailingAnnualDividendYield != null ? quote.trailingAnnualDividendYield * 100 : null,
    avgVolume3m: quote?.averageDailyVolume3Month ?? null,
    // Abstand zur 200-/50-Tage-Linie in % (währungsneutraler Quotient aus dem Quote)
    pctVs200d:
      quote?.twoHundredDayAverage && quote?.regularMarketPrice
        ? (quote.regularMarketPrice / quote.twoHundredDayAverage - 1) * 100
        : null,
    pctVs50d:
      quote?.fiftyDayAverage && quote?.regularMarketPrice
        ? (quote.regularMarketPrice / quote.fiftyDayAverage - 1) * 100
        : null,
    history: eur,
  }
})

console.log('Hole Benchmarks (EUR) ...')
const benchQuotes = await fetchQuotes(BENCHMARKS.map((b) => b.ticker))
const benchmarks = []
for (const b of BENCHMARKS) {
  const raw = await fetchHistory(b.ticker)
  if (!raw) continue
  const ccy = benchQuotes[b.ticker]?.currency ?? 'USD'
  const eur = toEUR(raw, ccy === 'GBp' ? 'GBP' : ccy, fxHist) ?? raw
  benchmarks.push({ ...b, perf3m: performance(eur, 3), perf6m: performance(eur, 6), perf12m: performance(eur, 12), history: eur })
}

const failed = stocks.filter((s) => s.failed)
const ok = stocks.filter((s) => !s.failed)

const out = {
  fetchedAt: new Date().toISOString(),
  currency: 'EUR',
  stockCount: ok.length,
  failedTickers: failed.map((s) => s.ticker),
  benchmarks,
  stocks: ok,
}

const outDir = path.join(root, 'public/data')
await mkdir(outDir, { recursive: true })
await writeFile(path.join(outDir, 'prices.json'), JSON.stringify(out))

console.log(`\nFertig: ${ok.length}/${universe.length} Ticker OK (alle in EUR), ${benchmarks.length}/${BENCHMARKS.length} Benchmarks.`)
for (const b of benchmarks) console.log(`  ${b.name}: 3M ${b.perf3m?.toFixed(1)}% | 6M ${b.perf6m?.toFixed(1)}% | 1J ${b.perf12m?.toFixed(1)}%`)
if (failed.length) console.log(`Fehlgeschlagen: ${failed.map((s) => s.ticker).join(', ')}`)

// Plausibilitäts-Stichprobe: EUR-Performance vs. Lokalwährung
for (const t of ['AAPL', 'SAP.DE', '7203.T']) {
  const s = ok.find((x) => x.ticker === t)
  if (s) console.log(`  ${t}: ${s.localPrice} ${s.localCcy} → ${s.price} € | 3M(EUR) ${s.perf3m?.toFixed(1)}% | 1J(EUR) ${s.perf12m?.toFixed(1)}%`)
}
