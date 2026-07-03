import { useEffect, useMemo, useState } from 'react'
import type { PricesFile, Region, Stock } from './types'

type SortKey = 'name' | 'sector' | 'price' | 'marketCapEUR' | 'perf3m' | 'perf6m'
type RegionFilter = Region | 'ALL'

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

export default function App() {
  const [data, setData] = useState<PricesFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [region, setRegion] = useState<RegionFilter>('ALL')
  const [period, setPeriod] = useState<'perf3m' | 'perf6m'>('perf3m')
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortAsc, setSortAsc] = useState(false)
  const [minCapBn, setMinCapBn] = useState(2)

  useEffect(() => {
    fetch('/data/prices.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(String(e)))
  }, [])

  const effectiveSortKey: SortKey = sortKey ?? period

  const rows = useMemo(() => {
    if (!data) return []
    const filtered = data.stocks.filter(
      (s) =>
        (region === 'ALL' || s.region === region) &&
        (s.marketCapEUR == null || s.marketCapEUR >= minCapBn * 1e9)
    )
    const dir = sortAsc ? 1 : -1
    return [...filtered].sort((a, b) => {
      const va = a[effectiveSortKey]
      const vb = b[effectiveSortKey]
      if (typeof va === 'string' && typeof vb === 'string') return dir * va.localeCompare(vb, 'de')
      const na = (va as number | null) ?? -Infinity
      const nb = (vb as number | null) ?? -Infinity
      return dir * (na - nb)
    })
  }, [data, region, minCapBn, effectiveSortKey, sortAsc])

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
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Aktien-Watchlist · Top-Performer</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {data
              ? `${rows.length} von ${data.stockCount} Aktien · Stand ${new Date(data.fetchedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}`
              : 'Lade Kursdaten …'}
            {data && data.failedTickers.length > 0 && (
              <span className="text-amber-400"> · {data.failedTickers.length} Ticker ohne Daten ({data.failedTickers.join(', ')})</span>
            )}
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3 mb-4">
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

          <div className="flex rounded-lg bg-zinc-900 p-1 ring-1 ring-zinc-800">
            {(['perf3m', 'perf6m'] as const).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPeriod(p)
                  if (sortKey === 'perf3m' || sortKey === 'perf6m') setSortKey(null)
                }}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  period === p ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {p === 'perf3m' ? '3 Monate' : '6 Monate'}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-400">
            Min. Marktkap
            <input
              type="number"
              min={0}
              value={minCapBn}
              onChange={(e) => setMinCapBn(Number(e.target.value))}
              className="w-20 rounded-md bg-zinc-900 ring-1 ring-zinc-800 px-2 py-1.5 text-zinc-100 text-right"
            />
            Mrd €
          </label>
        </div>

        <div className="overflow-x-auto rounded-xl ring-1 ring-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900 text-zinc-400 text-left">
                <th className="px-3 py-2.5 w-10 text-right">#</th>
                <Th label="Aktie" k="name" sortKey={effectiveSortKey} asc={sortAsc} onSort={toggleSort} />
                <th className="px-3 py-2.5">Region</th>
                <Th label="Sektor" k="sector" sortKey={effectiveSortKey} asc={sortAsc} onSort={toggleSort} />
                <Th label="Kurs" k="price" sortKey={effectiveSortKey} asc={sortAsc} onSort={toggleSort} right />
                <Th label="Marktkap" k="marketCapEUR" sortKey={effectiveSortKey} asc={sortAsc} onSort={toggleSort} right />
                <Th label="3M" k="perf3m" sortKey={effectiveSortKey} asc={sortAsc} onSort={toggleSort} right emphasize={period === 'perf3m'} />
                <Th label="6M" k="perf6m" sortKey={effectiveSortKey} asc={sortAsc} onSort={toggleSort} right emphasize={period === 'perf6m'} />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {rows.map((s, i) => (
                <Row key={s.ticker} stock={s} rank={i + 1} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
      className={`px-3 py-2.5 cursor-pointer select-none hover:text-zinc-200 ${right ? 'text-right' : ''} ${
        emphasize ? 'text-zinc-100' : ''
      }`}
      onClick={() => onSort(k)}
    >
      {label}
      {active && <span className="ml-1 text-zinc-500">{asc ? '↑' : '↓'}</span>}
    </th>
  )
}

function Row({ stock, rank }: { stock: Stock; rank: number }) {
  return (
    <tr className="hover:bg-zinc-900/60">
      <td className="px-3 py-2 text-right text-zinc-500 tabular-nums">{rank}</td>
      <td className="px-3 py-2">
        <div className="font-medium text-zinc-100">{stock.name}</div>
        <div className="text-xs text-zinc-500">{stock.ticker}</div>
      </td>
      <td className="px-3 py-2">
        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${REGION_BADGE[stock.region]}`}>
          {stock.region}
        </span>
      </td>
      <td className="px-3 py-2 text-zinc-400">{stock.sector}</td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
        {stock.price.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
        <span className="text-zinc-500 text-xs ml-1">{stock.currency}</span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{formatMarketCap(stock.marketCapEUR)}</td>
      <td className={`px-3 py-2 text-right tabular-nums font-medium ${perfClass(stock.perf3m)}`}>
        {formatPerf(stock.perf3m)}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums font-medium ${perfClass(stock.perf6m)}`}>
        {formatPerf(stock.perf6m)}
      </td>
    </tr>
  )
}
