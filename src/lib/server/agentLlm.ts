import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "./env";
import type { TenantRow } from "./supabase";
import type { AgentRunOutcome } from "./cycle";
import {
  executeEscalate,
  executeOfferPlan,
  executeReminder,
  executeRetry,
  logAction,
  updateTenantStatus,
} from "./cycle";
import { RISK_SCORES } from "../agentEngine";

let cached: Anthropic | undefined;
let cachedKey = "";

function getClient(): Anthropic {
  const env = getEnv();
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  if (cached && cachedKey === env.ANTHROPIC_API_KEY) return cached;
  cached = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  cachedKey = env.ANTHROPIC_API_KEY;
  return cached;
}

const SYSTEM_PROMPT = `You are a payment-recovery agent for a property manager.

You receive a single failed rent payment event. You must decide ONE recovery action and call the matching tool.

Decision policy:
- Soft failures (temporary issues, low risk score) → call retry_payment, then send_reminder.
- Tenant has insufficient funds or medium risk → call offer_payment_plan with a 2-part split (half today, half next Friday).
- Severe failures (closed account, fraud signals, risk > 80) → call escalate_to_human with a concise reason.

Always call exactly one action tool per failed event. Be decisive. Do not call multiple action tools in one turn. After the tool call returns, you may stop.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "retry_payment",
    description: "Retry the failed Stripe charge for this tenant. Use for transient failures (low/medium risk).",
    input_schema: {
      type: "object",
      properties: {
        tenant_id: { type: "string", description: "Tenant ID, e.g. 'kaya'." },
        rationale: { type: "string", description: "Why a retry is the right call." },
      },
      required: ["tenant_id", "rationale"],
    },
  },
  {
    name: "send_reminder",
    description: "Send the tenant a reminder via their preferred channel.",
    input_schema: {
      type: "object",
      properties: {
        tenant_id: { type: "string" },
        channel: { type: "string", enum: ["email", "sms", "portal"] },
        message: { type: "string", description: "Short, friendly reminder text." },
      },
      required: ["tenant_id", "channel", "message"],
    },
  },
  {
    name: "offer_payment_plan",
    description: "Offer the tenant a structured payment plan (typically 2 parts).",
    input_schema: {
      type: "object",
      properties: {
        tenant_id: { type: "string" },
        parts: {
          type: "array",
          description: "Plan installments in order.",
          items: {
            type: "object",
            properties: {
              amount_cents: { type: "integer", description: "Installment amount in cents." },
              due_date: { type: "string", description: "Human-readable due date, e.g. 'today' or 'next Friday'." },
              label: { type: "string", description: "Display label." },
            },
            required: ["amount_cents", "due_date", "label"],
          },
        },
      },
      required: ["tenant_id", "parts"],
    },
  },
  {
    name: "escalate_to_human",
    description: "Escalate to the property manager. Use only when automated recovery is unsafe.",
    input_schema: {
      type: "object",
      properties: {
        tenant_id: { type: "string" },
        reason: { type: "string", description: "One-sentence reason." },
      },
      required: ["tenant_id", "reason"],
    },
  },
];

interface RunInput {
  tenant: TenantRow;
  failureReason: string;
  cycleMonth: string;
}

export async function runAgentForPaymentEventLlm({
  tenant,
  failureReason,
  cycleMonth,
}: RunInput): Promise<AgentRunOutcome> {
  const client = getClient();
  const riskScore = RISK_SCORES[tenant.archetype];

  await logAction(
    `${tenant.name} payment failed: ${failureReason}`,
    `Stripe returned failure on ${cycleMonth} charge of €${tenant.rent_cents / 100}`,
    "Charge failed",
    tenant.id,
  );
  await logAction(
    "Risk score updated",
    `Tenant archetype "${tenant.archetype}" → score ${riskScore}`,
    `Risk score = ${riskScore}`,
    tenant.id,
  );

  const userMessage = `Failed payment event:
- tenant_id: ${tenant.id}
- tenant_name: ${tenant.name}
- unit: ${tenant.unit}
- rent_cents: ${tenant.rent_cents}
- archetype: ${tenant.archetype}
- risk_score: ${riskScore}
- cycle_month: ${cycleMonth}
- failure_reason: ${failureReason}

Pick exactly one recovery action and call its tool.`;

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: TOOLS,
    tool_choice: { type: "any", disable_parallel_tool_use: true },
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) {
    await logAction(
      "Agent produced no tool call",
      "Defaulted to escalation",
      "Escalated by fallback",
      tenant.id,
    );
    await executeEscalate({ tenant, cycleMonth }, "Agent did not pick an action");
    return {
      tenantStatus: "escalated",
      actions: [],
    };
  }

  await logAction(
    `Agent selected ${toolUse.name}`,
    `Risk ${riskScore}; Claude chose ${toolUse.name} based on archetype "${tenant.archetype}"`,
    `Flow: ${toolUse.name}`,
    tenant.id,
  );

  const input = toolUse.input as Record<string, unknown>;
  const ctx = { tenant, cycleMonth };

  switch (toolUse.name) {
    case "retry_payment": {
      const result = await executeRetry(ctx);
      if (result.success) {
        await logAction(
          `${tenant.name} retry succeeded`,
          result.reason,
          "Recovered",
          tenant.id,
        );
        return { tenantStatus: "retry_succeeded", actions: [] };
      }
      await logAction(
        `${tenant.name} retry failed`,
        result.reason,
        "Retry failed",
        tenant.id,
      );
      await executeEscalate(ctx, "Retry did not clear");
      return { tenantStatus: "escalated", actions: [] };
    }

    case "send_reminder": {
      const channel = (input.channel as string) ?? "portal";
      await executeReminder(ctx, channel);
      await updateTenantStatus(tenant.id, "current");
      return { tenantStatus: "current", actions: [] };
    }

    case "offer_payment_plan": {
      const rawParts = (input.parts as Array<{ amount_cents: number; due_date: string; label: string }>) ?? [];
      const parts =
        rawParts.length > 0
          ? rawParts.map((p) => ({ amount: p.amount_cents, due_date: p.due_date, label: p.label }))
          : [
              { amount: Math.round(tenant.rent_cents / 2), due_date: "today", label: "First installment" },
              {
                amount: tenant.rent_cents - Math.round(tenant.rent_cents / 2),
                due_date: "next Friday",
                label: "Second installment",
              },
            ];
      await executeOfferPlan(ctx, parts);
      await logAction(
        `Payment plan offered: ${parts.map((p) => `€${(p.amount / 100).toFixed(0)} ${p.due_date}`).join(", ")}`,
        `${parts.length}-part plan generated for ${tenant.name}`,
        "Plan offered",
        tenant.id,
      );
      return { tenantStatus: "payment_plan_offered", actions: [] };
    }

    case "escalate_to_human": {
      const reason = (input.reason as string) ?? "Unspecified";
      await executeEscalate(ctx, reason);
      await logAction(
        `${tenant.name} escalated to human review`,
        reason,
        "Escalated",
        tenant.id,
      );
      return { tenantStatus: "escalated", actions: [] };
    }

    default: {
      await logAction(
        `Unknown tool ${toolUse.name}`,
        "Defaulted to escalation",
        "Escalated by fallback",
        tenant.id,
      );
      await executeEscalate(ctx, `Unknown tool: ${toolUse.name}`);
      return { tenantStatus: "escalated", actions: [] };
    }
  }
}
