import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  getListEntitiesQueryKey,
  useUpdateEntity,
  useCreateEntity,
  useListEntities,
  useCloseEntity,
  useArchiveEntity,
  useReopenEntity,
  getEntityClosureAssessment,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Archive, Building2, LockKeyhole, Plus, RotateCcw } from "lucide-react";
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

const createSchema = z.object({
  legal_name: z.string().min(1, "Legal name is required"),
  display_name: z.string().min(1, "Display name is required"),
  short_code: z.string().min(2, "Short code is required"),
  entity_type: z.string().min(1),
  purpose: z.string().nullable().optional(),
  tax_classification_note: z.string().nullable().optional(),
});

type CreateFormValues = z.infer<typeof createSchema>;

function AddCompanyForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      legal_name: "Polymathic Systems LLC",
      display_name: "Polymathic Systems",
      short_code: "POLY",
      entity_type: "LLC",
      purpose: "Systems, automation, and software operations",
      tax_classification_note: "Single-member LLC disregarded for federal tax",
    },
  });

  const create = useCreateEntity({
    mutation: {
      onSuccess: (entity) => {
        queryClient.invalidateQueries({ queryKey: getListEntitiesQueryKey() });
        toast({ title: "Company added", description: `${entity.display_name} is ready with checking and tax reserve accounts.` });
        form.reset({
          legal_name: "",
          display_name: "",
          short_code: "",
          entity_type: "LLC",
          purpose: "",
          tax_classification_note: "",
        });
      },
      onError: () => toast({ title: "Failed to add company", variant: "destructive" }),
    },
  });

  function onSubmit(values: CreateFormValues) {
    create.mutate({
      data: {
        ...values,
        primary_color: "#00AEEF",
        secondary_color: "#0B1726",
        accent_color: "#7DD3FC",
      },
    });
  }

  return (
    <Card className="border-sky-500/40 bg-card/95">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-sky-400/50 bg-sky-500/10 text-sky-300">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">Add Company</CardTitle>
            <p className="text-xs text-muted-foreground">Creates the entity plus default checking and tax reserve accounts.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 md:grid-cols-2">
            <FormField control={form.control} name="legal_name" render={({ field }) => (
              <FormItem>
                <FormLabel>Legal Name</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="display_name" render={({ field }) => (
              <FormItem>
                <FormLabel>Display Name</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="short_code" render={({ field }) => (
              <FormItem>
                <FormLabel>Short Code</FormLabel>
                <FormControl><Input {...field} className="uppercase" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="entity_type" render={({ field }) => (
              <FormItem>
                <FormLabel>Entity Type</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="purpose" render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Purpose</FormLabel>
                <FormControl><Textarea rows={2} {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="tax_classification_note" render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Tax Classification Note</FormLabel>
                <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={create.isPending}>
                <Plus className="h-4 w-4" />
                {create.isPending ? "Adding..." : "Add Company"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function EntityForm({ entity }: { entity: Entity }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [archiveUntil, setArchiveUntil] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [assessingLifecycle, setAssessingLifecycle] = useState(false);
  const isPersonal = entity.short_code === "PERSONAL";
  const isActive = entity.lifecycle_status === "active" && entity.is_active;
  const isClosed = entity.lifecycle_status === "closed";
  const isArchived = entity.lifecycle_status === "archived";

  const refreshEntities = () => {
    queryClient.invalidateQueries({ queryKey: getListEntitiesQueryKey() });
  };

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
    setArchiveUntil(entity.archive_until ? entity.archive_until.slice(0, 10) : "");
    setArchiveReason(entity.archive_reason ?? "");
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

  const closeEntity = useCloseEntity({
    mutation: {
      onSuccess: (updated) => {
        refreshEntities();
        toast({ title: "Company closed", description: `${updated.display_name} is inactive but its records are preserved.` });
      },
      onError: () => toast({ title: "Failed to close company", variant: "destructive" }),
    },
  });

  const archiveEntity = useArchiveEntity({
    mutation: {
      onSuccess: (updated) => {
        refreshEntities();
        toast({ title: "Company archived", description: `${updated.display_name} is archived for recordkeeping.` });
      },
      onError: () => toast({ title: "Failed to archive company", variant: "destructive" }),
    },
  });

  const reopenEntity = useReopenEntity({
    mutation: {
      onSuccess: (updated) => {
        refreshEntities();
        toast({ title: "Company reopened", description: `${updated.display_name} is active again.` });
      },
      onError: () => toast({ title: "Failed to reopen company", variant: "destructive" }),
    },
  });

  function lifecyclePayload() {
    return {
      archive_until: archiveUntil ? new Date(`${archiveUntil}T00:00:00`).toISOString() : null,
      archive_reason: archiveReason || null,
    };
  }

  async function confirmLifecycle(action: "close" | "archive") {
    setAssessingLifecycle(true);
    try {
      const assessment = await getEntityClosureAssessment(entity.id);
      const warningText = assessment.warnings.length
        ? `\n\nReview before continuing:\n- ${assessment.warnings.join("\n- ")}`
        : "\n\nNo open balance or record warnings were found.";
      return window.confirm(`${action === "close" ? "Close" : "Archive"} ${entity.display_name}? All financial records remain preserved.${warningText}`);
    } catch {
      toast({ title: "Closure review could not be loaded", variant: "destructive" });
      return false;
    } finally {
      setAssessingLifecycle(false);
    }
  }

  async function handleClose() {
    if (!await confirmLifecycle("close")) return;
    closeEntity.mutate({ id: entity.id, data: lifecyclePayload() });
  }

  async function handleArchive() {
    if (!await confirmLifecycle("archive")) return;
    archiveEntity.mutate({ id: entity.id, data: lifecyclePayload() });
  }

  function handleReopen() {
    if (!window.confirm(`Reopen ${entity.display_name}? Its accounts will become active again.`)) return;
    reopenEntity.mutate({ id: entity.id });
  }

  return (
    <Card className={isActive ? "border-t-2" : "border-t-2 opacity-85"} style={{ borderTopColor: entity.primary_color ?? "#6b7280" }} data-testid={`card-entity-${entity.id}`}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entity.primary_color ?? "#6b7280" }} />
            <div>
              <CardTitle className="text-sm">{entity.legal_name}</CardTitle>
              <p className="text-xs text-muted-foreground">{entity.short_code} · {entity.entity_type}</p>
            </div>
          </div>
          <Badge
            variant={isActive ? "default" : "outline"}
            className={isArchived ? "border-slate-500 text-slate-300" : isClosed ? "border-amber-400/60 text-amber-200" : ""}
          >
            {entity.lifecycle_status}
          </Badge>
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

        <div className="mt-6 border-t border-border pt-5">
          <div className="grid gap-3 md:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="text-sm font-semibold text-white">Company Lifecycle</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Close or archive companies without deleting the transaction history, evidence, statements, or audit trail.
              </p>
              {(entity.closed_at || entity.archive_until) && (
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {entity.closed_at && <p>Closed: {new Date(entity.closed_at).toLocaleDateString()}</p>}
                  {entity.archive_until && <p>Keep records until: {new Date(entity.archive_until).toLocaleDateString()}</p>}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Recordkeeping Until</label>
                  <Input type="date" value={archiveUntil} onChange={(event) => setArchiveUntil(event.target.value)} disabled={isPersonal} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Reason</label>
                  <Input value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} placeholder="Closed, sold, inactive, dissolved..." disabled={isPersonal} />
                </div>
              </div>
              {isPersonal ? (
                <Alert>
                  <LockKeyhole className="h-4 w-4" />
                  <AlertDescription>The personal founder record is protected and cannot be closed or archived.</AlertDescription>
                </Alert>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
                  {!isActive && (
                    <Button type="button" variant="outline" size="sm" onClick={handleReopen} disabled={reopenEntity.isPending}>
                      <RotateCcw className="h-4 w-4" />
                      {reopenEntity.isPending ? "Reopening..." : "Reopen"}
                    </Button>
                  )}
                  {isActive && (
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleClose()} disabled={closeEntity.isPending || assessingLifecycle}>
                      <LockKeyhole className="h-4 w-4" />
                      {closeEntity.isPending ? "Closing..." : "Close Company"}
                    </Button>
                  )}
                  {!isArchived && (
                    <Button type="button" variant="destructive" size="sm" onClick={() => void handleArchive()} disabled={archiveEntity.isPending || assessingLifecycle}>
                      <Archive className="h-4 w-4" />
                      {archiveEntity.isPending ? "Archiving..." : "Archive"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { data: entities, isLoading, error } = useListEntities({ include_inactive: true });
  const activeEntities = entities?.filter(entity => entity.lifecycle_status === "active" && entity.is_active) ?? [];
  const inactiveEntities = entities?.filter(entity => !(entity.lifecycle_status === "active" && entity.is_active)) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Company Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage entities, operating accounts, colors, and tax notes.</p>
      </div>

      <AddCompanyForm />

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
        <>
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Active Companies</h2>
              <div className="mt-3 space-y-4">
                {activeEntities.map(entity => <EntityForm key={entity.id} entity={entity} />)}
              </div>
            </div>
          </div>

          {inactiveEntities.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Closed / Archived Companies</h2>
              {inactiveEntities.map(entity => <EntityForm key={entity.id} entity={entity} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
