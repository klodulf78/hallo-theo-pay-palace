import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity — hallo flow" },
      { name: "description", content: "Agent activity log." },
    ],
  }),
  component: () => <ComingSoon title="Agent Activity Log" />,
});
