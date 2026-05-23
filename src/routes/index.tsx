import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Payment Manager for Hallo Theo" },
      { name: "description", content: "Payment Manager for Hallo Theo" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Payment Manager for Hallo Theo
      </h1>
    </main>
  );
}
