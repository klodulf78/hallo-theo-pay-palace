import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/tenant-portal")({
  head: () => ({
    meta: [
      { title: "Tenant Portal — hallo flow" },
      { name: "description", content: "Tenant-facing portal." },
    ],
  }),
  component: () => <ComingSoon title="Tenant Portal" />,
});
