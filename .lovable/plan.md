## Problem

1. **Liste in den Mieter-Karten:** zeigt aktuell eine Zeile pro Vorgang (Monat). Maximilian Fischer erscheint dadurch mit 9 Mahnzeilen (3 Stufen × 3 Monate). User möchte nur **eine Zeile pro Mahnstufe** (max. 3 Zeilen pro Mieter).
2. **Mahnungs-PDF fehlerhaft:** Beim "Als PDF speichern" / Drucken bricht das Layout. Ursache: das Dialog-Element ist `position: fixed` + `transform: translate(-50%,-50%)`; der Brief darin hat zusätzlich Print-Reset, aber der fixierte Dialog-Wrapper verschiebt den Inhalt aus der A4-Seite. Empfänger-Block (Name) verschwindet dadurch teilweise / wird abgeschnitten.
3. **Anrede ist unnatürlich:** `Sehr geehrte/r Herr/Frau Maximilian Fischer,` — voller Name nach Anrede.

## Lösung

### A) Eskalations-Karte: pro Mahnstufe konsolidieren (`src/routes/exceptions.tsx`)

Statt einer Zeile pro Notice eine Zeile pro vorkommender Stufe rendern. Pro Stufen-Zeile:

- Stage-Badge (Stufe 1 / 2 / 3)
- Anzahl betroffener Monate (`3 Monate: Mai, Jun, Jul 2026`)
- Summe Mahngebühren dieser Stufe
- Spätestes Ausstellungs- und Fristdatum
- Buttons "Mahnung herunterladen" und "Verzugsnachweis ansehen" → öffnen den jüngsten Vorgang dieser Stufe; bei mehreren Monaten enthält die generierte Mahnung alle betroffenen Monate als Sammelaufstellung.

Gruppierung clientseitig per `useMemo` aus `c.notices` (Map nach `stage`).

### B) Sammel-Mahnung (`MahnungDialog`)

Brief erhält pro Monat eine Hauptforderungs-Zeile in der Aufstellung statt nur einer:
```
Hauptforderung Mai 2026 .......... 270,00 €
Hauptforderung Juni 2026 ......... 270,00 €
Hauptforderung Juli 2026 ......... 270,00 €
Mahngebühr Stufe 3 ................ 0,00 €
Verzugszinsen (8,27 %, 92 Tage) ... 12,34 €
─────────────────────────────────────────────
Gesamtforderung .................. 822,34 €
```

Anrede wird aus dem Mieternamen aufgesplittet: nur Nachname nach Anrede → `Sehr geehrte/r Herr/Frau Fischer,`. Voller Name bleibt im Empfänger-Block oben.

### C) Print-Layout reparieren (`src/styles.css`)

Aktuelles `@media print` versteckt zwar alles außer `.mahnung-letter`, lässt aber die Radix-Dialog-Wrapper (fixed, transform, z-index) aktiv. Ergänzungen:

- Alle Dialog-Wrapper im Print-Modus auf `position: static`, `transform: none`, `overflow: visible`, `max-height: none` zurücksetzen (`[data-radix-dialog-overlay]`, `[data-radix-dialog-content]`, `[data-state="open"]`).
- `.mahnung-letter` selbst auf `position: static` lassen, Container füllt die A4-Seite natürlich.
- `body > *` außer dem Dialog-Portal auf `display: none`, damit die App-Shell (Sidebar, Topbar) nicht mitdruckt.
- Sicherstellen, dass `.mahnung-letter` Hintergrund weiß und Textfarbe schwarz erzwingt — auch wenn dunkler Theme-Override greift.

### Technische Details

- `useMemo` in `TenantCaseCard` produziert `stageGroups: { stage, notices[], months[], sumFee, latestNotice }[]`.
- Klick auf "Mahnung herunterladen" → `setMahnungRow({ tenant: c, stageGroup })`. `MahnungDialog` Signatur ändert sich auf `stageGroup` statt `notice`; intern wird `latestNotice` für Stufe/Datum/Frist verwendet, `notices[]` für die Sammelaufstellung.
- `VerzugsnachweisDialog` bleibt unverändert (zeigt weiterhin den jüngsten Einzel-Notice der Stufe).
- Filter-Chips (`Alle`, `Nur Stufe 3`, `Nur Stufe 1–2`) und Sortierung bleiben unverändert — sie operieren weiter auf Karten-Ebene und sind bereits korrekt.

### Files

- `src/routes/exceptions.tsx` — Konsolidierung der Notice-Liste, neue `MahnungDialog`-Props (Sammelaufstellung, Nachname-Anrede).
- `src/styles.css` — Print-Reset für Radix Dialog-Wrapper, App-Shell ausblenden.

### Out of scope

- Echte PDF-Generierung (jsPDF / Puppeteer) — bleibt `window.print()`. Nur das Print-CSS wird sauberer.
- Server-Logik / DB-Schema.
