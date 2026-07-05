import { useEffect, useMemo, useState } from 'react'
import Sparkline from './Sparkline'
import StockDetail from './StockDetail'
import { loadWatchlist, saveWatchlist, type WatchlistEntry } from './watchlist'
import { getFmpKey, setFmpKey } from './isin'
import type { Benchmark, PricesFile, Region, Stock } from './types'

type PerfKey = 'perf3m' | 'perf6m' | 'perf12m'
type SortKey = 'name' | 'sector' | 'price' | 'marketCapEUR' | 'perf3m' | 'perf6m' | 'perf12m' | `o:${string}`
type RegionFilter = Region | 'ALL'
type View = 'top' | 'watch'

const REGION_LABELS: Record<RegionFilter, string> = {
  ALL: 'Alle',
  EU: 'Europa',
  US: 'USA',
  JP: 'Japan',
  EM: 'Emerging Markets',
}

const REGION_BADGE: Record<Region, string> = {
  EU: 'bg-blue-500/15 text-blue-300',
  US: 'bg-emerald-500/15 text-emerald-300',
  JP: 'bg-rose-500/15 text-rose-300',
  EM: 'bg-amber-500/15 text-amber-300',
}

const PERIOD_LABEL: Record<PerfKey, string> = { perf3m: '3 Monate', perf6m: '6 Monate', perf12m: '1 Jahr' }
const PERIOD_MONTHS: Record<PerfKey, number> = { perf3m: 3, perf6m: 6, perf12m: 12 }

const BENCH_SHORT: Record<string, string> = {
  'IWDA.L': 'vs World',
  'EIMI.L': 'vs EM',
  '^GSPC': 'vs S&P',
}

function formatMarketCap(v: number | null): string {
  if (v == null) return '–'
  if (v >= 1e12) return `${(v / 1e12).toFixed(2).replace('.', ',')} Bio €`
  return `${Math.round(v / 1e9)} Mrd €`
}

function formatPerf(v: number | null): string {
  if (v == null) return '–'
  const s = v.toFixed(1).replace('.', ',')
  return v > 0 ? `+${s} %` : `${s} %`
}

function perfClass(v: number | null): string {
  if (v == null) return 'text-zinc-500'
  return v >= 0 ? 'text-emerald-400' : 'text-red-400'
}

// Periodenperformance einer Benchmark direkt aus ihrer Historie (für jeden Zeitraum)
function histPerf(history: [string, number][], months: number): number | null {
  if (!history?.length) return null
  const ref = new Date()
  ref.setMonth(ref.getMonth() - months)
  const refIso = ref.toISOString().slice(0, 10)
  let start: number | null = null
  for (const [date, close] of history) {
    if (date <= refIso) start = close
    else break
  }
  const end = history[history.length - 1][1]
  if (!start || !end) return null
  return (end / start - 1) * 100
}

