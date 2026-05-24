import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  UserPlus,
  Calendar,
  CreditCard,
  Loader2,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addTenant } from "@/lib/add-tenant.functions";
import { runSepaRun, advanceSimulatedMonth } from "@/lib/validation.functions";
import { seedDemoPortfolio } from "@/lib/seed-portfolio.functions";

export function DemoControlsCard({ includeSeed = false }: { includeSeed?: boolean }) {
  const qc = useQueryClient();
  const addTenantFn = useServerFn(addTenant);
  const sepaFn = useServerFn(runSepaRun);
  const advanceFn = useServerFn(advanceSimulatedMonth);
  const seedFn = useServerFn(seedDemoPortfolio);

  const addM = useMutation({
    mutationFn: () => addTenantFn(),
    onSuccess: (d) => {
      if (d.skippedReason) {
        toast.info(d.skippedReason);
      } else {
        toast.success(
          `${d.onboarded} Mieter onboarded — Auslastung jetzt ${d.occupancyPercent.toFixed(0)}%`,
          { description: `${d.vacantUnits} Einheiten bleiben als Leerstand.` },
        );
      }
      qc.invalidateQueries();
    },
    onError: (e: Error) =>
      toast.error("Anlegen fehlgeschlagen", { description: e.message }),
  });

  const sepaM = useMutation({
    mutationFn: () => sepaFn(),
    onSuccess: (d) => {
      toast.success(
        `SEPA-Lauf: ${d.triggered} Buchungen · ${d.succeeded} ok · ${d.failed} fehlgeschlagen`,
        {
          description:
            d.skipped > 0
              ? `${d.skipped} übersprungen (bereits verbucht)`
              : undefined,
        },
      );
      if (d.errors.length > 0) {
        toast.error(`${d.errors.length} Fehler im SEPA-Lauf`, {
          description: d.errors.slice(0, 2).join(" · "),
        });
      }
      qc.invalidateQueries();
    },
    onError: (e: Error) =>
      toast.error("SEPA-Lauf fehlgeschlagen", { description: e.message }),
  });

  const monthM = useMutation({
    mutationFn: () => advanceFn(),
    onSuccess: (d) => {
      toast.success(d.message, {
        description: d.dunning?.error ? `Dunning: ${d.dunning.error}` : undefined,
      });
      qc.invalidateQueries();
    },
    onError: (e: Error) =>
      toast.error("Monat simulieren fehlgeschlagen", { description: e.message }),
  });

  const seedM = useMutation({
    mutationFn: () => seedFn(),
    onSuccess: () => {
      toast.success("Demo-Portfolio neu geseedet (9 Properties)");
      qc.invalidateQueries();
    },
    onError: (e: Error) =>
      toast.error("Seed fehlgeschlagen", { description: e.message }),
  });

  const gridCols = includeSeed
    ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
    : "grid-cols-1 md:grid-cols-3";

  return (
    <Card className="p-6 border-border shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold">Demo-Controls</h2>
        <p className="text-xs text-muted-foreground">
          Manuelles Auslösen der Validierungs-Flows
        </p>
      </div>
      <div className={`grid ${gridCols} gap-3`}>
        {includeSeed && (
          <BigButton
            icon={<MapPin className="h-5 w-5" />}
            label="Demo-Portfolio seeden"
            loading={seedM.isPending}
            onClick={() => seedM.mutate()}
          />
        )}
        <BigButton
          icon={<UserPlus className="h-5 w-5" />}
          label="Neuen Mieter aufnehmen"
          loading={addM.isPending}
          onClick={() => addM.mutate()}
        />
        <BigButton
          icon={<CreditCard className="h-5 w-5" />}
          label="SEPA-Lauf starten"
          loading={sepaM.isPending}
          onClick={() => sepaM.mutate()}
        />
        <BigButton
          icon={<Calendar className="h-5 w-5" />}
          label="Monat simulieren"
          loading={monthM.isPending}
          onClick={() => monthM.mutate()}
        />
      </div>
    </Card>
  );
}

function BigButton({
  icon,
  label,
  loading,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={loading}
      variant="outline"
      className="h-auto py-5 flex flex-col items-center justify-center gap-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
      <span>{label}</span>
    </Button>
  );
}
