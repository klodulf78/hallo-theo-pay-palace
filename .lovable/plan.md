## Sortierfunktion für Eskalationen-Seite

Analog zum Webhook-Events-Panel ein Sort-Dropdown im Seiten-Header rechts oben (shadcn `Select`). Sortiert die Mieter-Karten.

**Optionen:**
- Schwere (kritisch zuerst) — Default
- Gesamtsaldo (höchster zuerst)
- Gesamtsaldo (niedrigster zuerst)
- Höchste Mahnstufe (Stufe 3 zuerst)
- Mieter (A–Z)
- Älteste offene Forderung zuerst (nach frühestem `dueDate` der `notices`)

**Optional — Filter-Chips** über der Liste:
- Alle · Nur Stufe 3 · Nur Stufe 1–2

**Umsetzung:** rein in `src/routes/exceptions.tsx` (clientseitig auf `cases`-Array). Aktueller Server-Default-Sort (severity → saldo) bleibt als Fallback bestehen — die UI-Sortierung überschreibt ihn nur.
