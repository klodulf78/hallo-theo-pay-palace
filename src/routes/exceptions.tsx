import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  RefreshCw,
  Bell,
  CalendarClock,
  ArrowUpRight,
  Check,
} from "lucide-react";
import { getExceptions, type ExceptionWithContext } from "@/lib/exceptions.functions";
import { runExceptionAction, type ExceptionAction } from "@/lib/recovery-actions.functions";
import { useCycle } from "@/lib/cycle-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge, StatusDot } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/exceptions")({
  head: () => ({
    meta: [
      { title: "Exceptions — hallo flow" },
      { name: "description", content: "Exception queue for rent collection." },
    ],
  }),
  component: ExceptionsPage,
});

const fmtEur = (n: number) => `€${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const ACTIONS: {
  action: ExceptionAction;
  label: string;
  icon: typeof RefreshCw;
  variant: "default" | "secondary" | "outline";
}[] = [
  { action: "retry", label: "Retry", icon: RefreshCw, variant: "secondary" },
  { action: "reminder", label: "Send reminder", icon: Bell, variant: "secondary" },
  {
    action: "offer_payment_plan",
    label: "Offer plan",
    icon: CalendarClock,
    variant: "secondary",
  },
  {
    action: "escalate",
    label: "Escalate",
    icon: ArrowUpRight,
    variant: "outline",
  },
  { action: "resolve", label: "Resolve", icon: Check, variant: "default" },
];

function ExceptionsPage() {
  const cycle = useCycle();
  const queryClient = useQueryClient();
  const runActionFn = useServerFn(runExceptionAction);

  const exceptions = useQuery({
    queryKey: ["exceptions", cycle],
    queryFn: () => getExceptions(),
    staleTime: 0,
  });

  // Track which exception+action is mid-flight so only that button spins.
  const [pending, setPending] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (vars: { exceptionId: string; action: ExceptionAction }) =>
      runActionFn({ data: vars }),
    onMutate: (vars) => setPending(`${vars.exceptionId}:${vars.action}`),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
      // Refetch the queue + the dashboard KPIs that depend on it.
      void queryClient.invalidateQueries({ queryKey: ["exceptions"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      void queryClient.invalidateQueries({ queryKey: ["agent-actions"] });
    },
    onError: (err) => toast.error((err as Error).message),
    onSettled: () => setPending(null),
  });

  const rows = exceptions.data ?? [];
  const humanNeeded = rows.filter((e) => e.humanNeeded);
  const handled = rows.filter((e) => !e.humanNeeded);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Exception Queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every failed or at-risk payment the agent touched this cycle — and what it decided to
            do.
          </p>
        </div>
        <div className="rounded-md border border-border bg-card px-4 py-2 text-sm shadow-sm">
          <span className="font-semibold text-[var(--status-review)]">{humanNeeded.length}</span>{" "}
          <span className="text-muted-foreground">
            need{humanNeeded.length === 1 ? "s" : ""} human review
          </span>
        </div>
      </div>

      {/* Loading */}
      {exceptions.isLoading && (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-3 h-4 w-72" />
              <Skeleton className="mt-4 h-9 w-full" />
            </Card>
          ))}
        </div>
      )}

      {/* Error */}
      {exceptions.isError && (
        <Card className="border-[var(--status-review)]/30 bg-[var(--status-review)]/5 p-6 text-sm text-[var(--status-review)]">
          <div className="font-medium">Couldn't load the exception queue.</div>
          <div className="mt-1 text-[var(--status-review)]/80">
            {(exceptions.error as Error).message}
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => exceptions.refetch()}>
            Try again
          </Button>
        </Card>
      )}

      {/* Empty / celebratory state */}
      {!exceptions.isLoading && !exceptions.isError && humanNeeded.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-3 border-[var(--status-paid)]/30 bg-[var(--status-paid)]/5 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--status-paid)]/15 text-[var(--status-paid)]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Queue clear</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Nothing needs your attention. The agent auto-cleared or recovered every payment this
            cycle.
          </p>
          {handled.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {handled.length} exception{handled.length === 1 ? "" : "s"} resolved automatically —
              shown below for the record.
            </p>
          )}
        </Card>
      )}

      {/* Cases needing a human */}
      {humanNeeded.length > 0 && (
        <div className="space-y-4">
          {humanNeeded.map((e) => (
            <ExceptionCard
              key={e.id}
              exception={e}
              pending={pending}
              onAction={(action) => mutation.mutate({ exceptionId: e.id, action })}
            />
          ))}
        </div>
      )}

      {/* Already-handled cases (collapsed context, not noise) */}
      {handled.length > 0 && humanNeeded.length > 0 && (
        <>
          <Separator />
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Resolved by the agent ({handled.length})
          </div>
        </>
      )}
      {handled.length > 0 && (
        <div className="space-y-4">
          {handled.map((e) => (
            <ExceptionCard
              key={e.id}
              exception={e}
              pending={pending}
              muted
              onAction={(action) => mutation.mutate({ exceptionId: e.id, action })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RiskScore({ exception }: { exception: ExceptionWithContext }) {
  const score = exception.riskScore;
  const bd = exception.riskBreakdown;
  const level = bd?.level ?? null;
  const tone =
    level === "critical" || level === "high"
      ? "text-[var(--status-review)]"
      : level === "medium"
        ? "text-[var(--status-plan)]"
        : "text-[var(--status-paid)]";

  const trigger = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-sm font-bold tabular-nums",
        tone,
      )}
    >
      {score ?? "—"}
      {bd && bd.factors.length > 0 && <ChevronDown className="h-3 w-3 opacity-60" />}
    </span>
  );

  if (!bd || bd.factors.length === 0) {
    return (
      <div className="text-right">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Risk
        </div>
        <div className="mt-0.5">{trigger}</div>
      </div>
    );
  }

  return (
    <div className="text-right">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Risk · why
      </div>
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="mt-0.5 cursor-help">
              {trigger}
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="left"
            className="max-w-xs bg-popover text-popover-foreground border border-border shadow-md"
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold">
              <span>
                Risk {bd.score} · {bd.level}
              </span>
              <span className="font-normal text-muted-foreground">
                {bd.source === "heuristic" ? "heuristic" : "behavior model"}
              </span>
            </div>
            <ul className="space-y-1">
              {bd.factors.map((f, i) => (
                <li key={i} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-foreground/90">
                    {f.label}
                    {f.detail && (
                      <span className="block text-[11px] text-muted-foreground">{f.detail}</span>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--status-review)]">
                    +{f.points}
                  </span>
                </li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function ExceptionCard({
  exception: e,
  pending,
  onAction,
  muted,
}: {
  exception: ExceptionWithContext;
  pending: string | null;
  onAction: (action: ExceptionAction) => void;
  muted?: boolean;
}) {
  return (
    <Card className={cn("overflow-hidden border-border p-5 shadow-sm", muted && "opacity-80")}>
      {/* Header: identity + amount + risk */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {e.humanNeeded && (
              <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--status-review)]" />
            )}
            <h3 className="truncate text-base font-semibold">{e.tenantName}</h3>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {[e.unitLabel, e.propertyName, e.month].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge value={e.obligationStatus} kind="obligation" />
            {e.status && <StatusBadge value={e.status} kind="exception" />}
            {e.severity && <StatusBadge value={e.severity} kind="severity" />}
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-xs font-medium">
              Human needed:{" "}
              <span
                className={cn(
                  "font-semibold",
                  e.humanNeeded ? "text-[var(--status-review)]" : "text-[var(--status-paid)]",
                )}
              >
                {e.humanNeeded ? "Yes" : "No"}
              </span>
            </span>
          </div>
        </div>
        <div className="flex items-start gap-5">
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Amount
            </div>
            <div className="mt-0.5 text-lg font-bold tabular-nums">{fmtEur(e.amount)}</div>
          </div>
          <RiskScore exception={e} />
        </div>
      </div>

      {/* Recommended action */}
      {e.recommendedAction && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-xs text-accent-foreground">
          <span className="font-semibold uppercase tracking-wider">Recommended</span>
          <span className="capitalize">{e.recommendedAction.replace(/_/g, " ")}</span>
        </div>
      )}

      {/* Action history */}
      {e.actions.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Action history
          </div>
          <ol className="mt-2 space-y-2">
            {e.actions.map((a) => (
              <li key={a.id} className="flex items-start gap-2.5">
                <StatusDot result={a.result} className="mt-1.5 shrink-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold capitalize">
                      {(a.actionType ?? "action").replace(/_/g, " ")}
                    </span>
                    {a.result && <StatusBadge value={a.result} kind="result" />}
                    <span className="text-muted-foreground">{fmtTime(a.createdAt)}</span>
                  </div>
                  {a.reason && (
                    <p className="mt-0.5 text-xs leading-relaxed text-foreground/80">{a.reason}</p>
                  )}
                  {a.policyBasis && (
                    <p className="mt-0.5 text-[11px] italic leading-relaxed text-muted-foreground">
                      Policy: {a.policyBasis}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Action buttons */}
      <Separator className="my-4" />
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map(({ action, label, icon: Icon, variant }) => {
          const isPending = pending === `${e.id}:${action}`;
          const anyPending = pending?.startsWith(`${e.id}:`) ?? false;
          return (
            <Button
              key={action}
              size="sm"
              variant={variant}
              disabled={anyPending}
              onClick={() => onAction(action)}
              className="gap-1.5"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              {label}
            </Button>
          );
        })}
      </div>
    </Card>
  );
}
