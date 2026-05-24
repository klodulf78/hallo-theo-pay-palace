import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  UserPlus,
  CreditCard,
  AlertTriangle,
  Banknote,
  FileX2,
  Users2,
  EyeOff,
  Zap,
  ShieldCheck,
  TrendingUp,
  ArrowRight,
  Building2,
  Repeat,
  Bell,
  Scale,
  Sparkles,
  PlayCircle,
} from "lucide-react";

export const Route = createFileRoute("/pitch")({
  head: () => ({
    meta: [
      { title: "hallo flow — Pitch Deck" },
      { name: "description", content: "Fully autonomous payment operations for property management." },
    ],
  }),
  component: PitchDeck,
});

// ---------- Shell ----------

function PitchDeck() {
  const [idx, setIdx] = useState(0);
  const total = SLIDES.length;

  const next = useCallback(() => setIdx((i) => Math.min(total - 1, i + 1)), [total]);
  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        prev();
      } else if (/^[1-9]$/.test(e.key)) {
        const n = parseInt(e.key, 10) - 1;
        if (n < total) setIdx(n);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, total]);

  const Slide = SLIDES[idx];

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-blue-50 text-slate-900 overflow-hidden">
      <div className="relative mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 py-6 md:px-10 md:py-10">
        <header className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
          <span className="font-semibold text-slate-700">hallo flow</span>
          <span>{String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
        </header>

        <main className="flex-1 flex items-center">
          <div key={idx} className="w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
            <Slide />
          </div>
        </main>

        <footer className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-10 bg-blue-600" : "w-4 bg-slate-300 hover:bg-slate-400"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={prev}
              disabled={idx === 0}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button
              onClick={next}
              disabled={idx === total - 1}
              className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-40"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ---------- Reusable ----------

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
      {children}
    </div>
  );
}

function Headline({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-5xl md:text-6xl font-semibold tracking-tight text-slate-900 leading-[1.05]">
      {children}
    </h1>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] ${className}`}
    >
      {children}
    </div>
  );
}

// ---------- Slides ----------

function SlideTitle() {
  return (
    <div className="grid gap-10">
      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-slate-500">
        <span className="inline-block h-2 w-2 rounded-full bg-blue-600" />
        hallo theo · Berlin
      </div>

      <div className="space-y-6">
        <h1 className="text-7xl md:text-[120px] font-semibold tracking-tight leading-[0.95] text-slate-900">
          hallo <span className="text-blue-600">flow</span>
        </h1>
        <p className="max-w-2xl text-2xl md:text-3xl text-slate-600 leading-snug">
          Fully autonomous payment operations
          <br />
          for property management.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
          <Sparkles className="h-4 w-4 text-blue-600" />
          Stripe Hackathon 2026
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-blue-600/10 px-4 py-2 text-sm font-medium text-blue-700">
          Live demo inside
        </span>
      </div>
    </div>
  );
}

function SlideProblem() {
  const cards = [
    {
      n: "01",
      icon: Banknote,
      title: "Manual rent collection",
      body: "Every payment manually matched, confirmed and forwarded — via email and Excel.",
    },
    {
      n: "02",
      icon: FileX2,
      title: "Dunning by hand",
      body: "3–5 reminder letters per month, manually tracked, no automatic retries on failure.",
    },
    {
      n: "03",
      icon: Users2,
      title: "Manual owner payouts",
      body: "Calculate net amount, transfer, document — per property, every single month.",
    },
    {
      n: "04",
      icon: EyeOff,
      title: "Zero real-time overview",
      body: "Who paid? What’s outstanding? What’s been disbursed? No central visibility.",
    },
  ];
  return (
    <div className="grid gap-8">
      <div className="space-y-3">
        <Eyebrow>The Problem</Eyebrow>
        <Headline>
          Property management is
          <br />
          <span className="text-red-600">payment chaos.</span>
        </Headline>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((c) => (
          <Card key={c.n} className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <c.icon className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-mono text-slate-400">{c.n}</span>
                <h3 className="text-lg font-semibold text-slate-900">{c.title}</h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{c.body}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4">
        <p className="text-sm text-amber-900 leading-relaxed max-w-3xl">
          Especially painful when acquiring a new property management company —
          every takeover means cleaning up new chaos from scratch, manually, without a system.
        </p>
        <div className="shrink-0 text-right">
          <div className="text-3xl font-semibold text-amber-700">0</div>
          <div className="text-[10px] uppercase tracking-widest text-amber-700/80">automation</div>
        </div>
      </div>
    </div>
  );
}

function FlowNode({
  step,
  icon: Icon,
  title,
  lines,
  tone = "blue",
}: {
  step: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  lines: string[];
  tone?: "blue" | "green" | "red" | "slate";
}) {
  const tones = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    green: "bg-green-50 border-green-200 text-green-700",
    red: "bg-red-50 border-red-200 text-red-700",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
  } as const;
  return (
    <div className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm min-w-[180px]">
      <div className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tones[tone]}`}>
        <Icon className="h-3 w-3" />
        {step}
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-900 leading-tight">{title}</div>
      <ul className="mt-1.5 space-y-0.5">
        {lines.map((l, i) => (
          <li key={i} className="text-[11px] text-slate-500 leading-snug">{l}</li>
        ))}
      </ul>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center justify-center text-slate-300 shrink-0">
      <ArrowRight className="h-5 w-5" />
    </div>
  );
}

