## Ziel
Alle Sample-/Demo-Daten aus der Datenbank entfernen, ohne Tabellen, Views, Policies oder Constraints anzufassen. Schema bleibt 1:1 bestehen, damit anschließend ein neuer Datensatz eingespielt werden kann.

## Vorgehen
Per Insert-Tool ein einziges `TRUNCATE ... RESTART IDENTITY CASCADE` über alle 14 Tabellen ausführen. `TRUNCATE` löscht nur die Rows, nicht die Tabellen selbst. `CASCADE` sorgt dafür, dass Reihenfolge bei FK-Beziehungen egal ist. `RESTART IDENTITY` setzt etwaige Sequenzen zurück.

Betroffene Tabellen (alle werden geleert):
- `agent_actions`
- `communications`
- `exceptions`
- `payment_plan_installments`
- `payment_plans`
- `payment_events`
- `rent_obligations`
- `sepa_mandates`
- `owner_payouts`
- `tenants`
- `units`
- `properties`
- `owners`
- `guardrails`

Views (`portfolio_kpis`, `property_kpis`, `unit_kpis`) bleiben unverändert — sie zeigen danach automatisch leere/0-Werte.

## Hinweis zu Stripe
Die Stripe-Test-Clock, Customers und Subscriptions im Stripe-Sandbox-Account werden dadurch **nicht** gelöscht. Die `tenants.stripe_customer_id`-Referenzen verschwinden aber. Beim nächsten „Setup Stripe Demo" werden neue Stripe-Objekte erstellt. Falls du auch im Stripe-Dashboard aufräumen willst, sag Bescheid — das wäre ein separater Schritt.

## Danach
Du kannst neue Daten direkt per SQL-Insert oder über ein Seed-Skript einpflegen. UI/Dashboard funktionieren unverändert weiter und zeigen einfach leere KPIs an, bis Daten vorhanden sind.