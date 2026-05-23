import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./StatusBadge";
import { useHalloFlow } from "@/lib/store";

const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

export function TenantTable() {
  const { state } = useHalloFlow();

  return (
    <Card className="border-slate-200/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-900">Tenants</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Unit</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead className="text-right">Rent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Risk profile</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.tenants.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs text-slate-600">{t.unit}</TableCell>
                <TableCell className="font-medium text-slate-900">{t.name}</TableCell>
                <TableCell className="text-right text-slate-700">{fmtEur(t.rent)}</TableCell>
                <TableCell>
                  <StatusBadge status={t.status} />
                </TableCell>
                <TableCell className="text-xs text-slate-500 capitalize">
                  {t.archetype.replace("_", " ")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
