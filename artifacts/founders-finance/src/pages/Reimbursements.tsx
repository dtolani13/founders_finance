import {
  useListReimbursements, getListReimbursementsQueryKey,
  useMarkReimbursementPaid,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, entityBadgeStyle } from "@/lib/utils";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  partially_paid: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  waived: "bg-muted text-muted-foreground",
  converted_to_contribution: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

export default function Reimbursements() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: reimbursements, isLoading, error } = useListReimbursements({
    query: { queryKey: getListReimbursementsQueryKey() }
  });

  const markPaid = useMarkReimbursementPaid({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReimbursementsQueryKey() });
        toast({ title: "Marked as paid" });
      },
      onError: () => toast({ title: "Failed to mark paid", variant: "destructive" }),
    }
  });

  const pending = reimbursements?.filter(r => r.status === "pending" || r.status === "partially_paid") ?? [];
  const settled = reimbursements?.filter(r => r.status !== "pending" && r.status !== "partially_paid") ?? [];
  const totalPending = pending.reduce((s, r) => s + parseFloat(String(r.amount)), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reimbursements</h1>
          <p className="text-sm text-muted-foreground mt-1">Outstanding and settled reimbursement requests</p>
        </div>
        {totalPending > 0 && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total Pending</p>
            <p className="text-xl font-mono font-bold text-orange-500">{formatCurrency(totalPending)}</p>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load reimbursements.</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Card key={i}><CardContent className="py-4"><Skeleton className="h-14 w-full" /></CardContent></Card>)}
        </div>
      ) : !reimbursements?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-3" />
            <p className="text-sm font-medium">No reimbursements</p>
            <p className="text-xs text-muted-foreground mt-1">All reimbursements are settled.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {pending.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Pending ({pending.length})</h2>
              <div className="space-y-2">
                {pending.map(r => (
                  <Card key={r.id} className="border-l-4 border-l-orange-400" data-testid={`card-reimbursement-${r.id}`}>
                    <CardContent className="py-4 flex items-center gap-4">
                      <div className="flex-1 flex items-center gap-3 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold" style={entityBadgeStyle(r.owed_to_entity_color)}>
                          {r.owed_to_entity_name}
                        </span>
                        <span className="text-xs text-muted-foreground">is owed by</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold" style={entityBadgeStyle(r.owed_by_entity_color)}>
                          {r.owed_by_entity_name}
                        </span>
                        {r.memo && <span className="text-xs text-muted-foreground truncate max-w-40">{r.memo}</span>}
                      </div>
                      <div className="text-right mr-4">
                        <p className="font-mono font-bold text-lg">{formatCurrency(r.amount)}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASS[r.status]}`}>
                          {r.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => markPaid.mutate({ id: r.id, data: {} })}
                          disabled={markPaid.isPending}
                          data-testid={`button-mark-paid-${r.id}`}
                        >
                          Mark Paid
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {settled.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Settled ({settled.length})</h2>
              <div className="space-y-2">
                {settled.map(r => (
                  <Card key={r.id} className="opacity-60" data-testid={`card-settled-${r.id}`}>
                    <CardContent className="py-3 flex items-center gap-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold" style={entityBadgeStyle(r.owed_to_entity_color)}>{r.owed_to_entity_name}</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold" style={entityBadgeStyle(r.owed_by_entity_color)}>{r.owed_by_entity_name}</span>
                      <span className="font-mono text-sm text-muted-foreground ml-auto">{formatCurrency(r.amount)}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASS[r.status]}`}>
                        {r.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
