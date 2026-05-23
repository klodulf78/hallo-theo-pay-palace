import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import {
  UserPlus,
  CreditCard,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/demo-flow")({
  head: () => ({
    meta: [
      { title: "Demo-Ablauf — hallo flow" },
      { name: "description", content: "End-to-end Demo-Ablauf von Mieter-Onboarding bis Mahnung." },
    ],
  }),
  component: DemoFlowPage,
});

const PHASES = [
  {
    icon: UserPlus,
    title: "1. Mieter aufnehmen",
    subtitle: "Onboarding + SEPA-Mandat",
    color: "text-blue-600",
    bg: "bg-blue-50",
    ring: "ring-blue-200",
  },
  {
    icon: CreditCard,
    title: "2. SEPA einziehen",
    subtitle: "Lastschrift via Stripe, Webhook meldet Erfolg/Fehler",
    color: "text-green-600",
    bg: "bg-green-50",
    ring: "ring-green-200",
  },
  {
    icon: AlertTriangle,
    title: "3. Automatisch mahnen",
    subtitle: "Stage 1 → 2 → 3 nach Werktag-Fristen",
    color: "text-red-600",
    bg: "bg-red-50",
    ring: "ring-red-200",
  },
];

const STAGES = [
  { label: "0. Pünktlich", color: "bg-slate-300", text: "text-slate-800", h: "h-20" },
  { label: "1. Mahnung · 14 WT · 5€", color: "bg-yellow-300", text: "text-yellow-900", h: "h-32" },
  { label: "2. Mahnung · 14 WT · 10€", color: "bg-orange-400", text: "text-orange-950", h: "h-44" },
  { label: "3. Eskalation · Mensch übernimmt", color: "bg-red-500", text: "text-white", h: "h-56" },
];

function DemoFlowPage() {
  return (
    <AppShell>
      <div className="h-[calc(100vh-3.5rem)] flex flex-col px-10 py-8 gap-8 overflow-hidden">
        {/* Section 1: 3-Phasen-Flow */}
        <section className="flex items-stretch gap-4">
          {PHASES.map((p, i) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="flex items-center gap-4 flex-1">
                <Card className={`flex-1 p-8 ring-1 ${p.ring} ${p.bg} flex flex-col items-center text-center gap-4 shadow-sm`}>
                  <Icon className={`h-20 w-20 ${p.color}`} strokeWidth={1.5} />
                  <h2 className="text-2xl font-semibold text-slate-900">{p.title}</h2>
                  <p className="text-sm text-slate-600 leading-snug">{p.subtitle}</p>
                </Card>
                {i < PHASES.length - 1 && (
                  <ArrowRight className="h-10 w-10 text-slate-400 shrink-0" strokeWidth={2} />
                )}
              </div>
            );
          })}
        </section>

        {/* Section 2: Mahnstufen-Treppe */}
        <section className="flex-1 flex flex-col">
          <div className="flex items-end gap-4 flex-1 max-h-[340px]">
            {STAGES.map((s) => (
              <div key={s.label} className="flex-1 flex flex-col items-center justify-end gap-3">
                <span className={`text-sm font-medium ${s.text === "text-white" ? "text-slate-900" : "text-slate-700"} text-center`}>
                  {s.label}
                </span>
                <div className={`w-full ${s.h} ${s.color} rounded-t-lg shadow-md`} />
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="text-xs text-slate-500 text-center border-t pt-3">
          Verzugszinsen nach § 288 BGB · idempotent · SEPA-Rücklastschrift triggert Stufe 1 sofort
        </footer>
      </div>
    </AppShell>
  );
}
