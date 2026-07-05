import { useEffect, useMemo, useRef, useState } from 'react'
import { AreaSeries, ColorType, createChart, LineSeries, type ISeriesApi } from 'lightweight-charts'
import type { Benchmark, Stock } from './types'

type ChartPeriod = '1M' | '3M' | '6M' | '1J'
type ChartMode = 'price' | 'compare'
const PERIOD_MONTHS: Record<ChartPeriod, number> = { '1M': 1, '3M': 3, '6M': 6, '1J': 12 }

// Benchmark-Linienfarben im Vergleichsmodus
const BENCH_COLOR: Record<string, string> = {
  'IWDA.L': '#60a5fa', // MSCI World – blau
  'EIMI.L': '#fbbf24', // MSCI EM – amber
  '^GSPC': '#c084fc', // S&P 500 – violett
}
const STOCK_KEY = '__stock__'

function sliceHistory(history: [string, number][], months: number): [string, number][] {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  return history.filter(([date]) => date >= cutoffIso)
}

/** Auf 100 zum ersten Kurs des Zeitraums indexieren. */
function indexed(sliced: [string, number][]): { time: string; value: number }[] {
  if (sliced.length === 0) return []
  const base = sliced[0][1]
  return sliced.map(([time, value]) => ({ time, value: (value / base) * 100 }))
}

