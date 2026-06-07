import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const CLOSE_STATUS_CLASS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  review: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  closed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  reopened: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

export default function Dashboard() {
  const { data: summary, isLoading, error } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">System Status</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load dashboard summary.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Status</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time entity financial positions</p>
        </div>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            {formatCurrency(summary.total_pending_reimbursements)} Pending Reimb.
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            {formatCurrency(summary.total_open_intercompany)} Open Interco.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {summary.entities.map((card) => {
          const closeStatus = (card as typeof card & { monthly_close_status?: string | null }).monthly_close_status;
          return (
            <Card
              key={card.entity.id}
              className="overflow-hidden border-t-4 shadow-sm"
              style={{ borderTopColor: card.entity.primary_color || "hsl(var(--primary))" }}
            >
              <CardHeader className="bg-muted/30 pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    {card.entity.short_code}
                    <span className="text-xs font-normal text-muted-foreground px-2 py-0.5 bg-background rounded border">
                      {card.entity.entity_type}
                    </span>
                  </CardTitle>
                  {closeStatus && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-black/15 ${CLOSE_STATUS_CLASS[closeStatus] ?? "bg-muted text-muted-foreground"}`}>
                      {closeStatus.charAt(0).toUpperCase() + closeStatus.slice(1)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{card.entity.legal_name}</p>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">

                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">True Available Cash</p>
                  <p className="text-3xl font-mono tracking-tight">{formatCurrency(card.true_available_cash)}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground mb-1">Operating</p>
                    <p className="font-mono">{formatCurrency(card.operating_cash)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Tax Reserve</p>
                    <p className="font-mono">{formatCurrency(card.tax_reserve_balance)}</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-border space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Owed to others</span>
                    <span className="font-mono text-destructive">{formatCurrency(card.intercompany_payables)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Owed from others</span>
                    <span className="font-mono text-green-600">{formatCurrency(card.intercompany_receivables)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pending Reimbursements</span>
                    <span className="font-mono text-orange-600">{formatCurrency(card.pending_reimbursements)}</span>
                  </div>
                </div>

                {(card.missing_evidence_count > 0 || card.unreconciled_count > 0) && (
                  <div className="pt-4 border-t border-border flex flex-wrap gap-2">
                    {card.unreconciled_count > 0 && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-400/60 dark:bg-yellow-900/30 dark:text-yellow-500">
                        {card.unreconciled_count} Unreconciled
                      </span>
                    )}
                    {card.missing_evidence_count > 0 && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-400/60 dark:bg-red-900/30 dark:text-red-500">
                        {card.missing_evidence_count} Missing Receipts
                      </span>
                    )}
                  </div>
                )}

              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
