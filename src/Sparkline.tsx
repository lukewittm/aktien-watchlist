const WIDTH = 96
const HEIGHT = 28

/** Mini-Kursverlauf für Tabellenzeilen. Erwartet [ISO-Datum, Schlusskurs]-Paare. */
export default function Sparkline({ history, months }: { history: [string, number][]; months: number }) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  const points = history.filter(([date]) => date >= cutoffIso).map(([, close]) => close)

  if (points.length < 2) return <span className="text-zinc-600">–</span>

  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const stepX = WIDTH / (points.length - 1)
  // 2px Innenabstand oben/unten, damit die Linie nicht am Rand klebt
  const y = (v: number) => HEIGHT - 2 - ((v - min) / span) * (HEIGHT - 4)

  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const rising = points[points.length - 1] >= points[0]
  const stroke = rising ? 'var(--color-emerald-400)' : 'var(--color-red-400)'

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block" aria-hidden>
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
