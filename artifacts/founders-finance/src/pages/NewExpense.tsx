import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import {
  useListEntities, getListEntitiesQueryKey,
  useListAccounts, getListAccountsQueryKey,
  useListCategories, getListCategoriesQueryKey,
  useListVendors, getListVendorsQueryKey,
  useListAllocationPresets, getListAllocationPresetsQueryKey,
  useCreateManualExpense,
  getListTransactionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { AlertCircle, AlertTriangle, Plus, X } from "lucide-react";

const schema = z.object({
  transaction_date: z.string().min(1, "Date is required"),
  description: z.string().min(1, "Description is required"),
  vendor_name: z.string().optional(),
  total_amount: z.coerce.number().positive("Amount must be positive"),
  business_purpose: z.string().optional(),
  paying_entity_id: z.string().min(1, "Paying entity is required"),
  paying_account_id: z.string().min(1, "Paying account is required"),
  category_id: z.string().optional(),
  preset_id: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface ManualAllocation {
  target_entity_id: string;
  allocation_amount: number;
  allocation_percent: number | null;
  creates_intercompany_balance: boolean;
  category_id: string | null;
  memo: string | null;
}

export default function NewExpense() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [allocMode, setAllocMode] = useState<"preset" | "manual">("manual");
  const [allocations, setAllocations] = useState<ManualAllocation[]>([{ target_entity_id: "", allocation_amount: 0, allocation_percent: null, creates_intercompany_balance: false, category_id: null, memo: null }]);
  const [allocError, setAllocError] = useState<string | null>(null);

  const { data: entities } = useListEntities(undefined, { query: { queryKey: getListEntitiesQueryKey() } });
  const { data: categories } = useListCategories(undefined, { query: { queryKey: getListCategoriesQueryKey() } });
  const { data: vendors } = useListVendors(undefined, { query: { queryKey: getListVendorsQueryKey() } });
  const { data: presets } = useListAllocationPresets(undefined, { query: { queryKey: getListAllocationPresetsQueryKey() } });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      transaction_date: new Date().toISOString().split("T")[0],
      description: "",
      vendor_name: "",
      total_amount: 0,
      business_purpose: "",
      paying_entity_id: "",
      paying_account_id: "",
      category_id: "",
      preset_id: "",
    },
  });

  const payingEntityId = form.watch("paying_entity_id");
  const totalAmount = form.watch("total_amount");
  const presetId = form.watch("preset_id");

  const { data: payingAccounts } = useListAccounts(
    { entity_id: payingEntityId },
    { query: { enabled: !!payingEntityId, queryKey: getListAccountsQueryKey({ entity_id: payingEntityId }) } }
  );

  // Auto-populate allocations from preset
  useEffect(() => {
    if (allocMode === "preset" && presetId && presets) {
      const preset = presets.find(p => p.id === presetId);
      if (preset && totalAmount > 0) {
        const newAllocs: ManualAllocation[] = preset.lines.map(line => ({
          target_entity_id: line.entity_id,
          allocation_amount: Math.round(totalAmount * (parseFloat(String(line.percent)) / 100) * 100) / 100,
          allocation_percent: parseFloat(String(line.percent)),
          creates_intercompany_balance: false,
          category_id: null,
          memo: null,
        }));
        setAllocations(newAllocs);
      }
    }
  }, [allocMode, presetId, totalAmount, presets]);

  const allocTotal = allocations.reduce((s, a) => s + (a.allocation_amount || 0), 0);
  const allocDiff = Math.abs(allocTotal - (totalAmount || 0));

  useEffect(() => {
    if (totalAmount > 0 && allocTotal > 0 && allocDiff >= 0.01) {
      setAllocError(`Allocation total (${formatCurrency(allocTotal)}) must equal transaction total (${formatCurrency(totalAmount)})`);
    } else {
      setAllocError(null);
    }
  }, [allocTotal, totalAmount, allocDiff]);

  const createExpense = useCreateManualExpense({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        toast({ title: "Expense recorded", description: "Transaction has been created." });
        setLocation("/transactions");
      },
      onError: (err: Error) => {
        toast({ title: "Failed to create expense", description: err.message, variant: "destructive" });
      },
    }
  });

  function updateAllocation(idx: number, key: keyof ManualAllocation, value: unknown) {
    setAllocations(prev => prev.map((a, i) => i === idx ? { ...a, [key]: value } : a));
  }

  function removeAllocation(idx: number) {
    setAllocations(prev => prev.filter((_, i) => i !== idx));
  }

  function addAllocation() {
    setAllocations(prev => [...prev, { target_entity_id: "", allocation_amount: 0, allocation_percent: null, creates_intercompany_balance: false, category_id: null, memo: null }]);
  }

  function onSubmit(values: FormValues) {
    if (allocDiff >= 0.01) {
      setAllocError(`Allocation total must equal transaction total (${formatCurrency(values.total_amount)})`);
      return;
    }
    if (allocations.some(a => !a.target_entity_id)) {
      setAllocError("All allocations must have a target entity selected");
      return;
    }

    createExpense.mutate({
      data: {
        transaction_date: values.transaction_date,
        description: values.description,
        vendor_name: values.vendor_name || undefined,
        total_amount: values.total_amount,
        business_purpose: values.business_purpose || undefined,
        paying_entity_id: values.paying_entity_id,
        paying_account_id: values.paying_account_id,
        category_id: values.category_id || undefined,
        preset_id: values.preset_id || undefined,
        allocations: allocations.map(a => ({
          target_entity_id: a.target_entity_id,
          allocation_amount: a.allocation_amount,
          allocation_percent: a.allocation_percent,
          creates_intercompany_balance: a.target_entity_id !== payingEntityId,
          category_id: a.category_id,
          memo: a.memo,
        })),
      }
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Expense</h1>
        <p className="text-sm text-muted-foreground mt-1">Record a business expense with entity allocation</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Expense Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="transaction_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl><Input type="date" {...field} data-testid="input-date" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="total_amount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Amount</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input type="number" step="0.01" min="0.01" className="pl-7" placeholder="0.00" {...field} data-testid="input-amount" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Input placeholder="e.g. AWS monthly compute" {...field} data-testid="input-description" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="vendor_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input list="vendor-list" placeholder="e.g. AWS" {...field} data-testid="input-vendor" />
                    </FormControl>
                    <datalist id="vendor-list">
                      {vendors?.map(v => <option key={v.id} value={v.name} />)}
                    </datalist>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="category_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="business_purpose" render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Purpose <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl><Textarea placeholder="Why was this a business expense?" rows={2} {...field} data-testid="input-business-purpose" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Payment</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="paying_entity_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paying Entity</FormLabel>
                    <Select onValueChange={v => { field.onChange(v); form.setValue("paying_account_id", ""); }} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-paying-entity">
                          <SelectValue placeholder="Select entity" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {entities?.map(e => <SelectItem key={e.id} value={e.id}>{e.display_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="paying_account_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paying Account</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!payingEntityId}>
                      <FormControl>
                        <SelectTrigger data-testid="select-paying-account">
                          <SelectValue placeholder={payingEntityId ? "Select account" : "Select entity first"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {payingAccounts?.map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.name} {a.last_four ? `(…${a.last_four})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Allocation</CardTitle>
                <div className="flex gap-2">
                  <Button type="button" variant={allocMode === "preset" ? "default" : "outline"} size="sm" onClick={() => setAllocMode("preset")} data-testid="button-preset-mode">Use Preset</Button>
                  <Button type="button" variant={allocMode === "manual" ? "default" : "outline"} size="sm" onClick={() => setAllocMode("manual")} data-testid="button-manual-mode">Manual</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {allocMode === "preset" && (
                <FormField control={form.control} name="preset_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Allocation Preset</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-preset">
                          <SelectValue placeholder="Select a preset" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {presets?.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                            {p.lines.length > 0 && ` — ${p.lines.map(l => `${l.entity_short_code} ${l.percent}%`).join(" / ")}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <div className="space-y-3">
                {allocations.map((alloc, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end" data-testid={`row-allocation-${idx}`}>
                    <div className="col-span-4">
                      {idx === 0 && <label className="text-xs font-medium text-muted-foreground mb-1 block">Entity</label>}
                      <Select
                        value={alloc.target_entity_id}
                        onValueChange={v => updateAllocation(idx, "target_entity_id", v)}
                      >
                        <SelectTrigger className="h-8 text-sm" data-testid={`select-alloc-entity-${idx}`}>
                          <SelectValue placeholder="Entity" />
                        </SelectTrigger>
                        <SelectContent>
                          {entities?.map(e => <SelectItem key={e.id} value={e.id}>{e.display_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-4">
                      {idx === 0 && <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount</label>}
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={alloc.allocation_amount || ""}
                          onChange={e => updateAllocation(idx, "allocation_amount", parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm pl-5"
                          data-testid={`input-alloc-amount-${idx}`}
                        />
                      </div>
                    </div>
                    <div className="col-span-3">
                      {idx === 0 && <label className="text-xs font-medium text-muted-foreground mb-1 block">%</label>}
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={alloc.allocation_percent ?? ""}
                        onChange={e => updateAllocation(idx, "allocation_percent", e.target.value ? parseFloat(e.target.value) : null)}
                        className="h-8 text-sm"
                        placeholder="—"
                        data-testid={`input-alloc-percent-${idx}`}
                      />
                    </div>
                    <div className="col-span-1">
                      {idx === 0 && <div className="mb-1 h-4" />}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => removeAllocation(idx)}
                        disabled={allocations.length === 1}
                        data-testid={`button-remove-alloc-${idx}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addAllocation}
                  className="text-xs h-7"
                  data-testid="button-add-allocation"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Entity
                </Button>
              </div>

              {/* Allocation bar */}
              {totalAmount > 0 && allocations.some(a => a.allocation_amount > 0) && (
                <div className="mt-2">
                  <div className="flex h-3 rounded-full overflow-hidden gap-px bg-muted">
                    {allocations.filter(a => a.allocation_amount > 0).map((alloc, idx) => {
                      const pct = (alloc.allocation_amount / totalAmount) * 100;
                      const entity = entities?.find(e => e.id === alloc.target_entity_id);
                      return (
                        <div
                          key={idx}
                          style={{ width: `${pct}%`, backgroundColor: entity?.primary_color ?? "#6b7280" }}
                          title={`${entity?.display_name ?? "Unknown"}: ${formatCurrency(alloc.allocation_amount)} (${pct.toFixed(1)}%)`}
                        />
                      );
                    })}
                    {allocDiff > 0.01 && (
                      <div style={{ flex: 1, backgroundColor: "hsl(var(--destructive) / 0.2)" }} />
                    )}
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                    <span>Allocated: {formatCurrency(allocTotal)}</span>
                    <span className={allocDiff >= 0.01 ? "text-destructive font-medium" : "text-green-600"}>
                      {allocDiff < 0.01 ? "Balanced" : `Diff: ${formatCurrency(allocDiff)}`}
                    </span>
                  </div>
                </div>
              )}

              {allocError && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <AlertDescription className="text-xs">{allocError}</AlertDescription>
                </Alert>
              )}

              {payingEntityId && allocations.some(a => a.target_entity_id && a.target_entity_id !== payingEntityId && a.allocation_amount > 0) && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                  Allocations to entities other than the paying entity will create intercompany balances.
                </p>
              )}

              {(() => {
                const personalEntity = entities?.find(e => e.short_code === "PERSONAL");
                const hasPersonalAlloc = personalEntity && allocations.some(
                  a => a.target_entity_id === personalEntity.id && a.allocation_amount > 0
                );
                if (!hasPersonalAlloc) return null;
                return (
                  <div className="flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/40 p-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Personal / Non-Deductible</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                        One or more allocations target the Personal / Founder entity. These amounts are not business expenses and are not tax-deductible.
                      </p>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => setLocation("/transactions")} data-testid="button-cancel">Cancel</Button>
            <Button
              type="submit"
              disabled={createExpense.isPending || !!allocError}
              data-testid="button-submit"
            >
              {createExpense.isPending ? "Recording..." : "Record Expense"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
