import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getRecentWebhookEvents, type WebhookEvent } from "@/lib/events.functions";
import { useCycle } from "@/lib/cycle-store";
import { cn } from "@/lib/utils";

const fmtEur = (n: number) =>
  `€${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

function dateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dateLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dateKey(iso) === dateKey(today.toISOString())) return "Heute";
  if (dateKey(iso) === dateKey(yesterday.toISOString())) return "Gestern";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "long" });
}

function eventIcon(type: string) {
  if (type === "payment_succeeded")
    return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (type === "payment_failed")
    return <XCircle className="h-4 w-4 text-red-600" />;
  if (type === "refund")
    return <RotateCcw className="h-4 w-4 text-[var(--status-plan)]" />;
  return <Activity className="h-4 w-4 text-muted-foreground" />;
}

function eventLabel(type: string) {
  switch (type) {
    case "payment_succeeded":
      return "Payment succeeded";
    case "payment_failed":
      return "Payment failed";
    case "refund":
      return "Refund issued";
    default:
      return type;
  }
}

function statusBadge(type: string) {
  if (type === "payment_succeeded")
    return (
      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0">
        succeeded
      </Badge>
    );
  if (type === "payment_failed")
    return (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0">
        failed
      </Badge>
    );
  return (
    <Badge variant="secondary" className="border-0">
      {type}
    </Badge>
  );
}

export function RecentEventsCard() {
  const cycle = useCycle();
  const [showAll, setShowAll] = useState(false);
  const events = useQuery({
    queryKey: ["recent-webhook-events", cycle],
    queryFn: () => getRecentWebhookEvents(),
    refetchInterval: 5000,
  });

  const all = events.data ?? [];
  const visible = showAll ? all : all.slice(0, 20);
  const hasMore = all.length > 20;

  const grouped = useMemo(() => {
    const groups: { label: string; key: string; items: WebhookEvent[] }[] = [];
    for (const e of visible) {
      const k = dateKey(e.occurredAt);
      const last = groups[groups.length - 1];
      if (last && last.key === k) {
        last.items.push(e);
      } else {
        groups.push({ key: k, label: dateLabel(e.occurredAt), items: [e] });
      }
    }
    return groups;
  }, [visible]);

  return (
    <Card className="p-6 border-border shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Recent Webhook Events</h2>
            <p className="text-xs text-muted-foreground">
              Live stream from Stripe · auto-refresh
            </p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {all.length} events
        </span>
      </div>

      <div className="mt-4">
        {events.isLoading ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : all.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No webhook events yet. Set up Stripe and advance the month to
            generate live payment events.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.key}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.label}
                  </div>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-2">
                  {g.items.map((e) => (
                    <div
                      key={e.id}
                      className={cn(
                        "flex items-center justify-between gap-3 py-3 pl-3 pr-4 rounded-md bg-muted/30 border-l-4",
                        e.type === "payment_succeeded" && "border-green-500",
                        e.type === "payment_failed" && "border-red-500",
                        e.type !== "payment_succeeded" &&
                          e.type !== "payment_failed" &&
                          "border-border",
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0">{eventIcon(e.type)}</div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">
                              {eventLabel(e.type)}
                            </span>
                            {statusBadge(e.type)}
                          </div>
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {fmtTime(e.occurredAt)}
                            {e.tenantName ? ` · ${e.tenantName}` : ""}
                            {e.failureReason ? ` · ${e.failureReason}` : ""}
                          </div>
                        </div>
                      </div>
                      <div
                        className={cn(
                          "text-sm font-semibold tabular-nums shrink-0",
                          e.type === "payment_succeeded" && "text-green-600",
                          e.type === "payment_failed" && "text-red-600",
                          e.type === "refund" && "text-[var(--status-plan)]",
                        )}
                      >
                        {fmtEur(e.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {hasMore && !showAll && (
              <div className="pt-2 text-center">
                <button
                  onClick={() => setShowAll(true)}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Alle Events ansehen →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
