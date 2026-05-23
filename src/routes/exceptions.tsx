import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  listOpenExceptions,
  markExceptionInProgress,
  type ExceptionRow,
} from "@/lib/exceptions.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/exceptions")({
  head: () => ({
    meta: [
      { title: "Eskalationen — hallo flow" },
      {
        name: "description",
        content: "Fälle die menschliche Entscheidung benötigen.",
      },
    ],
  }),
  component: ExceptionsPage,
});

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const severityStyle: Record<string, string> = {
  critical: "bg-red-500/15 text-red-600 border-red-500/30",
  high: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  medium: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

function ExceptionsPage() {
  const listFn = useServerFn(listOpenExceptions);
  const markFn = useServerFn(markExceptionInProgress);
  const qc = useQueryClient();
  const [openRow, setOpenRow] = useState<ExceptionRow | null>(null);

  const q = useQuery({
    queryKey: ["open-exceptions"],
    queryFn: () => listFn(),
    refetchInterval: 5000,
  });

  const m = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["open-exceptions"] }),
  });

  const rows = q.data ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Eskalationen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fälle die menschliche Entscheidung benötigen
        </p>
      </div>

      <Card className="p-0 border-border shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Keine offenen Eskalationen — Roboter hat alles im Griff 🤖
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mieter</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Schwere</TableHead>
                <TableHead>Empfohlene Aktion</TableHead>
                <TableHead>Erstellt am</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.tenantName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.propertyName}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize",
                        severityStyle[r.severity ?? "low"] ??
                          severityStyle.low,
                      )}
                    >
                      {r.severity ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.recommendedAction ?? "—"}
                    {r.status === "in_progress" && (
                      <Badge variant="secondary" className="ml-2">
                        in Bearbeitung
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm tabular-nums">
                    {fmtDate(r.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOpenRow(r)}
                      >
                        Verzugsnachweis ansehen
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={m.isPending || r.status === "in_progress"}
                        onClick={() => m.mutate(r.id)}
                      >
                        Kündigung einleiten
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={m.isPending || r.status === "in_progress"}
                        onClick={() => m.mutate(r.id)}
                      >
                        Anwalt einschalten
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!openRow} onOpenChange={(o) => !o && setOpenRow(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Verzugsnachweis · {openRow?.tenantName}</DialogTitle>
            <DialogDescription>
              Snapshot aller Risiko-Faktoren zum Zeitpunkt der Eskalation
            </DialogDescription>
          </DialogHeader>
          <pre className="mt-2 max-h-[60vh] overflow-auto rounded-md bg-muted p-4 text-xs leading-relaxed">
            {openRow?.riskBreakdown ?? "—"}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
