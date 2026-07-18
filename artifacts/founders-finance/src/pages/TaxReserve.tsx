import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useGetTaxReserveSummary, getGetTaxReserveSummaryQueryKey,
  useCreateTaxReserveRule,
  useSuggestTaxReserveTransfer,
  useListEntities, getListEntitiesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { AlertCircle, Info } from "lucide-react";

const ruleSchema = z.object({
  entity_id: z.string().min(1, "Entity is required"),
  reserve_percent: z.coerce.number().min(1).max(100),
  rule_basis: z.enum(["revenue", "net_income", "manual"]),
  notes: z.string().optional(),
});

const suggestSchema = z.object({
  entity_id: z.string().min(1, "Entity is required"),
  revenue_amount: z.coerce.number().positive("Enter a positive revenue amount"),
});

type RuleFormValues = z.infer<typeof ruleSchema>;
type SuggestFormValues = z.infer<typeof suggestSchema>;

export default function TaxReserve() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [suggestion, setSuggestion] = useState<{ suggested_amount: number; reserve_percent: number; basis: string; disclaimer: string } | null>(null);
  const [showRuleForm, setShowRuleForm] = useState(false);

  const { data: summaries, isLoading, error } = useGetTaxReserveSummary({
    query: { queryKey: getGetTaxReserveSummaryQueryKey() }
  });

  const { data: entities } = useListEntities(undefined, { query: { queryKey: getListEntitiesQueryKey() } });

  const createRule = useCreateTaxReserveRule({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTaxReserveSummaryQueryKey() });
        toast({ title: "Tax reserve rule saved" });
        ruleForm.reset();
        setShowRuleForm(false);
      },
      onError: () => toast({ title: "Failed to save rule", variant: "destructive" }),
    }
  });

  const suggest = useSuggestTaxReserveTransfer({
    mutation: {
      onSuccess: (data) => setSuggestion(data),
      onError: () => toast({ title: "Failed to generate suggestion", variant: "destructive" }),
    }
  });

  const ruleForm = useForm<RuleFormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: { entity_id: "", reserve_percent: 30, rule_basis: "revenue", notes: "" },
  });

  const suggestForm = useForm<SuggestFormValues>({
    resolver: zodResolver(suggestSchema),
    defaultValues: { entity_id: "", revenue_amount: 0 },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tax Reserve</h1>
          <p className="text-sm text-muted-foreground mt-1">Reserve rules and set-aside estimates per entity</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowRuleForm(!showRuleForm)} data-testid="button-toggle-rule-form">
          Set Reserve Rule
        </Button>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Tax reserve estimates are for planning purposes only. This is not tax advice. Consult a qualified tax professional for your actual tax obligations.
        </AlertDescription>
      </Alert>

      {showRuleForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">Configure Reserve Rule</CardTitle></CardHeader>
          <CardContent>
            <Form {...ruleForm}>
              <form onSubmit={ruleForm.handleSubmit(v => createRule.mutate({ data: v }))} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <FormField control={ruleForm.control} name="entity_id" render={({ field }) => (
                    <FormItem>
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
                  <FormField control={ruleForm.control} name="reserve_percent" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reserve %</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input type="number" step="0.5" min="1" max="100" {...field} data-testid="input-percent" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={ruleForm.control} name="rule_basis" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Basis</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-basis"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="revenue">Gross Revenue</SelectItem>
                          <SelectItem value="net_income">Net Income</SelectItem>
                          <SelectItem value="manual">Manual</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowRuleForm(false)} data-testid="button-cancel">Cancel</Button>
                  <Button type="submit" disabled={createRule.isPending} data-testid="button-save-rule">
                    {createRule.isPending ? "Saving..." : "Save Rule"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load tax reserve data.</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2].map(i => <Card key={i}><CardContent className="py-6"><Skeleton className="h-24 w-full" /></CardContent></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Array.isArray(summaries) ? summaries : [summaries]).filter(Boolean).map((s: NonNullable<typeof summaries>[number]) => (
            <Card key={s.entity.id} className="border-t-2" style={{ borderTopColor: s.entity.primary_color ?? "#6b7280" }} data-testid={`card-reserve-${s.entity.id}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{s.entity.display_name}</CardTitle>
                {s.rule ? (
                  <p className="text-xs text-muted-foreground">{formatPercent(s.rule.reserve_percent)} of {s.rule.rule_basis}</p>
                ) : (
                  <p className="text-xs text-orange-500">No rule configured</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Current Reserve Balance</p>
                  <p className="text-2xl font-mono font-bold">{formatCurrency(s.current_reserve_balance)}</p>
                </div>
                {s.rule && s.suggested_set_aside > 0 && (
                  <div className="pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-1">Suggested Set-Aside</p>
                    <p className="text-lg font-mono text-orange-500">{formatCurrency(s.suggested_set_aside)}</p>
                    <p className="text-xs text-muted-foreground mt-1">based on last revenue: {formatCurrency(s.last_revenue_amount)}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Suggest calculator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Set-Aside Calculator</CardTitle>
          <p className="text-xs text-muted-foreground">Enter a revenue amount to calculate suggested tax reserve transfer</p>
        </CardHeader>
        <CardContent>
          <Form {...suggestForm}>
            <form onSubmit={suggestForm.handleSubmit(v => suggest.mutate({ data: v }))} className="flex gap-4 items-end flex-wrap">
              <FormField control={suggestForm.control} name="entity_id" render={({ field }) => (
                <FormItem className="w-48">
                  <FormLabel>Entity</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger data-testid="select-calc-entity"><SelectValue placeholder="Entity" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {entities?.filter(e => e.short_code !== "PERSONAL").map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={suggestForm.control} name="revenue_amount" render={({ field }) => (
                <FormItem className="w-44">
                  <FormLabel>Revenue Amount</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <Input type="number" step="0.01" min="0.01" className="pl-7" placeholder="0.00" {...field} data-testid="input-revenue" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" disabled={suggest.isPending} size="sm" data-testid="button-calculate">
                {suggest.isPending ? "Calculating..." : "Calculate"}
              </Button>
            </form>
          </Form>

          {suggestion && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Suggested Transfer to Tax Reserve</p>
                  <p className="text-3xl font-mono font-bold">{formatCurrency(suggestion.suggested_amount)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatPercent(suggestion.reserve_percent)} of {suggestion.basis}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3 border-t border-border pt-3 italic">{suggestion.disclaimer}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
