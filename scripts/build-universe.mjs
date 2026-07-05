// Baut data/universe.json regelbasiert aus echten Index-Bestandslisten und
// validiert JEDEN Ticker gegen Yahoo Finance. Statt Ticker aus dem Gedächtnis
// zu tippen, werden pro Firma mehrere Kandidaten gesammelt (Heimatbörse,
// pytickersymbols, Yahoo-Suche), alle per Batch-Quote geprüft und der beste
// (richtige Börse/Währung, höchste Liquidität) ausgewählt. Nicht handelbare
// oder doppelte Werte fallen raus.
//
// Aufruf: npm run build:universe
// Quellen:
//   - S&P 500: datahub constituents.csv (Symbol + GICS-Sektor)
//   - Europa:  pytickersymbols stocks.yaml (nationale Indizes mit Yahoo-Tickern)
//   - Japan/EM/Ergänzungen/Must-haves: kuratierte, validierte Liste (curated.mjs)
import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createRequire } from 'node:module'
import YahooFinance from 'yahoo-finance2'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')
import { CURATED, MUST_HAVE, SECTOR_MAP, INDUSTRY_TO_SECTOR } from './curated.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })

const SP500_CSV = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv'
const PTS_YAML = 'https://raw.githubusercontent.com/portfolioplus/pytickersymbols/master/stocks.yaml'

// Europäische Indizes aus pytickersymbols, deren Union wir als EU-Universum nehmen
const EU_INDICES = new Set([
  'DAX', 'MDAX', 'SDAX', 'TECDAX',
  'FTSE 100', 'CAC 40', 'CAC Mid 60', 'IBEX 35', 'AEX', 'BEL 20',
  'OMX Stockholm 30', 'OMX Helsinki 25', 'Switzerland 20', 'EURO STOXX 50',
])

// Land -> { suffix der Heimatbörse, erwartete Notierungswährung }
const COUNTRY = {
  Germany: { suffix: '.DE', ccy: 'EUR' },
  France: { suffix: '.PA', ccy: 'EUR' },
  'United Kingdom': { suffix: '.L', ccy: 'GBP' },
  Netherlands: { suffix: '.AS', ccy: 'EUR' },
  Spain: { suffix: '.MC', ccy: 'EUR' },
  Italy: { suffix: '.MI', ccy: 'EUR' },
  Belgium: { suffix: '.BR', ccy: 'EUR' },
  Finland: { suffix: '.HE', ccy: 'EUR' },
  Sweden: { suffix: '.ST', ccy: 'SEK' },
  Switzerland: { suffix: '.SW', ccy: 'CHF' },
  Denmark: { suffix: '.CO', ccy: 'DKK' },
  Norway: { suffix: '.OL', ccy: 'NOK' },
  Austria: { suffix: '.VI', ccy: 'EUR' },
  Ireland: { suffix: '.L', ccy: 'EUR' },
  Portugal: { suffix: '.LS', ccy: 'EUR' },
}

async function getText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.text()
}

// Minimaler CSV-Parser (RFC-4180-genug für die datahub-Datei)
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQ = false
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = '' }
      if (c === '\r' && text[i + 1] === '\n') i++
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

function mapSector(industries) {
  for (const ind of industries ?? []) {
    for (const [needle, sector] of Object.entries(INDUSTRY_TO_SECTOR)) {
      if (ind.toLowerCase().includes(needle)) return sector
    }
  }
  return 'Sonstige'
}

async function batchQuote(symbols) {
  const bySymbol = {}
  const uniq = [...new Set(symbols)].filter(Boolean)
  for (let i = 0; i < uniq.length; i += 50) {
    const chunk = uniq.slice(i, i + 50)
    try {
      const quotes = await yf.quote(chunk)
      for (const q of quotes) bySymbol[q.symbol] = q
    } catch {
      // einzeln nachfassen, falls ein Symbol im Batch den ganzen Call kippt
      for (const s of chunk) {
        try { const q = await yf.quote(s); if (q) bySymbol[q.symbol] = q } catch { /* ignore */ }
      }
    }
  }
  return bySymbol
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function searchCandidates(name) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await yf.search(name, { quotesCount: 8, newsCount: 0 })
      return (r.quotes ?? []).filter((q) => q.quoteType === 'EQUITY' && q.symbol).map((q) => q.symbol)
    } catch {
      await sleep(1200 * (attempt + 1)) // gegen Yahoo-Rate-Limit
    }
  }
  return []
}

// Sekundär-/Regionalbörsen und OTC, die wir gegenüber der Heimatbörse abwerten
const SECONDARY_SUFFIX = new Set(['.F', '.MU', '.SG', '.DU', '.HM', '.BE', '.HA'])
const suffixOf = (sym) => (sym.match(/\.[A-Z]+$/) || [''])[0]

