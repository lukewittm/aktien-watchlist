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
- [x] **Universum-Ausbau** — regelbasiertes ~1000-Ticker-Universum + erweiterte Filter (Sektor, Perf-Schwelle, KGV, Dividende, 200-Tage-Linie), Suche
- [x] **Phase 4** — Konsistenz-Score (R², positive Wochen, Max Drawdown), kombinierte „Performance × Konsistenz"-Sortierung, „Neu in den Top-Performern"
- [x] **Deployment** — GitHub Pages via GitHub Actions (s. u.)
- [x] **Payload/Robustheit** — `prices.json` verschlankt (gemeinsame Datums-Achse statt History pro Ticker), Qualitäts-Gate vor jedem Deploy, mobile-responsive Tabelle
- [ ] **Phase 5 (Rest)** — Stooq-Backup als Fallback, falls Yahoo mal ausfällt

## Deployment

**Live:** GitHub Pages, deployt via GitHub Actions (`.github/workflows/deploy.yml`).

- Trigger: bei jedem Push auf `main`, täglich werktags **19:00 UTC**, oder manuell (`workflow_dispatch`).
- **Warum die Uhrzeit wichtig ist:** Ein Fetch, bevor jede Börse im Universum für den Tag gehandelt hat, füllt nicht gehandelte Regionen in der gemeinsamen Datums-Achse künstlich mit dem Vortageskurs auf (sichtbar als „–" bei „Diff. 1T" statt einer echten Tagesbewegung). 19:00 UTC ist ein **bewusster Kompromiss**: Asien/Europa/Indien sind sicher geschlossen, USA (~20/21 UTC) und Brasilien (~20:30 UTC) aber noch nicht — deren Diff. 1T zeigt meist „–". Für volle Abdeckung inkl. USA/Brasilien müsste der Cron auf 21:00–23:00 UTC (dafür später am Tag fertig).
- Jeder Lauf holt frische Kurse (`npm run fetch`), prüft sie (`npm run validate` – bricht bei degradierten Daten ab, ohne zu deployen), baut und deployt als Pages-Artefakt. Kein Daten-Branch, keine wachsende Git-Historie.
- Lokal weiterhin: `npm run fetch && npm run dev`.

## Deutschland-Zuschnitt

Da in Deutschland (EUR) gekauft wird:
- **Alle Kurse/Performance in EUR** – `fetch-prices.mjs` rechnet mit historischen Wechselkursen um (EUR-Rendite inkl. Devisenbewegung); `localPrice`/`localCcy` bleiben als Heimatbörsen-Referenz erhalten.
- **Nur in DE handelbare Werte** – US/EU/JP bleiben komplett (über Tradegate/gettex/LS handelbar); bei EM sind exotische Lokaltitel (Korea/Taiwan/Indien ohne dt. Notiz) weggelassen, die ~20 handelbaren stehen mit geprüftem deutschen Handelsplatz-Ticker (`deTicker`, 🇩🇪) in `curated.mjs`.
- **ISIN als Kauf-Identifier** – WKN ist gratis nicht beschaffbar (nur kostenpflichtig). Stattdessen ISIN via Financial Modeling Prep: kostenlosen API-Key in der App-Kopfzeile hinterlegen, ISIN wird beim Öffnen einer Aktie on-demand geholt + gecacht (`src/isin.ts`). Funktioniert im Broker wie eine WKN. *Offen: ob FMP-Free-Tier ISIN auch für Nicht-US-Werte liefert.*

## Bekannte Datenpunkte

- Yahoo Finance ist inoffiziell/ohne SLA. Letzter Fetch (05.07.2026): 1016/1017 Ticker OK.
- `ROG.SW` (Roche Genussschein) liefert bei Yahoo keine Daten → `RO.SW` (Inhaberaktie) im Universum.
- ~20 europäische Kleinstwerte lösen nur auf Frankfurt-Zweitnotiz (`.F`) auf; der Marktkap-Filter blendet sie i. d. R. aus.
