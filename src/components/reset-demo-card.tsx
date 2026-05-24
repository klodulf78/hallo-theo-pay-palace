import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, Loader2, AlertTriangle, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resetDemo } from "@/lib/reset-demo.functions";
import { seedDemoPortfolio } from "@/lib/seed-portfolio.functions";

export function ResetDemoCard() {
  const [open, setOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const qc = useQueryClient();
  const resetFn = useServerFn(resetDemo);
  const seedFn = useServerFn(seedDemoPortfolio);

  const m = useMutation({
    mutationFn: () => resetFn(),
    onSuccess: (d) => {
      setOpen(false);
      if (d.stripeError) {
        toast.warning(
          `Demo zurückgesetzt — Supabase clean, Stripe-Cleanup fehlgeschlagen: ${d.stripeError}`,
        );
      } else {
        toast.success(
          `Demo zurückgesetzt — ${d.stripeDeleted} Stripe-Kunden gelöscht. Bereit für nächsten Lauf.`,
        );
      }
      qc.invalidateQueries();
    },
    onError: (e: Error) => {
      toast.error("Reset fehlgeschlagen", { description: e.message });
    },
  });

  const seedM = useMutation({
    mutationFn: () => seedFn(),
    onSuccess: () => {
      toast.success(
        "Portfolio neu geseedet: 9 Properties mit erweiterter Streuung — bereit für Mieter-Onboarding.",
      );
      qc.invalidateQueries();
    },
    onError: (e: Error) => {
      toast.error("Seed fehlgeschlagen", { description: e.message });
    },
  });

  return (
    <>
      <Card className="p-4 border-red-200 bg-red-50/40 dark:bg-red-950/10 shadow-none">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">
                Danger Zone
              </div>
              <div className="text-xs text-muted-foreground truncate">
                Löscht alle Demo-Daten (Mieter, Zahlungen, Mahnungen) für einen
                sauberen Re-Run.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => seedM.mutate()}
              disabled={seedM.isPending || m.isPending}
            >
              {seedM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
              <span className="ml-1">Demo-Portfolio seeden</span>
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setOpen(true)}
              disabled={m.isPending || seedM.isPending}
            >
              {m.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span className="ml-1">Demo zurücksetzen</span>
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={(o) => !m.isPending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demo wirklich zurücksetzen?</DialogTitle>
            <DialogDescription>
              Alle Mieter, Mietforderungen, Zahlungen, Mahnungen und
              Eskalationen werden gelöscht. Properties, Owners,
              Policy-Einstellungen bleiben erhalten.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={m.isPending}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => m.mutate()}
              disabled={m.isPending}
            >
              {m.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              Ja, zurücksetzen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
