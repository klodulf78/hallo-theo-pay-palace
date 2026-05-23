// Pure dunning-state-machine logic. No I/O — easy to unit-test.
//
// Stages 1–3 per rent_obligation (one claim = one month). Reset on full pay.
// Stage transitions use working-day (Werktag) deadlines. § 288 Abs. 1 BGB
// default interest accrues from default_since to "today".
//
// Spec ref: see dunning task description in repo README/PR.

import {
  addWorkingDays,
  isWorkingDay,
  nthWorkingDayOfMonth,
  toIsoDate,
} from "./working-days.ts";

// ---------- Types ----------

export type DunningPolicy = {
  basiszinssatz: number; // e.g. 0.0327 (Bundesbank base rate)
  defaultInterestSurcharge: number; // § 288 Abs. 1 BGB = 0.05 for consumers
  stage1Fee: number;
  stage2Fee: number;
  stage1DeadlineWorkingDays: number;
  stage2DeadlineWorkingDays: number;
  stage3ArrearsThreshold: number; // N monthly rents
  sepaChargebackFee: number;
  defaultGraceWorkingDays: number; // +1 WT joker
  defaultDueWorkingDay: number; // § 556b BGB fallback (3rd WT)
};

export type ClaimInput = {
  id: string;
  tenantId: string;
  amount: number; // open principal of the claim (rent for the month)
  monthlyRent: number; // tenant's contractual monthly rent
  dueDate: string; // ISO YYYY-MM-DD from rent_obligations.due_date
  status:
    | "pending"
    | "paid"
    | "reconciled"
    | "failed"
    | "auto_recovered"
    | "payment_plan"
    | "human_review";
  dunningStage: 0 | 1 | 2 | 3;
  defaultSince: string | null; // ISO date
  accruedDunningFees: number;
  accruedDefaultInterest: number;
  // Has any SEPA Rücklastschrift hit this claim (returned debit)?
  hadSepaChargeback: boolean;
  // Existing dunning_notices stages already issued for this claim,
  // keyed by stage number → issued_date (ISO YYYY-MM-DD).
  existingNotices: Record<1 | 2 | 3, string | undefined>;
  // Tenant has an accepted/active payment_plan covering this claim?
  hasActivePaymentPlan: boolean;
  // Already-issued exceptions with human_needed=true for this claim?
  hasOpenHumanException: boolean;
};

export type TenantArrearsInput = {
  // Sum of open principal across all unpaid claims for the tenant.
  openArrearsAmount: number;
};

export type StageAction =
  | {
      kind: "issue_stage";
      stage: 1 | 2 | 3;
      issuedDate: string;
      deadlineDate: string;
      mahngebuehr: number;
      defaultInterestSnapshot: number;
      verzugsnachweis: VerzugsnachweisSnapshot;
      // Updates to apply to rent_obligations row:
      newDunningStage: 1 | 2 | 3;
      newDefaultSince: string;
      newAccruedFees: number;
      newAccruedInterest: number;
      // For Stage 3 we ALSO create an exceptions case-file row.
      requiresHumanException: boolean;
    }
  | {
      kind: "reset";
      newDunningStage: 0;
      newDefaultSince: null;
      newAccruedFees: 0;
      newAccruedInterest: 0;
    }
  | { kind: "noop"; reason: string };

export type VerzugsnachweisSnapshot = {
  rent_obligation_id: string;
  tenant_id: string;
  stage: 1 | 2 | 3;
  expected_amount: number;
  received_amount: number; // 0 unless we have partial-payment data
  open_amount: number;
  basiszinssatz: number;
  default_interest_surcharge: number;
  default_since: string;
  as_of: string;
  default_days_calendar: number;
  default_interest: number;
  mahngebuehr: number;
  trigger: "deadline_passed" | "sepa_chargeback" | "arrears_threshold_reached";
};

// ---------- Helpers ----------

/**
 * Contractual payment deadline for a claim.
 *
 * If the tenant's contractual due_day is known, use that day in the claim's
 * month — clamped to the next working day if it lands on a weekend.
 * Otherwise fall back to § 556b BGB = 3rd working day of the month.
 */
