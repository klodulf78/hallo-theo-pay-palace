import { cn } from "@/lib/utils";

/**
 * Shared, demo-grade status pills for hallo flow. Maps the rent_obligation /
 * exception / severity / agent-result vocabularies onto the existing
 * `--status-*` CSS variables so the Dashboard, Exception Queue, Activity Log and
 * Tenant Portal all color-code the same concept identically.
 */

type Style = { label: string; className: string };

const dot = (v: string) => `bg-[var(--status-${v})]`;
const tint = (v: string) =>
  `border-[var(--status-${v})]/30 bg-[var(--status-${v})]/10 text-[var(--status-${v})]`;

const OBLIGATION: Record<string, Style> = {
  paid: { label: "Paid", className: tint("paid") },
  reconciled: { label: "Reconciled", className: tint("paid") },
  auto_recovered: { label: "Auto-recovered", className: tint("recovered") },
  payment_plan: { label: "Payment plan", className: tint("plan") },
  human_review: { label: "Human review", className: tint("review") },
  failed: { label: "Failed", className: tint("review") },
  pending: { label: "Pending", className: tint("pending") },
  expected: { label: "Expected", className: tint("pending") },
};

const EXCEPTION_STATUS: Record<string, Style> = {
  open: { label: "Open", className: tint("review") },
  in_progress: { label: "In progress", className: tint("plan") },
  resolved: { label: "Resolved", className: tint("paid") },
  escalated: { label: "Escalated", className: tint("review") },
};

const SEVERITY: Record<string, Style> = {
  low: { label: "Low", className: tint("paid") },
  medium: { label: "Medium", className: tint("plan") },
  high: { label: "High", className: tint("review") },
  critical: { label: "Critical", className: tint("review") },
};

const RESULT: Record<string, Style> = {
  success: { label: "Success", className: tint("paid") },
  pending: { label: "Pending", className: tint("plan") },
  failed: { label: "Failed", className: tint("review") },
};

const MAPS = {
  obligation: OBLIGATION,
  exception: EXCEPTION_STATUS,
  severity: SEVERITY,
  result: RESULT,
} as const;

const prettify = (v: string) => v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function StatusBadge({
  value,
  kind,
  className,
}: {
  value: string | null | undefined;
  kind: keyof typeof MAPS;
  className?: string;
}) {
  const key = (value ?? "").toLowerCase();
  const style = MAPS[kind][key] ?? {
    label: value ? prettify(value) : "—",
    className: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}

/** A small colored dot for the same status vocabulary (timeline rails etc.). */
export function StatusDot({
  result,
  className,
}: {
  result: string | null | undefined;
  className?: string;
}) {
  const key = (result ?? "").toLowerCase();
  const v = key === "success" ? "paid" : key === "failed" ? "review" : "plan";
  return <span className={cn("h-2.5 w-2.5 rounded-full", dot(v), className)} />;
}
