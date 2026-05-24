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
import { useLang } from "@/lib/use-language";

export function ResetDemoCard({ simple = false }: { simple?: boolean }) {
  const [open, setOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const qc = useQueryClient();
  const { t, lang } = useLang();
  const isDe = lang === "de";
  const resetFn = useServerFn(resetDemo);
  const seedFn = useServerFn(seedDemoPortfolio);

  const m = useMutation({
    mutationFn: () => resetFn(),
    onSuccess: (d) => {
      setOpen(false);
      if (d.stripeError) {
        toast.warning(
          isDe
            ? `Demo zurückgesetzt — Daten clean, Stripe-Cleanup fehlgeschlagen: ${d.stripeError}`
            : `Demo reset — data clean, Stripe cleanup failed: ${d.stripeError}`,
        );
      } else {
        toast.success(
          isDe
            ? `Demo zurückgesetzt — ${d.stripeDeleted} Stripe-Kunden gelöscht, ${d.propertiesDeleted ?? 0} Properties entfernt.`
            : `Demo reset — ${d.stripeDeleted} Stripe customers deleted, ${d.propertiesDeleted ?? 0} properties removed.`,
        );
      }
      qc.invalidateQueries();
    },
    onError: (e: Error) => {
      toast.error(isDe ? "Reset fehlgeschlagen" : "Reset failed", { description: e.message });
    },
  });

  const seedM = useMutation({
    mutationFn: () => seedFn(),
    onSuccess: () => {
      setSeedOpen(false);
      toast.success(isDe ? "Portfolio neu geseedet: 9 Properties." : "Portfolio re-seeded: 9 properties.");
      qc.invalidateQueries();
    },
    onError: (e: Error) => {
      toast.error(isDe ? "Seed fehlgeschlagen" : "Seeding failed", { description: e.message });
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
                {t("danger.title")}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {t("danger.desc")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!simple && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSeedOpen(true)}
                disabled={seedM.isPending || m.isPending}
              >
                {seedM.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MapPin className="h-4 w-4" />
                )}
                <span className="ml-1">{t("danger.seed")}</span>
              </Button>
            )}
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
              <span className="ml-1">{t("danger.reset")}</span>
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={(o) => !m.isPending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("danger.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("danger.confirmDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={m.isPending}>
              {t("danger.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => m.mutate()} disabled={m.isPending}>
              {m.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              {t("danger.confirmYes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!simple && (
        <Dialog open={seedOpen} onOpenChange={(o) => !seedM.isPending && setSeedOpen(o)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("danger.seedTitle")}</DialogTitle>
              <DialogDescription>{t("danger.seedDesc")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSeedOpen(false)} disabled={seedM.isPending}>
                {t("danger.cancel")}
              </Button>
              <Button onClick={() => seedM.mutate()} disabled={seedM.isPending}>
                {seedM.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <MapPin className="h-4 w-4 mr-1" />
                )}
                {t("danger.seedYes")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