export function contractualDeadline(
  dueDate: string,
  tenantDueDay: number | null,
  policy: DunningPolicy,
): Date {
  const [y, m] = dueDate.split("-").map(Number);
  if (tenantDueDay && tenantDueDay >= 1 && tenantDueDay <= 31) {
    const candidate = new Date(Date.UTC(y, m - 1, tenantDueDay));
    // Clamp to next working day if it lands on a weekend.
    return isWorkingDay(candidate) ? candidate : addWorkingDays(candidate, 0);
  }
  return nthWorkingDayOfMonth(y, m, policy.defaultDueWorkingDay);
}

/**
 * "default_since" = first working day on which the claim counts as in default.
 * = contractualDeadline + (1 + defaultGraceWorkingDays - 1) WT.
 * Spec: "default_since = deadline + 1 working day (+1 Werktag joker)".
 */
export function computeDefaultSince(contractualDeadline: Date, policy: DunningPolicy): Date {
  return addWorkingDays(contractualDeadline, policy.defaultGraceWorkingDays);
}

/** § 288 Abs. 1 BGB simple-interest calculation. Calendar days, no compounding. */
export function computeDefaultInterest(
  openAmount: number,
  policy: DunningPolicy,
  defaultSince: string,
  asOf: string,
): { defaultDaysCalendar: number; interest: number } {
  const since = new Date(`${defaultSince}T00:00:00Z`);
  const now = new Date(`${asOf}T00:00:00Z`);
  const ms = now.getTime() - since.getTime();
  const days = Math.max(0, Math.floor(ms / 86_400_000));
  const rate = policy.basiszinssatz + policy.defaultInterestSurcharge;
  const interest = round2((openAmount * rate * days) / 365);
  return { defaultDaysCalendar: days, interest };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- The state machine ----------

/**
 * Decide what (if anything) to do for one claim, given the current Time-Machine
 * date. Pure — caller persists the action.
 */
export function decideClaimAction(
  claim: ClaimInput,
  arrears: TenantArrearsInput,
  policy: DunningPolicy,
  tenantDueDay: number | null,
  asOf: string,
): StageAction {
  // 1) Reset state when claim is settled. Handle this even if it was at stage>0.
  if (claim.status === "paid" || claim.status === "reconciled") {
    if (
      claim.dunningStage === 0 &&
      claim.defaultSince === null &&
      claim.accruedDunningFees === 0 &&
      claim.accruedDefaultInterest === 0
    ) {
      return { kind: "noop", reason: "already_clean" };
    }
    return {
      kind: "reset",
      newDunningStage: 0,
      newDefaultSince: null,
      newAccruedFees: 0,
      newAccruedInterest: 0,
    };
  }

  // 2) Exclusion: claims with an accepted payment plan or in human_review.
  //    These exit the dunning run untouched.
  if (claim.status === "payment_plan" || claim.hasActivePaymentPlan) {
    return { kind: "noop", reason: "payment_plan_active" };
  }
  if (claim.status === "human_review" || claim.hasOpenHumanException) {
    return { kind: "noop", reason: "human_review_active" };
  }

  // 3) Determine the contractual deadline + default_since for this claim.
  const deadline = contractualDeadline(claim.dueDate, tenantDueDay, policy);
  const defaultSinceDate =
    claim.defaultSince !== null
      ? new Date(`${claim.defaultSince}T00:00:00Z`)
      : computeDefaultSince(deadline, policy);

  const today = new Date(`${asOf}T00:00:00Z`);

  // 4) Has the next stage's trigger fired yet?
  const stage1Issued = claim.existingNotices[1];
  const stage2Issued = claim.existingNotices[2];
  const stage3Issued = claim.existingNotices[3];
  const stage1Already = stage1Issued !== undefined;
  const stage2Already = stage2Issued !== undefined;
  const stage3Already = stage3Issued !== undefined;

  // SEPA Rücklastschrift: immediate Stage 1, no joker wait.
  const sepaImmediate = claim.hadSepaChargeback && !stage1Already && claim.dunningStage < 1;

  // Stage 1 trigger: today >= default_since (or SEPA chargeback)
  if (!stage1Already && (sepaImmediate || today >= defaultSinceDate)) {
    // For SEPA chargeback: default_since = today (the chargeback day) so
    // interest doesn't pre-date the actual default event.
    const defaultSinceIso = sepaImmediate ? toIsoDate(today) : toIsoDate(defaultSinceDate);
    return buildIssueAction(
      1,
      claim,
      policy,
      defaultSinceIso,
      sepaImmediate ? "sepa_chargeback" : "deadline_passed",
      sepaImmediate,
      asOf,
    );
  }

  // Stage 2 trigger: Stage 1 deadline has passed and claim still unpaid.
  if (stage1Already && !stage2Already && stage1Issued) {
    const stage1Deadline = addWorkingDays(
      new Date(`${stage1Issued}T00:00:00Z`),
      policy.stage1DeadlineWorkingDays,
    );
    if (today >= stage1Deadline) {
      return buildIssueAction(
        2,
        claim,
        policy,
        toIsoDate(defaultSinceDate),
        "deadline_passed",
        false,
        asOf,
      );
    }
  }

  // Stage 3 trigger: Stage 2 deadline passed AND tenant arrears ≥ threshold rents.
  if (stage1Already && stage2Already && !stage3Already && stage2Issued) {
    const stage2Deadline = addWorkingDays(
      new Date(`${stage2Issued}T00:00:00Z`),
      policy.stage2DeadlineWorkingDays,
    );
    const thresholdAmount = claim.monthlyRent * policy.stage3ArrearsThreshold;
    if (today >= stage2Deadline && arrears.openArrearsAmount >= thresholdAmount) {
      return buildIssueAction(
        3,
        claim,
        policy,
        toIsoDate(defaultSinceDate),
        "arrears_threshold_reached",
        false,
        asOf,
      );
    }
  }

  return { kind: "noop", reason: stage3Already ? "stage3_already" : "no_trigger" };
}

function buildIssueAction(
  stage: 1 | 2 | 3,
  claim: ClaimInput,
  policy: DunningPolicy,
  defaultSinceIso: string,
  trigger: VerzugsnachweisSnapshot["trigger"],
  withChargebackFee: boolean,
  asOf: string,
): StageAction {
  // Stage fee schedule.
  let mahngebuehr = 0;
  if (stage === 1) mahngebuehr = policy.stage1Fee;
  else if (stage === 2) mahngebuehr = policy.stage2Fee;
  // Stage 3 carries no extra Mahngebühr — it's pre-escalation case-file only.
  if (withChargebackFee) mahngebuehr = round2(mahngebuehr + policy.sepaChargebackFee);

  const { defaultDaysCalendar, interest } = computeDefaultInterest(
    claim.amount,
    policy,
    defaultSinceIso,
    asOf,
  );

  const issuedDate = asOf;
  const deadlineWorkingDays =
    stage === 1
      ? policy.stage1DeadlineWorkingDays
      : stage === 2
        ? policy.stage2DeadlineWorkingDays
        : 0; // Stage 3 has no tenant deadline — human takes over.
  const deadlineDate =
    stage === 3
      ? issuedDate
      : toIsoDate(addWorkingDays(new Date(`${issuedDate}T00:00:00Z`), deadlineWorkingDays));

  const snapshot: VerzugsnachweisSnapshot = {
    rent_obligation_id: claim.id,
    tenant_id: claim.tenantId,
    stage,
    expected_amount: round2(claim.amount),
    received_amount: 0,
    open_amount: round2(claim.amount),
    basiszinssatz: policy.basiszinssatz,
    default_interest_surcharge: policy.defaultInterestSurcharge,
    default_since: defaultSinceIso,
    as_of: asOf,
    default_days_calendar: defaultDaysCalendar,
    default_interest: interest,
    mahngebuehr,
    trigger,
  };

  return {
    kind: "issue_stage",
    stage,
    issuedDate,
    deadlineDate,
    mahngebuehr,
    defaultInterestSnapshot: interest,
    verzugsnachweis: snapshot,
    newDunningStage: stage,
    newDefaultSince: defaultSinceIso,
    // We DON'T double-charge: fees on rent_obligations are the sum of all
    // notice rows' Mahngebühren. So a fresh stage adds its fee to the running
    // accrued total. Interest is replaced (not summed) with the most recent
    // snapshot since it's recomputed from default_since each time.
    newAccruedFees: round2(claim.accruedDunningFees + mahngebuehr),
    newAccruedInterest: interest,
    requiresHumanException: stage === 3,
  };
}
