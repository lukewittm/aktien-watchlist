// Sanity-Gate vor dem Deploy: npm run fetch kann technisch mit Exit-Code 0 durchlaufen,
// obwohl z.B. ein Yahoo-Ausfall nur einen Bruchteil der Ticker liefert (einzelne
// Fehlschläge werden im Fetch nur geloggt, nicht als Gesamtfehler gewertet). Dieses
// Skript prüft die frisch geschriebene prices.json auf Plausibilität und bricht mit
// Exit-Code 1 ab, wenn sie degradiert aussieht – im CI-Workflow verhindert das den
// Deploy, die zuletzt erfolgreich veröffentlichte Version bleibt live.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const data = JSON.parse(await readFile(path.join(root, 'public/data/prices.json'), 'utf8'))

// Normalzustand: ~1010 von 1011 Tickern, 3/3 Benchmarks, ~265-282 Handelstage (13 Monate).
// Schwellen mit deutlichem Sicherheitsabstand nach unten, damit einzelne übliche
// Ausfälle (aktuell: N1N.F) nicht triggern, ein Massenausfall aber schon.
const MIN_STOCKS = 900
const MAX_FAILED = 150
const REQUIRED_BENCHMARKS = 3
const MIN_DATES = 100
const MAX_EMPTY_CLOSES = 10

const problems = []

if (!Array.isArray(data.stocks) || data.stocks.length < MIN_STOCKS) {
  problems.push(`Nur ${data.stocks?.length ?? 0} Ticker geladen (erwartet: >= ${MIN_STOCKS})`)
}
if ((data.failedTickers?.length ?? 0) > MAX_FAILED) {
  problems.push(`${data.failedTickers.length} fehlgeschlagene Ticker (erwartet: <= ${MAX_FAILED})`)
}
if (!Array.isArray(data.benchmarks) || data.benchmarks.length < REQUIRED_BENCHMARKS) {
  problems.push(`Nur ${data.benchmarks?.length ?? 0}/${REQUIRED_BENCHMARKS} Benchmarks geladen`)
}
if (!Array.isArray(data.dates) || data.dates.length < MIN_DATES) {
  problems.push(`Nur ${data.dates?.length ?? 0} Handelstage in der Datums-Achse (erwartet: >= ${MIN_DATES})`)
}

const emptyClosesCount = (data.stocks ?? []).filter((s) => !s.closes?.some((c) => c != null)).length
if (emptyClosesCount > MAX_EMPTY_CLOSES) {
  problems.push(`${emptyClosesCount} Ticker haben eine komplett leere Kurshistorie (erwartet: <= ${MAX_EMPTY_CLOSES})`)
}

if (problems.length) {
  console.error('Datenqualitäts-Check FEHLGESCHLAGEN – Deploy wird abgebrochen:')
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}

console.log(
  `Datenqualitäts-Check OK: ${data.stocks.length} Ticker, ${data.benchmarks.length} Benchmarks, ${data.dates.length} Handelstage, ${data.failedTickers?.length ?? 0} fehlgeschlagen.`
)
