import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListMonthlyClosePeriods, getListMonthlyClosePeriodsQueryKey,
  useCreateMonthlyClosePeriod,
  useUpdateMonthlyClosePeriod,
  useListEntities, getListEntitiesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { formatDate, entityBadgeStyle } from "@/lib/utils";
import { AlertCircle, CheckSquare, Lock, Unlock, Plus } from "lucide-react";
import type { MonthlyClosePeriod } from "@workspace/api-client-react";

const createSchema = z.object({
  entity_id: z.string().min(1, "Entity is required"),
  period_month: z.string().min(1, "Month is required"),
});

type CreateFormValues = z.infer<typeof createSchema>;

interface ReopenDialog {
  periodId: string;
  memo: string;
}

const CHECKLIST_ITEMS: { key: keyof MonthlyClosePeriod; label: string }[] = [
  { key: "all_statements_uploaded", label: "All statements uploaded" },
  { key: "all_transactions_reconciled", label: "All transactions reconciled" },
  { key: "all_receipts_attached", label: "All receipts attached" },
  { key: "all_allocations_complete", label: "All allocations complete" },
  { key: "intercompany_reviewed", label: "Intercompany balances reviewed" },
  { key: "tax_reserve_reviewed", label: "Tax reserve reviewed" },
  { key: "export_generated", label: "Export generated" },
];

const STATUS_CLASS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  closed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  reopened: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

