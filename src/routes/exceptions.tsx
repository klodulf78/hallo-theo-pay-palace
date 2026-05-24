import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
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
  Printer,
  Mail,
  Home,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  listTenantCases,
  markExceptionInProgress,
  type TenantCase,
  type DunningNoticeRow,
  type Verzugsnachweis,
} from "@/lib/exceptions.functions";
import {
  downloadAsPdf,
  downloadAsDocx,
  type MahnungLetterData,
} from "@/lib/mahnung-export";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

type SortKey =
  | "severity"
  | "saldo_desc"
  | "saldo_asc"
  | "stage_desc"
  | "tenant_asc"
  | "oldest_due";

type FilterKey = "all" | "stage3" | "stage12";

const SORT_LABELS: Record<SortKey, string> = {
  severity: "Schwere (kritisch zuerst)",
  saldo_desc: "Gesamtsaldo (höchster zuerst)",
  saldo_asc: "Gesamtsaldo (niedrigster zuerst)",
  stage_desc: "Höchste Mahnstufe (3 zuerst)",
  tenant_asc: "Mieter (A–Z)",
  oldest_due: "Älteste offene Forderung zuerst",
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export const Route = createFileRoute("/exceptions")({
  head: () => ({
    meta: [
      { title: "Eskalationen — hallo flow" },
      {
        name: "description",
        content: "Mieter-zentrierte Übersicht aller offenen Mahnvorgänge.",
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
const fmtEur = (n: number) => EUR.format(n);
const fmtDateLong = (iso?: string | null) =>
  !iso ? "—" : DE_LONG.format(new Date(`${iso}T00:00:00Z`));
const fmtMonth = (m?: string | null) =>
  !m ? "—" : DE_MONTH.format(new Date(`${m}-01T00:00:00Z`));
const fmtPct = (n: number, d = 2) =>
  `${(n * 100).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d })}\u00a0%`;

const severityStyle: Record<string, string> = {
  critical: "bg-red-500/15 text-red-700 border-red-500/30",
  high: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  medium: "bg-amber-500/15 text-amber-800 border-amber-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

const stageStyle: Record<number, string> = {
  1: "bg-yellow-500/15 text-yellow-800 border-yellow-500/30",
  2: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  3: "bg-red-500/15 text-red-700 border-red-500/30",
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
  const listFn = useServerFn(listTenantCases);
  const markFn = useServerFn(markExceptionInProgress);
  const qc = useQueryClient();
  const [verzugsRow, setVerzugsRow] = useState<{
    tenant: TenantCase;
    notice: DunningNoticeRow;
  } | null>(null);
  const [mahnungRow, setMahnungRow] = useState<{
    tenant: TenantCase;
    stage: 1 | 2 | 3;
    notices: DunningNoticeRow[];
  } | null>(null);

  const q = useQuery({
    queryKey: ["tenant-cases"],
    queryFn: () => listFn(),
    refetchInterval: 5000,
  });

  const m = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant-cases"] }),
  });

  const cases = q.data ?? [];

  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = useMemo(() => {
    if (filter === "stage3")
      return cases.filter((c) => c.notices.some((n) => n.stage === 3));
    if (filter === "stage12")
      return cases.filter(
        (c) =>
          c.notices.some((n) => n.stage === 1 || n.stage === 2) &&
          !c.notices.some((n) => n.stage === 3),
      );
    return cases;
  }, [cases, filter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortKey) {
      case "saldo_desc":
        arr.sort((a, b) => b.gesamtsaldo - a.gesamtsaldo);
        break;
      case "saldo_asc":
        arr.sort((a, b) => a.gesamtsaldo - b.gesamtsaldo);
        break;
      case "stage_desc":
        arr.sort((a, b) => {
          const ma = Math.max(0, ...a.notices.map((n) => n.stage));
          const mb = Math.max(0, ...b.notices.map((n) => n.stage));
          if (ma !== mb) return mb - ma;
          return b.gesamtsaldo - a.gesamtsaldo;
        });
        break;
      case "tenant_asc":
        arr.sort((a, b) => a.tenantName.localeCompare(b.tenantName, "de"));
        break;
      case "oldest_due":
        arr.sort((a, b) => {
          const da = a.notices
            .map((n) => n.dueDate)
            .filter(Boolean)
            .sort()[0] ?? "9999-12-31";
          const db = b.notices
            .map((n) => n.dueDate)
            .filter(Boolean)
            .sort()[0] ?? "9999-12-31";
          return da.localeCompare(db);
        });
        break;
      case "severity":
      default:
        arr.sort((a, b) => {
          const sd =
            (SEVERITY_RANK[b.severity] ?? 0) -
            (SEVERITY_RANK[a.severity] ?? 0);
          if (sd !== 0) return sd;
          return b.gesamtsaldo - a.gesamtsaldo;
        });
        break;
    }
    return arr;
  }, [filtered, sortKey]);

  const stage3Count = cases.filter((c) =>
    c.notices.some((n) => n.stage === 3),
  ).length;
  const stage12Count = cases.filter(
    (c) =>
      c.notices.some((n) => n.stage === 1 || n.stage === 2) &&
      !c.notices.some((n) => n.stage === 3),
  ).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6 print:hidden-app">
      <div className="print:hidden flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Eskalationen</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mieter mit offenen Forderungen oder aktiven Mahnstufen
          </p>
        </div>
        {cases.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Sortieren nach:
            </span>
            <Select
              value={sortKey}
              onValueChange={(v) => setSortKey(v as SortKey)}
            >
              <SelectTrigger className="h-9 w-[260px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <SelectItem key={k} value={k} className="text-xs">
                    {SORT_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {cases.length === 0 ? (
        <Card className="p-12 border-border shadow-sm text-center">
          <div className="text-sm text-muted-foreground">
            Keine offenen Eskalationen — Roboter hat alles im Griff 🤖
          </div>
        </Card>
      ) : (
        <>
          <div className="print:hidden flex items-center gap-2">
            <FilterChip
              active={filter === "all"}
              onClick={() => setFilter("all")}
              label={`Alle (${cases.length})`}
            />
            <FilterChip
              active={filter === "stage3"}
              onClick={() => setFilter("stage3")}
              label={`Nur Stufe 3 (${stage3Count})`}
              tone="critical"
            />
            <FilterChip
              active={filter === "stage12"}
              onClick={() => setFilter("stage12")}
              label={`Nur Stufe 1–2 (${stage12Count})`}
              tone="warning"
            />
          </div>

          {sorted.length === 0 ? (
            <Card className="p-8 border-border shadow-sm text-center text-sm text-muted-foreground">
              Keine Mieter für diese Auswahl.
            </Card>
          ) : (
            <div className="space-y-4">
              {sorted.map((c) => (
                <TenantCaseCard
                  key={c.tenantId}
                  c={c}
                  onOpenVerzugsnachweis={(n) =>
                    setVerzugsRow({ tenant: c, notice: n })
                  }
                  onOpenMahnung={(stage, notices) =>
                    setMahnungRow({ tenant: c, stage, notices })
                  }
                  onAction={() =>
                    c.stage3ExceptionId && m.mutate(c.stage3ExceptionId)
                  }
                  actionPending={m.isPending}
                />
              ))}
            </div>
          )}
        </>
      )}

      <VerzugsnachweisDialog
        row={verzugsRow}
        onClose={() => setVerzugsRow(null)}
      />
      <MahnungDialog row={mahnungRow} onClose={() => setMahnungRow(null)} />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "critical" | "warning";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1 text-xs font-medium rounded-full border transition-colors",
        active
          ? tone === "critical"
            ? "bg-red-600 text-white border-red-600"
            : tone === "warning"
              ? "bg-orange-600 text-white border-orange-600"
              : "bg-foreground text-background border-foreground"
          : "bg-background text-muted-foreground border-border hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

// ---------- Card ----------
function TenantCaseCard({
  c,
  onOpenVerzugsnachweis,
  onOpenMahnung,
  onAction,
  actionPending,
}: {
  c: TenantCase;
  onOpenVerzugsnachweis: (n: DunningNoticeRow) => void;
  onOpenMahnung: (stage: 1 | 2 | 3, notices: DunningNoticeRow[]) => void;
  onAction: () => void;
  actionPending: boolean;
}) {
  const hasStage3 = c.notices.some((n) => n.stage === 3);

  const stageGroups = useMemo(() => {
    const byStage = new Map<1 | 2 | 3, DunningNoticeRow[]>();
    for (const n of c.notices) {
      const arr = byStage.get(n.stage) ?? [];
      arr.push(n);
      byStage.set(n.stage, arr);
    }
    return ([3, 2, 1] as const)
      .filter((s) => byStage.has(s))
      .map((stage) => {
        const notices = (byStage.get(stage) ?? []).slice().sort((a, b) =>
          a.month.localeCompare(b.month),
        );
        const latest = notices.reduce((acc, n) =>
          n.issuedDate > acc.issuedDate ? n : acc,
        );
        const sumFee = notices.reduce((s, n) => s + n.mahngebuehr, 0);
        return { stage, notices, latest, sumFee };
      });
  }, [c.notices]);

  return (
    <Card className="p-6 border-border shadow-sm space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {c.tenantName}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Home className="h-3.5 w-3.5" />
            {c.propertyName} · {c.unitLabel}
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "capitalize text-xs",
            severityStyle[c.severity] ?? severityStyle.low,
          )}
        >
          {c.severity}
        </Badge>
      </div>

      {/* Saldo block */}
      <div className="rounded-lg border border-border bg-muted/40 p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <SaldoCell label="Offene Hauptforderung" value={fmtEur(c.hauptforderung)} />
        <SaldoCell label="Mahngebühren" value={fmtEur(c.mahngebuehren)} />
        <SaldoCell label="Verzugszinsen" value={fmtEur(c.verzugszinsen)} />
        <div className="border-l border-border pl-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Gesamtsaldo
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {fmtEur(c.gesamtsaldo)}
          </div>
        </div>
      </div>

      {/* Mahnstufen — eine Zeile pro Stufe */}
      {stageGroups.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
            Mahnstufen
          </div>
          <div className="rounded-md border border-border divide-y divide-border">
            {stageGroups.map((g) => (
              <div
                key={g.stage}
                className="px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2"
              >
                <Badge
                  variant="outline"
                  className={cn("font-semibold", stageStyle[g.stage])}
                >
                  Stufe {g.stage}
                </Badge>
                <div className="text-sm font-medium min-w-[180px]">
                  {g.notices.length === 1
                    ? fmtMonth(g.notices[0].month)
                    : `${g.notices.length} Monate: ${g.notices.map((n) => fmtMonth(n.month)).join(", ")}`}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  Zuletzt ausgestellt {fmtDateLong(g.latest.issuedDate)}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  Frist {fmtDateLong(g.latest.deadlineDate)}
                </div>
                <div className="text-xs tabular-nums">
                  Gebühren{" "}
                  <span className="font-medium">{fmtEur(g.sumFee)}</span>
                </div>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenMahnung(g.stage, g.notices)}
                  >
                    <Mail className="h-3.5 w-3.5 mr-1.5" />
                    Mahnung herunterladen
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenVerzugsnachweis(g.latest)}
                  >
                    Verzugsnachweis ansehen
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage-3 Aktionen */}
      {hasStage3 && c.stage3ExceptionId && (
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <span className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
            Aktionen
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={
                actionPending || c.stage3ExceptionStatus === "in_progress"
              }
              onClick={onAction}
            >
              Kündigung einleiten
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={
                actionPending || c.stage3ExceptionStatus === "in_progress"
              }
              onClick={onAction}
            >
              Anwalt einschalten
            </Button>
            {c.stage3ExceptionStatus === "in_progress" && (
              <Badge variant="secondary">in Bearbeitung</Badge>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function SaldoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// ---------- Verzugsnachweis Dialog ----------
function VerzugsnachweisDialog({
  row,
  onClose,
}: {
  row: { tenant: TenantCase; notice: DunningNoticeRow } | null;
  onClose: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const s = row?.notice.snapshot;
  const tenant = row?.tenant;
  const notice = row?.notice;

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="text-2xl font-semibold tracking-tight">
            Verzugsnachweis · {tenant?.tenantName}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {fmtMonth(notice?.month)} · Stand: {fmtDateLong(s?.as_of)}
          </DialogDescription>
        </DialogHeader>

        {!s ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Kein Snapshot verfügbar.
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <Section icon={<FileText className="h-4 w-4" />} title="Sachverhalt">
              <Grid>
                <Field label="Mieter" value={tenant!.tenantName} />
                <Field
                  label="Wohnung"
                  value={`${tenant!.unitLabel} · ${tenant!.propertyName}`}
                />
                <Field label="Mietforderung" value={fmtMonth(notice!.month)} />
                <Field label="Geschuldeter Betrag" value={fmtEur(s.expected_amount)} />
                <Field label="Eingegangen" value={fmtEur(s.received_amount)} />
                <Field label="Offener Betrag" value={fmtEur(s.open_amount)} emphasize />
              </Grid>
            </Section>

            <Section icon={<Clock className="h-4 w-4" />} title="Verzug">
              <Grid>
                <Field label="Fälligkeit" value={fmtDateLong(notice!.dueDate)} />
                <Field label="Verzug seit" value={fmtDateLong(s.default_since)} />
                <Field label="Verzugsdauer" value={`${s.default_days_calendar} Kalendertage`} />
                <Field label="Auslöser" value={TRIGGER_LABEL[s.trigger] ?? s.trigger} />
              </Grid>
            </Section>

            <Section icon={<Calculator className="h-4 w-4" />} title="Verzugszinsberechnung">
              <Grid>
                <Field label="Basiszinssatz (Bundesbank)" value={fmtPct(s.basiszinssatz)} />
                <Field label="Aufschlag § 288 Abs. 1 BGB" value={`+${fmtPct(s.default_interest_surcharge)}`} />
                <Field
                  label="Effektiver Verzugszins"
                  value={`${fmtPct(s.basiszinssatz + s.default_interest_surcharge)} p.a.`}
                  emphasize
                />
              </Grid>
              <div className="mt-4 rounded-md border border-border bg-muted/50 px-4 py-3 font-mono text-sm">
                {fmtEur(s.open_amount)} × {fmtPct(s.basiszinssatz + s.default_interest_surcharge)} ×{" "}
                {s.default_days_calendar} Tage ÷ 365 ={" "}
                <span className="font-semibold">{fmtEur(s.default_interest)}</span>
              </div>
            </Section>

            <Section icon={<AlertTriangle className="h-4 w-4" />} title="Mahnstufe & Gebühren">
              <Grid>
                <Field label="Aktuelle Mahnstufe" value={STAGE_LABEL[s.stage] ?? `Stufe ${s.stage}`} />
                <Field
                  label="Mahngebühr dieser Stufe"
                  value={
                    s.mahngebuehr === 0
                      ? "€0,00 (Stufe 3 ist Eskalation)"
                      : fmtEur(s.mahngebuehr)
                  }
                />
                <Field
                  label="Gesamtforderung Mieter"
                  value={fmtEur(tenant!.gesamtsaldo)}
                  emphasize
                />
              </Grid>
            </Section>

            <Section icon={<Scale className="h-4 w-4" />} title="Rechtliche Grundlage">
              <div className="rounded-md border border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground space-y-1.5">
                <div><span className="font-semibold text-foreground">§ 286 BGB</span> — Verzug des Schuldners</div>
                <div><span className="font-semibold text-foreground">§ 288 Abs. 1 BGB</span> — Verzugszinsen für Geldforderungen</div>
                <div><span className="font-semibold text-foreground">§ 543, § 569 BGB</span> — Fristlose Kündigung bei Zahlungsverzug</div>
              </div>
            </Section>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={cn("h-3 w-3 transition-transform", showRaw && "rotate-180")} />
                Roh-Daten
              </button>
              {showRaw && (
                <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
                  {JSON.stringify(s, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-border pt-4">
          <Button variant="outline" onClick={onClose}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
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
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">{children}</div>;
}
function Field({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums text-right", emphasize && "font-semibold text-foreground")}>
        {value}
      </span>
    </div>
  );
}

// ---------- Mahnung Letter Dialog ----------
function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : full;
}

function monthsRangeLabel(notices: DunningNoticeRow[]): string {
  if (notices.length === 0) return "";
  if (notices.length === 1) return fmtMonth(notices[0].month);
  const sorted = notices.slice().sort((a, b) => a.month.localeCompare(b.month));
  return `${fmtMonth(sorted[0].month)} – ${fmtMonth(sorted[sorted.length - 1].month)}`;
}

function MahnungDialog({
  row,
  onClose,
}: {
  row: {
    tenant: TenantCase;
    stage: 1 | 2 | 3;
    notices: DunningNoticeRow[];
  } | null;
  onClose: () => void;
}) {
  if (!row) {
    return (
      <Dialog open={false} onOpenChange={(o) => !o && onClose()}>
        <DialogContent />
      </Dialog>
    );
  }
  const { tenant, stage, notices } = row;
  const sortedNotices = notices.slice().sort((a, b) => a.month.localeCompare(b.month));
  const latest = sortedNotices.reduce((acc, n) =>
    n.issuedDate > acc.issuedDate ? n : acc,
  );
  

  const sumHaupt = sortedNotices.reduce((s, n) => s + n.amount, 0);
  const sumFees = sortedNotices.reduce((s, n) => s + n.mahngebuehr, 0);
  const sumInterest = sortedNotices.reduce(
    (s, n) => s + n.defaultInterestSnapshot,
    0,
  );
  const total = sumHaupt + sumFees + sumInterest;

  const snap = latest.snapshot;
  const interestRate =
    (snap?.basiszinssatz ?? 0.0327) +
    (snap?.default_interest_surcharge ?? 0.05);

  // For stage 2, reference the earliest matching stage-1 notice
  const stage1Ref = tenant.notices.find((n) => n.stage === 1);

  const monthsLabel = monthsRangeLabel(sortedNotices);

  const introText =
    stage === 1
      ? `Trotz Fälligkeit ist Ihre Mietzahlung für ${monthsLabel} in Höhe von ${fmtEur(sumHaupt)} bei uns nicht eingegangen. Wir möchten Sie höflich daran erinnern und bitten um umgehende Begleichung.`
      : stage === 2
        ? `Trotz unserer ersten Zahlungserinnerung${stage1Ref ? ` vom ${fmtDateLong(stage1Ref.issuedDate)}` : ""} sind Ihre Mietzahlungen für ${monthsLabel} weiterhin offen. Wir fordern Sie hiermit ausdrücklich zur Zahlung auf.`
        : `Letzte Zahlungsaufforderung vor Einleitung rechtlicher Schritte. Trotz mehrerer Mahnungen sind Ihre Zahlungsrückstände auf ${fmtEur(tenant.gesamtsaldo)} angewachsen — dies entspricht mehr als zwei Monatsmieten und erfüllt damit die Voraussetzungen für eine fristlose Kündigung nach § 543 Abs. 2 Nr. 3 BGB.`;

  const closingText =
    stage === 1
      ? "Sollten Sie bereits gezahlt haben, betrachten Sie dieses Schreiben als gegenstandslos."
      : stage === 2
        ? "Bei weiterer Nichtzahlung müssen wir rechtliche Schritte einleiten."
        : "Wir setzen Ihnen eine letzte Frist von 14 Tagen. Andernfalls werden wir das Mietverhältnis fristlos kündigen und unsere Forderungen gerichtlich durchsetzen.";

  const subject =
    sortedNotices.length === 1
      ? `${stage}. Mahnung — Mietzahlung ${monthsLabel}`
      : `${stage}. Mahnung — Mietzahlungen ${monthsLabel} (${sortedNotices.length} Monate)`;

  const letterRef = useRef<HTMLDivElement>(null);

  const totalDays = sortedNotices.reduce(
    (s, n) => s + (n.snapshot?.default_days_calendar ?? 0),
    0,
  );

  const issueDateISO = latest.issuedDate.slice(0, 10);
  const tenantLastName = lastName(tenant.tenantName);

  const lineItems = [
    ...sortedNotices.map((n) => ({
      label: `Hauptforderung (Miete ${fmtMonth(n.month)})`,
      value: fmtEur(n.amount),
    })),
    {
      label: `Mahngebühr Stufe ${stage}${sortedNotices.length > 1 ? ` (${sortedNotices.length} Monate)` : ""}`,
      value: fmtEur(sumFees),
    },
    {
      label: `Verzugszinsen (${fmtPct(interestRate)} p.a., ${totalDays} Tage gesamt)`,
      value: fmtEur(sumInterest),
    },
  ];

  const letterData: MahnungLetterData = {
    lastName: tenantLastName,
    issueDateISO,
    issueDateLong: fmtDateLong(latest.issuedDate),
    deadlineDateLong: fmtDateLong(latest.deadlineDate),
    companyName: "Hallo Theo",
    portfolioName: tenant.propertyName ?? "Berlin Mitte Portfolio",
    tenantName: tenant.tenantName,
    unitLabel: tenant.unitLabel,
    propertyStreet: tenant.propertyStreet,
    propertyPostalCode: tenant.propertyPostalCode,
    propertyCity: tenant.propertyCity,
    subject,
    introText,
    closingText,
    lineItems,
    totalLabel: "Gesamtforderung:",
    totalValue: fmtEur(total),
    iban: "DE00 0000 0000 0000 0000 00",
    bic: "DEMOXXXX",
  };

  const handlePdf = () => downloadAsPdf(letterData);
  const handleDocx = () => {
    void downloadAsDocx(letterData);
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="text-xl">
            Mahnung Stufe {stage} · {tenant.tenantName}
          </DialogTitle>
          <DialogDescription>Vorschau · {monthsLabel}</DialogDescription>
        </DialogHeader>

        <div ref={letterRef} className="mahnung-letter bg-white text-black p-10 text-[13px] leading-relaxed font-serif">

          {/* Briefkopf */}
          <div className="flex justify-between items-start mb-12">
            <div>
              <div className="font-bold text-base">Hallo Theo</div>
              <div className="text-xs text-neutral-600">
                Berlin Mitte Portfolio
              </div>
            </div>
            <div className="text-xs text-neutral-700">
              Berlin, {fmtDateLong(latest.issuedDate)}
            </div>
          </div>

          {/* Empfänger */}
          <div className="mb-10 text-[13px]">
            <div className="font-semibold">{tenant.tenantName}</div>
            <div>{tenant.unitLabel}</div>
            {tenant.propertyStreet && <div>{tenant.propertyStreet}</div>}
            {(tenant.propertyPostalCode || tenant.propertyCity) && (
              <div>
                {tenant.propertyPostalCode} {tenant.propertyCity}
              </div>
            )}
          </div>

          {/* Betreff */}
          <div className="font-bold mb-6">Betreff: {subject}</div>

          {/* Anrede */}
          <div className="mb-4">
            Sehr geehrte/r Herr/Frau {lastName(tenant.tenantName)},
          </div>

          {/* Intro */}
          <p className="mb-6 text-justify">{introText}</p>

          {/* Aufstellung */}
          <div className="mb-6">
            <div className="font-semibold mb-2">Aufstellung:</div>
            <div className="font-mono text-[12px] space-y-1">
              {sortedNotices.map((n) => (
                <Row
                  key={n.id}
                  label={`Hauptforderung (Miete ${fmtMonth(n.month)})`}
                  value={fmtEur(n.amount)}
                />
              ))}
              <Row
                label={`Mahngebühr Stufe ${stage}${sortedNotices.length > 1 ? ` (${sortedNotices.length} Monate)` : ""}`}
                value={fmtEur(sumFees)}
              />
              <Row
                label={`Verzugszinsen (${fmtPct(interestRate)} p.a., ${totalDays} Tage gesamt)`}
                value={fmtEur(sumInterest)}
              />
              <div className="border-t border-black mt-2 pt-1 flex justify-between font-bold">
                <span>Gesamtforderung:</span>
                <span>{fmtEur(total)}</span>
              </div>
            </div>
          </div>

          <p className="mb-6">
            Bitte begleichen Sie den offenen Betrag bis spätestens{" "}
            <span className="font-semibold">
              {fmtDateLong(latest.deadlineDate)}
            </span>{" "}
            auf das folgende Konto:{" "}
            <span className="font-mono">DE00 0000 0000 0000 0000 00</span>, BIC:{" "}
            <span className="font-mono">DEMOXXXX</span>.
          </p>

          <p className="mb-10 text-justify">{closingText}</p>

          <div>
            <div className="mb-1">Mit freundlichen Grüßen</div>
            <div className="font-semibold">Hausverwaltung Hallo Theo</div>
          </div>
        </div>

        <DialogFooter className="border-t border-border pt-4 print:hidden">
          <Button variant="outline" onClick={onClose}>
            Schließen
          </Button>
          <Button variant="outline" onClick={handleDocx}>
            <FileText className="h-4 w-4 mr-2" />
            Als Word speichern
          </Button>
          <Button onClick={handlePdf}>
            <Download className="h-4 w-4 mr-2" />
            Als PDF speichern
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span>{label}:</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
