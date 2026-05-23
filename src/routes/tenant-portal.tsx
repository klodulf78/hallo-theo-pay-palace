import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  UserCircle2,
  CreditCard,
  ShieldCheck,
  RefreshCw,
  CalendarClock,
  MessageSquare,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  getTenantPortal,
  type TenantPortalData,
  type TenantPortalPlan,
} from "@/lib/tenant-portal.functions";
import { acceptPaymentPlan, runExceptionAction } from "@/lib/recovery-actions.functions";
import { getExceptions } from "@/lib/exceptions.functions";
import { useCycle } from "@/lib/cycle-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/tenant-portal")({
  head: () => ({
    meta: [
      { title: "Tenant Portal — hallo flow" },
      { name: "description", content: "Tenant-facing portal." },
    ],
  }),
  component: TenantPortalPage,
});

const fmtEur = (n: number) =>
  `€${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

function TenantPortalPage() {
  const cycle = useCycle();
  const queryClient = useQueryClient();
  const portalFn = useServerFn(getTenantPortal);
  const acceptFn = useServerFn(acceptPaymentPlan);
  const retryFn = useServerFn(runExceptionAction);

  // Default Kaya (no tenantId). Optional switcher overrides this.
  const [tenantId, setTenantId] = useState<string | undefined>(undefined);

  const portal = useQuery({
    queryKey: ["tenant-portal", cycle, tenantId ?? "default"],
    queryFn: () => portalFn(tenantId ? { data: { tenantId } } : undefined),
    staleTime: 0,
  });

  // Tenant switcher options come from the exception queue (tenants the agent
  // touched). Secondary nicety — default Kaya works without it.
  const exceptions = useQuery({
    queryKey: ["exceptions", cycle],
    queryFn: () => getExceptions(),
    staleTime: 0,
  });
  const switcherTenants = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of exceptions.data ?? []) {
      if (!seen.has(e.tenantId)) seen.set(e.tenantId, e.tenantName);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [exceptions.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["tenant-portal"] });
    void queryClient.invalidateQueries({ queryKey: ["exceptions"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
    void queryClient.invalidateQueries({ queryKey: ["agent-actions"] });
  };

  const acceptMutation = useMutation({
    mutationFn: (planId: string) => acceptFn({ data: { planId } }),
    onSuccess: (res) => {
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      invalidate();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const retryMutation = useMutation({
    mutationFn: (exceptionId: string) => retryFn({ data: { exceptionId, action: "retry" } }),
    onSuccess: (res) => {
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      invalidate();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const data = portal.data ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Tenant Portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Self-service rent — resolve a missed payment without calling anyone.
          </p>
        </div>
        {switcherTenants.length > 0 && (
          <div className="w-56">
            <Select
              value={tenantId ?? "__default"}
              onValueChange={(v) => setTenantId(v === "__default" ? undefined : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="View as tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default">Kaya (default)</SelectItem>
                {switcherTenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Loading */}
      {portal.isLoading && (
        <div className="space-y-4">
          <Card className="p-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="mt-3 h-4 w-64" />
          </Card>
          <Card className="p-6">
            <Skeleton className="h-24 w-full" />
          </Card>
        </div>
      )}

      {/* Error */}
      {portal.isError && (
        <Card className="border-[var(--status-review)]/30 bg-[var(--status-review)]/5 p-6 text-sm text-[var(--status-review)]">
          <div className="font-medium">Couldn't load the tenant portal.</div>
          <div className="mt-1 text-[var(--status-review)]/80">
            {(portal.error as Error).message}
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => portal.refetch()}>
            Try again
          </Button>
        </Card>
      )}

      {/* No tenant */}
      {!portal.isLoading && !portal.isError && !data && (
        <Card className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <UserCircle2 className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">No tenant data</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Seed the demo and run a cycle to populate the tenant portal.
          </p>
        </Card>
      )}

      {data && (
        <PortalBody data={data} acceptMutation={acceptMutation} retryMutation={retryMutation} />
      )}
    </div>
  );
}

function PortalBody({
  data,
  acceptMutation,
  retryMutation,
}: {
  data: TenantPortalData;
  acceptMutation: ReturnType<typeof useMutation<unknown, Error, string>>;
  retryMutation: ReturnType<typeof useMutation<unknown, Error, string>>;
}) {
  const { tenant, obligation, sepaMandate, plans, latestMessage, exceptionId } = data;

  const offeredPlan = plans.find((p) => p.status === "offered") ?? null;

  const amountDue = obligation?.amountDue ?? tenant.rentAmount;
  const isOutstanding =
    !!obligation && ["failed", "human_review", "payment_plan"].includes(obligation.status);

  return (
    <>
      {/* Identity + rent status header */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <UserCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{tenant.name}</h2>
              <p className="text-xs text-muted-foreground">
                {[tenant.unitLabel, tenant.propertyName].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Monthly rent {fmtEur(tenant.rentAmount)} · {data.month}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Rent status
            </div>
            <div className="mt-1">
              {obligation ? (
                <StatusBadge value={obligation.status} kind="obligation" />
              ) : (
                <span className="text-sm text-muted-foreground">No obligation this month</span>
              )}
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            icon={CreditCard}
            label="Amount due"
            value={isOutstanding ? fmtEur(amountDue) : "€0"}
            tone={isOutstanding ? "danger" : "ok"}
          />
          <Field
            icon={CalendarClock}
            label="Due date"
            value={fmtDate(obligation?.dueDate ?? null)}
          />
          <Field
            icon={ShieldCheck}
            label="SEPA mandate"
            value={sepaMandate?.status ? sepaMandate.status.replace(/_/g, " ") : "Not set up"}
            sub={sepaMandate?.iban ?? sepaMandate?.mandateReference ?? undefined}
            tone={sepaMandate?.status === "active" ? "ok" : "neutral"}
          />
        </div>
      </Card>

      {/* Agent's latest message */}
      {latestMessage && (
        <Card className="border-l-4 border-l-primary/50 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            Message from your property manager
            {latestMessage.channel && (
              <span className="font-normal normal-case text-muted-foreground/80">
                · via {latestMessage.channel}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">{latestMessage.body}</p>
        </Card>
      )}

      {/* Offered payment plan */}
      {offeredPlan && (
        <PlanCard
          plan={offeredPlan}
          onAccept={() => acceptMutation.mutate(offeredPlan.id)}
          accepting={acceptMutation.isPending}
        />
      )}

      {/* Already-accepted plan summary (no action) */}
      {!offeredPlan && plans.some((p) => p.status === "accepted") && (
        <PlanCard plan={plans.find((p) => p.status === "accepted")!} accepted />
      )}

      {/* Actions */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold">Resolve your payment</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick the option that works for you. Most issues clear instantly — no support ticket
          needed.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            onClick={() => exceptionId && retryMutation.mutate(exceptionId)}
            disabled={!exceptionId || retryMutation.isPending}
            className="gap-2"
          >
            {retryMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Retry payment
          </Button>
          {/* Non-functional affordance for completeness */}
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => toast.info("Updating your payment method isn't available in this demo.")}
          >
            <CreditCard className="h-4 w-4" />
            Update payment method
          </Button>
        </div>
        {!exceptionId && (
          <p className="mt-3 text-xs text-muted-foreground">
            Nothing to retry — your rent for {data.month} isn't flagged.
          </p>
        )}
      </Card>
    </>
  );
}

function PlanCard({
  plan,
  onAccept,
  accepting,
  accepted,
}: {
  plan: TenantPortalPlan;
  onAccept?: () => void;
  accepting?: boolean;
  accepted?: boolean;
}) {
  return (
    <Card
      className={cn(
        "p-6",
        accepted
          ? "border-[var(--status-paid)]/30 bg-[var(--status-paid)]/5"
          : "border-[var(--status-plan)]/40 bg-[var(--status-plan)]/5",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock
            className={cn(
              "h-4 w-4",
              accepted ? "text-[var(--status-paid)]" : "text-[var(--status-plan)]",
            )}
          />
          <h3 className="text-sm font-semibold">
            {accepted ? "Your payment plan" : "Offered payment plan"}
          </h3>
        </div>
        <span className="text-sm font-bold tabular-nums">
          {fmtEur(plan.totalAmount)} total · {plan.installmentCount ?? plan.installments.length}{" "}
          parts
        </span>
      </div>

      <ol className="mt-4 space-y-2">
        {plan.installments.map((inst) => (
          <li
            key={inst.id}
            className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {inst.sequence}
              </span>
              <span className="font-medium tabular-nums">{fmtEur(inst.amount)}</span>
              <span className="text-xs text-muted-foreground">due {fmtDate(inst.dueDate)}</span>
            </span>
            {inst.status && <StatusBadge value={inst.status} kind="result" />}
          </li>
        ))}
      </ol>

      {accepted ? (
        <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--status-paid)]">
          <CheckCircle2 className="h-4 w-4" />
          Plan accepted — thank you.
        </div>
      ) : (
        <Button onClick={onAccept} disabled={accepting} className="mt-4 gap-2">
          {accepting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Accept {plan.installmentCount ?? plan.installments.length}-Part Plan
        </Button>
      )}
    </Card>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: typeof CreditCard;
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "danger" | "neutral";
}) {
  const valueTone =
    tone === "ok"
      ? "text-[var(--status-paid)]"
      : tone === "danger"
        ? "text-[var(--status-review)]"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-card/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={cn("mt-1 text-base font-semibold capitalize", valueTone)}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
