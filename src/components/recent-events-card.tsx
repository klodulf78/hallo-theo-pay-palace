import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getRecentWebhookEvents, type WebhookEvent } from "@/lib/events.functions";
import { useCycle } from "@/lib/cycle-store";
import { cn } from "@/lib/utils";
import { useLang, formatCurrency } from "@/lib/use-language";
import type { Lang } from "@/lib/translations";

const fmtTime = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleTimeString(lang === "de" ? "de-DE" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

function dateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dateLabel(iso: string, lang: Lang, today: string, yesterday: string) {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date();
  y.setDate(t.getDate() - 1);
  if (dateKey(iso) === dateKey(t.toISOString())) return today;
  if (dateKey(iso) === dateKey(y.toISOString())) return yesterday;
  return d.toLocaleDateString(lang === "de" ? "de-DE" : "en-US", { day: "2-digit", month: "long" });
}

function eventIcon(type: string) {
  if (type === "payment_succeeded") return <CheckCircle className="h-4 w-4" style={{ color: "#16a34a" }} />;
  if (type === "payment_failed") return <XCircle className="h-4 w-4" style={{ color: "#dc2626" }} />;
  if (type === "refund") return <RotateCcw className="h-4 w-4 text-[var(--status-plan)]" />;
  return <Activity className="h-4 w-4 text-muted-foreground" />;
}

function eventLabel(type: string, t: (k: string) => string) {
  switch (type) {
    case "payment_succeeded":
      return t("webhooks.paymentSucceeded");
    case "payment_failed":
      return t("webhooks.paymentFailed");
    case "refund":
      return t("webhooks.refundIssued");
    default:
      return type;
  }
}

function statusBadge(type: string) {
  if (type === "payment_succeeded")
    return (
      <Badge className="border-0 text-white" style={{ backgroundColor: "#16a34a" }}>
        succeeded
      </Badge>
    );
  if (type === "payment_failed")
    return (
      <Badge className="border-0 text-white" style={{ backgroundColor: "#dc2626" }}>
        failed
      </Badge>
    );
  return (
    <Badge variant="secondary" className="border-0">
      {type}
    </Badge>
  );
}

type SortKey = "date_desc" | "date_asc" | "status_failed" | "amount_desc" | "tenant_asc";
type FilterKey = "all" | "success" | "failed";

export function RecentEventsCard() {
  const cycle = useCycle();
  const { t, lang } = useLang();
  const [showAll, setShowAll] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");
  const [filter, setFilter] = useState<FilterKey>("all");

  const events = useQuery({
    queryKey: ["recent-webhook-events", cycle],
    queryFn: () => getRecentWebhookEvents(),
    refetchInterval: 5000,
  });

  const all = events.data ?? [];

  const SORT_LABELS: Record<SortKey, string> = {
    date_desc: t("webhooks.sortNewest"),
    date_asc: t("webhooks.sortOldest"),
    status_failed: t("webhooks.sortStatus"),
    amount_desc: t("webhooks.sortAmount"),
    tenant_asc: t("webhooks.sortTenant"),
  };

  const filtered = useMemo(() => {
    if (filter === "success") return all.filter((e) => e.type === "payment_succeeded");
    if (filter === "failed") return all.filter((e) => e.type === "payment_failed");
    return all;
  }, [all, filter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortKey) {
      case "date_asc":
        arr.sort((a, b) => +new Date(a.occurredAt) - +new Date(b.occurredAt));
        break;
      case "status_failed":
        arr.sort((a, b) => {
          const af = a.type === "payment_failed" ? 0 : 1;
          const bf = b.type === "payment_failed" ? 0 : 1;
          if (af !== bf) return af - bf;
          return +new Date(b.occurredAt) - +new Date(a.occurredAt);
        });
        break;
      case "amount_desc":
        arr.sort((a, b) => b.amount - a.amount);
        break;
      case "tenant_asc":
        arr.sort((a, b) => (a.tenantName ?? "").localeCompare(b.tenantName ?? "", lang));
        break;
      case "date_desc":
      default:
        arr.sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));
        break;
    }
    return arr;
  }, [filtered, sortKey, lang]);

  const visible = showAll ? sorted : sorted.slice(0, 20);
  const hasMore = sorted.length > 20;
  const groupByDate = sortKey === "date_desc" || sortKey === "date_asc";
  const todayLabel = t("webhooks.today");
  const yesterdayLabel = t("webhooks.yesterday");

  const grouped = useMemo(() => {
    if (!groupByDate)
      return [{ label: "", key: "flat", items: visible }] as {
        label: string;
        key: string;
        items: WebhookEvent[];
      }[];
    const groups: { label: string; key: string; items: WebhookEvent[] }[] = [];
    for (const e of visible) {
      const k = dateKey(e.occurredAt);
      const last = groups[groups.length - 1];
      if (last && last.key === k) {
        last.items.push(e);
      } else {
        groups.push({ key: k, label: dateLabel(e.occurredAt, lang, todayLabel, yesterdayLabel), items: [e] });
      }
    }
    return groups;
  }, [visible, groupByDate, lang, todayLabel, yesterdayLabel]);

  const successCount = all.filter((e) => e.type === "payment_succeeded").length;
  const failCount = all.filter((e) => e.type === "payment_failed").length;

  return (
    <Card className="p-6 border-border shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold">{t("webhooks.title")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("webhooks.subtitle")} · {all.length} {t("webhooks.events")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:inline">{t("webhooks.sortBy")}</span>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-8 w-[220px] text-xs">
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
      </div>

      <div className="mt-4 flex items-center gap-2">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label={`${t("webhooks.filterAll")} (${all.length})`}
        />
        <FilterChip
          active={filter === "success"}
          onClick={() => setFilter("success")}
          label={`${t("webhooks.filterOk")} (${successCount})`}
          tone="success"
        />
        <FilterChip
          active={filter === "failed"}
          onClick={() => setFilter("failed")}
          label={`${t("webhooks.filterFail")} (${failCount})`}
          tone="failed"
        />
      </div>

      <div className="mt-4">
        {events.isLoading ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("webhooks.empty")}</div>
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.key}>
                {g.label && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {g.label}
                    </div>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className="space-y-2">
                  {g.items.map((e) => {
                    const isSuccess = e.type === "payment_succeeded";
                    const isFailed = e.type === "payment_failed";
                    const rowStyle: React.CSSProperties = isSuccess
                      ? { backgroundColor: "#dcfce7", borderLeft: "4px solid #16a34a" }
                      : isFailed
                        ? { backgroundColor: "#fee2e2", borderLeft: "4px solid #dc2626" }
                        : { backgroundColor: "rgba(0,0,0,0.03)", borderLeft: "4px solid hsl(var(--border))" };
                    return (
                      <div
                        key={e.id}
                        style={rowStyle}
                        className="flex items-center justify-between gap-3 py-3 pl-3 pr-4 rounded-md"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="shrink-0">{eventIcon(e.type)}</div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold truncate">{eventLabel(e.type, t)}</span>
                              {statusBadge(e.type)}
                            </div>
                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                              {fmtTime(e.occurredAt, lang)}
                              {e.tenantName ? ` · ${e.tenantName}` : ""}
                              {e.failureReason ? ` · ${e.failureReason}` : ""}
                            </div>
                          </div>
                        </div>
                        <div
                          className="text-sm font-bold tabular-nums shrink-0"
                          style={{
                            color: isSuccess ? "#15803d" : isFailed ? "#b91c1c" : undefined,
                          }}
                        >
                          {formatCurrency(e.amount, lang)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {hasMore && !showAll && (
              <div className="pt-2 text-center">
                <button
                  onClick={() => setShowAll(true)}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {t("webhooks.viewAll")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
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
  tone?: "success" | "failed";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1 text-xs font-medium rounded-full border transition-colors",
        active
          ? tone === "success"
            ? "bg-green-600 text-white border-green-600"
            : tone === "failed"
              ? "bg-red-600 text-white border-red-600"
              : "bg-foreground text-background border-foreground"
          : "bg-background text-muted-foreground border-border hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}
