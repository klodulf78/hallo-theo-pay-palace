import { describe, expect, it } from "vitest";
import {
  type ClaimInput,
  type DunningPolicy,
  computeDefaultInterest,
  contractualDeadline,
  decideClaimAction,
} from "./dunning-logic.ts";

const POLICY: DunningPolicy = {
  basiszinssatz: 0.0327,
  defaultInterestSurcharge: 0.05,
  stage1Fee: 5.0,
  stage2Fee: 10.0,
  stage1DeadlineWorkingDays: 14,
  stage2DeadlineWorkingDays: 14,
  stage3ArrearsThreshold: 2,
  sepaChargebackFee: 5.0,
  defaultGraceWorkingDays: 1,
  defaultDueWorkingDay: 3,
};

function baseClaim(over: Partial<ClaimInput> = {}): ClaimInput {
  return {
    id: "claim-1",
    tenantId: "tenant-1",
    amount: 1000,
    monthlyRent: 1000,
    dueDate: "2026-05-01",
    status: "pending",
    dunningStage: 0,
    defaultSince: null,
    accruedDunningFees: 0,
    accruedDefaultInterest: 0,
    hadSepaChargeback: false,
    existingNotices: { 1: undefined, 2: undefined, 3: undefined },
    hasActivePaymentPlan: false,
    hasOpenHumanException: false,
    ...over,
  };
}

const NO_ARREARS = { openArrearsAmount: 0 };
const TWO_RENTS_ARREARS = { openArrearsAmount: 2000 };

describe("contractualDeadline", () => {
  it("falls back to § 556b BGB (3rd working day) when due_day is null", () => {
    const d = contractualDeadline("2026-05-01", null, POLICY);
    expect(d.toISOString().slice(0, 10)).toBe("2026-05-05"); // 3rd WT of May 2026
  });
  it("uses the contractual due_day when set", () => {
    const d = contractualDeadline("2026-05-01", 1, POLICY);
    expect(d.toISOString().slice(0, 10)).toBe("2026-05-01"); // Fri
  });
  it("clamps a weekend due_day to the next working day", () => {
    const d = contractualDeadline("2026-05-01", 9, POLICY); // 9 May = Sat
    expect(d.toISOString().slice(0, 10)).toBe("2026-05-11"); // → Mon
  });
});

describe("computeDefaultInterest (§ 288 Abs. 1 BGB)", () => {
  it("matches a hand-checked example: €1000, 30 days, 3.27% base + 5%", () => {
    // rate = 0.0827, days = 30, principal = 1000
    // 1000 * 0.0827 * 30 / 365 = 6.797... → 6.80
    const r = computeDefaultInterest(1000, POLICY, "2026-04-06", "2026-05-06");
    expect(r.defaultDaysCalendar).toBe(30);
    expect(r.interest).toBe(6.8);
  });
  it("returns 0 when asOf is on or before default_since", () => {
    const r = computeDefaultInterest(1000, POLICY, "2026-05-06", "2026-05-06");
    expect(r.interest).toBe(0);
    expect(r.defaultDaysCalendar).toBe(0);
  });
});

