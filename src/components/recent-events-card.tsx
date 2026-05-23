import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getRecentWebhookEvents } from "@/lib/events.functions";
import { useCycle } from "@/lib/cycle-store";
import { cn } from "@/lib/utils";

const fmtEur = (n: number) =>
  `€${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function eventIcon(type: string) {
  if (type === "payment_succeeded")
    return <CheckCircle2 className="h-4 w-4 text-[var(--status-paid)]" />;
  if (type === "payment_failed")
    return <XCircle className="h-4 w-4 text-[var(--status-review)]" />;
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

export function RecentEventsCard() {
  const cycle = useCycle();
  const events = useQuery({
    queryKey: ["recent-webhook-events", cycle],
    queryFn: () => getRecentWebhookEvents(),
    refetchInterval: 5000,
  });

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
          {events.data?.length ?? 0} events
        </span>
      </div>

      <div className="mt-4 divide-y divide-border">
        {events.isLoading ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !events.data || events.data.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No webhook events yet. Set up Stripe and advance the month to
            generate live payment events.
          </div>
        ) : (
          events.data.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  {eventIcon(e.type)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {eventLabel(e.type)}
                    {e.tenantName ? (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · {e.tenantName}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {fmtTime(e.occurredAt)}
                    {e.failureReason ? ` · ${e.failureReason}` : ""}
                  </div>
                </div>
              </div>
              <div
                className={cn(
                  "text-sm font-semibold tabular-nums shrink-0",
                  e.type === "payment_succeeded" && "text-[var(--status-paid)]",
                  e.type === "payment_failed" && "text-[var(--status-review)]",
                  e.type === "refund" && "text-[var(--status-plan)]",
                )}
              >
                {fmtEur(e.amount)}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
