import { createFileRoute } from "@tanstack/react-router";
import { RecentEventsCard } from "@/components/recent-events-card";
import { DemoControlsCard } from "@/components/demo-controls-card";
import { ResetDemoCard } from "@/components/reset-demo-card";
import {
  HeaderStrip,
  LiveStateCard,
  DunningStatusCard,
} from "@/components/validation-panels";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Validation Mode — hallo flow" },
      {
        name: "description",
        content:
          "Validation dashboard for the autonomous dunning flow of hallo flow.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          Validation Mode
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manuelles Testen des Mahn-Flows. Production-View ist temporär ausgeblendet.
        </p>
      </div>

      <HeaderStrip />
      <DemoControlsCard />
      <LiveStateCard />
      <DunningStatusCard />
      <RecentEventsCard />

      <div className="pt-8">
        <ResetDemoCard />
      </div>
    </div>
  );
}
