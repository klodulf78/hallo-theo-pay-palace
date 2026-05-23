import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useHalloFlow } from "@/lib/store";
import { Activity, Bot } from "lucide-react";

export function AgentActivityLog() {
  const { state } = useHalloFlow();
  const entries = [...state.log].reverse();

  return (
    <Card className="border-slate-200/80 h-full">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-violet-600" />
          <CardTitle className="text-base text-slate-900">Agent Activity Log</CardTitle>
        </div>
        <Badge variant="outline" className="text-xs">
          {entries.length}
        </Badge>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500">
            <Activity className="size-8 text-slate-300 mb-2" />
            <div className="text-sm">Agent is idle</div>
            <div className="text-xs text-slate-400">
              Advance the month to see decisions appear here.
            </div>
          </div>
        ) : (
          <ScrollArea className="h-[420px] pr-3">
            <ol className="relative border-l border-slate-200 ml-2 space-y-4">
              {entries.map((entry) => (
                <li key={entry.id} className="ml-4">
                  <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full bg-violet-500 ring-4 ring-violet-100" />
                  <div className="text-sm font-medium text-slate-900">{entry.action}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{entry.reason}</div>
                  <div className="text-xs text-emerald-700 mt-0.5">→ {entry.result}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </div>
                </li>
              ))}
            </ol>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
