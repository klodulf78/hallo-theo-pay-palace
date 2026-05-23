import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addTenant } from "@/lib/add-tenant.functions";

export function AddTenantButton() {
  const addTenantFn = useServerFn(addTenant);
  const qc = useQueryClient();

  const m = useMutation({
    mutationFn: () => addTenantFn(),
    onSuccess: (data) => {
      toast.success(`Mieter ${data.tenantName} aufgenommen`, {
        description: `${data.unitLabel} · Stripe Customer ${data.stripeCustomerId}`,
      });
      qc.invalidateQueries();
    },
    onError: (err: Error) => {
      toast.error("Konnte Mieter nicht aufnehmen", {
        description: err.message,
      });
    },
  });

  return (
    <Button
      onClick={() => m.mutate()}
      disabled={m.isPending}
      variant="outline"
      className="gap-2"
    >
      {m.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <UserPlus className="h-4 w-4" />
      )}
      {m.isPending ? "Lege Mieter an…" : "Neuen Mieter aufnehmen"}
    </Button>
  );
}