describe("Stage 1 trigger", () => {
  it("fires on default_since (T+1 WT after contractual deadline) with historical issued_date", () => {
    // due_day=null → deadline = Tue 5 May. default_since = +1 WT = Wed 6 May.
    // Run dunning later (15 May) — issued_date should backdate to default_since.
    const action = decideClaimAction(baseClaim(), NO_ARREARS, POLICY, null, "2026-05-15");
    expect(action.kind).toBe("issue_stage");
    if (action.kind === "issue_stage") {
      expect(action.stage).toBe(1);
      expect(action.mahngebuehr).toBe(5);
      expect(action.newDefaultSince).toBe("2026-05-06");
      expect(action.issuedDate).toBe("2026-05-06");
      // deadline = issued + 14 WT = Wed 6 May + 14 WT = Tue 26 May
      expect(action.deadlineDate).toBe("2026-05-26");
    }
  });
  it("caps issued_date at asOf when defaultSince is in the future of the run", () => {
    // Run on default_since day itself → issued = asOf = default_since.
    const action = decideClaimAction(baseClaim(), NO_ARREARS, POLICY, null, "2026-05-06");
    expect(action.kind).toBe("issue_stage");
    if (action.kind === "issue_stage") {
      expect(action.issuedDate).toBe("2026-05-06");
    }
  });
  it("does NOT fire before default_since", () => {
    const action = decideClaimAction(baseClaim(), NO_ARREARS, POLICY, null, "2026-05-05");
    expect(action.kind).toBe("noop");
  });
  it("fires immediately on SEPA Rücklastschrift even before default_since", () => {
    // Before deadline: SEPA chargeback should still trigger Stage 1.
    const action = decideClaimAction(
      baseClaim({ hadSepaChargeback: true }),
      NO_ARREARS,
      POLICY,
      null,
      "2026-05-04", // before deadline
    );
    expect(action.kind).toBe("issue_stage");
    if (action.kind === "issue_stage") {
      expect(action.stage).toBe(1);
      // Chargeback fee added.
      expect(action.mahngebuehr).toBe(10);
      expect(action.verzugsnachweis.trigger).toBe("sepa_chargeback");
      // SEPA chargeback: issued_date stays at asOf (chargeback detection day).
      expect(action.issuedDate).toBe("2026-05-04");
    }
  });
  it("backdates SEPA Stage 1 to the actual chargeback date when asOf is later", () => {
    // Chargeback happened 2026-05-01; engine runs on 2026-06-01.
    // Expected: issued_date and default_since == 2026-05-01, not 2026-06-01.
    const action = decideClaimAction(
      baseClaim({
        hadSepaChargeback: true,
        sepaChargebackDate: "2026-05-01",
      }),
      NO_ARREARS,
      POLICY,
      null,
      "2026-06-01",
    );
    expect(action.kind).toBe("issue_stage");
    if (action.kind === "issue_stage") {
      expect(action.stage).toBe(1);
      expect(action.issuedDate).toBe("2026-05-01");
      expect(action.newDefaultSince).toBe("2026-05-01");
      expect(action.verzugsnachweis.trigger).toBe("sepa_chargeback");
    }
  });
});

describe("Idempotency", () => {
  it("re-running on the same date after Stage 1 issued = noop", () => {
    const action = decideClaimAction(
      baseClaim({
        dunningStage: 1,
        defaultSince: "2026-05-06",
        accruedDunningFees: 5,
        existingNotices: { 1: "2026-05-06", 2: undefined, 3: undefined },
      }),
      NO_ARREARS,
      POLICY,
      null,
      "2026-05-06",
    );
    expect(action.kind).toBe("noop");
  });
});

describe("Stage 1 → 2 transition", () => {
  it("does NOT fire Stage 2 before Stage 1 deadline", () => {
    const action = decideClaimAction(
      baseClaim({
        dunningStage: 1,
        defaultSince: "2026-05-06",
        accruedDunningFees: 5,
        existingNotices: { 1: "2026-05-06", 2: undefined, 3: undefined },
      }),
      NO_ARREARS,
      POLICY,
      null,
      "2026-05-25", // Mon — Stage 1 deadline is Tue 26 May
    );
    expect(action.kind).toBe("noop");
  });
  it("fires Stage 2 on the day Stage 1 deadline lapses", () => {
    const action = decideClaimAction(
      baseClaim({
        dunningStage: 1,
        defaultSince: "2026-05-06",
        accruedDunningFees: 5,
        existingNotices: { 1: "2026-05-06", 2: undefined, 3: undefined },
      }),
      NO_ARREARS,
      POLICY,
      null,
      "2026-05-26", // Stage 1 deadline date
    );
    expect(action.kind).toBe("issue_stage");
    if (action.kind === "issue_stage") {
      expect(action.stage).toBe(2);
      expect(action.mahngebuehr).toBe(10);
      // Fees accumulate: 5 (stage1) + 10 (stage2) = 15.
      expect(action.newAccruedFees).toBe(15);
      // Stage 2 deadline = 26 May + 14 WT = Mon 15 Jun.
      expect(action.deadlineDate).toBe("2026-06-15");
    }
  });
});

