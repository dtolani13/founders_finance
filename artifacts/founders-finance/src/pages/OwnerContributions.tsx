import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListOwnerContributions, getListOwnerContributionsQueryKey,
  useCreateOwnerContribution,
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
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, entityBadgeStyle } from "@/lib/utils";
import { Plus } from "lucide-react";

const schema = z.object({
  entity_id: z.string().min(1, "Entity is required"),
  amount: z.coerce.number().positive("Amount must be positive"),
  contribution_type: z.enum(["capital_contribution", "owner_loan"]),
  memo: z.string().optional(),
  contribution_date: z.string().min(1, "Date is required"),
});

type FormValues = z.infer<typeof schema>;

export default function OwnerContributions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: contributions, isLoading } = useListOwnerContributions({ query: { queryKey: getListOwnerContributionsQueryKey() } });
  const { data: entities } = useListEntities({ query: { queryKey: getListEntitiesQueryKey() } });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      entity_id: "",
      amount: 0,
      contribution_type: "capital_contribution",
      memo: "",
      contribution_date: new Date().toISOString().split("T")[0],
    },
  });

  const create = useCreateOwnerContribution({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOwnerContributionsQueryKey() });
        toast({ title: "Contribution recorded" });
        form.reset();
        setShowForm(false);
      },
      onError: () => toast({ title: "Failed to record contribution", variant: "destructive" }),
    }
  });

  function onSubmit(values: FormValues) {
    create.mutate({ data: { ...values, memo: values.memo ?? null } });
  }

  const totalByEntity: Record<string, number> = {};
  contributions?.forEach(c => {
    totalByEntity[c.entity_id] = (totalByEntity[c.entity_id] ?? 0) + parseFloat(String(c.amount));
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Owner Contributions</h1>
          <p className="text-sm text-muted-foreground mt-1">Capital injections and owner loans by entity</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)} data-testid="button-toggle-form">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Record Contribution
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">New Contribution</CardTitle></CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="entity_id" render={({ field }) => (
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
                  <FormField control={form.control} name="contribution_type" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-type"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="capital_contribution">Capital Contribution</SelectItem>
                          <SelectItem value="owner_loan">Owner Loan</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="amount" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                          <Input type="number" step="0.01" min="0.01" className="pl-7" placeholder="0.00" {...field} data-testid="input-amount" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="contribution_date" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl><Input type="date" {...field} data-testid="input-date" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="memo" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Memo <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl><Textarea rows={2} placeholder="Purpose or description" {...field} data-testid="input-memo" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel">Cancel</Button>
                  <Button type="submit" disabled={create.isPending} data-testid="button-submit">
                    {create.isPending ? "Recording..." : "Record"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Summary by entity */}
      {Object.keys(totalByEntity).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {entities?.filter(e => totalByEntity[e.id]).map(entity => (
            <Card key={entity.id} className="border-t-2" style={{ borderTopColor: entity.primary_color ?? "#6b7280" }}>
              <CardContent className="py-4">
                <p className="text-xs font-medium text-muted-foreground mb-1">{entity.display_name}</p>
                <p className="text-2xl font-mono font-bold">{formatCurrency(totalByEntity[entity.id])}</p>
                <p className="text-xs text-muted-foreground mt-1">total contributed</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !contributions?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground text-sm">No owner contributions recorded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm" data-testid="table-contributions">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Entity</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Memo</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody>
              {contributions.map(c => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/20" data-testid={`row-contribution-${c.id}`}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatDate(c.contribution_date)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold" style={entityBadgeStyle(c.entity_primary_color)}>
                      {c.entity_display_name ?? c.entity_id.slice(0, 8)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {c.contribution_type === "capital_contribution" ? "Capital" : "Loan"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-40 truncate">{c.memo ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium">{formatCurrency(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