export default function MonthlyClose() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [entityFilter, setEntityFilter] = useState<string>("");
  const [reopenDialog, setReopenDialog] = useState<ReopenDialog | null>(null);

  const params = entityFilter ? { entity_id: entityFilter } : {};
  const { data: periods, isLoading, error } = useListMonthlyClosePeriods(params, {
    query: { queryKey: getListMonthlyClosePeriodsQueryKey(params) }
  });

  const { data: entities } = useListEntities({ query: { queryKey: getListEntitiesQueryKey() } });

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      entity_id: "",
      period_month: new Date().toISOString().slice(0, 7) + "-01",
    },
  });

  const create = useCreateMonthlyClosePeriod({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMonthlyClosePeriodsQueryKey() });
        toast({ title: "Period created" });
        form.reset();
        setShowForm(false);
      },
      onError: () => toast({ title: "Failed to create period", variant: "destructive" }),
    }
  });

  const update = useUpdateMonthlyClosePeriod({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMonthlyClosePeriodsQueryKey() });
        toast({ title: "Period updated" });
      },
      onError: (err: Error) => toast({ title: "Failed to update", description: err.message, variant: "destructive" }),
    }
  });

  function toggleChecklist(periodId: string, key: string, value: boolean) {
    update.mutate({ id: periodId, data: { [key]: value } });
  }

  function closePeriod(periodId: string) {
    update.mutate({ id: periodId, data: { status: "closed" } });
  }

  function confirmReopen() {
    if (!reopenDialog || !reopenDialog.memo.trim()) return;
    update.mutate(
      { id: reopenDialog.periodId, data: { status: "reopened", correction_memo: reopenDialog.memo.trim() } },
      { onSettled: () => setReopenDialog(null) }
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monthly Close</h1>
          <p className="text-sm text-muted-foreground mt-1">Period closing checklist and status per entity</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)} data-testid="button-add-period">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          New Period
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">Open New Period</CardTitle></CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(v => create.mutate({ data: v }))} className="flex gap-4 items-end">
                <FormField control={form.control} name="entity_id" render={({ field }) => (
                  <FormItem className="w-48">
                    <FormLabel>Entity</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger data-testid="select-entity"><SelectValue placeholder="Select entity" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {entities?.filter(e => e.short_code !== "PERSONAL").map(e => (
                          <SelectItem key={e.id} value={e.id}>{e.display_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="period_month" render={({ field }) => (
                  <FormItem className="w-40">
                    <FormLabel>Month</FormLabel>
                    <FormControl>
                      <Input type="month" onChange={e => field.onChange(e.target.value + "-01")} data-testid="input-month" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel">Cancel</Button>
                  <Button type="submit" disabled={create.isPending} data-testid="button-submit">
                    {create.isPending ? "Creating..." : "Create"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        <Select value={entityFilter || "__all__"} onValueChange={v => setEntityFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-48 h-8 text-sm" data-testid="select-entity-filter">
            <SelectValue placeholder="All Entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Entities</SelectItem>
            {entities?.map(e => <SelectItem key={e.id} value={e.id}>{e.display_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load monthly close periods.</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1,2].map(i => <Card key={i}><CardContent className="py-6"><Skeleton className="h-32 w-full" /></CardContent></Card>)}
        </div>
      ) : !periods?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckSquare className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No close periods created yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {periods.map(period => {
            const checklistDone = CHECKLIST_ITEMS.filter(item => period[item.key] === true).length;
            const allDone = checklistDone === CHECKLIST_ITEMS.length;
            const isClosed = period.status === "closed";
            const isReopening = reopenDialog?.periodId === period.id;

            return (
              <Card key={period.id} data-testid={`card-period-${period.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border border-black/20"
                        style={entityBadgeStyle(period.entity_primary_color)}
                      >
                        {period.entity_display_name}
                      </span>
                      <span className="font-mono text-sm font-medium">{period.period_month?.slice(0, 7)}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-black/15 ${STATUS_CLASS[period.status] ?? "bg-muted text-muted-foreground"}`}>
                        {period.status.charAt(0).toUpperCase() + period.status.slice(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{checklistDone}/{CHECKLIST_ITEMS.length} complete</span>
                      {!isClosed ? (
                        <Button
                          size="sm"
                          variant={allDone ? "default" : "outline"}
                          className="h-7 text-xs"
                          onClick={() => closePeriod(period.id)}
                          disabled={update.isPending}
                          data-testid={`button-close-${period.id}`}
                        >
                          <Lock className="w-3 h-3 mr-1" />
                          Close Period
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setReopenDialog({ periodId: period.id, memo: "" })}
                          disabled={update.isPending}
                          data-testid={`button-reopen-${period.id}`}
                        >
                          <Unlock className="w-3 h-3 mr-1" />
                          Reopen
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {isReopening && (
                  <div className="mx-6 mb-4 rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900/40 p-4 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-orange-800 dark:text-orange-400">Reopen requires a correction memo</p>
                      <p className="text-xs text-orange-700 dark:text-orange-500 mt-0.5">
                        Describe why this closed period is being reopened. This creates an audit trail.
                      </p>
                    </div>
                    <Textarea
                      value={reopenDialog.memo}
                      onChange={e => setReopenDialog(prev => prev ? { ...prev, memo: e.target.value } : null)}
                      placeholder="e.g. Missing receipt discovered for AWS invoice, needs re-reconciliation"
                      rows={2}
                      className="text-sm"
                      data-testid={`input-correction-memo-${period.id}`}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setReopenDialog(null)}
                        data-testid={`button-reopen-cancel-${period.id}`}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 text-xs bg-orange-600 hover:bg-orange-700 text-white"
                        onClick={confirmReopen}
                        disabled={!reopenDialog.memo.trim() || update.isPending}
                        data-testid={`button-reopen-confirm-${period.id}`}
                      >
                        {update.isPending ? "Reopening..." : "Confirm Reopen"}
                      </Button>
                    </div>
                  </div>
                )}

                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {CHECKLIST_ITEMS.map(item => (
                      <div key={item.key} className="flex items-center gap-2">
                        <Checkbox
                          checked={period[item.key] === true}
                          onCheckedChange={v => toggleChecklist(period.id, item.key, Boolean(v))}
                          disabled={isClosed}
                          data-testid={`check-${item.key}-${period.id}`}
                        />
                        <label className={`text-xs cursor-pointer ${period[item.key] ? "line-through text-muted-foreground" : ""}`}>
                          {item.label}
                        </label>
                      </div>
                    ))}
                  </div>
                  {isClosed && period.closed_at && (
                    <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                      Closed {formatDate(period.closed_at)}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
