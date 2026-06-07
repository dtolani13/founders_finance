import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListDocuments, getListDocumentsQueryKey,
  useCreateDocument,
  useUpdateDocument,
  useListEntities, getListEntitiesQueryKey,
  useListTransactions, getListTransactionsQueryKey,
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
import { useToast } from "@/hooks/use-toast";
import { formatDate, entityBadgeStyle } from "@/lib/utils";
import { AlertCircle, Files, Plus, Filter, X } from "lucide-react";

const EVIDENCE_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  metadata_only: { label: "Metadata Only", className: "bg-muted text-muted-foreground" },
  attached: { label: "Attached", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  missing: { label: "Missing", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  needs_review: { label: "Needs Review", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
};

const DOC_TYPES = ["receipt","invoice","screenshot","contract","bank_statement","subscription_receipt","tax_document","note","other"] as const;

const schema = z.object({
  document_type: z.enum(DOC_TYPES),
  entity_id: z.string().optional(),
  transaction_id: z.string().optional(),
  file_name: z.string().optional(),
  description: z.string().optional(),
  evidence_status: z.enum(["metadata_only","attached","missing","needs_review"]).default("metadata_only"),
  period_month: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function Evidence() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [entityFilter, setEntityFilter] = useState<string>("");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [monthFilter, setMonthFilter] = useState<string>("");

  const params: Record<string, string> = {};
  if (entityFilter) params.entity_id = entityFilter;
  if (docTypeFilter) params.document_type = docTypeFilter;
  if (statusFilter) params.evidence_status = statusFilter;
  if (monthFilter) params.period_month = monthFilter + "-01";

  const { data: documents, isLoading, error } = useListDocuments(params, {
    query: { queryKey: getListDocumentsQueryKey(params) }
  });

  const { data: entities } = useListEntities({ query: { queryKey: getListEntitiesQueryKey() } });
  const { data: transactions } = useListTransactions({}, { query: { queryKey: getListTransactionsQueryKey({}) } });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      document_type: "receipt",
      entity_id: "__none__",
      transaction_id: "__none__",
      file_name: "",
      description: "",
      evidence_status: "metadata_only",
      period_month: "",
    },
  });

  const create = useCreateDocument({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
        toast({ title: "Document recorded" });
        form.reset();
        setShowForm(false);
      },
      onError: () => toast({ title: "Failed to record document", variant: "destructive" }),
    }
  });

  const updateDoc = useUpdateDocument({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
        toast({ title: "Status updated" });
      },
      onError: () => toast({ title: "Failed to update", variant: "destructive" }),
    }
  });

  function onSubmit(values: FormValues) {
    create.mutate({
      data: {
        document_type: values.document_type,
        entity_id: (values.entity_id && values.entity_id !== "__none__") ? values.entity_id : undefined,
        transaction_id: (values.transaction_id && values.transaction_id !== "__none__") ? values.transaction_id : undefined,
        file_name: values.file_name || undefined,
        description: values.description || undefined,
        evidence_status: values.evidence_status,
        period_month: values.period_month || undefined,
      }
    });
  }

  function cycleStatus(docId: string, current: string) {
    const cycle: Record<string, string> = { metadata_only: "attached", attached: "missing", missing: "needs_review", needs_review: "metadata_only" };
    updateDoc.mutate({ id: docId, data: { evidence_status: cycle[current] ?? "metadata_only" } });
  }

  const hasFilters = !!(entityFilter || docTypeFilter || statusFilter || monthFilter);
  const missing = documents?.filter(d => d.evidence_status === "missing").length ?? 0;
  const needsReview = documents?.filter(d => d.evidence_status === "needs_review").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Evidence Vault</h1>
          <p className="text-sm text-muted-foreground mt-1">Document metadata, receipts, and filing evidence</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)} data-testid="button-add-document">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Document
        </Button>
      </div>

      {(missing > 0 || needsReview > 0) && (
        <div className="flex gap-3">
          {missing > 0 && (
            <Alert variant="destructive" className="flex-1">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{missing} document{missing !== 1 ? "s" : ""} flagged as missing evidence.</AlertDescription>
            </Alert>
          )}
          {needsReview > 0 && (
            <Alert className="flex-1 border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/10">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <AlertDescription className="text-yellow-800 dark:text-yellow-400">{needsReview} document{needsReview !== 1 ? "s" : ""} need review.</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">Add Document</CardTitle></CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="document_type" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-doc-type"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {DOC_TYPES.map(t => (
                            <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="evidence_status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Evidence Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="metadata_only">Metadata Only</SelectItem>
                          <SelectItem value="attached">Attached</SelectItem>
                          <SelectItem value="missing">Missing</SelectItem>
                          <SelectItem value="needs_review">Needs Review</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="entity_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Entity <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-entity"><SelectValue placeholder="Any entity" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">No entity</SelectItem>
                          {entities?.map(e => <SelectItem key={e.id} value={e.id}>{e.display_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="transaction_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transaction <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-transaction"><SelectValue placeholder="No transaction" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">No transaction</SelectItem>
                          {transactions?.slice(0, 50).map(t => (
                            <SelectItem key={t.id} value={t.id}>
                              {formatDate(t.transaction_date)} · {t.description?.slice(0, 40)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="file_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>File Name <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl><Input placeholder="receipt_openai_may.pdf" {...field} data-testid="input-file-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="period_month" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Period Month <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <Input type="month" {...field} onChange={e => field.onChange(e.target.value)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl><Textarea rows={2} placeholder="Notes about this document" {...field} data-testid="input-description" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button type="submit" disabled={create.isPending}>{create.isPending ? "Saving..." : "Save Document"}</Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        <Select value={entityFilter || "__all__"} onValueChange={v => setEntityFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-entity-filter"><SelectValue placeholder="All Entities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Entities</SelectItem>
            {entities?.map(e => <SelectItem key={e.id} value={e.id}>{e.display_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={docTypeFilter || "__all__"} onValueChange={v => setDocTypeFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Types</SelectItem>
            {DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter || "__all__"} onValueChange={v => setStatusFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Statuses</SelectItem>
            <SelectItem value="metadata_only">Metadata Only</SelectItem>
            <SelectItem value="attached">Attached</SelectItem>
            <SelectItem value="missing">Missing</SelectItem>
            <SelectItem value="needs_review">Needs Review</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="month"
          className="h-8 text-sm w-36"
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
          placeholder="Period month"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => { setEntityFilter(""); setDocTypeFilter(""); setStatusFilter(""); setMonthFilter(""); }}>
            <X className="w-3 h-3" />Clear filters
          </Button>
        )}
        {documents !== undefined && (
          <span className="text-xs text-muted-foreground ml-auto">{documents.length} document{documents.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load documents.</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !documents?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Files className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{hasFilters ? "No documents match the current filters." : "No documents recorded yet."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm" data-testid="table-documents">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">File / Description</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Entity</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Period</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-muted/20" data-testid={`row-doc-${doc.id}`}>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {doc.document_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                  </td>
                  <td className="px-4 py-3">
                    {doc.file_name && <div className="font-medium text-xs font-mono">{doc.file_name}</div>}
                    {doc.description && <div className="text-xs text-muted-foreground">{doc.description}</div>}
                    {!doc.file_name && !doc.description && <span className="text-muted-foreground/50 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {doc.entity_display_name ? (
                      <span className="text-xs text-muted-foreground">{doc.entity_display_name}</span>
                    ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                    {doc.period_month ? doc.period_month.slice(0, 7) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${EVIDENCE_STATUS_LABEL[doc.evidence_status]?.className}`}
                      onClick={() => cycleStatus(doc.id, doc.evidence_status)}
                      title="Click to cycle status"
                    >
                      {EVIDENCE_STATUS_LABEL[doc.evidence_status]?.label}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{formatDate(doc.uploaded_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
