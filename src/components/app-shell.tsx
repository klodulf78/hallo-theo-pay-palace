import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  AlertTriangle,
  Building2,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Demo-Ablauf", to: "/demo-flow", icon: Workflow },
  { label: "Exceptions", to: "/exceptions", icon: AlertTriangle },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="px-5 py-6 border-b border-border">
          <div className="text-2xl font-semibold tracking-tight text-primary lowercase">
            hallo flow
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Autonomous rent collection
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/70 hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-border text-xs text-muted-foreground">
          Demo · v0.1
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 shrink-0 border-b border-border bg-card px-4 md:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground leading-none">
                Property
              </div>
              <div className="text-sm font-medium truncate">
                hallo theo · Berlin Mitte Portfolio
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
