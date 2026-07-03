# Aktien-Watchlist

Persönliches Aktien-Performance-Dashboard: Top-Performer aus Europa, USA, Japan und Emerging Markets, gefiltert nach Marktkapitalisierung, sortiert nach 3M/6M-Performance. Siehe Produktbrief (`produktbrief-aktien-watchlist.md` in Downloads).

## Setup & Betrieb

```bash
npm install
npm run fetch   # holt Kurse (7 Monate Tageskurse) + Marktkap für alle ~190 Ticker von Yahoo Finance → public/data/prices.json
npm run dev     # Dev-Server auf http://localhost:5173
npm run build   # Produktions-Build nach dist/
```

`npm run fetch` einmal täglich laufen lassen genügt (3M/6M-Performance braucht keine Stundenauflösung).

## Aufbau

- `data/universe.json` — kuratiertes Screening-Universum (~190 Ticker, 4 Regionen), Sektor statisch gepflegt. Quartalsweise nach Index-Rebalancing von Hand aktualisieren.
- `scripts/fetch-prices.mjs` — Yahoo-Finance-Abruf (yahoo-finance2): Batch-Quotes für Marktkap, Tages-Charts pro Ticker, Retry mit Backoff, Forward-Fill für Lücken, FX-Umrechnung der Marktkap nach EUR (inkl. GBp→GBP-Sonderfall für LSE).
- `public/data/prices.json` — generierte Datenbasis, wird vom Frontend geladen. Enthält die volle Kurshistorie pro Ticker (Basis für spätere Charts).
- `src/App.tsx` — Top-Performer-Tabelle: Regionen-Filter, 3M/6M-Umschalter, sortierbare Spalten, Min-Marktkap-Filter (Standard 2 Mrd €).

## Phasen-Status (aus dem Produktbrief)

- [x] **Phase 0/1** — Projekt-Setup, Universum, Yahoo-Anbindung, Performance-Berechnung, Top-Performer-Tabelle
- [ ] **Phase 2** — Watchlist + Charts (Kurshistorie liegt bereits in `prices.json`)
- [ ] **Phase 3** — Benchmark-Vergleich (MSCI World / MSCI EM / S&P 500)
- [ ] **Phase 4** — Konsistenz-Score (R², positive Wochen, Max Drawdown)
- [ ] **Phase 5** — Robustheit (Stooq-Backup, Scheduler statt manuellem Fetch)

## Deployment (offen)

Cloudflare Pages + Worker mit Cron-Trigger laut Brief. Bis dahin: lokal `npm run fetch && npm run dev`. Alternative laut Brief: GitHub Actions committet täglich `prices.json`, GitHub Pages/Cloudflare Pages served den Build.

## Bekannte Datenpunkte

- Yahoo Finance ist inoffiziell/ohne SLA. Erster Testlauf (03.07.2026): 189/189 Ticker erfolgreich.
- `ROG.SW` (Roche Genussschein) liefert bei Yahoo derzeit keine Daten — im Universum ist stattdessen `RO.SW` (Inhaberaktie).
