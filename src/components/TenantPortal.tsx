import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { useHalloFlow } from "@/lib/store";
import { PaymentPlanCard } from "./PaymentPlanCard";
import { AlertCircle, ArrowLeft, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

export function TenantPortal({ tenantId }: { tenantId: string }) {
  const { state, acceptPlan } = useHalloFlow();
  const tenant = state.tenants.find((t) => t.id === tenantId);
  const plan = state.plans.find((p) => p.tenantId === tenantId);

  if (!tenant) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 px-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900">Tenant not found</h1>
          <Link to="/admin" className="text-blue-600 hover:underline mt-2 inline-block">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const accepted = tenant.status === "payment_plan_accepted";
  const hasFailedPayment = tenant.status === "payment_plan_offered" || accepted;

  const stub = (label: string) => () => toast.info(`${label} — coming soon`);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Link
            to="/admin"
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="size-4" />
            Back to admin
          </Link>
          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
            <ShieldCheck className="size-3 mr-1" />
            hallo flow tenant portal
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
        <section>
          <h1 className="text-3xl font-semibold text-slate-900">Hi {tenant.name}</h1>
          <p className="text-slate-500 mt-1">
            Unit {tenant.unit} · {state.property.name}
          </p>
        </section>

        {hasFailedPayment ? (
          <Alert className="border-red-200 bg-red-50 text-red-900">
            <AlertCircle className="size-4 text-red-600" />
            <AlertTitle>Your May rent payment didn't go through</AlertTitle>
            <AlertDescription>
              Your bank declined the charge for <strong>{fmtEur(tenant.rent)}</strong>. No worries —
              we&apos;ve prepared options for you below.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
            <ShieldCheck className="size-4 text-emerald-600" />
            <AlertTitle>You&apos;re all set</AlertTitle>
            <AlertDescription>
              Your rent is up to date. There&apos;s nothing to do here right now.
            </AlertDescription>
          </Alert>
        )}

        <Card className="border-slate-200/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-900">May rent</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-semibold text-slate-900">{fmtEur(tenant.rent)}</div>
              <div className="text-xs text-slate-500 mt-1">Due now</div>
            </div>
            <Badge
              variant="outline"
              className={
                accepted
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }
            >
              {accepted ? "Payment Plan Accepted" : "Payment plan offered"}
            </Badge>
          </CardContent>
        </Card>

        <PaymentPlanCard plan={plan} />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button
            onClick={() => {
              if (accepted) {
                toast.info("Plan already accepted");
                return;
              }
              acceptPlan(tenant.id);
              toast.success("Payment plan accepted", {
                description: "First installment scheduled, second will run next Friday.",
              });
            }}
            disabled={accepted}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {accepted ? "Plan accepted" : "Accept Payment Plan"}
          </Button>
          <Button variant="outline" onClick={stub("Retry payment")}>
            <RefreshCw className="size-4 mr-1.5" />
            Retry Payment Now
          </Button>
          <Button variant="ghost" onClick={stub("Contact property manager")}>
            <MessageCircle className="size-4 mr-1.5" />
            Contact Property Manager
          </Button>
        </div>

        <p className="text-xs text-slate-400 text-center pt-4">
          Powered by hallo flow · autonomous rent collection
        </p>
      </main>
    </div>
  );
}
