import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { getValidationState } from "@/lib/validation.functions";
import { cn } from "@/lib/utils";
import { useLang, formatDate, formatCurrency } from "@/lib/use-language";

const LABELS: Record<string, string> = {
  properties: "Properties",
  tenants: "Tenants",
  rent_obligations: "Rent Obligations",
  payment_events: "Payment Events",
  exceptions: "Exceptions",
  dunning_notices: "Dunning Notices",
};

const stageColors: Record<number, string> = {
  1: "bg-[var(--status-plan)]/15 text-[var(--status-plan)]",
  2: "bg-[var(--status-review)]/15 text-[var(--status-review)]",
  3: "bg-red-500/15 text-red-600",
};

export function HeaderStrip() {
  const fn = useServerFn(getValidationState);
  const { lang, t } = useLang();
  const q = useQuery({
    queryKey: ["validation-state"],
    queryFn: () => fn(),
    refetchInterval: 3000,
  });
  return (
    <div className="rounded-lg border border-border bg-card px-6 py-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("dashboard.demoDate")}
      </div>
      <div className="mt-1 text-2xl md:text-3xl font-bold tracking-tight text-primary">
        {formatDate(q.data?.simulatedNow ?? null, lang)}
      </div>
    </div>
  );
}

export function LiveStateCard() {
  const fn = useServerFn(getValidationState);
  const q = useQuery({
    queryKey: ["validation-state"],
    queryFn: () => fn(),
    refetchInterval: 3000,
  });
  const c = q.data?.counts;
  return (
    <Card className="p-6 border-border shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold">Live State</h2>
        <p className="text-xs text-muted-foreground">Auto-refresh · 3s</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(LABELS).map(([k, label]) => (
          <div key={k} className="rounded-md border border-border bg-card/50 px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {c ? c[k as keyof typeof c] : "—"}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function DunningStatusCard() {
  const fn = useServerFn(getValidationState);
  const { t, lang } = useLang();
  const q = useQuery({
    queryKey: ["validation-state"],
    queryFn: () => fn(),
    refetchInterval: 3000,
  });
  const rows = q.data?.dunning ?? [];
  return (
    <Card className="p-6 border-border shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{t("dunning.statusTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("dunning.subtitle")}</p>
      </div>
      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {t("dunning.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-semibold">{t("dunning.tenant")}</th>
                <th className="py-2 pr-3 font-semibold">{t("dunning.stage")}</th>
                <th className="py-2 pr-3 font-semibold">{t("dunning.defaultSince")}</th>
                <th className="py-2 pr-3 font-semibold text-right">{t("dunning.fees")}</th>
                <th className="py-2 pr-3 font-semibold text-right">{t("dunning.interest")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.tenantId}>
                  <td className="py-2.5 pr-3 font-medium">{r.tenantName}</td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
                        stageColors[r.stage] ?? "bg-muted text-foreground",
                      )}
                    >
                      {t("dunning.stageLabel")} {r.stage}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-muted-foreground">
                    {r.defaultSince ? formatDate(r.defaultSince, lang) : "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {formatCurrency(r.accruedFees, lang)}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {formatCurrency(r.accruedInterest, lang)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
