# Aktien-Watchlist

Persönliches Aktien-Performance-Dashboard: Top-Performer aus Europa, USA, Japan und Emerging Markets, gefiltert nach Marktkapitalisierung und weiteren Kriterien, sortiert nach 3M/6M/1J-Performance. Siehe Produktbrief (`produktbrief-aktien-watchlist.md` in Downloads).

## Setup & Betrieb

```bash
npm install
npm run build:universe  # baut data/universe.json aus echten Indexlisten (nur bei Bedarf, s.u.)
npm run fetch           # holt 13 Monate Tageskurse + Kennzahlen für alle ~1000 Ticker → public/data/prices.json
npm run dev             # Dev-Server auf http://localhost:5173
npm run build           # Produktions-Build nach dist/
```

`npm run fetch` einmal täglich genügt (Monats-Performance braucht keine Stundenauflösung). `build:universe` nur nach Index-Rebalancing / wenn sich die Ticker-Liste ändern soll.

## Universum (regelbasiert, gegen Yahoo validiert)

Statt einer handgetippten Liste wird das Universum aus **echten Indexbeständen** zusammengesetzt und **jeder Ticker gegen Yahoo Finance geprüft**:

- **USA:** S&P 500 (datahub `constituents.csv`, inkl. GICS-Sektor)
- **Europa:** nationale Indizes via pytickersymbols (DAX/MDAX/SDAX/TecDAX, FTSE 100, CAC 40 + Mid 60, IBEX 35, AEX, BEL 20, OMX Stockholm/Helsinki, Switzerland 20, EURO STOXX 50)
- **Japan / EM-Kernländer / EU-Lücken (Italien, Dänemark, Norwegen …) / Must-haves:** kuratiert in `scripts/curated.mjs`

`scripts/build-universe.mjs` sammelt pro Firma mehrere Ticker-Kandidaten (Heimatbörse, pytickersymbols-Feld, Yahoo-Suche), batcht sie gegen Yahoo, wählt das **Primärlisting** (richtige Börse/Währung, höchste Marktkap) und dedupliziert. Eine harte Regionsprüfung verhindert Fehltreffer (z. B. „Atlas Copco" → US-Ticker ATLC). Aktuell **~1017 Ticker** (US 500, EU ~467, JP 19, EM 31), alle Screenshot-Must-haves enthalten. Kein festes Cap — der Marktkap-Filter im UI regelt die sichtbare Menge.

## Aufbau

- `scripts/build-universe.mjs` + `scripts/curated.mjs` — Universum-Builder (s.o.).
- `scripts/fetch-prices.mjs` — Yahoo-Abruf: Batch-Quotes (Marktkap, KGV, Div., 52W, 50/200-Tage-Linie), Tages-Charts pro Ticker, Retry/Backoff, Forward-Fill, FX-Umrechnung nach EUR (inkl. GBp→GBP für LSE); rechnet 3M/6M/1J-Performance.
- `public/data/prices.json` — generierte Datenbasis (~6 MB, volle Kurshistorie für Charts).
- `src/App.tsx` — Top-Performer-Tabelle mit Filtern: Region, Sektor, Marktkap, Min-Performance, Max-KGV, Min-Dividende, „über 200-Tage-Linie"; 3M/6M/1J-Umschalter; sortierbare Spalten inkl. Outperformance vs. 3 Benchmarks.
- `src/StockDetail.tsx` — Detail-Modal: großer Chart (Kurs / indexierter Benchmark-Vergleich), Kennzahlen, Watchlist-Toggle.

## Phasen-Status (aus dem Produktbrief)

- [x] **Phase 0/1** — Projekt-Setup, Universum, Yahoo-Anbindung, Performance-Berechnung, Top-Performer-Tabelle
- [x] **Phase 2** — Watchlist (Stern-Toggle, Notizen, localStorage bis zum Deployment) + Detail-Chart (1M/3M/6M/1J) + Sparklines
- [x] **Phase 3** — Benchmark-Vergleich (MSCI World / MSCI EM / S&P 500): Outperformance-Spalten + indexierter Vergleichs-Chart
- [x] **Universum-Ausbau** — regelbasiertes ~1000-Ticker-Universum + erweiterte Filter (Sektor, Perf-Schwelle, KGV, Dividende, 200-Tage-Linie)
- [ ] **Phase 4** — Konsistenz-Score (R², positive Wochen, Max Drawdown) + kombinierte Standard-Sortierung
- [ ] **Phase 5** — Robustheit (Stooq-Backup, Scheduler), Deployment, `prices.json` verschlanken (Snapshot vs. Historie trennen)

## Deployment (offen)

Cloudflare Pages + Worker mit Cron-Trigger laut Brief. Bis dahin: lokal `npm run fetch && npm run dev`. Alternative: GitHub Actions committet täglich `prices.json`, GitHub/Cloudflare Pages served den Build.

## Bekannte Datenpunkte

- Yahoo Finance ist inoffiziell/ohne SLA. Letzter Fetch (05.07.2026): 1016/1017 Ticker OK.
- `ROG.SW` (Roche Genussschein) liefert bei Yahoo keine Daten → `RO.SW` (Inhaberaktie) im Universum.
- ~20 europäische Kleinstwerte lösen nur auf Frankfurt-Zweitnotiz (`.F`) auf; der Marktkap-Filter blendet sie i. d. R. aus.