function SlideSolution() {
  return (
    <div className="grid gap-6">
      <div className="space-y-3">
        <Eyebrow>The Solution</Eyebrow>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-slate-900 leading-tight">
          hallo flow — <span className="text-blue-600">fully automated.</span>
        </h1>
        <div className="flex flex-wrap gap-2">
          {["Stripe Billing", "Stripe Connect", "Webhooks"].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-blue-600/10 px-3 py-1 text-xs font-medium text-blue-700">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Main flow */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <FlowNode step="1" icon={Building2} title="Acquire mgmt." lines={["Hallo Theo onboards", "new tenants & portfolio"]} tone="slate" />
          <Arrow />
          <FlowNode step="2" icon={UserPlus} title="Tenant onboarding" lines={["Create Stripe Customer", "SEPA mandate · Credit card"]} tone="blue" />
          <Arrow />
          <FlowNode step="3" icon={Repeat} title="Monthly SEPA run" lines={["Stripe Billing · Cron", "1st of every month"]} tone="blue" />
          <Arrow />
          <FlowNode step="4" icon={Banknote} title="Owner payout" lines={["Stripe Connect · Express", "Net of mgmt. fee"]} tone="green" />
          <Arrow />
          <FlowNode step="5" icon={ShieldCheck} title="Reconciliation" lines={["Full audit log", "all parties · real-time"]} tone="green" />
        </div>

        {/* Dunning branch */}
        <div className="mt-5 rounded-xl border border-dashed border-red-200 bg-red-50/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Smart Dunning — on payment failure
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <FlowNode step="A" icon={Repeat} title="Auto-retry" lines={["Day 3 → 7 → 14", "exponential backoff"]} tone="red" />
            <Arrow />
            <FlowNode step="B" icon={Bell} title="Reminder" lines={["Automated email", "Late fee calculation"]} tone="red" />
            <Arrow />
            <FlowNode step="C" icon={Scale} title="Escalation" lines={["PM notification", "Legal action"]} tone="red" />
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-slate-500">
        hallo flow · fully event-driven via Stripe Webhooks
      </p>
    </div>
  );
}

function SlideDemo() {
  const steps = [
    { n: 1, title: "Add tenant", body: "Create Stripe customer + SEPA mandate in one click." },
    { n: 2, title: "Start SEPA run", body: "Trigger Stripe Billing for the active month." },
    { n: 3, title: "Let payment fail", body: "Critical profile uses pm_card_chargeDeclined." },
    { n: 4, title: "Watch reminder trigger live", body: "Stage 1 → 2 → 3 escalation, fully automated." },
  ];

  return (
    <div className="grid gap-8">
      <div className="space-y-3">
        <Eyebrow>Live Demo</Eyebrow>
        <Headline>
          No more chaos.
          <br />
          <span className="text-blue-600">Just flow.</span>
        </Headline>
        <a
          href="https://hallo-theo-pay-palace.lovable.app"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-mono text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <PlayCircle className="h-4 w-4 text-blue-600" />
          hallo-theo-pay-palace.lovable.app
          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {steps.map((s) => (
          <Card key={s.n} className="relative">
            <div className="text-5xl font-semibold text-blue-600/15 leading-none">
              {String(s.n).padStart(2, "0")}
            </div>
            <div className="mt-2 text-base font-semibold text-slate-900">{s.title}</div>
            <p className="mt-1 text-sm text-slate-600 leading-snug">{s.body}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        <Chip icon={Zap} label="Fully automated" tone="blue" />
        <Chip icon={ShieldCheck} label="Stripe-native" tone="green" />
        <Chip icon={TrendingUp} label="Scalable" tone="slate" />
      </div>
    </div>
  );
}

function Chip({
  icon: Icon,
  label,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: "blue" | "green" | "slate";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-green-50 text-green-700 border-green-200",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
  } as const;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${tones[tone]}`}>
      <Icon className="h-4 w-4" />
      {label}
    </span>
  );
}

const SLIDES = [SlideTitle, SlideProblem, SlideSolution, SlideDemo];
