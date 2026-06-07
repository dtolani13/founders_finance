import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListEntities, getListEntitiesQueryKey,
  useUpdateEntity,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle } from "lucide-react";
import type { Entity } from "@workspace/api-client-react";

const schema = z.object({
  display_name: z.string().min(1, "Display name is required"),
  purpose: z.string().nullable().optional(),
  primary_color: z.string().nullable().optional(),
  secondary_color: z.string().nullable().optional(),
  accent_color: z.string().nullable().optional(),
  tax_classification_note: z.string().nullable().optional(),
});

type FormValues = z.infer<typeof schema>;

function EntityForm({ entity }: { entity: Entity }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      display_name: entity.display_name,
      purpose: entity.purpose ?? "",
      primary_color: entity.primary_color ?? "",
      secondary_color: entity.secondary_color ?? "",
      accent_color: entity.accent_color ?? "",
      tax_classification_note: entity.tax_classification_note ?? "",
    },
  });

  useEffect(() => {
    form.reset({
      display_name: entity.display_name,
      purpose: entity.purpose ?? "",
      primary_color: entity.primary_color ?? "",
      secondary_color: entity.secondary_color ?? "",
      accent_color: entity.accent_color ?? "",
      tax_classification_note: entity.tax_classification_note ?? "",
    });
  }, [entity.id]);

  const update = useUpdateEntity({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEntitiesQueryKey() });
        toast({ title: "Entity updated", description: `${entity.display_name} settings saved.` });
      },
      onError: () => toast({ title: "Failed to update entity", variant: "destructive" }),
    }
  });

  function onSubmit(values: FormValues) {
    update.mutate({ id: entity.id, data: values });
  }

  return (
    <Card className="border-t-2" style={{ borderTopColor: entity.primary_color ?? "#6b7280" }} data-testid={`card-entity-${entity.id}`}>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entity.primary_color ?? "#6b7280" }} />
          <div>
            <CardTitle className="text-sm">{entity.legal_name}</CardTitle>
            <p className="text-xs text-muted-foreground">{entity.short_code} · {entity.entity_type}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="display_name" render={({ field }) => (
              <FormItem>
                <FormLabel>Display Name</FormLabel>
                <FormControl><Input {...field} data-testid={`input-display-name-${entity.id}`} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="purpose" render={({ field }) => (
              <FormItem>
                <FormLabel>Purpose <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <FormControl><Textarea rows={2} placeholder="What does this entity do?" {...field} value={field.value ?? ""} data-testid={`input-purpose-${entity.id}`} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="primary_color" render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Color</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <input type="color" value={field.value || "#6b7280"} onChange={e => field.onChange(e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-border" data-testid={`input-primary-color-${entity.id}`} />
                      <Input value={field.value ?? ""} onChange={field.onChange} placeholder="#7C3AED" className="h-8 text-xs font-mono" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="secondary_color" render={({ field }) => (
                <FormItem>
                  <FormLabel>Secondary Color</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <input type="color" value={field.value || "#6b7280"} onChange={e => field.onChange(e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-border" />
                      <Input value={field.value ?? ""} onChange={field.onChange} placeholder="#EDE9FE" className="h-8 text-xs font-mono" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="accent_color" render={({ field }) => (
                <FormItem>
                  <FormLabel>Accent Color</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <input type="color" value={field.value || "#6b7280"} onChange={e => field.onChange(e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-border" />
                      <Input value={field.value ?? ""} onChange={field.onChange} placeholder="#A78BFA" className="h-8 text-xs font-mono" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="tax_classification_note" render={({ field }) => (
              <FormItem>
                <FormLabel>Tax Classification Note <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <FormControl><Input placeholder="e.g. Single-member LLC, disregarded entity" {...field} value={field.value ?? ""} data-testid={`input-tax-note-${entity.id}`} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={update.isPending} data-testid={`button-save-${entity.id}`}>
                {update.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { data: entities, isLoading, error } = useListEntities({ query: { queryKey: getListEntitiesQueryKey() } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Entity Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure display names, colors, and notes per entity</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load entities.</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <Card key={i}><CardContent className="py-6"><Skeleton className="h-32 w-full" /></CardContent></Card>)}
        </div>
      ) : (
        <div className="space-y-4">
          {entities?.map(entity => <EntityForm key={entity.id} entity={entity} />)}
        </div>
      )}
    </div>
  );
}
