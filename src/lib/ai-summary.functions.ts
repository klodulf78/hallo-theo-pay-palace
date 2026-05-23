import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const KpiSchema = z.object({
  month: z.string(),
  tenantCount: z.number(),
  expected: z.number(),
  collected: z.number(),
  collectedCount: z.number(),
  recovered: z.number(),
  recoveredCount: z.number(),
  paymentPlan: z.number(),
  paymentPlanCount: z.number(),
  humanReview: z.number(),
  humanReviewCount: z.number(),
  autoClearedPct: z.number(),
  autoClearedNumerator: z.number(),
  autoClearedDenominator: z.number(),
  supportTickets: z.number(),
});

export const generateCycleSummary = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => KpiSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return {
        summary:
          "AI summary unavailable: LOVABLE_API_KEY is not configured.",
        error: "missing_key" as const,
      };
    }

    const monthLabel = new Date(data.month + "-01").toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });

    const userPrompt = `You are summarizing the monthly rent collection cycle for a property manager.

Write a calm, professional, reassuring paragraph of 3-4 sentences. Plain language. No bullet points, no headings, no markdown.

Cycle: ${monthLabel}
- Tenants: ${data.tenantCount}
- Expected rent: €${data.expected.toLocaleString("en-US")}
- Collected on time: €${data.collected.toLocaleString("en-US")} (${data.collectedCount} tenants)
- Recovered after agent retried failed payments: €${data.recovered.toLocaleString("en-US")} (${data.recoveredCount} tenants)
- Accepted payment plan: €${data.paymentPlan.toLocaleString("en-US")} (${data.paymentPlanCount} tenants)
- Needs human review: €${data.humanReview.toLocaleString("en-US")} (${data.humanReviewCount} cases)
- Auto-cleared: ${data.autoClearedNumerator} of ${data.autoClearedDenominator} (${data.autoClearedPct}%)
- Payment-status support tickets: ${data.supportTickets}

Focus on what was resolved automatically and what (if anything) needs the manager's attention.`;

    try {
      const res = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content:
                  "You write short, calm status summaries for property managers. Always 3-4 sentences, no markdown.",
              },
              { role: "user", content: userPrompt },
            ],
          }),
        },
      );

      if (!res.ok) {
        if (res.status === 429) {
          return {
            summary:
              "AI summary is temporarily rate-limited. Please try again in a moment.",
            error: "rate_limited" as const,
          };
        }
        if (res.status === 402) {
          return {
            summary:
              "AI summary requires additional Lovable AI credits to continue.",
            error: "payment_required" as const,
          };
        }
        const text = await res.text();
        console.error("Lovable AI error:", res.status, text);
        return {
          summary: "AI summary is currently unavailable.",
          error: "upstream_error" as const,
        };
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const summary =
        json.choices?.[0]?.message?.content?.trim() ??
        "AI summary is currently unavailable.";
      return { summary, error: null };
    } catch (err) {
      console.error("Lovable AI request failed:", err);
      return {
        summary: "AI summary is currently unavailable.",
        error: "exception" as const,
      };
    }
  });
