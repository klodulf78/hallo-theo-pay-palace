/**
 * Offline verification of the recovery agent's decision logic — runs the REAL
 * exported functions (no DB, no Stripe). Confirms each seeded tenant's first
 * failure maps to the scripted action, plus the key guardrails.
 *
 * Run: bun scripts/verify-agent.ts
 */
import {
  computeRiskScore,
  decidePolicyAction,
  type RiskSignals,
} from "../src/lib/payment-recovery-agent.server";

// Behavior baselines (mirror RISK_BY_BEHAVIOR in the agent).
const BASE: Record<string, number> = {
  reliable: 10,
  soft_fail: 45,
  payment_plan: 72,
  critical: 91,
};

type Case = { name: string; behavior: string; rent: number; expect: string };
const roster: Case[] = [
  { name: "Hoffmann", behavior: "soft_fail", rent: 1200, expect: "retry_payment" },
  { name: "Nowak", behavior: "soft_fail", rent: 1350, expect: "retry_payment" },
  { name: "Kaya", behavior: "payment_plan", rent: 1200, expect: "offer_payment_plan" },
  { name: "Richter", behavior: "critical", rent: 1470, expect: "escalate_to_human" },
];

let fails = 0;
const line = (ok: boolean, msg: string) => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
};

console.log("— Per-tenant first-failure decision —");
for (const t of roster) {
  // Signals present on a real first failure: 1 failed attempt + outstanding rent,
  // plus the behavior baseline (the tier the demo relies on).
  const signals = {
    failedAttempts: 1,
    outstandingAmount: t.rent,
    behaviorBaseline: BASE[t.behavior],
  } as RiskSignals;
  const { score } = computeRiskScore(signals);
  const decision = decidePolicyAction({
    riskScore: score,
    attemptCount: 1,
    invoiceAmount: t.rent,
  });
  line(
    decision.name === t.expect,
    `${t.name.padEnd(9)} ${t.behavior.padEnd(13)} risk=${String(score).padStart(3)} -> ${decision.name} (expected ${t.expect})`,
  );
}

console.log("\n— Guardrails —");
line(
  decidePolicyAction({ riskScore: 40, attemptCount: 1, invoiceAmount: 1600 }).name ===
    "escalate_to_human",
  "amount > €1,500 -> escalate",
);
line(
  decidePolicyAction({ riskScore: 45, attemptCount: 2, invoiceAmount: 1200 }).name ===
    "offer_payment_plan",
  "second failure (attempt 2) -> offer plan",
);
line(
  decidePolicyAction({ riskScore: 90, attemptCount: 1, invoiceAmount: 1000 }).name ===
    "escalate_to_human",
  "risk >= 80 -> escalate",
);

console.log(fails === 0 ? "\n✅ ALL CHECKS PASS" : `\n❌ ${fails} CHECK(S) FAILED`);
process.exit(fails > 0 ? 1 : 0);
