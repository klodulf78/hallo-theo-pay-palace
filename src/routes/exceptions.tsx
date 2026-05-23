import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/exceptions")({
  head: () => ({
    meta: [
      { title: "Exceptions — hallo flow" },
      { name: "description", content: "Exception queue for rent collection." },
    ],
  }),
  component: () => <ComingSoon title="Exception Queue" />,
});
