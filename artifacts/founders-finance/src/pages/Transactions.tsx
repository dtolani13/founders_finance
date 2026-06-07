import { useState } from "react";
import type { ReactElement } from "react";
import {
  useListTransactions, getListTransactionsQueryKey,
  useListEntities, getListEntitiesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Clock, XCircle, Filter, X } from "lucide-react";
import { Link } from "wouter";

const STATUS_ICON: Record<string, ReactElement> = {
  posted: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
  draft: <Clock className="w-3.5 h-3.5 text-yellow-500" />,
  needs_review: <AlertCircle className="w-3.5 h-3.5 text-orange-500" />,
  voided: <XCircle className="w-3.5 h-3.5 text-muted-foreground" />,
};

const STATUS_LABEL: Record<string, string> = {
  posted: "Posted",
  draft: "Draft",
  needs_review: "Needs Review",
  voided: "Voided",
};

const TYPE_LABEL: Record<string, string> = {
  business_expense: "Business Expense",
  owner_contribution: "Owner Contribution",
  intercompany_reimbursement: "Intercompany",
  owner_reimbursement: "Reimbursement",
  owner_draw: "Owner Draw",
  transfer: "Transfer",
  asset_purchase: "Asset Purchase",
  revenue: "Revenue",
  adjustment: "Adjustment",
  shared_expense_allocation: "Shared Allocation",
};

const TYPE_BADGE_CLASS: Record<string, string> = {
  business_expense: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
  owner_contribution: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  intercompany_reimbursement: "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400",
  owner_reimbursement: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  owner_draw: "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400",
  transfer: "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400",
  asset_purchase: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  revenue: "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400",
  adjustment: "bg-muted text-muted-foreground",
  shared_expense_allocation: "bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400",
};

export default function Transactions() {
  const [entityId, setEntityId] = useState<string>("");
  const [txType, setTxType] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const params = {
    ...(entityId && { entity_id: entityId }),
    ...(txType && { transaction_type: txType }),
    ...(status && { status }),
    ...(dateFrom && { date_from: dateFrom }),
    ...(dateTo && { date_to: dateTo }),
  };

  const { data: transactions, isLoading, error } = useListTransactions(params, {
    query: { queryKey: getListTransactionsQueryKey(params) }
  });

  const { data: entities } = useListEntities({ query: { queryKey: getListEntitiesQueryKey() } });

  const hasFilters = entityId || txType || status || dateFrom || dateTo;

  function clearFilters() {
    setEntityId("");
    setTxType("");
    setStatus("");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground mt-1">All financial events across entities</p>
        </div>
        <Link href="/expenses/new">
          <Button size="sm" data-testid="button-new-expense">New Expense</Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Filter className="w-3.5 h-3.5" />
              Filters
            </div>

            <Select value={entityId || "__all__"} onValueChange={v => setEntityId(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-40 h-8 text-sm" data-testid="select-entity-filter">
                <SelectValue placeholder="All Entities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Entities</SelectItem>
                {entities?.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={txType || "__all__"} onValueChange={v => setTxType(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-type-filter">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Types</SelectItem>
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={status || "__all__"} onValueChange={v => setStatus(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-status-filter">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Statuses</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="needs_review">Needs Review</SelectItem>
                <SelectItem value="voided">Voided</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5">
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-36 text-sm" data-testid="input-date-from" />
              <span className="text-muted-foreground text-xs">to</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 w-36 text-sm" data-testid="input-date-to" />
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2 text-xs" data-testid="button-clear-filters">
                <X className="w-3 h-3 mr-1" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load transactions.</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => (
            <Card key={i}><CardContent className="py-3"><Skeleton className="h-10 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : !transactions?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground text-sm">No transactions match the current filters.</p>
            {hasFilters && <Button variant="link" onClick={clearFilters} className="mt-2 text-xs">Clear filters</Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm" data-testid="table-transactions">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Alloc</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, i) => (
                <tr
                  key={tx.id}
                  className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 1 ? "bg-muted/10" : ""}`}
                  data-testid={`row-transaction-${tx.id}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(tx.transaction_date)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground leading-tight">{tx.description}</div>
                    {tx.vendor_name && <div className="text-xs text-muted-foreground mt-0.5">{tx.vendor_name}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap border border-black/15 ${TYPE_BADGE_CLASS[tx.transaction_type] ?? "bg-muted text-muted-foreground"}`}>
                      {TYPE_LABEL[tx.transaction_type] ?? tx.transaction_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {STATUS_ICON[tx.status]}
                      <span className="text-xs">{STATUS_LABEL[tx.status] ?? tx.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium">
                    {formatCurrency(tx.total_amount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {tx.allocation_count > 0 ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium rounded-full bg-primary/10 text-primary border border-primary/30">
                        {tx.allocation_count}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {transactions && (
        <p className="text-xs text-muted-foreground text-right">
          {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
          {hasFilters ? " (filtered)" : ""}
        </p>
      )}
    </div>
  );
}
