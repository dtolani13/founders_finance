import {
  useListAllocationPresets, getListAllocationPresetsQueryKey,
  useListUnallocatedExpenses, getListUnallocatedExpensesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

export default function Allocations() {
  const { data: presets, isLoading: presetsLoading, error: presetsError } = useListAllocationPresets(undefined, {
    query: { queryKey: getListAllocationPresetsQueryKey() }
  });

  const { data: unallocated, isLoading: unallocLoading } = useListUnallocatedExpenses({
    query: { queryKey: getListUnallocatedExpensesQueryKey() }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Allocation Presets</h1>
        <p className="text-sm text-muted-foreground mt-1">Reusable expense split templates across entities</p>
      </div>

      {presetsError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load allocation presets.</AlertDescription>
        </Alert>
      )}

      {presetsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Card key={i}><CardContent className="py-6"><Skeleton className="h-24 w-full" /></CardContent></Card>)}
        </div>
      ) : !presets?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground text-sm">No allocation presets configured.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {presets.map(preset => (
            <Card key={preset.id} data-testid={`card-preset-${preset.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-sm font-semibold">{preset.name}</CardTitle>
                  <Badge variant="secondary" className="text-xs">Active</Badge>
                </div>
                {preset.description && (
                  <p className="text-xs text-muted-foreground">{preset.description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Allocation bar */}
                <div className="flex h-3 rounded-full overflow-hidden gap-px bg-muted">
                  {preset.lines.map((line, i) => (
                    <div
                      key={i}
                      style={{ width: `${line.percent}%`, backgroundColor: line.entity_primary_color ?? "#6b7280" }}
                      title={`${line.entity_display_name ?? line.entity_short_code}: ${line.percent}%`}
                    />
                  ))}
                </div>

                <div className="space-y-1.5">
                  {preset.lines.map((line, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: line.entity_primary_color ?? "#6b7280" }}
                        />
                        <span className="font-medium">{line.entity_short_code}</span>
                        {line.entity_display_name && (
                          <span className="text-xs text-muted-foreground">{line.entity_display_name}</span>
                        )}
                      </div>
                      <span className="font-mono text-sm">{formatPercent(line.percent)}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-border text-xs text-muted-foreground">
                  {preset.lines.length} entit{preset.lines.length !== 1 ? "ies" : "y"}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Unallocated expenses */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Unallocated Expenses</h2>
        {unallocLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !unallocated?.length ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-green-600 font-medium">All expenses have been allocated.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody>
                {unallocated.map(tx => (
                  <tr key={tx.id} className="border-b border-border last:border-0" data-testid={`row-unallocated-${tx.id}`}>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{tx.transaction_date}</td>
                    <td className="px-4 py-2.5 font-medium">{tx.description}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(tx.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground text-right">
              {unallocated.length} unallocated expense{unallocated.length !== 1 ? "s" : ""} — total {formatCurrency(unallocated.reduce((s, t) => s + parseFloat(String(t.total_amount)), 0))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