function formatNumber(v: number | null, digits = 1): string {
  if (v == null) return '–'
  return v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function formatVolume(v: number | null): string {
  if (v == null) return '–'
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace('.', ',')} Mio`
  if (v >= 1e3) return `${Math.round(v / 1e3)} Tsd`
  return String(v)
}

export default function StockDetail({
  stock,
  benchmarks,
  onClose,
  watched,
  onToggleWatch,
}: {
  stock: Stock
  benchmarks: Benchmark[]
  onClose: () => void
  watched: boolean
  onToggleWatch: () => void
}) {
  const [period, setPeriod] = useState<ChartPeriod>('6M')
  const [mode, setMode] = useState<ChartMode>('price')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const chartRef = useRef<HTMLDivElement>(null)
  const seriesRef = useRef<Record<string, ISeriesApi<'Line'>>>({})

  const months = PERIOD_MONTHS[period]
  const points = useMemo(() => sliceHistory(stock.history, months), [stock, months])
  const periodPerf = points.length >= 2 ? (points[points.length - 1][1] / points[0][1] - 1) * 100 : null
  const rising = periodPerf != null && periodPerf >= 0
  const stockColor = rising ? '#34d399' : '#f87171'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const el = chartRef.current
    if (!el || points.length < 2) return
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#a1a1aa',
        attributionLogo: false,
      },
      grid: { vertLines: { color: '#27272a' }, horzLines: { color: '#27272a' } },
      rightPriceScale: { borderColor: '#3f3f46' },
      timeScale: { borderColor: '#3f3f46' },
      crosshair: {
        horzLine: { labelBackgroundColor: '#3f3f46' },
        vertLine: { labelBackgroundColor: '#3f3f46' },
      },
      localization: { locale: 'de-DE' },
    })
    seriesRef.current = {}

    if (mode === 'price') {
      const series = chart.addSeries(AreaSeries, {
        lineColor: stockColor,
        topColor: rising ? 'rgba(52, 211, 153, 0.25)' : 'rgba(248, 113, 113, 0.25)',
        bottomColor: 'rgba(0, 0, 0, 0)',
        lineWidth: 2,
      })
      series.setData(points.map(([time, value]) => ({ time, value })))
    } else {
      // Vergleichsmodus: Aktie + Benchmarks, alle auf 100 indexiert
      const stockSeries = chart.addSeries(LineSeries, {
        color: '#e4e4e7',
        lineWidth: 2,
        visible: !hidden.has(STOCK_KEY),
        priceLineVisible: false,
      })
      stockSeries.setData(indexed(points))
      seriesRef.current[STOCK_KEY] = stockSeries

      for (const b of benchmarks) {
        const series = chart.addSeries(LineSeries, {
          color: BENCH_COLOR[b.ticker] ?? '#a1a1aa',
          lineWidth: 2,
          visible: !hidden.has(b.ticker),
          priceLineVisible: false,
          lastValueVisible: false,
        })
        series.setData(indexed(sliceHistory(b.history, months)))
        seriesRef.current[b.ticker] = series
      }
    }

    chart.timeScale().fitContent()
    return () => chart.remove()
    // hidden bewusst NICHT in den Deps: Sichtbarkeit wird ohne Neuaufbau umgeschaltet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, mode, months, rising, stockColor, benchmarks])

  // Legende: Sichtbarkeit auf bestehende Serien anwenden, ohne Chart neu zu bauen
  useEffect(() => {
    for (const [key, series] of Object.entries(seriesRef.current)) {
      series.applyOptions({ visible: !hidden.has(key) })
    }
  }, [hidden])

  function toggleLine(key: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const stats: [string, string][] = [
    ['52W-Hoch', `${formatNumber(stock.high52w, 2)} ${stock.currency ?? ''}`],
    ['52W-Tief', `${formatNumber(stock.low52w, 2)} ${stock.currency ?? ''}`],
    [
      'Abstand 52W-Hoch',
      stock.high52w != null ? `${((stock.price / stock.high52w - 1) * 100).toFixed(1).replace('.', ',')} %` : '–',
    ],
    ['KGV', formatNumber(stock.peTrailing)],
    ['KGV (erwartet)', formatNumber(stock.peForward)],
    ['Div.-Rendite', stock.divYieldPct != null ? `${formatNumber(stock.divYieldPct)} %` : '–'],
    ['Ø Volumen (3M)', formatVolume(stock.avgVolume3m)],
    [
      'Marktkap',
      stock.marketCapEUR != null
        ? stock.marketCapEUR >= 1e12
          ? `${(stock.marketCapEUR / 1e12).toFixed(2).replace('.', ',')} Bio €`
          : `${Math.round(stock.marketCapEUR / 1e9)} Mrd €`
        : '–',
    ],
  ]

  // Periodenperformance einer Reihe direkt aus der geslicten Historie (für jeden Zeitraum korrekt)
  function slicedPerf(history: [string, number][]): number | null {
    const s = sliceHistory(history, months)
    if (s.length < 2) return null
    return (s[s.length - 1][1] / s[0][1] - 1) * 100
  }

  // Legenden-Einträge inkl. Periodenperformance zum Vergleich
  const legend =
    mode === 'compare'
      ? [
          { key: STOCK_KEY, label: stock.name, color: '#e4e4e7', perf: periodPerf },
          ...benchmarks.map((b) => ({
            key: b.ticker,
            label: b.name,
            color: BENCH_COLOR[b.ticker] ?? '#a1a1aa',
            perf: slicedPerf(b.history),
          })),
        ]
      : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-zinc-900 ring-1 ring-zinc-700/60 shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{stock.name}</h2>
            <p className="text-sm text-zinc-400">
              {stock.ticker} · {stock.sector} ·{' '}
              {{ EU: 'Europa', US: 'USA', JP: 'Japan', EM: 'Emerging Markets' }[stock.region]}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xl font-semibold tabular-nums">
                {stock.price.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                <span className="text-sm text-zinc-400 ml-1">{stock.currency}</span>
              </div>
              {periodPerf != null && (
                <div className={`text-sm font-medium tabular-nums ${rising ? 'text-emerald-400' : 'text-red-400'}`}>
                  {periodPerf > 0 ? '+' : ''}
                  {periodPerf.toFixed(1).replace('.', ',')} % ({period})
                </div>
              )}
            </div>
            <button
              onClick={onToggleWatch}
              className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 transition-colors ${
                watched
                  ? 'bg-amber-400/10 text-amber-300 ring-amber-400/30 hover:bg-amber-400/20'
                  : 'text-zinc-300 ring-zinc-700 hover:bg-zinc-800'
              }`}
            >
              {watched ? '★ Auf Watchlist' : '☆ Zur Watchlist'}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex rounded-lg bg-zinc-950 p-1 ring-1 ring-zinc-800 w-fit">
            {(Object.keys(PERIOD_MONTHS) as ChartPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  period === p ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg bg-zinc-950 p-1 ring-1 ring-zinc-800 w-fit">
            {(['price', 'compare'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  mode === m ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {m === 'price' ? 'Kurs' : 'Vergleich (indexiert)'}
              </button>
            ))}
          </div>
        </div>

        <div ref={chartRef} className="mt-3 h-72 w-full" />

        {mode === 'compare' && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {legend.map((item) => {
              const off = hidden.has(item.key)
              return (
                <button
                  key={item.key}
                  onClick={() => toggleLine(item.key)}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-1 text-xs ring-1 transition-colors ${
                    off ? 'ring-zinc-800 text-zinc-600' : 'ring-zinc-700 text-zinc-200 hover:bg-zinc-800'
                  }`}
                  title={off ? 'Einblenden' : 'Ausblenden'}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: off ? '#3f3f46' : item.color }}
                  />
                  {item.label}
                  {item.perf != null && (
                    <span className={off ? 'text-zinc-600' : item.perf >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {item.perf > 0 ? '+' : ''}
                      {item.perf.toFixed(1).replace('.', ',')} %
                    </span>
                  )}
                </button>
              )
            })}
            <span className="text-xs text-zinc-600 ml-1">indexiert auf 100 zum Startzeitpunkt</span>
          </div>
        )}

        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-zinc-950/60 ring-1 ring-zinc-800 px-3 py-2">
              <dt className="text-xs text-zinc-500">{label}</dt>
              <dd className="text-sm font-medium tabular-nums text-zinc-200 mt-0.5">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