export default function App() {
  const [data, setData] = useState<PricesFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('top')
  const [region, setRegion] = useState<RegionFilter>('ALL')
  const [period, setPeriod] = useState<PerfKey>('perf3m')
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortAsc, setSortAsc] = useState(false)
  const [selected, setSelected] = useState<Stock | null>(null)
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>(loadWatchlist)
  const [fmpKey, setFmpKeyState] = useState(getFmpKey)
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')

  function saveKey() {
    setFmpKey(keyDraft)
    setFmpKeyState(keyDraft.trim())
    setShowKeyInput(false)
  }

  // Filter
  const [minCapBn, setMinCapBn] = useState(2)
  const [sector, setSector] = useState('ALL')
  const [minPerf, setMinPerf] = useState('')
  const [maxPE, setMaxPE] = useState('')
  const [minDiv, setMinDiv] = useState('')
  const [above200, setAbove200] = useState(false)

  useEffect(() => {
    fetch('/data/prices.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => saveWatchlist(watchlist), [watchlist])

  const watchedTickers = useMemo(() => new Set(watchlist.map((e) => e.ticker)), [watchlist])
  const benchmarks: Benchmark[] = useMemo(() => data?.benchmarks ?? [], [data])
  const months = PERIOD_MONTHS[period]

  const sectors = useMemo(() => {
    const set = new Set<string>()
    for (const s of data?.stocks ?? []) set.add(s.sector)
    return [...set].sort((a, b) => a.localeCompare(b, 'de'))
  }, [data])

  // Benchmark-Performance für den aktiven Zeitraum, aus der Historie
  const benchPerf = useMemo(() => {
    const m: Record<string, number | null> = {}
    for (const b of benchmarks) m[b.ticker] = histPerf(b.history, months)
    return m
  }, [benchmarks, months])

  function outperf(stock: Stock, benchTicker: string): number | null {
    const sp = stock[period]
    const bp = benchPerf[benchTicker]
    if (sp == null || bp == null) return null
    return sp - bp
  }

  function toggleWatch(ticker: string) {
    setWatchlist((prev) =>
      prev.some((e) => e.ticker === ticker)
        ? prev.filter((e) => e.ticker !== ticker)
        : [...prev, { ticker, addedAt: new Date().toISOString(), note: '' }]
    )
  }

  function setNote(ticker: string, note: string) {
    setWatchlist((prev) => prev.map((e) => (e.ticker === ticker ? { ...e, note } : e)))
  }

  const effectiveSortKey: SortKey = sortKey ?? period

  function sortValue(stock: Stock, key: SortKey): string | number | null {
    if (key.startsWith('o:')) return outperf(stock, key.slice(2))
    return stock[key as Exclude<SortKey, `o:${string}`>]
  }

  const rows = useMemo(() => {
    if (!data) return []
    const minPerfNum = minPerf === '' ? null : Number(minPerf)
    const maxPENum = maxPE === '' ? null : Number(maxPE)
    const minDivNum = minDiv === '' ? null : Number(minDiv)
    const filtered = data.stocks.filter((s) => {
      if (view === 'watch') return watchedTickers.has(s.ticker)
      if (region !== 'ALL' && s.region !== region) return false
      if (s.marketCapEUR != null && s.marketCapEUR < minCapBn * 1e9) return false
      if (sector !== 'ALL' && s.sector !== sector) return false
      if (minPerfNum != null && (s[period] == null || (s[period] as number) < minPerfNum)) return false
      if (maxPENum != null && (s.peTrailing == null || s.peTrailing > maxPENum)) return false
      if (minDivNum != null && (s.divYieldPct == null || s.divYieldPct < minDivNum)) return false
      if (above200 && !(s.pctVs200d != null && s.pctVs200d > 0)) return false
      return true
    })
    const dir = sortAsc ? 1 : -1
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, effectiveSortKey)
      const vb = sortValue(b, effectiveSortKey)
      if (typeof va === 'string' && typeof vb === 'string') return dir * va.localeCompare(vb, 'de')
      const na = (va as number | null) ?? -Infinity
      const nb = (vb as number | null) ?? -Infinity
      return dir * (na - nb)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, view, watchedTickers, region, minCapBn, sector, minPerf, maxPE, minDiv, above200, effectiveSortKey, sortAsc, period, benchPerf])

  const missingWatched = useMemo(() => {
    if (!data) return []
    const known = new Set(data.stocks.map((s) => s.ticker))
    return watchlist.filter((e) => !known.has(e.ticker))
  }, [data, watchlist])

  function toggleSort(key: SortKey) {
    if (effectiveSortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(key === 'name' || key === 'sector')
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">Keine Kursdaten gefunden</h1>
          <p className="text-zinc-400 text-sm">
            <code className="text-zinc-300">public/data/prices.json</code> fehlt oder ist nicht ladbar ({error}).
            Einmal <code className="text-zinc-300">npm run fetch</code> ausführen.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">
              {view === 'top' ? 'Aktien-Watchlist · Top-Performer' : 'Aktien-Watchlist · Meine Watchlist'}
            </h1>
            <div className="flex rounded-lg bg-zinc-900 p-1 ring-1 ring-zinc-800">
              <button
                onClick={() => setView('top')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  view === 'top' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Top-Performer
              </button>
              <button
                onClick={() => setView('watch')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  view === 'watch' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                ★ Watchlist ({watchlist.length})
              </button>
            </div>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            {data
              ? `${rows.length} ${view === 'watch' ? 'Aktien auf der Watchlist' : `von ${data.stockCount} Aktien`} · Stand ${new Date(data.fetchedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })} · Kurse & Performance in EUR`
              : 'Lade Kursdaten …'}
            {data && data.failedTickers.length > 0 && (
              <span className="text-amber-400"> · {data.failedTickers.length} Ticker ohne Daten</span>
            )}
          </p>
          {benchmarks.length > 0 && (
            <p className="text-xs text-zinc-500 mt-1">
              Benchmarks ({PERIOD_LABEL[period]}):{' '}
              {benchmarks.map((b, i) => (
                <span key={b.ticker}>
                  {i > 0 && ' · '}
                  {b.name} <span className={perfClass(benchPerf[b.ticker])}>{formatPerf(benchPerf[b.ticker])}</span>
                </span>
              ))}
            </p>
          )}
          <div className="text-xs mt-1">
            <button
              onClick={() => {
                setKeyDraft(fmpKey)
                setShowKeyInput((v) => !v)
              }}
              className="text-zinc-500 underline hover:text-zinc-300"
            >
              {fmpKey ? 'ISIN-Abruf aktiv · Key ändern' : 'ISIN als Kauf-Identifier aktivieren (kostenloser FMP-Key)'}
            </button>
            {showKeyInput && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder="FMP API-Key"
                  className="w-56 rounded-md bg-zinc-900 ring-1 ring-zinc-800 px-2 py-1 text-zinc-100"
                />
                <button onClick={saveKey} className="rounded-md bg-zinc-700 px-2.5 py-1 text-zinc-100 hover:bg-zinc-600">
                  Speichern
                </button>
                <a
                  href="https://site.financialmodelingprep.com/developer/docs/pricing"
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-500 underline hover:text-zinc-300"
                >
                  kostenlosen Key holen ↗
                </a>
              </div>
            )}
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3 mb-3">
          {view === 'top' && (
            <div className="flex rounded-lg bg-zinc-900 p-1 ring-1 ring-zinc-800">
              {(Object.keys(REGION_LABELS) as RegionFilter[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRegion(r)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    region === r ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {REGION_LABELS[r]}
                </button>
              ))}
            </div>
          )}

          <div className="flex rounded-lg bg-zinc-900 p-1 ring-1 ring-zinc-800">
            {(['perf3m', 'perf6m', 'perf12m'] as const).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPeriod(p)
                  if (sortKey === 'perf3m' || sortKey === 'perf6m' || sortKey === 'perf12m') setSortKey(null)
                }}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  period === p ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {p === 'perf3m' ? '3M' : p === 'perf6m' ? '6M' : '1J'}
              </button>
            ))}
          </div>
        </div>

        {view === 'top' && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-sm text-zinc-400">
            <label className="flex items-center gap-1.5">
              Sektor
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="rounded-md bg-zinc-900 ring-1 ring-zinc-800 px-2 py-1.5 text-zinc-100"
              >
                <option value="ALL">Alle</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              Marktkap ≥
              <input
                type="number"
                min={0}
                value={minCapBn}
                onChange={(e) => setMinCapBn(Number(e.target.value))}
                className="w-16 rounded-md bg-zinc-900 ring-1 ring-zinc-800 px-2 py-1.5 text-zinc-100 text-right"
              />
              Mrd €
            </label>
            <label className="flex items-center gap-1.5">
              Perf. {period === 'perf3m' ? '3M' : period === 'perf6m' ? '6M' : '1J'} ≥
              <input
                type="number"
                value={minPerf}
                onChange={(e) => setMinPerf(e.target.value)}
                placeholder="–"
                className="w-16 rounded-md bg-zinc-900 ring-1 ring-zinc-800 px-2 py-1.5 text-zinc-100 text-right"
              />
              %
            </label>
            <label className="flex items-center gap-1.5">
              KGV ≤
              <input
                type="number"
                value={maxPE}
                onChange={(e) => setMaxPE(e.target.value)}
                placeholder="–"
                className="w-16 rounded-md bg-zinc-900 ring-1 ring-zinc-800 px-2 py-1.5 text-zinc-100 text-right"
              />
            </label>
            <label className="flex items-center gap-1.5">
              Div. ≥
              <input
                type="number"
                value={minDiv}
                onChange={(e) => setMinDiv(e.target.value)}
                placeholder="–"
                className="w-16 rounded-md bg-zinc-900 ring-1 ring-zinc-800 px-2 py-1.5 text-zinc-100 text-right"
              />
              %
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={above200} onChange={(e) => setAbove200(e.target.checked)} className="accent-emerald-500" />
              über 200-Tage-Linie
            </label>
            {(sector !== 'ALL' || minPerf || maxPE || minDiv || above200 || minCapBn !== 2) && (
              <button
                onClick={() => {
                  setSector('ALL'); setMinPerf(''); setMaxPE(''); setMinDiv(''); setAbove200(false); setMinCapBn(2)
                }}
                className="text-zinc-500 hover:text-zinc-300 underline"
              >
                zurücksetzen
              </button>
            )}
          </div>
        )}

        {view === 'watch' && rows.length === 0 && missingWatched.length === 0 ? (
          <div className="rounded-xl ring-1 ring-zinc-800 bg-zinc-900/40 p-10 text-center text-zinc-400">
            <p className="text-lg">Noch keine Aktien auf der Watchlist.</p>
            <p className="text-sm mt-2">
              In der Top-Performer-Liste auf den Stern (☆) klicken, um Kaufkandidaten zu sammeln.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-900 text-zinc-400 text-left">
                  <th className="px-2 py-2.5 w-8"></th>
                  <th className="px-3 py-2.5 w-10 text-right">#</th>
                  <Th label="Aktie" k="name" sortKey={effectiveSortKey} asc={sortAsc} onSort={toggleSort} />
                  <th className="px-3 py-2.5">Region</th>
                  <Th label="Sektor" k="sector" sortKey={effectiveSortKey} asc={sortAsc} onSort={toggleSort} />
                  <Th label="Kurs" k="price" sortKey={effectiveSortKey} asc={sortAsc} onSort={toggleSort} right />
                  <Th label="Marktkap" k="marketCapEUR" sortKey={effectiveSortKey} asc={sortAsc} onSort={toggleSort} right />
                  <th className="px-3 py-2.5">Verlauf {period === 'perf3m' ? '3M' : period === 'perf6m' ? '6M' : '1J'}</th>
                  <Th label="3M" k="perf3m" sortKey={effectiveSortKey} asc={sortAsc} onSort={toggleSort} right emphasize={period === 'perf3m'} />
                  <Th label="6M" k="perf6m" sortKey={effectiveSortKey} asc={sortAsc} onSort={toggleSort} right emphasize={period === 'perf6m'} />
                  <Th label="1J" k="perf12m" sortKey={effectiveSortKey} asc={sortAsc} onSort={toggleSort} right emphasize={period === 'perf12m'} />
                  {benchmarks.map((b) => (
                    <Th
                      key={b.ticker}
                      label={BENCH_SHORT[b.ticker] ?? b.name}
                      k={`o:${b.ticker}`}
                      sortKey={effectiveSortKey}
                      asc={sortAsc}
                      onSort={toggleSort}
                      right
                    />
                  ))}
                  {view === 'watch' && <th className="px-3 py-2.5">Notiz</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {rows.map((s, i) => (
                  <Row
                    key={s.ticker}
                    stock={s}
                    rank={i + 1}
                    months={months}
                    onSelect={setSelected}
                    watched={watchedTickers.has(s.ticker)}
                    onToggleWatch={toggleWatch}
                    entry={view === 'watch' ? watchlist.find((e) => e.ticker === s.ticker) : undefined}
                    onNote={setNote}
                    benchmarks={benchmarks}
                    outperf={outperf}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === 'watch' && missingWatched.length > 0 && (
          <p className="text-sm text-amber-400 mt-3">
            Ohne aktuelle Kursdaten (nicht mehr im Universum): {missingWatched.map((e) => e.ticker).join(', ')}
          </p>
        )}
      </div>

      {selected && (
        <StockDetail
          stock={selected}
          benchmarks={benchmarks}
          fmpKey={fmpKey}
          onClose={() => setSelected(null)}
          watched={watchedTickers.has(selected.ticker)}
          onToggleWatch={() => toggleWatch(selected.ticker)}
        />
      )}
    </div>
  )
}

function Th({
  label,
  k,
  sortKey,
  asc,
  onSort,
  right = false,
  emphasize = false,
}: {
  label: string
  k: SortKey
  sortKey: SortKey
  asc: boolean
  onSort: (k: SortKey) => void
  right?: boolean
  emphasize?: boolean
}) {
  const active = sortKey === k
  return (
    <th
      className={`px-3 py-2.5 cursor-pointer select-none hover:text-zinc-200 whitespace-nowrap ${right ? 'text-right' : ''} ${
        emphasize ? 'text-zinc-100' : ''
      }`}
      onClick={() => onSort(k)}
    >
      {label}
      {active && <span className="ml-1 text-zinc-500">{asc ? '↑' : '↓'}</span>}
    </th>
  )
}

function Row({
  stock,
  rank,
  months,
  onSelect,
  watched,
  onToggleWatch,
  entry,
  onNote,
  benchmarks,
  outperf,
}: {
  stock: Stock
  rank: number
  months: number
  onSelect: (s: Stock) => void
  watched: boolean
  onToggleWatch: (ticker: string) => void
  entry?: WatchlistEntry
  onNote: (ticker: string, note: string) => void
  benchmarks: Benchmark[]
  outperf: (stock: Stock, benchTicker: string) => number | null
}) {
  return (
    <tr className="hover:bg-zinc-900/60 cursor-pointer" onClick={() => onSelect(stock)}>
      <td className="px-2 py-2">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleWatch(stock.ticker)
          }}
          className={`text-lg leading-none ${watched ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-300'}`}
          aria-label={watched ? 'Von Watchlist entfernen' : 'Zur Watchlist hinzufügen'}
          title={watched ? 'Von Watchlist entfernen' : 'Zur Watchlist hinzufügen'}
        >
          {watched ? '★' : '☆'}
        </button>
      </td>
      <td className="px-3 py-2 text-right text-zinc-500 tabular-nums">{rank}</td>
      <td className="px-3 py-2">
        <div className="font-medium text-zinc-100">{stock.name}</div>
        <div className="text-xs text-zinc-500">
          {stock.ticker}
          {entry && (
            <span className="ml-2 text-zinc-600">
              seit {new Date(entry.addedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${REGION_BADGE[stock.region]}`}>
          {stock.region}
        </span>
      </td>
      <td className="px-3 py-2 text-zinc-400">{stock.sector}</td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
        {stock.price.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
        <span className="text-zinc-500 text-xs ml-1">€</span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{formatMarketCap(stock.marketCapEUR)}</td>
      <td className="px-3 py-2">
        <Sparkline history={stock.history} months={months} />
      </td>
      <td className={`px-3 py-2 text-right tabular-nums font-medium ${perfClass(stock.perf3m)}`}>
        {formatPerf(stock.perf3m)}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums font-medium ${perfClass(stock.perf6m)}`}>
        {formatPerf(stock.perf6m)}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums font-medium ${perfClass(stock.perf12m)}`}>
        {formatPerf(stock.perf12m)}
      </td>
      {benchmarks.map((b) => {
        const o = outperf(stock, b.ticker)
        return (
          <td key={b.ticker} className={`px-3 py-2 text-right tabular-nums ${perfClass(o)}`}>
            {formatPerf(o)}
          </td>
        )
      })}
      {entry && (
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={entry.note}
            placeholder="Notiz …"
            onChange={(e) => onNote(stock.ticker, e.target.value)}
            className="w-36 rounded-md bg-zinc-950/60 ring-1 ring-zinc-800 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:ring-zinc-600 focus:outline-none"
          />
        </td>
      )}
    </tr>
  )
}
