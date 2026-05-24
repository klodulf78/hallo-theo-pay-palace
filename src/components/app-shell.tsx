import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  AlertTriangle,
  Building2,
  Workflow,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Dashboard", to: "/portfolio", icon: LayoutDashboard },
  { label: "Eskalationen", to: "/exceptions", icon: AlertTriangle },
  { label: "Demo-Ablauf", to: "/demo-flow", icon: Workflow },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside
        className={cn(
          "hidden md:flex shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div
          className={cn(
            "py-6 border-b border-border flex items-center gap-2",
            collapsed ? "px-2 justify-center" : "px-5 justify-between",
          )}
        >
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-2xl font-semibold tracking-tight text-primary lowercase">
                hallo flow
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Autonomous rent collection
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
        <nav className={cn("flex-1 py-4 space-y-1", collapsed ? "px-2" : "px-3")}>
          {NAV.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center rounded-md py-2 text-sm font-medium transition-colors",
                  collapsed ? "justify-center px-2" : "gap-3 px-3",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/70 hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>
        {!collapsed && (
          <div className="px-5 py-4 border-t border-border text-xs text-muted-foreground">
            Demo · v0.1
          </div>
        )}
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