describe("Stage 2 → 3 transition", () => {
  const claim2Issued = baseClaim({
    dunningStage: 2,
    defaultSince: "2026-05-06",
    accruedDunningFees: 15,
    existingNotices: { 1: "2026-05-06", 2: "2026-05-26", 3: undefined },
  });

  it("does NOT fire Stage 3 when arrears < 2 monthly rents (even if deadline passed)", () => {
    const action = decideClaimAction(
      claim2Issued,
      { openArrearsAmount: 1500 }, // < 2 × 1000
      POLICY,
      null,
      "2026-06-15", // Stage 2 deadline
    );
    expect(action.kind).toBe("noop");
  });
  it("fires Stage 3 only when deadline passed AND arrears ≥ 2 monthly rents", () => {
    const action = decideClaimAction(claim2Issued, TWO_RENTS_ARREARS, POLICY, null, "2026-06-15");
    expect(action.kind).toBe("issue_stage");
    if (action.kind === "issue_stage") {
      expect(action.stage).toBe(3);
      expect(action.requiresHumanException).toBe(true);
      expect(action.verzugsnachweis.trigger).toBe("arrears_threshold_reached");
      // No extra Mahngebühr on Stage 3 — pre-escalation only.
      expect(action.mahngebuehr).toBe(0);
    }
  });
});

describe("Reset on payment", () => {
  it("resets dunning state when claim is paid", () => {
    const action = decideClaimAction(
      baseClaim({
        status: "paid",
        dunningStage: 2,
        defaultSince: "2026-05-06",
        accruedDunningFees: 15,
        accruedDefaultInterest: 6.8,
        existingNotices: { 1: "2026-05-06", 2: "2026-05-26", 3: undefined },
      }),
      NO_ARREARS,
      POLICY,
      null,
      "2026-06-01",
    );
    expect(action.kind).toBe("reset");
    if (action.kind === "reset") {
      expect(action.newDunningStage).toBe(0);
      expect(action.newDefaultSince).toBeNull();
      expect(action.newAccruedFees).toBe(0);
      expect(action.newAccruedInterest).toBe(0);
    }
  });
  it("is a noop for an already-clean paid claim", () => {
    const action = decideClaimAction(
      baseClaim({ status: "paid" }),
      NO_ARREARS,
      POLICY,
      null,
      "2026-06-01",
    );
    expect(action.kind).toBe("noop");
  });
});

describe("Exclusions", () => {
  it("skips claims in active payment_plan status", () => {
    const action = decideClaimAction(
      baseClaim({ status: "payment_plan" }),
      NO_ARREARS,
      POLICY,
      null,
      "2026-05-06",
    );
    expect(action.kind).toBe("noop");
    if (action.kind === "noop") expect(action.reason).toBe("payment_plan_active");
  });
  it("skips claims in human_review status", () => {
    const action = decideClaimAction(
      baseClaim({ status: "human_review" }),
      NO_ARREARS,
      POLICY,
      null,
      "2026-05-06",
    );
    expect(action.kind).toBe("noop");
    if (action.kind === "noop") expect(action.reason).toBe("human_review_active");
  });
  it("skips claims with an open human-needed exception", () => {
    const action = decideClaimAction(
      baseClaim({ hasOpenHumanException: true }),
      NO_ARREARS,
      POLICY,
      null,
      "2026-05-06",
    );
    expect(action.kind).toBe("noop");
  });
});