// Erlaubte Börsen je Region – verhindert Fehltreffer (z. B. "Atlas Copco" -> US-Ticker ATLC)
const EU_EXCHANGES = new Set(['.DE', '.PA', '.L', '.AS', '.MC', '.MI', '.BR', '.HE', '.ST', '.SW', '.CO', '.OL', '.VI', '.LS', '.IR', '.AT', '.F', '.MU', '.SG', '.DU', '.HM', '.BE', '.HA'])
const EM_EXCHANGES = new Set(['.KS', '.KQ', '.TW', '.TWO', '.HK', '.NS', '.BO', '.SA'])
function acceptForRegion(region, sym) {
  const suf = suffixOf(sym)
  if (region === 'US') return suf === '' // bare Symbol (inkl. BRK-B)
  if (region === 'JP') return suf === '.T'
  if (region === 'EM') return EM_EXCHANGES.has(suf)
  if (region === 'EU') return EU_EXCHANGES.has(suf)
  return false
}

// Wählt aus mehreren Quote-Treffern den besten Primärlisting-Ticker.
// Rückgabe { q, score } – score dient auch dem späteren Dedup über den Firmennamen.
function pickBest(cands, quotes, region, expectCcy, expectSuffix) {
  const scored = cands
    .map((sym) => quotes[sym])
    .filter((q) => q && q.regularMarketPrice != null && q.marketCap && acceptForRegion(region, q.symbol))
    .map((q) => {
      const suf = suffixOf(q.symbol)
      const ccy = q.currency === 'GBp' ? 'GBP' : q.currency
      let score = Math.log10(q.marketCap) * 10 // Primärlisting hat i.d.R. höchste Marktkap
      if (expectSuffix && suf === expectSuffix) score += 5000 // exakte Heimatbörse
      else if (!expectSuffix && !suf) score += 5000 // US-Primärlisting (kein Suffix)
      if (expectCcy && ccy === expectCcy) score += 1000
      if (SECONDARY_SUFFIX.has(suf)) score -= 4000 // Frankfurt-Zweitnotiz etc.
      return { q, score }
    })
    .sort((a, b) => b.score - a.score)
  return scored[0] ?? null
}

