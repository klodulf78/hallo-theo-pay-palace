import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  FileText,
  Clock,
  Calculator,
  AlertTriangle,
  Scale,
  Download,
  ChevronDown,
} from "lucide-react";
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
  DialogFooter,
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

// ---------- Formatters ----------

const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});
const DE_LONG = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});
const DE_MONTH = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
});

function fmtEur(n: number): string {
  return EUR.format(n);
}
function fmtDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  return DE_LONG.format(new Date(`${iso}T00:00:00Z`));
}
function fmtMonth(monthStr: string | null): string {
  if (!monthStr) return "—";
  return DE_MONTH.format(new Date(`${monthStr}-01T00:00:00Z`));
}
function fmtTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtPct(n: number, digits = 2): string {
  return `${(n * 100).toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}\u00a0%`;
}

const severityStyle: Record<string, string> = {
  critical: "bg-red-500/15 text-red-600 border-red-500/30",
  high: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  medium: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

const TRIGGER_LABEL: Record<string, string> = {
  arrears_threshold_reached: "Kumulative Rückstände ≥ 2 Monatsmieten",
  deadline_passed: "Zahlungsfrist überschritten",
  sepa_chargeback: "SEPA-Rücklastschrift eingegangen",
};

const STAGE_LABEL: Record<number, string> = {
  1: "1. Mahnung",
  2: "2. Mahnung",
  3: "Vor-Eskalation (Stufe 3)",
};

// ---------- Page ----------

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
                        severityStyle[r.severity ?? "low"] ?? severityStyle.low,
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
                    {fmtTimestamp(r.createdAt)}
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

      <VerzugsnachweisDialog
        row={openRow}
        onClose={() => setOpenRow(null)}
      />
    </div>
  );
}

// ---------- Dialog ----------

function VerzugsnachweisDialog({
  row,
  onClose,
}: {
  row: ExceptionRow | null;
  onClose: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const s = row?.snapshot;

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible print:shadow-none print:border-0">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="text-2xl font-semibold tracking-tight">
            Verzugsnachweis · {row?.tenantName}
          </DialogTitle>
          <DialogDescription className="text-sm">
            Stand: {fmtDateLong(s?.as_of)}
          </DialogDescription>
        </DialogHeader>

        {!s ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Kein Snapshot verfügbar.
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Section 1 — Sachverhalt */}
            <Section icon={<FileText className="h-4 w-4" />} title="Sachverhalt">
              <Grid>
                <Field label="Mieter" value={row!.tenantName} />
                <Field
                  label="Wohnung"
                  value={`${row!.unitLabel} · ${row!.propertyName}`}
                />
                <Field label="Mietforderung" value={fmtMonth(row!.month)} />
                <Field
                  label="Geschuldeter Betrag"
                  value={fmtEur(s.expected_amount)}
                />
                <Field label="Eingegangen" value={fmtEur(s.received_amount)} />
                <Field
                  label="Offener Betrag"
                  value={fmtEur(s.open_amount)}
                  emphasize
                />
              </Grid>
            </Section>

            {/* Section 2 — Verzug */}
            <Section icon={<Clock className="h-4 w-4" />} title="Verzug">
              <Grid>
                <Field label="Fälligkeit" value={fmtDateLong(row!.dueDate)} />
                <Field
                  label="Verzug seit"
                  value={fmtDateLong(s.default_since)}
                />
                <Field
                  label="Verzugsdauer"
                  value={`${s.default_days_calendar} Kalendertage`}
                />
                <Field
                  label="Auslöser"
                  value={TRIGGER_LABEL[s.trigger] ?? s.trigger}
                />
              </Grid>
            </Section>

            {/* Section 3 — Verzugszinsberechnung */}
            <Section
              icon={<Calculator className="h-4 w-4" />}
              title="Verzugszinsberechnung"
            >
              <Grid>
                <Field
                  label="Basiszinssatz (Bundesbank)"
                  value={fmtPct(s.basiszinssatz)}
                />
                <Field
                  label="Aufschlag § 288 Abs. 1 BGB"
                  value={`+${fmtPct(s.default_interest_surcharge)}`}
                />
                <Field
                  label="Effektiver Verzugszins"
                  value={`${fmtPct(s.basiszinssatz + s.default_interest_surcharge)} p.a.`}
                  emphasize
                />
              </Grid>
              <div className="mt-4 rounded-md border border-border bg-muted/50 px-4 py-3 font-mono text-sm">
                {fmtEur(s.open_amount)} ×{" "}
                {fmtPct(s.basiszinssatz + s.default_interest_surcharge)} ×{" "}
                {s.default_days_calendar} Tage ÷ 365 ={" "}
                <span className="font-semibold">
                  {fmtEur(s.default_interest)}
                </span>
              </div>
            </Section>

            {/* Section 4 — Mahnstufe + Gebühren */}
            <Section
              icon={<AlertTriangle className="h-4 w-4" />}
              title="Mahnstufe & Gebühren"
            >
              <Grid>
                <Field
                  label="Aktuelle Mahnstufe"
                  value={STAGE_LABEL[s.stage] ?? `Stufe ${s.stage}`}
                />
                <Field
                  label="Mahngebühr dieser Stufe"
                  value={
                    s.mahngebuehr === 0
                      ? "€0,00 (Stufe 3 ist Eskalation, keine zusätzliche Gebühr)"
                      : fmtEur(s.mahngebuehr)
                  }
                />
                <Field
                  label="Gesamtforderung"
                  value={fmtEur(
                    s.open_amount + row!.totalAccruedFees + s.default_interest,
                  )}
                  emphasize
                />
              </Grid>
            </Section>

            {/* Section 5 — Rechtliche Grundlage */}
            <Section
              icon={<Scale className="h-4 w-4" />}
              title="Rechtliche Grundlage"
            >
              <div className="rounded-md border border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground space-y-1.5">
                <div>
                  <span className="font-semibold text-foreground">
                    § 286 BGB
                  </span>{" "}
                  — Verzug des Schuldners
                </div>
                <div>
                  <span className="font-semibold text-foreground">
                    § 288 Abs. 1 BGB
                  </span>{" "}
                  — Verzugszinsen für Geldforderungen
                </div>
                <div>
                  <span className="font-semibold text-foreground">
                    § 543, § 569 BGB
                  </span>{" "}
                  — Fristlose Kündigung bei Zahlungsverzug (für Stufe 3)
                </div>
              </div>
            </Section>

            {/* Raw data toggle */}
            <div className="pt-2 print:hidden">
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    showRaw && "rotate-180",
                  )}
                />
                Roh-Daten
              </button>
              {showRaw && (
                <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
                  {row?.riskBreakdownRaw ?? "—"}
                </pre>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-border pt-4 print:hidden">
          <Button variant="outline" onClick={onClose}>
            Schließen
          </Button>
          <Button onClick={() => window.print()}>
            <Download className="h-4 w-4 mr-2" />
            Als PDF exportieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase text-muted-foreground">
        <span className="text-foreground">{icon}</span>
        {title}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums text-right",
          emphasize && "font-semibold text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}
