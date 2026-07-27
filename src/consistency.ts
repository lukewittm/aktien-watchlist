// Konsistenz-Score nach Produktbrief 3.3: Trendgüte (R²), Anteil positiver Wochen,
// Max Drawdown – bevorzugt stetige Trends statt Aktien mit einem einzelnen Kurssprung.
export interface Consistency {
  r2: number | null
  positiveWeeksPct: number | null
  maxDrawdownPct: number | null
  /** 0-100, gleich gewichteter Mittelwert der drei Komponenten (fehlende werden übersprungen) */
  score: number | null
}

function sliceCloses(history: [string, number][], months: number): number[] {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const iso = cutoff.toISOString().slice(0, 10)
  return history.filter(([d]) => d >= iso).map(([, c]) => c)
}

// R² einer linearen Regression über den Kursverlauf (Index vs. Kurs)
function computeR2(closes: number[]): number | null {
  const n = closes.length
  if (n < 10) return null
  const xs = closes.map((_, i) => i)
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = closes.reduce((a, b) => a + b, 0) / n
  let num = 0
  let denX = 0
  let denY = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (closes[i] - my)
    denX += (xs[i] - mx) ** 2
    denY += (closes[i] - my) ** 2
  }
  if (denX === 0 || denY === 0) return null
  const r = num / Math.sqrt(denX * denY)
  return r * r
}

// Anteil "positiver Wochen": grobe 5-Handelstage-Fenster statt Kalenderwochen (robust
// gegenüber Feiertagslücken, die schon in der Historie forward-gefüllt sind)
function computePositiveWeeksPct(closes: number[]): number | null {
  if (closes.length < 10) return null
  let pos = 0
  let total = 0
  for (let i = 5; i < closes.length; i += 5) {
    total++
    if (closes[i] > closes[i - 5]) pos++
  }
  return total ? (pos / total) * 100 : null
}

function computeMaxDrawdownPct(closes: number[]): number | null {
  if (closes.length < 2) return null
  let peak = closes[0]
  let maxDd = 0
  for (const c of closes) {
    peak = Math.max(peak, c)
    maxDd = Math.min(maxDd, (c / peak - 1) * 100)
  }
  return maxDd
}

export function computeConsistency(history: [string, number][], months: number): Consistency {
  const closes = sliceCloses(history, months)
  const r2 = computeR2(closes)
  const positiveWeeksPct = computePositiveWeeksPct(closes)
  const maxDrawdownPct = computeMaxDrawdownPct(closes)

  const parts: number[] = []
  if (r2 != null) parts.push(r2 * 100)
  if (positiveWeeksPct != null) parts.push(positiveWeeksPct)
  // Drawdown-Bonus: 0% -> 100 Punkte, -30% oder schlechter -> 0 Punkte
  if (maxDrawdownPct != null) parts.push(Math.max(0, 100 + (maxDrawdownPct / 30) * 100))

  return {
    r2,
    positiveWeeksPct,
    maxDrawdownPct,
    score: parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null,
  }
}

// Percentile-Rang (0-1) von v innerhalb values – skalen- und vorzeichenunabhängig,
// deshalb Basis für den kombinierten "Performance × Konsistenz"-Score statt
// direkter Multiplikation (die bei negativer Performance das Vorzeichen verfälscht).
export function percentileRank(v: number | null, values: (number | null)[]): number {
  if (v == null) return 0
  const valid = values.filter((x): x is number => x != null)
  if (valid.length < 2) return 0.5
  const below = valid.filter((x) => x < v).length
  return below / (valid.length - 1 || 1)
}
