import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  getListDocumentsQueryKey,
  getListEntitiesQueryKey,
  getListTransactionsQueryKey,
  useArchiveDocument,
  useCreateDocument,
  useListDocuments,
  useListEntities,
  useListTransactions,
  useReplaceEvidenceFile,
  useUploadEvidence,
} from "@workspace/api-client-react";
import type { Document } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import {
  AlertCircle,
  Archive,
  Download,
  Eye,
  FileCheck2,
  Files,
  Filter,
  Paperclip,
  Plus,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";

const EVIDENCE_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  metadata_only: { label: "Metadata only", className: "bg-muted text-muted-foreground" },
  attached: { label: "Verified file", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  missing: { label: "File missing", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  needs_review: { label: "Needs review", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  archived: { label: "Archived", className: "bg-muted text-muted-foreground" },
};

const DOC_TYPES = ["receipt", "invoice", "screenshot", "contract", "bank_statement", "subscription_receipt", "tax_document", "note", "other"] as const;
const FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.csv";

const schema = z.object({
  document_type: z.enum(DOC_TYPES),
  entity_id: z.string().optional(),
  transaction_id: z.string().optional(),
  description: z.string().max(4000).optional(),
  period_month: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function formatBytes(value: number | null | undefined): string {
  if (value == null) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.replace(/^HTTP \d+ [^:]+:\s*/, "") : "The request failed.";
}

export default function Evidence() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const replacementInput = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [replacementDocumentId, setReplacementDocumentId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Document | null>(null);
  const [entityFilter, setEntityFilter] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  const params: Record<string, string> = {};
  if (entityFilter) params.entity_id = entityFilter;
  if (docTypeFilter) params.document_type = docTypeFilter;
  if (statusFilter) params.evidence_status = statusFilter;
  if (monthFilter) params.period_month = `${monthFilter}-01`;

  const { data: documents, isLoading, error } = useListDocuments(params, {
    query: { queryKey: getListDocumentsQueryKey(params) },
  });
  const { data: entities } = useListEntities(undefined, { query: { queryKey: getListEntitiesQueryKey() } });
  const { data: transactions } = useListTransactions({}, { query: { queryKey: getListTransactionsQueryKey({}) } });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      document_type: "receipt",
      entity_id: "__none__",
      transaction_id: "__none__",
      description: "",
      period_month: "",
    },
  });

  function refreshDocuments() {
    queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
  }

  function resetCreateForm() {
    form.reset();
    setSelectedFile(null);
    setShowForm(false);
  }

  const create = useCreateDocument({
    mutation: {
      onSuccess: () => {
        refreshDocuments();
        toast({ title: "Evidence metadata saved" });
        resetCreateForm();
      },
      onError: (mutationError) => toast({ title: "Could not save evidence", description: errorMessage(mutationError), variant: "destructive" }),
    },
  });

  const upload = useUploadEvidence({
    mutation: {
      onSuccess: () => {
        refreshDocuments();
        toast({ title: "Evidence uploaded and verified" });
        resetCreateForm();
      },
      onError: (mutationError) => toast({ title: "Upload failed", description: errorMessage(mutationError), variant: "destructive" }),
    },
  });

  const replaceFile = useReplaceEvidenceFile({
    mutation: {
      onSuccess: () => {
        refreshDocuments();
        toast({ title: "Evidence file replaced", description: "The previous file was retained in version storage." });
      },
      onError: (mutationError) => toast({ title: "Replacement failed", description: errorMessage(mutationError), variant: "destructive" }),
      onSettled: () => setReplacementDocumentId(null),
    },
  });

  const archive = useArchiveDocument({
    mutation: {
      onSuccess: () => {
        refreshDocuments();
        toast({ title: "Evidence archived", description: "The metadata and file were retained for recordkeeping." });
        setArchiveTarget(null);
      },
      onError: (mutationError) => toast({ title: "Archive failed", description: errorMessage(mutationError), variant: "destructive" }),
    },
  });

  function normalizedMetadata(values: FormValues) {
    return {
      document_type: values.document_type,
      entity_id: values.entity_id && values.entity_id !== "__none__" ? values.entity_id : undefined,
      transaction_id: values.transaction_id && values.transaction_id !== "__none__" ? values.transaction_id : undefined,
      description: values.description || undefined,
      period_month: values.period_month ? `${values.period_month}-01` : undefined,
    };
  }

  function onSubmit(values: FormValues) {
    const metadata = normalizedMetadata(values);
    if (selectedFile) {
      upload.mutate({ data: { ...metadata, file: selectedFile } });
      return;
    }
    create.mutate({ data: metadata });
  }

  function beginReplacement(documentId: string) {
    setReplacementDocumentId(documentId);
    replacementInput.current?.click();
  }

  function onReplacementSelected(file: File | undefined) {
    if (file && replacementDocumentId) replaceFile.mutate({ id: replacementDocumentId, data: { file } });
    if (replacementInput.current) replacementInput.current.value = "";
  }

  const hasFilters = Boolean(entityFilter || docTypeFilter || statusFilter || monthFilter);
  const attached = documents?.filter((document) => document.evidence_status === "attached").length ?? 0;
  const missing = documents?.filter((document) => document.evidence_status === "missing").length ?? 0;
  const needsReview = documents?.filter((document) => document.evidence_status === "needs_review").length ?? 0;
  const isSaving = create.isPending || upload.isPending;

  return (
    <div className="space-y-6">
      <input
        ref={replacementInput}
        type="file"
        accept={FILE_ACCEPT}
        className="hidden"
        onChange={(event) => onReplacementSelected(event.target.files?.[0])}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Evidence Vault</h1>
          <p className="mt-1 text-sm text-muted-foreground">Receipts, statements, contracts, and source records</p>
        </div>
        <Button size="sm" onClick={() => setShowForm((open) => !open)} data-testid="button-add-document">
          <Plus className="mr-1.5 h-4 w-4" />
          Add evidence
        </Button>
      </div>

      <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
        {[
          { label: "Verified files", value: attached, icon: FileCheck2, tone: "text-emerald-400" },
          { label: "Missing", value: missing, icon: AlertCircle, tone: missing ? "text-red-400" : "text-muted-foreground" },
          { label: "Needs review", value: needsReview, icon: RefreshCw, tone: needsReview ? "text-amber-400" : "text-muted-foreground" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex items-center gap-3 bg-card px-4 py-3">
            <Icon className={`h-4 w-4 ${tone}`} />
            <div>
              <div className="font-mono text-lg font-semibold leading-none">{value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">Add evidence</CardTitle></CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField control={form.control} name="document_type" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-doc-type"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {DOC_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>{type.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormItem>
                    <FormLabel>File</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept={FILE_ACCEPT}
                        onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                        data-testid="input-evidence-file"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField control={form.control} name="entity_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-entity"><SelectValue placeholder="No company" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">No company</SelectItem>
                          {entities?.map((entity) => <SelectItem key={entity.id} value={entity.id}>{entity.display_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="transaction_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transaction</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-transaction"><SelectValue placeholder="No transaction" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">No transaction</SelectItem>
                          {transactions?.slice(0, 100).map((transaction) => (
                            <SelectItem key={transaction.id} value={transaction.id}>
                              {formatDate(transaction.transaction_date)} · {transaction.description.slice(0, 48)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                  <FormField control={form.control} name="period_month" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Period month</FormLabel>
                      <FormControl><Input type="month" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl><Textarea rows={2} {...field} data-testid="input-description" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={resetCreateForm}>Cancel</Button>
                  <Button type="submit" disabled={isSaving}>
                    {selectedFile ? <Upload className="mr-1.5 h-4 w-4" /> : <Paperclip className="mr-1.5 h-4 w-4" />}
                    {isSaving ? "Saving..." : selectedFile ? "Upload evidence" : "Save metadata"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={entityFilter || "__all__"} onValueChange={(value) => setEntityFilter(value === "__all__" ? "" : value)}>
          <SelectTrigger className="h-8 w-40 text-sm"><SelectValue placeholder="All companies" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All companies</SelectItem>
            {entities?.map((entity) => <SelectItem key={entity.id} value={entity.id}>{entity.display_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={docTypeFilter || "__all__"} onValueChange={(value) => setDocTypeFilter(value === "__all__" ? "" : value)}>
          <SelectTrigger className="h-8 w-40 text-sm"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All types</SelectItem>
            {DOC_TYPES.map((type) => <SelectItem key={type} value={type}>{type.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter || "__all__"} onValueChange={(value) => setStatusFilter(value === "__all__" ? "" : value)}>
          <SelectTrigger className="h-8 w-40 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="attached">Verified file</SelectItem>
            <SelectItem value="metadata_only">Metadata only</SelectItem>
            <SelectItem value="missing">File missing</SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
          </SelectContent>
        </Select>
        <Input type="month" className="h-8 w-40 text-sm" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} />
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => { setEntityFilter(""); setDocTypeFilter(""); setStatusFilter(""); setMonthFilter(""); }}>
            <X className="mr-1 h-4 w-4" />Clear
          </Button>
        )}
        {documents && <span className="ml-auto text-xs text-muted-foreground">{documents.length} record{documents.length === 1 ? "" : "s"}</span>}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <Skeleton className="h-52 w-full" />
      ) : !documents?.length ? (
        <div className="border-y border-border py-16 text-center">
          <Files className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{hasFilters ? "No evidence matches these filters." : "No evidence has been recorded."}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[900px] text-sm" data-testid="table-documents">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-muted-foreground">Evidence</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-muted-foreground">Company</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-muted-foreground">Period</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-muted-foreground">Added</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id} className="border-b border-border last:border-0 hover:bg-muted/20" data-testid={`row-doc-${document.id}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{document.file_name ?? document.document_type.replace(/_/g, " ")}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{document.document_type.replace(/_/g, " ")}</span>
                      {document.file_size_bytes != null && <span className="font-mono">{formatBytes(document.file_size_bytes)}</span>}
                    </div>
                    {document.description && <div className="mt-1 max-w-md truncate text-xs text-muted-foreground">{document.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{document.entity_display_name ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{document.period_month?.slice(0, 7) ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium ${EVIDENCE_STATUS_LABEL[document.evidence_status]?.className}`}>
                      {EVIDENCE_STATUS_LABEL[document.evidence_status]?.label ?? document.evidence_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatDate(document.uploaded_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {document.has_file && (
                        <>
                          <Button variant="outline" size="sm" className="h-8" asChild>
                            <a href={`/api/documents/${document.id}/content`} target="_blank" rel="noreferrer"><Eye className="mr-1 h-4 w-4" />Preview</a>
                          </Button>
                          <Button variant="outline" size="icon" className="h-8 w-8" asChild title="Download">
                            <a href={`/api/documents/${document.id}/content?download=true`}><Download className="h-4 w-4" /></a>
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => beginReplacement(document.id)}
                        disabled={replaceFile.isPending && replacementDocumentId === document.id}
                      >
                        <RefreshCw className="mr-1 h-4 w-4" />{document.has_file ? "Replace" : "Attach"}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setArchiveTarget(document)} title="Archive">
                        <Archive className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this evidence?</AlertDialogTitle>
            <AlertDialogDescription>
              The record and attached file will be retained and removed from the active Evidence Vault.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveTarget && archive.mutate({ id: archiveTarget.id })}
              disabled={archive.isPending}
            >
              Archive evidence
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
