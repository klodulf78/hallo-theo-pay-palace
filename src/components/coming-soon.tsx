import { Sparkles } from "lucide-react";

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center max-w-md">
        <div className="mx-auto h-12 w-12 rounded-full bg-accent text-accent-foreground flex items-center justify-center mb-4">
          <Sparkles className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Coming soon. This part of hallo flow is on the roadmap.
        </p>
      </div>
    </div>
  );
}
