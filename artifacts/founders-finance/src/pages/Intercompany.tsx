import { useState } from "react";
import {
  useListIntercompanyBalances, getListIntercompanyBalancesQueryKey,
  useMarkIntercompanyPaid,
  useReverseIntercompanySettlement,
  useListAccounts,
  getListAccountsQueryKey,
} from "@workspace/api-client-react";
import type { IntercompanyLink } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, entityBadgeStyle } from "@/lib/utils";
import { AlertCircle, ArrowRight, CheckCircle2, RotateCcw, WalletCards } from "lucide-react";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  partially_paid: { label: "Partial", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  waived: { label: "Waived", className: "bg-muted text-muted-foreground" },
};

export default function Intercompany() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedLink, setSelectedLink] = useState<IntercompanyLink | null>(null);
  const [action, setAction] = useState<"settle" | "reverse">("settle");
  const [operationDate, setOperationDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [owingAccountId, setOwingAccountId] = useState("");
  const [owedAccountId, setOwedAccountId] = useState("");

  const { data: links, isLoading, error } = useListIntercompanyBalances({
    query: { queryKey: getListIntercompanyBalancesQueryKey() }
  });
  const { data: accounts } = useListAccounts({}, {
    query: { queryKey: getListAccountsQueryKey({}) },
  });

  const finishAction = (title: string) => {
    queryClient.invalidateQueries({ queryKey: getListIntercompanyBalancesQueryKey() });
    toast({ title });
    setSelectedLink(null);
    setMemo("");
  };
  const operationError = (error: unknown) => toast({
    title: (error as { response?: { data?: { error?: string } } })?.response?.data?.error
      ?? "Intercompany balance could not be updated",
    variant: "destructive",
  });

  const markPaid = useMarkIntercompanyPaid({
    mutation: {
      onSuccess: () => finishAction("Intercompany balance settled"),
      onError: operationError,
    }
  });
  const reverseSettlement = useReverseIntercompanySettlement({
    mutation: {
      onSuccess: () => finishAction("Settlement reversed and balance reopened"),
      onError: operationError,
    },
  });

  const checkingAccounts = accounts?.filter((account) => account.is_active && account.account_type === "checking") ?? [];
  const owingAccounts = selectedLink
    ? checkingAccounts.filter((account) => account.entity_id === selectedLink.owing_entity_id)
    : [];
  const owedAccounts = selectedLink
    ? checkingAccounts.filter((account) => account.entity_id === selectedLink.owed_entity_id)
    : [];

  const openAction = (link: IntercompanyLink, kind: "settle" | "reverse") => {
    const availableOwing = checkingAccounts.filter((account) => account.entity_id === link.owing_entity_id);
    const availableOwed = checkingAccounts.filter((account) => account.entity_id === link.owed_entity_id);
    setSelectedLink(link);
    setAction(kind);
    setOperationDate(new Date().toISOString().slice(0, 10));
    setMemo("");
    setOwingAccountId(availableOwing.length === 1 ? availableOwing[0].id : "");
    setOwedAccountId(availableOwed.length === 1 ? availableOwed[0].id : "");
  };

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
                    <CardContent className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center">
                      <div className="flex flex-1 flex-wrap items-center gap-3">
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

                      <div className="text-left lg:mr-4 lg:text-right">
                        <p className="font-mono font-bold text-lg">{formatCurrency(link.amount)}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(link.created_at)}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[link.status]?.className}`}>
                          {STATUS_BADGE[link.status]?.label ?? link.status}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => openAction(link, "settle")}
                          disabled={markPaid.isPending}
                          data-testid={`button-mark-paid-${link.id}`}
                        >
                          <WalletCards className="mr-1 h-3.5 w-3.5" />Settle
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
                    <CardContent className="flex flex-wrap items-center gap-3 py-3">
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
                      {link.status === "paid" && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openAction(link, "reverse")}>
                          <RotateCcw className="mr-1 h-3.5 w-3.5" />Reverse
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={Boolean(selectedLink)} onOpenChange={(open) => !open && setSelectedLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action === "settle" ? "Settle intercompany balance" : "Reverse settlement"}</DialogTitle>
            <DialogDescription>
              {action === "settle"
                ? `${selectedLink?.owing_entity_name ?? "The owing company"} will pay ${selectedLink?.owed_entity_name ?? "the receiving company"}. A balanced posted journal will be created.`
                : "A new balanced reversal journal will be posted and the original intercompany balance will reopen. The original settlement remains unchanged."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">{action === "settle" ? "Payment date" : "Reversal date"}</label>
              <Input type="date" value={operationDate} onChange={(event) => setOperationDate(event.target.value)} />
            </div>
            {action === "settle" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Pay from</label>
                  <Select value={owingAccountId} onValueChange={setOwingAccountId}>
                    <SelectTrigger><SelectValue placeholder="Choose checking account" /></SelectTrigger>
                    <SelectContent>
                      {owingAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>{account.name}{account.last_four ? ` •${account.last_four}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Deposit to</label>
                  <Select value={owedAccountId} onValueChange={setOwedAccountId}>
                    <SelectTrigger><SelectValue placeholder="Choose checking account" /></SelectTrigger>
                    <SelectContent>
                      {owedAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>{account.name}{account.last_four ? ` •${account.last_four}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium">{action === "reverse" ? "Reversal explanation" : "Memo"}</label>
              <Textarea
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                rows={3}
                placeholder={action === "reverse" ? "Required reason for reversing this settlement" : "Optional settlement context"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedLink(null)}>Cancel</Button>
            <Button
              variant={action === "reverse" ? "destructive" : "default"}
              disabled={
                markPaid.isPending
                || reverseSettlement.isPending
                || !operationDate
                || (action === "settle" && (!owingAccountId || !owedAccountId))
                || (action === "reverse" && memo.trim().length < 3)
              }
              onClick={() => {
                if (!selectedLink) return;
                if (action === "settle") {
                  markPaid.mutate({
                    id: selectedLink.id,
                    data: {
                      payment_date: operationDate,
                      memo: memo.trim() || null,
                      owing_account_id: owingAccountId,
                      owed_account_id: owedAccountId,
                    },
                  });
                } else {
                  reverseSettlement.mutate({
                    id: selectedLink.id,
                    data: { reversal_date: operationDate, memo: memo.trim() },
                  });
                }
              }}
            >
              {action === "settle" ? "Post Settlement" : "Post Reversal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
