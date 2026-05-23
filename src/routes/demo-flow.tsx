import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  UserPlus,
  CreditCard,
  AlertTriangle,
  ChevronRight,
  Clock,
  Euro,
  Scale,
  RotateCw,
  Zap,
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
    gradient: "from-blue-50 to-blue-100",
    badgeBg: "bg-blue-500/10",
    iconColor: "text-blue-600",
  },
  {
    icon: CreditCard,
    title: "2. SEPA einziehen",
    subtitle: "Lastschrift via Stripe, Webhook meldet Erfolg/Fehler",
    gradient: "from-green-50 to-green-100",
    badgeBg: "bg-green-500/10",
    iconColor: "text-green-600",
  },
  {
    icon: AlertTriangle,
    title: "3. Automatisch mahnen",
    subtitle: "Stage 1 → 2 → 3 nach Werktag-Fristen",
    gradient: "from-red-50 to-red-100",
    badgeBg: "bg-red-500/10",
    iconColor: "text-red-600",
  },
];

const STAGES = [
  {
    stage: "0",
    title: "Pünktlich",
    days: "—",
    fee: "0 €",
    cardBg: "bg-slate-100",
    badgeBg: "bg-slate-200",
    badgeText: "text-slate-700",
    titleText: "text-slate-700",
    metaText: "text-slate-500",
    border: "border border-slate-200",
  },
  {
    stage: "1",
    title: "1. Mahnung",
    days: "14 Werktage",
    fee: "5 €",
    cardBg: "bg-amber-50",
    badgeBg: "bg-amber-200",
    badgeText: "text-amber-800",
    titleText: "text-amber-900",
    metaText: "text-amber-700",
    border: "border border-amber-200",
  },
  {
    stage: "2",
    title: "2. Mahnung",
    days: "14 Werktage",
    fee: "10 €",
    cardBg: "bg-orange-100",
    badgeBg: "bg-orange-300",
    badgeText: "text-orange-900",
    titleText: "text-orange-950",
    metaText: "text-orange-800",
    border: "border border-orange-300",
  },
  {
    stage: "3",
    title: "Eskalation",
    days: "Mensch übernimmt",
    fee: "Inkasso",
    cardBg: "bg-red-100",
    badgeBg: "bg-red-500",
    badgeText: "text-white",
    titleText: "text-red-950",
    metaText: "text-red-800",
    border: "border-2 border-red-500",
    emphasized: true,
  },
];

function DemoFlowPage() {
  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-16">
        {/* Header */}
        <header className="text-center space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Wie hallo flow funktioniert
          </h1>
          <p className="text-muted-foreground text-base">
            Vom Onboarding bis zur Eskalation — eine autonome Pipeline
          </p>
        </header>

        {/* Section 1: 3-Phasen-Flow */}
        <section className="space-y-4">
          <div className="flex flex-col md:flex-row items-stretch gap-6">
            {PHASES.map((p, i) => {
              const Icon = p.icon;
              return (
                <div key={p.title} className="flex flex-col md:flex-row items-center gap-4 flex-1">
                  <Card
                    className={`flex-1 w-full p-8 bg-gradient-to-br ${p.gradient} border shadow-sm hover:shadow-md transition-shadow`}
                  >
                    <div className={`rounded-full w-16 h-16 flex items-center justify-center ${p.badgeBg}`}>
                      <Icon className={`${p.iconColor}`} size={32} strokeWidth={2} />
                    </div>
                    <h3 className="text-xl font-semibold mt-4 text-slate-900">{p.title}</h3>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                      {p.subtitle}
                    </p>
                  </Card>
                  {i < PHASES.length - 1 && (
                    <ChevronRight
                      size={32}
                      className="text-muted-foreground shrink-0 rotate-90 md:rotate-0"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 2: Mahnstufen-Kaskade */}
        <section className="space-y-4">
          <div className="flex flex-col md:flex-row items-stretch gap-3">
            {STAGES.map((s, i) => (
              <div key={s.stage} className="flex flex-col md:flex-row items-center gap-2 flex-1">
                <Card
                  className={`flex-1 w-full p-5 ${s.cardBg} ${s.border} shadow-sm ${
                    s.emphasized ? "md:scale-[1.03]" : ""
                  } transition-transform`}
                >
                  <div className="flex flex-col items-center text-center gap-3">
                    <div
                      className={`rounded-full w-12 h-12 flex items-center justify-center ${s.badgeBg} ${s.badgeText} font-bold text-lg`}
                    >
                      {s.stage}
                    </div>
                    <div className={`font-semibold ${s.titleText}`}>{s.title}</div>
                    <div className={`flex items-center gap-2 text-xs ${s.metaText}`}>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={12} />
                        {s.days}
                      </span>
                      <span className="opacity-40">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Euro size={12} />
                        {s.fee}
                      </span>
                    </div>
                  </div>
                </Card>
                {i < STAGES.length - 1 && (
                  <div className="hidden md:flex items-center">
                    <div className="w-3 h-px bg-border" />
                    <ChevronRight size={18} className="text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Info pills */}
        <section className="flex flex-wrap justify-center gap-3">
          <Badge variant="secondary" className="gap-2 px-3 py-1.5 text-xs font-normal">
            <Scale size={14} />
            Verzugszinsen § 288 BGB
          </Badge>
          <Badge variant="secondary" className="gap-2 px-3 py-1.5 text-xs font-normal">
            <RotateCw size={14} />
            Idempotent
          </Badge>
          <Badge variant="secondary" className="gap-2 px-3 py-1.5 text-xs font-normal">
            <Zap size={14} />
            SEPA-Rücklastschrift → sofort Stufe 1
          </Badge>
        </section>
      </div>
    </AppShell>
  );
}
