import { useEffect, useMemo, useRef, useState } from 'react'
import { AreaSeries, ColorType, createChart } from 'lightweight-charts'
import type { Stock } from './types'

type ChartPeriod = '1M' | '3M' | '6M' | '1J'
const PERIOD_MONTHS: Record<ChartPeriod, number> = { '1M': 1, '3M': 3, '6M': 6, '1J': 12 }

function sliceHistory(history: [string, number][], period: ChartPeriod): [string, number][] {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - PERIOD_MONTHS[period])
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  return history.filter(([date]) => date >= cutoffIso)
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

export default function StockDetail({ stock, onClose }: { stock: Stock; onClose: () => void }) {
  const [period, setPeriod] = useState<ChartPeriod>('6M')
  const chartRef = useRef<HTMLDivElement>(null)

  const points = useMemo(() => sliceHistory(stock.history, period), [stock, period])
  const periodPerf = points.length >= 2 ? (points[points.length - 1][1] / points[0][1] - 1) * 100 : null
  const rising = periodPerf != null && periodPerf >= 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const el = chartRef.current
    if (!el || points.length < 2) return
    const lineColor = rising ? '#34d399' : '#f87171'
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#a1a1aa',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#27272a' },
        horzLines: { color: '#27272a' },
      },
      rightPriceScale: { borderColor: '#3f3f46' },
      timeScale: { borderColor: '#3f3f46' },
      crosshair: {
        horzLine: { labelBackgroundColor: '#3f3f46' },
        vertLine: { labelBackgroundColor: '#3f3f46' },
      },
      localization: { locale: 'de-DE' },
    })
    const series = chart.addSeries(AreaSeries, {
      lineColor,
      topColor: rising ? 'rgba(52, 211, 153, 0.25)' : 'rgba(248, 113, 113, 0.25)',
      bottomColor: 'rgba(0, 0, 0, 0)',
      lineWidth: 2,
    })
    series.setData(points.map(([time, value]) => ({ time, value })))
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [points, rising])

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
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="mt-4 flex rounded-lg bg-zinc-950 p-1 ring-1 ring-zinc-800 w-fit">
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

        <div ref={chartRef} className="mt-3 h-72 w-full" />

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
