import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPortfolio } from "@/lib/portfolio.functions";

const PortfolioMap = lazy(() => import("@/components/portfolio-map"));

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio · hallo flow" },
      {
        name: "description",
        content: "Deutschlandweite Karte aller Properties mit Live-Status.",
      },
      { property: "og:title", content: "Portfolio · hallo flow" },
      {
        property: "og:description",
        content: "Deutschlandweite Karte aller Properties mit Live-Status.",
      },
    ],
  }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const fn = useServerFn(getPortfolio);
  const { data, isLoading } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => fn(),
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const s = data?.summary;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Portfolio · Deutschland
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {s
            ? `${s.properties} Properties · ${s.tenants} Mieter · ${s.mrr.toLocaleString("de-DE")}€ MRR · ${s.activeExceptions} aktive Eskalationen`
            : "Lade Aggregate…"}
        </p>
      </header>

      <div
        className="rounded-lg overflow-hidden border border-border bg-muted"
        style={{ minHeight: 600 }}
      >
        {mounted && data ? (
          <Suspense
            fallback={
              <div className="h-[600px] flex items-center justify-center text-sm text-muted-foreground">
                Lade Karte…
              </div>
            }
          >
            <PortfolioMap markers={data.markers} />
          </Suspense>
        ) : (
          <div className="h-[600px] flex items-center justify-center text-sm text-muted-foreground">
            {isLoading ? "Lade Daten…" : "Lade Karte…"}
          </div>
        )}
      </div>
    </div>
  );
}
