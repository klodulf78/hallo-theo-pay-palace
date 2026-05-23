---
name: agent-policy-engine
description: >-
  The autonomous decision engine for hallo flow — risk scoring, the decision and
  guardrail policy, the agent tool schema, the LLM tool-use loop, and the
  agent_actions audit log. Use when deciding what the payment-recovery agent
  should do on a failed payment, computing or tuning a risk score, adding/editing
  agent tools, wiring the tool-use loop, or ensuring every action is logged and
  guardrailed.
---

# Agentic decision engine (hallo flow)

The agent turns a payment event into a next-best action **within guardrails** and logs the
reason. Code lives in `src/lib/payment-recovery-agent.server.ts`, invoked from the Stripe
webhook on `invoice.payment_failed`.

## Golden rule: deterministic baseline, LLM on top
A deterministic mapping (`event → risk → action`) must always work with **zero API calls**.
The LLM tool-use loop wraps it for nicer reasoning and is only kept if stable. If the LLM path
is risky in the demo, fall back to the deterministic engine and present it as a
"policy-controlled agent" — that is a legitimate, judge-safe story.

## Risk score
Heuristic (0–100):
```
risk = days_overdue_w + failed_attempts_w + prior_late_w + no_mandate_w + outstanding_w
       - prior_successful_w
```
Behavior fallback already in code: reliable 10 · soft_fail 45 · payment_plan 72 · critical 91.

| score | level | default action |
|---|---|---|
| 0–25 | low | monitor / no action |
| 26–55 | medium | retry + reminder |
| 56–80 | high | offer payment plan |
| 81–100 | critical | escalate to human |

## Decision policy (event → action)
- Payment succeeds → mark collected, reconcile.
- First failure, low/medium risk → `retry_payment` (prefer retry over reminder on first fail).
- First failure, high risk → reminder + `offer_payment_plan`.
- Second failure → offer plan or escalate.
- Plan accepted → update ledger, close exception.
- Amount above threshold, no response after reminder, hard decline → `escalate_to_human`.

## Guardrails (hard limits — never auto-cross)
Max 2 retries · max 2-part plan · max auto-approved outstanding **€1,500** · critical score
threshold **80** · escalate on repeated failure / no mandate / amount over limit / disputed
payment · **no rent waiver, no legal advice, no formal debt collection** · every action logged
with a reason (auditability).

## Agent tool schema (PRD's 7; 4 implemented today)
Implemented: `retry_payment`, `send_reminder(channel, message)`,
`offer_payment_plan(installments[])`, `escalate_to_human(reason)`.
Expansion targets: `charge_rent(tenant_id)`, `accept_payment_plan(plan_id)`,
`reconcile_payment(payment_event_id)`.

Each tool maps to an `execute*` function that (1) patches the `exceptions` row
(recommended_action, risk_score, severity, human_needed, status), (2) does its Stripe/DB side
effect, and (3) calls `logAction(...)`.

## LLM tool-use loop (current implementation)
- Gateway: `https://ai.gateway.lovable.dev/v1/chat/completions`, model
  `google/gemini-3-flash-preview`, auth `LOVABLE_API_KEY`. OpenAI-compatible shape.
- Request: system + user message, `tools`, `tool_choice: "required"`,
  `parallel_tool_calls: false` — force exactly one tool call.
- Parse `choices[0].message.tool_calls[0].function` → `{ name, JSON.parse(arguments) }`.

## Fallback-to-escalation is sacred
Any failure — missing `LOVABLE_API_KEY`, gateway non-200, fetch throw, no tool call, bad JSON
— must resolve to `executeEscalate(...)` so a case is never silently lost. Preserve this in
every change.

## Audit logging (powers `/activity`)
`logAction(input, action_type, result, reason, policy_basis)` inserts into `agent_actions`.
Always log the initial "charge failed — agent invoked" entry, then the chosen action.
Write `reason`/`policy_basis` as demo-quality sentences ("first failure, rent below €1,500,
tenant has prior good history") — judges read them.

## Side-effect cheatsheet
- retry → `stripe.invoices.pay(invoiceId)`; on paid → obligation `auto_recovered` + exception
  resolved.
- reminder → insert `communications` (channel, message_type `reminder`).
- offer plan → insert `payment_plans` + N `payment_plan_installments`, obligation →
  `payment_plan`, insert `communications` (`payment_plan_offer`).
- escalate → exception `human_needed=true` / `escalated`, obligation `human_review`,
  `communications` (`escalation_notice`).

(See the **`supabase-data`** skill for exact columns and the **`stripe-test-ops`** skill for
the retry/invoice mechanics.)
