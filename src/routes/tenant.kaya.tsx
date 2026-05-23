import { createFileRoute } from "@tanstack/react-router";
import { TenantPortal } from "@/components/TenantPortal";

export const Route = createFileRoute("/tenant/kaya")({
  head: () => ({
    meta: [
      { title: "hallo flow — Kaya" },
      { name: "description", content: "Tenant portal for Kaya." },
    ],
  }),
  component: () => <TenantPortal tenantId="kaya" />,
});