// Firmenname für Dedup normalisieren (Rechtsformen/Sonderzeichen entfernen)
function normName(name) {
  return name
    .toLowerCase()
    .replace(/\b(inc|corp|corporation|co|ltd|plc|ag|se|sa|nv|spa|oyj|asa|group|holding|holdings|the|class [a-z]|reg|shs)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

async function main() {
  console.log('Lade Quellen ...')
  const [sp500Csv, ptsYaml] = await Promise.all([getText(SP500_CSV), getText(PTS_YAML)])

  // --- Kandidaten sammeln -------------------------------------------------
  // Jeder Kandidat: { key(dedup), name, region, sector, candidateTickers[], expectCcy }
  const candidates = []
  const seenKey = new Set()
  function addCandidate(cand) {
    if (seenKey.has(cand.key)) return
    seenKey.add(cand.key)
    candidates.push(cand)
  }

  // US: S&P 500
  const rows = parseCsv(sp500Csv)
  const header = rows[0].map((h) => h.trim())
  const iSym = header.indexOf('Symbol')
  const iName = header.indexOf('Security')
  const iSec = header.findIndex((h) => /GICS Sector/i.test(h))
  for (const r of rows.slice(1)) {
    const sym = (r[iSym] || '').trim().replace(/\./g, '-') // BRK.B -> BRK-B
    if (!sym) continue
    addCandidate({
      key: 'US:' + sym,
      name: (r[iName] || sym).trim(),
      region: 'US',
      sector: SECTOR_MAP[(r[iSec] || '').trim()] ?? 'Sonstige',
      candidateTickers: [sym],
      expectCcy: 'USD',
      expectSuffix: '',
    })
  }

  // Europa: pytickersymbols
  const pts = yaml.load(ptsYaml)
  for (const c of pts.companies) {
    if (!(c.indices ?? []).some((i) => EU_INDICES.has(i))) continue
    const country = COUNTRY[c.country]
    if (!country) continue
    const ptsYahoo = (c.symbols ?? []).map((s) => s.yahoo).filter(Boolean)
    const constructed = c.symbol ? c.symbol + country.suffix : null
    addCandidate({
      key: 'EU:' + (c.metadata?.isin || c.name),
      name: c.name,
      region: 'EU',
      sector: mapSector(c.industries),
      candidateTickers: [constructed, ...ptsYahoo].filter(Boolean),
      expectCcy: country.ccy,
      expectSuffix: country.suffix,
      searchName: c.name,
      searchCountry: c.country,
    })
  }

  // Kuratiert: Japan, EM, EU-Lücken (Italien/Dänemark/Norwegen etc.), Must-haves
  for (const c of [...CURATED, ...MUST_HAVE]) {
    addCandidate({
      key: c.region + ':' + c.ticker,
      name: c.name,
      region: c.region,
      sector: c.sector,
      candidateTickers: [c.ticker],
      expectCcy: c.ccy ?? null,
      expectSuffix: suffixOf(c.ticker),
      fixedTicker: c.ticker,
    })
  }

  console.log(`Kandidaten: ${candidates.length} Firmen. Validiere gegen Yahoo ...`)

  // --- Runde 1: alle bekannten Kandidaten-Ticker batch-quoten -------------
  const allTickers = candidates.flatMap((c) => c.candidateTickers)
  const quotes = await batchQuote(allTickers)

  // --- Auflösen + Runde 2 (Yahoo-Suche für Ungelöste) --------------------
  const resolved = []
  const improveEU = [] // EU: ungelöst ODER nur auf Zweitnotiz gelöst -> Suche nachschieben
  for (const c of candidates) {
    const best = pickBest(c.candidateTickers, quotes, c.region, c.expectCcy, c.expectSuffix)
    const isHome = best && suffixOf(best.q.symbol) === c.expectSuffix
    if (best) resolved.push({ c, q: best.q, score: best.score })
    // Wenn keine echte Heimatnotiz gefunden wurde, per Suche versuchen zu verbessern
    if (c.searchName && !isHome) improveEU.push({ c, current: best })
  }

  console.log(`Runde 1: ${resolved.length} gelöst, ${improveEU.length} EU per Suche nachbessern ...`)
  let searched = 0
  for (const { c, current } of improveEU) {
    const found = await searchCandidates(c.searchName)
    await sleep(120) // Suche etwas entzerren, um Rate-Limits zu vermeiden
    if (found.length) {
      const q2 = await batchQuote(found)
      const best = pickBest([...found, ...c.candidateTickers], { ...quotes, ...q2 }, c.region, c.expectCcy, c.expectSuffix)
      if (best && (!current || best.score > current.score)) {
        if (current) {
          // vorherige (schwache) Auflösung ersetzen
          const idx = resolved.findIndex((r) => r.c === c)
          if (idx >= 0) resolved.splice(idx, 1)
        }
        resolved.push({ c, q: best.q, score: best.score })
      }
    }
    if (++searched % 40 === 0) console.log(`  Suche ${searched}/${improveEU.length}`)
  }

  // --- Dedup: pro Ticker und pro Firmenname den bestbewerteten behalten ---
  const bestByTicker = new Map()
  const bestByName = new Map()
  for (const r of resolved) {
    const t = r.q.symbol
    if (!bestByTicker.has(t) || r.score > bestByTicker.get(t).score) bestByTicker.set(t, r)
  }
  for (const r of bestByTicker.values()) {
    const nk = r.c.region + '|' + normName(r.c.name)
    if (!bestByName.has(nk) || r.score > bestByName.get(nk).score) bestByName.set(nk, r)
  }

  const stocks = [...bestByName.values()]
    .map(({ c, q }) => ({
      ticker: q.symbol,
      name: c.name,
      region: c.region,
      sector: c.sector,
    }))
    .sort((a, b) => (a.region + a.name).localeCompare(b.region + b.name, 'de'))

  const byRegion = {}
  for (const s of stocks) byRegion[s.region] = (byRegion[s.region] || 0) + 1

  await mkdir(path.join(root, 'data'), { recursive: true })
  await writeFile(
    path.join(root, 'data/universe.json'),
    JSON.stringify(
      {
        comment:
          'Regelbasiert aus S&P 500 (datahub) + europäischen Indizes (pytickersymbols) + kuratierten JP/EM/Must-haves. Jeder Ticker gegen Yahoo validiert. Neu erzeugen: npm run build:universe',
        builtAt: new Date().toISOString(),
        stocks,
      },
      null,
      1
    )
  )

  console.log(`\nFertig: ${stocks.length} Ticker -> data/universe.json`)
  console.log('Nach Region:', byRegion)
  // Must-have-Kontrolle
  const finalTickers = new Set(stocks.map((s) => s.ticker))
  const missing = MUST_HAVE.filter((m) => !finalTickers.has(m.ticker)).map((m) => `${m.name} (${m.ticker})`)
  console.log(missing.length ? `Fehlende Must-haves: ${missing.join(', ')}` : 'Alle Must-haves enthalten. ✓')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
