import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPropertyDetail } from "@/lib/property-detail.functions";

export const Route = createFileRoute("/portfolio/$propertyId")({
  head: () => ({
    meta: [{ title: "Property · hallo flow" }],
  }),
  component: PropertyDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-sm text-muted-foreground">Property nicht gefunden.</div>
  ),
});

const stageColor: Record<number, string> = {
  1: "bg-amber-100 text-amber-800 border-amber-300",
  2: "bg-orange-100 text-orange-800 border-orange-300",
  3: "bg-red-100 text-red-800 border-red-300",
};

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function PropertyDetailPage() {
  const { propertyId } = Route.useParams();
  const router = useRouter();
  const fn = useServerFn(getPropertyDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["property-detail", propertyId],
    queryFn: () => fn({ data: { propertyId } }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Lade Property…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 space-y-3">
        <nav className="text-sm">
          <Link to="/portfolio" className="text-muted-foreground hover:underline">
            Portfolio
          </Link>
        </nav>
        <p className="text-sm text-muted-foreground">
          Property nicht gefunden.{" "}
          <button
            onClick={() => router.history.back()}
            className="underline text-primary"
          >
            Zurück
          </button>
        </p>
      </div>
    );
  }

  const subtitle = [
    data.street,
    [data.postalCode, data.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <nav className="flex items-center gap-1 text-sm">
        <Link
          to="/portfolio"
          className="text-muted-foreground hover:text-foreground hover:underline"
        >
          Portfolio
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{data.name}</span>
      </nav>

      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{data.name}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        )}
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Einheiten" value={String(data.kpis.units)} />
        <KpiCard
          label="Belegt"
          value={`${data.kpis.occupied} / ${data.kpis.units}`}
        />
        <KpiCard label="Monatliche Miete" value={fmtMoney(data.kpis.monthlyRent)} />
        <KpiCard
          label="Aktive Mahnungen"
          value={String(data.kpis.activeDunning)}
          accent={data.kpis.activeDunning > 0 ? "warn" : "default"}
        />
      </div>

      <Card className="p-6 border-border shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold">Einheiten</h2>
          <p className="text-xs text-muted-foreground">
            {data.units.length} Einheiten in diesem Objekt
          </p>
        </div>

        {data.units.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Keine Einheiten angelegt.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-semibold">Einheit</th>
                  <th className="py-2 pr-3 font-semibold">Etage</th>
                  <th className="py-2 pr-3 font-semibold">Mieter</th>
                  <th className="py-2 pr-3 font-semibold text-right">Monatsmiete</th>
                  <th className="py-2 pr-3 font-semibold">Mahnstufe</th>
                  <th className="py-2 pr-3 font-semibold">Letzte Zahlung</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.units.map((u) => (
                  <tr key={u.unitId}>
                    <td className="py-2.5 pr-3 font-medium">{u.label}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">
                      {u.floor ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      {u.tenantName ?? (
                        <span className="italic text-muted-foreground">leer</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {fmtMoney(u.rentAmount)}
                    </td>
                    <td className="py-2.5 pr-3">
                      {u.dunningStage > 0 ? (
                        <Badge
                          variant="outline"
                          className={stageColor[u.dunningStage] ?? ""}
                        >
                          Stufe {u.dunningStage}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground tabular-nums">
                      {fmtDate(u.lastPaymentAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent = "default",
}: {
  label: string;
  value: string;
  accent?: "default" | "warn";
}) {
  return (
    <div
      className={
        "rounded-lg border bg-card px-4 py-3 shadow-sm " +
        (accent === "warn"
          ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10"
          : "border-border")
      }
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
