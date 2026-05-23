import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  CreditCard,
  RefreshCw,
  Bell,
  CalendarClock,
  ArrowUpRight,
  CheckCheck,
} from "lucide-react";
import { getAgentActions, type AgentActionLogEntry } from "@/lib/exceptions.functions";
import { useCycle } from "@/lib/cycle-store";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity — hallo flow" },
      { name: "description", content: "Agent activity log." },
    ],
  }),
  component: ActivityPage,
});

const ACTION_ICON: Record<string, typeof RefreshCw> = {
  charge: CreditCard,
  retry: RefreshCw,
  reminder: Bell,
  offer_payment_plan: CalendarClock,
  escalate: ArrowUpRight,
  reconcile: CheckCheck,
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

function ActivityPage() {
  const cycle = useCycle();
  const actions = useQuery({
    queryKey: ["agent-actions", cycle],
    queryFn: () => getAgentActions(),
    staleTime: 0,
  });

  const rows = actions.data ?? [];
  const successes = rows.filter((a) => a.result === "success").length;

  // Group consecutive (already newest-first) actions by calendar day for headers.
  const groups: { day: string; items: AgentActionLogEntry[] }[] = [];
  for (const a of rows) {
    const day = fmtDay(a.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(a);
    else groups.push({ day, items: [a] });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Agent Activity Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every decision the autonomous agent made, with the reason and the policy it followed.
            Nothing happens off the record.
          </p>
        </div>
        {rows.length > 0 && (
          <div className="rounded-md border border-border bg-card px-4 py-2 text-sm shadow-sm">
            <span className="font-semibold">{rows.length}</span>{" "}
            <span className="text-muted-foreground">actions ·</span>{" "}
            <span className="font-semibold text-[var(--status-paid)]">{successes}</span>{" "}
            <span className="text-muted-foreground">successful</span>
          </div>
        )}
      </div>

      {/* Loading */}
      {actions.isLoading && (
        <Card className="p-6">
          <div className="space-y-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-[90%]" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Error */}
      {actions.isError && (
        <Card className="border-[var(--status-review)]/30 bg-[var(--status-review)]/5 p-6 text-sm text-[var(--status-review)]">
          <div className="font-medium">Couldn't load the activity log.</div>
          <div className="mt-1 text-[var(--status-review)]/80">
            {(actions.error as Error).message}
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => actions.refetch()}>
            Try again
          </Button>
        </Card>
      )}

      {/* Empty */}
      {!actions.isLoading && !actions.isError && rows.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <ActivityIcon className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">No activity yet</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Once the cycle runs, every charge, retry, reminder and escalation the agent performs
            will appear here.
          </p>
        </Card>
      )}

      {/* Timeline */}
      {groups.map((group) => (
        <div key={group.day} className="space-y-3">
          <div className="sticky top-0 z-10 -mx-1 bg-background/80 px-1 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
            {group.day}
          </div>
          <Card className="p-6">
            <ol className="relative space-y-6">
              {/* vertical rail */}
              <span className="absolute left-[18px] top-2 bottom-2 w-px bg-border" />
              {group.items.map((a) => (
                <TimelineRow key={a.id} entry={a} />
              ))}
            </ol>
          </Card>
        </div>
      ))}
    </div>
  );
}

function TimelineRow({ entry: a }: { entry: AgentActionLogEntry }) {
  const Icon = ACTION_ICON[a.actionType ?? ""] ?? ActivityIcon;
  const ringTone =
    a.result === "success"
      ? "bg-[var(--status-paid)]/10 text-[var(--status-paid)] ring-[var(--status-paid)]/20"
      : a.result === "failed"
        ? "bg-[var(--status-review)]/10 text-[var(--status-review)] ring-[var(--status-review)]/20"
        : "bg-[var(--status-plan)]/10 text-[var(--status-plan)] ring-[var(--status-plan)]/20";

  return (
    <li className="relative flex gap-4">
      <div
        className={cn(
          "z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4 ring-background",
          ringTone,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold capitalize">
            {(a.actionType ?? "action").replace(/_/g, " ")}
          </span>
          {a.result && <StatusBadge value={a.result} kind="result" />}
          <span className="text-xs text-muted-foreground">
            {a.tenantName}
            {a.unitLabel ? ` · ${a.unitLabel}` : ""}
          </span>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {fmtTime(a.timestamp)}
          </span>
        </div>
        {a.reason && <p className="mt-1 text-sm leading-relaxed text-foreground/90">{a.reason}</p>}
        {a.policyBasis && (
          <div className="mt-2 rounded-md border-l-2 border-primary/40 bg-muted/50 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Policy basis
            </span>
            <p className="text-xs leading-relaxed text-foreground/80">{a.policyBasis}</p>
          </div>
        )}
      </div>
    </li>
  );
}
