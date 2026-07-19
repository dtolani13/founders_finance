import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  getListEntitiesQueryKey,
  getListOwnerDrawsQueryKey,
  useCreateOwnerDraw,
  useListEntities,
  useListOwnerDraws,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { entityBadgeStyle, formatCurrency, formatDate } from "@/lib/utils";
import { ArrowDownToLine, Plus } from "lucide-react";

const drawSchema = z.object({
  entity_id: z.string().min(1, "Company is required"),
  amount: z.coerce.number().positive("Amount must be positive"),
  draw_date: z.string().min(1, "Date is required"),
  memo: z.string().optional(),
});

type DrawForm = z.infer<typeof drawSchema>;

function apiMessage(error: unknown): string {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to record owner draw";
}

export default function OwnerDraws() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const { data: draws, isLoading } = useListOwnerDraws({ query: { queryKey: getListOwnerDrawsQueryKey() } });
  const { data: entities } = useListEntities(undefined, { query: { queryKey: getListEntitiesQueryKey() } });
  const form = useForm<DrawForm>({
    resolver: zodResolver(drawSchema),
    defaultValues: {
      entity_id: "",
      amount: 0,
      draw_date: new Date().toISOString().slice(0, 10),
      memo: "",
    },
  });

  const create = useCreateOwnerDraw({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOwnerDrawsQueryKey() });
        toast({ title: "Owner draw recorded", description: "A balanced cash and equity journal was posted." });
        form.reset();
        setShowForm(false);
      },
      onError: (error) => toast({ title: apiMessage(error), variant: "destructive" }),
    },
  });

  const totals = (draws ?? []).reduce<Record<string, number>>((result, draw) => {
    result[draw.entity_id] = (result[draw.entity_id] ?? 0) + Number(draw.amount);
    return result;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Owner Draws</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cash taken from a company by the owner</p>
        </div>
        <Button size="sm" onClick={() => setShowForm((value) => !value)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />Record Draw
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">New Owner Draw</CardTitle></CardHeader>
          <CardContent>
            <Form {...form}>
              <form className="space-y-4" onSubmit={form.handleSubmit((values) => create.mutate({ data: { ...values, memo: values.memo || null } }))}>
                <div className="grid gap-4 md:grid-cols-3">
                  <FormField control={form.control} name="entity_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {entities?.filter((entity) => entity.lifecycle_status === "active" && entity.short_code !== "PERSONAL").map((entity) => (
                            <SelectItem key={entity.id} value={entity.id}>{entity.display_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="amount" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount</FormLabel>
                      <FormControl><Input type="number" min="0.01" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="draw_date" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="memo" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Memo <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                    <FormControl><Textarea rows={2} placeholder="Reason or context for the draw" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button type="submit" disabled={create.isPending}>{create.isPending ? "Posting..." : "Post Draw"}</Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {Object.keys(totals).length > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          {entities?.filter((entity) => totals[entity.id]).map((entity) => (
            <Card key={entity.id} className="border-t-2" style={{ borderTopColor: entity.primary_color ?? "#38BDF8" }}>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">{entity.display_name}</p>
                <p className="mt-1 font-mono text-xl font-bold">{formatCurrency(totals[entity.id])}</p>
                <p className="mt-1 text-xs text-muted-foreground">total owner draws</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isLoading ? <Skeleton className="h-48 w-full" /> : !draws?.length ? (
        <Card><CardContent className="py-14 text-center">
          <ArrowDownToLine className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No owner draws recorded</p>
          <p className="mt-1 text-xs text-muted-foreground">Draws will appear here and in the transaction ledger.</p>
        </CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[680px] text-sm">
            <thead><tr className="border-b bg-muted/40">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Company</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Memo</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Amount</th>
            </tr></thead>
            <tbody>{draws.map((draw) => (
              <tr key={draw.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatDate(draw.draw_date)}</td>
                <td className="px-4 py-3"><span className="rounded px-2 py-0.5 text-xs font-bold" style={entityBadgeStyle(draw.entity_primary_color)}>{draw.entity_display_name}</span></td>
                <td className="max-w-80 truncate px-4 py-3 text-muted-foreground">{draw.memo ?? "-"}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold">{formatCurrency(draw.amount)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
