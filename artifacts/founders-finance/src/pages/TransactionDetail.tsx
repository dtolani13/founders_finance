import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetTransactionQueryKey,
  getListTransactionsQueryKey,
  useGetTransaction,
  usePostTransaction,
  useVoidTransaction,
} from "@workspace/api-client-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { entityBadgeStyle, formatCurrency, formatDate } from "@/lib/utils";
import { AlertCircle, ArrowLeft, CheckCircle2, ExternalLink, FileCheck2, History, Scale, XCircle } from "lucide-react";

function timestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function TransactionDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useGetTransaction(id, { query: { queryKey: getGetTransactionQueryKey(id) } });
  const postMutation = usePostTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTransactionQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        toast({ title: "Transaction posted", description: "The balanced journal is now part of the permanent ledger." });
      },
      onError: (cause: unknown) => toast({
        title: (cause as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Transaction could not be posted",
        variant: "destructive",
      }),
    },
  });
  const voidMutation = useVoidTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTransactionQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        toast({ title: "Transaction voided", description: "The original record and journal remain in the audit trail." });
      },
      onError: (cause: unknown) => toast({
        title: (cause as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Transaction could not be voided",
        variant: "destructive",
      }),
    },
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-80 w-full" /></div>;
  if (error || !data) return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Transaction detail could not be loaded.</AlertDescription></Alert>;

  const { transaction, lines, allocations, evidence, audit } = data;
  const debits = lines.reduce((sum, line) => sum + Number(line.debit), 0);
  const credits = lines.reduce((sum, line) => sum + Number(line.credit), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/transactions" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Transactions</Link>
          <h1 className="text-2xl font-bold">{transaction.description}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{formatDate(transaction.transaction_date)}</span><span>-</span><span>{transaction.transaction_type.replaceAll("_", " ")}</span>
            <Badge variant={transaction.status === "posted" ? "default" : "outline"}>{transaction.status}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right"><p className="text-xs text-muted-foreground">Total</p><p className="font-mono text-2xl font-bold">{formatCurrency(transaction.total_amount)}</p></div>
          {transaction.status === "draft" && (
            <AlertDialog>
              <AlertDialogTrigger asChild><Button size="sm" disabled={!transaction.is_balanced}><CheckCircle2 className="mr-1.5 h-4 w-4" />Post</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Post this transaction?</AlertDialogTitle><AlertDialogDescription>Posting adds this balanced journal to the permanent ledger. Posted lines cannot be edited directly; corrections use a controlled void or reversal.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => postMutation.mutate({ id })}>Post Transaction</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {transaction.status !== "voided" && (
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" size="sm"><XCircle className="mr-1.5 h-4 w-4" />Void</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Void this transaction?</AlertDialogTitle><AlertDialogDescription>This preserves the complete record but excludes the transaction from active financial reporting. Closed-period rules still apply.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => voidMutation.mutate({ id })}>Void Transaction</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">Posting state</p><p className="mt-1 font-semibold capitalize">{transaction.status}</p><p className="mt-1 text-xs text-muted-foreground">{transaction.is_balanced ? "Balanced journal" : "Balance review required"}</p></CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">Allocations</p><p className="mt-1 text-xl font-mono font-bold">{allocations.length}</p><p className="mt-1 text-xs text-muted-foreground">company allocation records</p></CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">Evidence</p><p className="mt-1 text-xl font-mono font-bold">{evidence.length}</p><p className="mt-1 text-xs text-muted-foreground">linked supporting records</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Scale className="h-4 w-4" />Journal Lines</CardTitle></CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-y bg-muted/40"><th className="px-4 py-2 text-left text-xs text-muted-foreground">Company</th><th className="px-4 py-2 text-left text-xs text-muted-foreground">Account / Category</th><th className="px-4 py-2 text-left text-xs text-muted-foreground">Memo</th><th className="px-4 py-2 text-right text-xs text-muted-foreground">Debit</th><th className="px-4 py-2 text-right text-xs text-muted-foreground">Credit</th></tr></thead>
          <tbody>{lines.map((line) => <tr key={line.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{line.entity_short_code ?? "-"}</td><td className="px-4 py-3 text-muted-foreground">{line.account_name ?? line.category_name ?? "Equity / clearing"}</td><td className="px-4 py-3 text-muted-foreground">{line.memo ?? "-"}</td><td className="px-4 py-3 text-right font-mono">{Number(line.debit) ? formatCurrency(line.debit) : "-"}</td><td className="px-4 py-3 text-right font-mono">{Number(line.credit) ? formatCurrency(line.credit) : "-"}</td></tr>)}</tbody>
          <tfoot><tr className="border-t bg-muted/20 font-semibold"><td colSpan={3} className="px-4 py-3 text-right">Totals</td><td className="px-4 py-3 text-right font-mono">{formatCurrency(debits)}</td><td className="px-4 py-3 text-right font-mono">{formatCurrency(credits)}</td></tr></tfoot>
        </table></div></CardContent>
      </Card>

      {allocations.length > 0 && <Card><CardHeader><CardTitle className="text-base">Company Allocations</CardTitle></CardHeader><CardContent className="space-y-2">{allocations.map((allocation) => <div key={allocation.id} className="flex items-center gap-3 rounded-md border px-3 py-2"><span className="rounded px-2 py-0.5 text-xs font-bold" style={entityBadgeStyle(allocation.entity_primary_color)}>{allocation.entity_display_name}</span><span className="text-xs text-muted-foreground">{allocation.allocation_percent}%</span><span className="ml-auto font-mono font-semibold">{formatCurrency(allocation.allocation_amount)}</span></div>)}</CardContent></Card>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileCheck2 className="h-4 w-4" />Evidence</CardTitle></CardHeader><CardContent className="space-y-2">{evidence.length ? evidence.map((document) => <div key={document.id} className="flex items-center gap-3 rounded-md border px-3 py-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{document.file_name ?? document.description ?? document.document_type}</p><p className="text-xs text-muted-foreground">{document.evidence_status}</p></div>{document.has_file && <a href={`/api/documents/${document.id}/content`} target="_blank" rel="noreferrer" className="text-sky-400" aria-label="Open evidence"><ExternalLink className="h-4 w-4" /></a>}</div>) : <p className="text-sm text-muted-foreground">No evidence is linked to this transaction.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" />Audit History</CardTitle></CardHeader><CardContent className="space-y-3">{audit.length ? audit.map((record) => <div key={record.id} className="border-l-2 border-sky-500/50 pl-3"><div className="flex items-center justify-between gap-2"><Badge variant="outline">{record.action}</Badge><span className="text-xs text-muted-foreground">{timestamp(record.created_at)}</span></div>{record.memo && <p className="mt-1 text-xs text-muted-foreground">{record.memo}</p>}</div>) : <p className="text-sm text-muted-foreground">No direct audit events were recorded for this transaction.</p>}</CardContent></Card>
      </div>
    </div>
  );
}
