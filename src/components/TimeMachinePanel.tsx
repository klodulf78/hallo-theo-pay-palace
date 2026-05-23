import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHalloFlow } from "@/lib/store";
import { CalendarClock, FastForward, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export function TimeMachinePanel() {
  const { state, advanceMonth, reset } = useHalloFlow();

  const dateLabel = new Date(state.currentDate).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const stub = (label: string) => () =>
    toast.info(`${label} — coming soon`, {
      description: "Only Advance Month is wired in this demo.",
    });

  return (
    <Card className="border-blue-100/80 bg-gradient-to-br from-white to-blue-50/50">
      <CardContent className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-blue-100 text-blue-700 grid place-items-center">
            <CalendarClock className="size-5" />
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Simulated date
            </div>
            <div className="text-lg font-semibold text-slate-900">{dateLabel}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={stub("Advance 1 Day")}>
            +1 Day
          </Button>
          <Button variant="outline" size="sm" onClick={stub("Advance 1 Week")}>
            +1 Week
          </Button>
          <Button
            onClick={() => {
              advanceMonth();
              toast.success("Monthly rent cycle complete", {
                description: "Charges run, agent decisions logged, exceptions queued.",
              });
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          >
            <FastForward className="size-4 mr-1.5" />
            Advance Month
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              reset();
              toast("Demo reset");
            }}
          >
            <RotateCcw className="size-4 mr-1.5" />
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
