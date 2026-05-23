import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { setupStripeDemo, getStripeStatus } from "@/lib/stripe.functions";
import { seedDemoData } from "@/lib/seed.functions";
import { useCycle } from "@/lib/cycle-store";

export function StripeSetupCard() {
  const cycle = useCycle();
  const seedFn = useServerFn(seedDemoData);
  const setupFn = useServerFn(setupStripeDemo);
  const statusFn = useServerFn(getStripeStatus);

  const status = useQuery({
    queryKey: ["stripe-status", cycle],
    queryFn: () => statusFn(),
    refetchInterval: 5000,
  });

  const seed = useMutation({
    mutationFn: () => seedFn(),
    onSettled: () => status.refetch(),
  });

  const setup = useMutation({
    mutationFn: () => setupFn(),
    onSettled: () => status.refetch(),
  });

  const s = status.data;
  const isReady = !!s && s.tenantsProvisioned === s.tenantsTotal && s.tenantsTotal > 0;
  const clockDate = s?.testClockTime
    ? new Date(s.testClockTime * 1000).toISOString().slice(0, 10)
    : "—";

  return (
    <Card className="p-6 border-border shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <CreditCard className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Stripe Test Clock</h2>
            <p className="text-xs text-muted-foreground">
              SEPA-style subscriptions & autonomous payment cycle simulation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isReady ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--status-paid)]/10 px-2.5 py-1 text-xs font-medium text-[var(--status-paid)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5" />
              Setup required
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="Clock date" value={clockDate} />
        <Stat label="Status" value={s?.testClockStatus ?? "—"} />
        <Stat label="Provisioned" value={s ? `${s.tenantsProvisioned} / ${s.tenantsTotal}` : "—"} />
        <Stat label="Payment events" value={s?.paymentEvents?.toString() ?? "—"} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          onClick={() => seed.mutate()}
          disabled={seed.isPending}
          variant="secondary"
          className="gap-2"
        >
          {seed.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {seed.isPending ? "Seeding demo data…" : "Seed demo data"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Creates 1 owner, 1 property, 12 units, 12 tenants & SEPA mandates (run this first)
        </span>
      </div>

      {seed.data && (
        <div className="mt-3 rounded-md border border-[var(--status-paid)]/30 bg-[var(--status-paid)]/5 p-3 text-xs text-[var(--status-paid)]">
          {seed.data.skipped ? (
            <div className="font-medium">Demo data already present — nothing to seed.</div>
          ) : (
            <>
              <div className="font-medium mb-1">Seed complete:</div>
              <span>
                {seed.data.ownersCreated} owner · {seed.data.propertiesCreated} property ·{" "}
                {seed.data.unitsCreated} units · {seed.data.tenantsCreated} tenants ·{" "}
                {seed.data.mandatesCreated} SEPA mandates
              </span>
            </>
          )}
        </div>
      )}

      {seed.error && (
        <div className="mt-3 rounded-md border border-[var(--status-review)]/30 bg-[var(--status-review)]/5 p-3 text-xs text-[var(--status-review)]">
          Seeding failed: {(seed.error as Error).message}
        </div>
      )}

      {!isReady && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => setup.mutate()} disabled={setup.isPending} className="gap-2">
            {setup.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {setup.isPending ? "Provisioning Stripe…" : "Setup Stripe Demo"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Creates 1 test clock + 1 customer & subscription per tenant
          </span>
        </div>
      )}

      {setup.data && setup.data.errors.length > 0 && (
        <div className="mt-3 rounded-md border border-[var(--status-review)]/30 bg-[var(--status-review)]/5 p-3 text-xs text-[var(--status-review)]">
          <div className="font-medium mb-1">Some tenants failed to provision:</div>
          <ul className="space-y-0.5 list-disc list-inside">
            {setup.data.errors.slice(0, 3).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
