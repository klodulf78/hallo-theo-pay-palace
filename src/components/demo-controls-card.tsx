import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus, Calendar, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addTenant } from "@/lib/add-tenant.functions";
import { runSepaRun } from "@/lib/validation.functions";
import { advanceMonth, useAdvancing } from "@/lib/cycle-store";
import { advanceStripeMonth } from "@/lib/stripe.functions";

export function DemoControlsCard() {
  const qc = useQueryClient();
  const addTenantFn = useServerFn(addTenant);
  const sepaFn = useServerFn(runSepaRun);
  const advanceFn = useServerFn(advanceStripeMonth);
  const advancing = useAdvancing();

  const addM = useMutation({
    mutationFn: () => addTenantFn(),
    onSuccess: (d) => {
      toast.success(`Mieter ${d.tenantName} angelegt`, {
        description: `${d.unitLabel} · Stripe ${d.stripeCustomerId}`,
      });
      qc.invalidateQueries();
    },
    onError: (e: Error) =>
      toast.error("Anlegen fehlgeschlagen", { description: e.message }),
  });

  const sepaM = useMutation({
    mutationFn: () => sepaFn(),
    onSuccess: (d) => {
      toast.success(`SEPA-Lauf gestartet: ${d.triggered} Buchungen ausgelöst`, {
        description:
          d.skipped > 0 ? `${d.skipped} übersprungen (bereits vorhanden)` : undefined,
      });
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
    mutationFn: async () => {
      await advanceMonth();
      // Re-fetch the message from the underlying fn for the toast
      return advanceFn();
    },
    onSuccess: (d) => {
      toast.success(d.message, {
        description: d.dunning?.stages_issued
          ? `${d.dunning.stages_issued} Mahnstufe(n) ausgelöst`
          : undefined,
      });
      qc.invalidateQueries();
    },
  });

  return (
    <Card className="p-6 border-border shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold">Demo-Controls</h2>
        <p className="text-xs text-muted-foreground">
          Manuelles Auslösen der Validierungs-Flows
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <BigButton
          icon={<UserPlus className="h-5 w-5" />}
          label="Neuen Mieter aufnehmen"
          loading={addM.isPending}
          onClick={() => addM.mutate()}
        />
        <BigButton
          icon={<Calendar className="h-5 w-5" />}
          label="Monat simulieren"
          loading={advancing || monthM.isPending}
          onClick={() => monthM.mutate()}
        />
        <BigButton
          icon={<CreditCard className="h-5 w-5" />}
          label="SEPA-Lauf starten"
          loading={sepaM.isPending}
          onClick={() => sepaM.mutate()}
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
