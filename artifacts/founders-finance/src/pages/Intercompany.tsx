import {
  useListIntercompanyBalances, getListIntercompanyBalancesQueryKey,
  useMarkIntercompanyPaid,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, entityBadgeStyle } from "@/lib/utils";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  partially_paid: { label: "Partial", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  waived: { label: "Waived", className: "bg-muted text-muted-foreground" },
};

export default function Intercompany() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: links, isLoading, error } = useListIntercompanyBalances({
    query: { queryKey: getListIntercompanyBalancesQueryKey() }
  });

  const markPaid = useMarkIntercompanyPaid({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListIntercompanyBalancesQueryKey() });
        toast({ title: "Marked as paid" });
      },
      onError: () => {
        toast({ title: "Failed to mark paid", variant: "destructive" });
      },
    }
  });

  const openLinks = links?.filter(l => l.status === "open" || l.status === "partially_paid") ?? [];
  const closedLinks = links?.filter(l => l.status === "paid" || l.status === "waived") ?? [];
  const totalOpen = openLinks.reduce((s, l) => s + parseFloat(String(l.amount)), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Intercompany Balances</h1>
          <p className="text-sm text-muted-foreground mt-1">Who owes whom across entities</p>
        </div>
        {openLinks.length > 0 && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total Open</p>
            <p className="text-xl font-mono font-bold text-orange-500">{formatCurrency(totalOpen)}</p>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load intercompany balances.</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Card key={i}><CardContent className="py-4"><Skeleton className="h-14 w-full" /></CardContent></Card>)}
        </div>
      ) : !links?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-3" />
            <p className="text-sm font-medium">No intercompany balances</p>
            <p className="text-xs text-muted-foreground mt-1">All entities are settled with each other.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {openLinks.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Open</h2>
              <div className="space-y-2">
                {openLinks.map(link => (
                  <Card key={link.id} className="border-l-4" style={{ borderLeftColor: link.owing_entity_color ?? "#6b7280" }} data-testid={`card-link-${link.id}`}>
                    <CardContent className="py-4 flex items-center gap-4">
                      <div className="flex-1 flex items-center gap-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold"
                          style={entityBadgeStyle(link.owing_entity_color)}
                          data-testid={`badge-owing-${link.id}`}
                        >
                          {link.owing_entity_name ?? link.owing_entity_id.slice(0, 8)}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold"
                          style={entityBadgeStyle(link.owed_entity_color)}
                          data-testid={`badge-owed-${link.id}`}
                        >
                          {link.owed_entity_name ?? link.owed_entity_id.slice(0, 8)}
                        </span>
                        {link.memo && <span className="text-xs text-muted-foreground truncate max-w-48">{link.memo}</span>}
                      </div>

                      <div className="text-right mr-4">
                        <p className="font-mono font-bold text-lg">{formatCurrency(link.amount)}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(link.created_at)}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[link.status]?.className}`}>
                          {STATUS_BADGE[link.status]?.label ?? link.status}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => markPaid.mutate({ id: link.id, data: {} })}
                          disabled={markPaid.isPending}
                          data-testid={`button-mark-paid-${link.id}`}
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

          {closedLinks.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Settled</h2>
              <div className="space-y-2">
                {closedLinks.map(link => (
                  <Card key={link.id} className="opacity-60" data-testid={`card-link-settled-${link.id}`}>
                    <CardContent className="py-3 flex items-center gap-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold" style={entityBadgeStyle(link.owing_entity_color)}>
                        {link.owing_entity_name}
                      </span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold" style={entityBadgeStyle(link.owed_entity_color)}>
                        {link.owed_entity_name}
                      </span>
                      <span className="font-mono text-sm text-muted-foreground ml-auto">{formatCurrency(link.amount)}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[link.status]?.className}`}>
                        {STATUS_BADGE[link.status]?.label}
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
