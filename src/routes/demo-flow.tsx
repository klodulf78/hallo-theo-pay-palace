import { createFileRoute } from "@tanstack/react-router";
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
import { useLang } from "@/lib/use-language";

export const Route = createFileRoute("/demo-flow")({
  head: () => ({
    meta: [
      { title: "How it works — hallo flow" },
      { name: "description", content: "End-to-end demo flow from tenant onboarding to dunning." },
    ],
  }),
  component: DemoFlowPage,
});

function DemoFlowPage() {
  const { t } = useLang();

  const PHASES = [
    {
      icon: UserPlus,
      title: t("demoFlowPage.phase1"),
      subtitle: t("demoFlowPage.phase1Sub"),
      gradient: "from-blue-50 to-blue-100",
      badgeBg: "bg-blue-500/10",
      iconColor: "text-blue-600",
    },
    {
      icon: CreditCard,
      title: t("demoFlowPage.phase2"),
      subtitle: t("demoFlowPage.phase2Sub"),
      gradient: "from-green-50 to-green-100",
      badgeBg: "bg-green-500/10",
      iconColor: "text-green-600",
    },
    {
      icon: AlertTriangle,
      title: t("demoFlowPage.phase3"),
      subtitle: t("demoFlowPage.phase3Sub"),
      gradient: "from-red-50 to-red-100",
      badgeBg: "bg-red-500/10",
      iconColor: "text-red-600",
    },
  ];

  const STAGES = [
    {
      stage: "0",
      title: t("demoFlowPage.stage0"),
      days: "—",
      fee: "0 €",
      cardBg: "bg-slate-100",
      badgeBg: "bg-slate-200",
      badgeText: "text-slate-700",
      titleText: "text-slate-700",
      metaText: "text-slate-500",
      border: "border border-slate-200",
      emphasized: false,
    },
    {
      stage: "1",
      title: t("demoFlowPage.stage1"),
      days: t("demoFlowPage.workDays"),
      fee: "5 €",
      cardBg: "bg-amber-50",
      badgeBg: "bg-amber-200",
      badgeText: "text-amber-800",
      titleText: "text-amber-900",
      metaText: "text-amber-700",
      border: "border border-amber-200",
      emphasized: false,
    },
    {
      stage: "2",
      title: t("demoFlowPage.stage2"),
      days: t("demoFlowPage.workDays"),
      fee: "10 €",
      cardBg: "bg-orange-100",
      badgeBg: "bg-orange-300",
      badgeText: "text-orange-900",
      titleText: "text-orange-950",
      metaText: "text-orange-800",
      border: "border border-orange-300",
      emphasized: false,
    },
    {
      stage: "3",
      title: t("demoFlowPage.stage3"),
      days: t("demoFlowPage.stage3Meta"),
      fee: t("demoFlowPage.stage3Fee"),
      cardBg: "bg-red-100",
      badgeBg: "bg-red-500",
      badgeText: "text-white",
      titleText: "text-red-950",
      metaText: "text-red-800",
      border: "border-2 border-red-500",
      emphasized: true,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-8 py-12 space-y-16">
      <header className="text-center space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t("demoFlowPage.title")}</h1>
        <p className="text-muted-foreground text-base">{t("demoFlowPage.subtitle")}</p>
      </header>

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
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{p.subtitle}</p>
                </Card>
                {i < PHASES.length - 1 && (
                  <ChevronRight size={32} className="text-muted-foreground shrink-0 rotate-90 md:rotate-0" />
                )}
              </div>
            );
          })}
        </div>
      </section>

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

      <section className="flex flex-wrap justify-center gap-3">
        <Badge variant="secondary" className="gap-2 px-3 py-1.5 text-xs font-normal">
          <Scale size={14} />
          {t("demoFlowPage.interestPill")}
        </Badge>
        <Badge variant="secondary" className="gap-2 px-3 py-1.5 text-xs font-normal">
          <RotateCw size={14} />
          {t("demoFlowPage.idempotentPill")}
        </Badge>
        <Badge variant="secondary" className="gap-2 px-3 py-1.5 text-xs font-normal">
          <Zap size={14} />
          {t("demoFlowPage.sepaPill")}
        </Badge>
      </section>
    </div>
  );
}
