import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListStatements, getListStatementsQueryKey,
  useCreateStatement,
  useGetStatement, getGetStatementQueryKey,
  useAddStatementLines,
  useMatchStatementLine,
  useUpdateStatementLine,
  useArchiveStatement,
  useInspectStatementCsv,
  usePreviewStatementCsv,
  useImportStatementCsv,
  useGetStatementLineCandidates,
  getGetStatementLineCandidatesQueryKey,
  useListTransactions, getListTransactionsQueryKey,
  useListAccounts, getListAccountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AlertCircle, Archive, FileSpreadsheet, FileText, Plus, ChevronDown, ChevronRight, CheckCircle, Link2, Minus, Upload, X } from "lucide-react";
import type { StatementCsvImportBody, StatementCsvInspection, StatementCsvPreview, StatementLine, StatementMatchCandidate, Transaction } from "@workspace/api-client-react";

const STATUS_CLASS: Record<string, string> = {
  uploaded: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  reconciling: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  reconciled: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const LINE_STATUS_CLASS: Record<string, string> = {
  unmatched: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  matched: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  ignored: "bg-muted text-muted-foreground",
  needs_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
};

const createSchema = z.object({
  account_id: z.string().min(1, "Account is required"),
  statement_month: z.string().min(1, "Month is required"),
  opening_balance: z.coerce.number().nullable().optional(),
  closing_balance: z.coerce.number().nullable().optional(),
});

const lineSchema = z.object({
  transaction_date: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  amount: z.coerce.number({ invalid_type_error: "Amount is required" }),
  balance_after: z.coerce.number().nullable().optional(),
  notes: z.string().optional(),
});

type CreateFormValues = z.infer<typeof createSchema>;
type LineFormValues = z.infer<typeof lineSchema>;

function MatchDialog({ line, onClose, onMatched }: {
  line: StatementLine;
  onClose: () => void;
  onMatched: () => void;
}) {
  const { toast } = useToast();
  const { data: transactions, isLoading } = useListTransactions({}, {
    query: { queryKey: getListTransactionsQueryKey({}) }
  });
  const { data: candidates, isLoading: candidatesLoading } = useGetStatementLineCandidates(line.id, {
    query: { queryKey: getGetStatementLineCandidatesQueryKey(line.id) },
  });

  const match = useMatchStatementLine({
    mutation: {
      onSuccess: () => {
        toast({ title: "Line matched" });
        onMatched();
        onClose();
      },
      onError: () => toast({ title: "Failed to match", variant: "destructive" }),
    }
  });

  function handleMatch(tx: Transaction) {
    match.mutate({ id: line.id, data: { transaction_id: tx.id, match_type: "manual" } });
  }

  const candidateIds = new Set((candidates ?? []).map((candidate) => candidate.id));
  const orderedTransactions = [
    ...(candidates ?? []),
    ...(transactions ?? []).filter((transaction) => !candidateIds.has(transaction.id)),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl border border-border w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="font-semibold text-sm">Match Line to Transaction</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {line.description} · {formatCurrency(line.amount)}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}><X className="w-3.5 h-3.5" /></Button>
        </div>
        <div className="overflow-y-auto flex-1">
          {isLoading || candidatesLoading ? (
            <div className="p-4 space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !orderedTransactions.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No transactions found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Description</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {orderedTransactions.map(tx => {
                  const candidate = candidateIds.has(tx.id) ? tx as StatementMatchCandidate : null;
                  return (
                  <tr key={tx.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">{formatDate(tx.transaction_date)}</td>
                    <td className="px-4 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span>{tx.description}</span>
                        {candidate && <Badge className="h-4 px-1.5 text-[10px]">Suggested {candidate.match_score}%</Badge>}
                      </div>
                      {tx.vendor_name && <div className="text-muted-foreground text-xs">{tx.vendor_name}</div>}
                      {candidate && <div className="text-[10px] text-primary">{candidate.match_reasons.join(" · ")}</div>}
                    </td>
                    <td className="px-4 py-2 text-xs font-mono text-right whitespace-nowrap">{formatCurrency(tx.total_amount)}</td>
                    <td className="px-2 py-2">
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2" disabled={match.isPending} onClick={() => handleMatch(tx)}>
                        <Link2 className="w-3 h-3 mr-1" />Match
                      </Button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

type CsvMapping = {
  transactionDate: string;
  postedDate: string;
  description: string;
  mode: "amount" | "debit_credit";
  amount: string;
  debit: string;
  credit: string;
  balance: string;
};

const emptyCsvMapping: CsvMapping = {
  transactionDate: "",
  postedDate: "",
  description: "",
  mode: "amount",
  amount: "",
  debit: "",
  credit: "",
  balance: "",
};

function detectColumn(headers: string[], patterns: RegExp[]) {
  return headers.find((header) => patterns.some((pattern) => pattern.test(header.toLowerCase()))) ?? "";
}

function CsvImportPanel({ statementId, onImported, onCancel }: { statementId: string; onImported: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<StatementCsvInspection | null>(null);
  const [mapping, setMapping] = useState<CsvMapping>(emptyCsvMapping);
  const [preview, setPreview] = useState<StatementCsvPreview | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(false);

  const inspect = useInspectStatementCsv({
    mutation: {
      onSuccess: (result) => {
        const amount = detectColumn(result.headers, [/^amount$/, /transaction amount/, /net amount/]);
        const debit = detectColumn(result.headers, [/^debit$/, /withdrawal/, /money out/]);
        const credit = detectColumn(result.headers, [/^credit$/, /deposit/, /money in/]);
        setInspection(result);
        setPreview(null);
        setMapping({
          transactionDate: detectColumn(result.headers, [/transaction date/, /^date$/, /effective date/]),
          postedDate: detectColumn(result.headers, [/posted date/, /post date/]),
          description: detectColumn(result.headers, [/description/, /memo/, /details/, /name/]),
          mode: amount ? "amount" : debit && credit ? "debit_credit" : "amount",
          amount,
          debit,
          credit,
          balance: detectColumn(result.headers, [/balance/, /running balance/]),
        });
      },
      onError: () => toast({ title: "Could not inspect CSV", description: "Use a valid CSV file under 2 MB.", variant: "destructive" }),
    },
  });

  const validate = usePreviewStatementCsv({
    mutation: {
      onSuccess: setPreview,
      onError: () => toast({ title: "Could not validate CSV", description: "Check the selected columns and file format.", variant: "destructive" }),
    },
  });

  const importCsv = useImportStatementCsv({
    mutation: {
      onSuccess: (result) => {
        toast({ title: `${result.imported_count} statement line${result.imported_count === 1 ? "" : "s"} imported`, description: result.skipped_duplicate_count ? `${result.skipped_duplicate_count} duplicate row${result.skipped_duplicate_count === 1 ? " was" : "s were"} skipped.` : undefined });
        onImported();
      },
      onError: () => toast({ title: "Import was not applied", description: "The statement was left unchanged. Review validation and duplicate settings.", variant: "destructive" }),
    },
  });

  function body(): StatementCsvImportBody | null {
    if (!file || !mapping.transactionDate || !mapping.description) return null;
    if (mapping.mode === "amount" && !mapping.amount) return null;
    if (mapping.mode === "debit_credit" && (!mapping.debit || !mapping.credit)) return null;
    return {
      file,
      transaction_date_column: mapping.transactionDate,
      posted_date_column: mapping.postedDate || undefined,
      description_column: mapping.description,
      amount_column: mapping.mode === "amount" ? mapping.amount : undefined,
      debit_column: mapping.mode === "debit_credit" ? mapping.debit : undefined,
      credit_column: mapping.mode === "debit_credit" ? mapping.credit : undefined,
      balance_column: mapping.balance || undefined,
      skip_duplicates: skipDuplicates ? "true" : "false",
    };
  }

  function chooseFile(selected: File | undefined) {
    if (!selected) return;
    setFile(selected);
    setInspection(null);
    setPreview(null);
    setSkipDuplicates(false);
    inspect.mutate({ id: statementId, data: { file: selected } });
  }

  const duplicateCount = (preview?.in_file_duplicate_rows.length ?? 0) + (preview?.existing_duplicate_rows.length ?? 0);
  const canImport = Boolean(preview?.ready_to_import && (!duplicateCount || skipDuplicates));
  const selectColumn = (label: string, value: string, onChange: (value: string) => void, optional = false) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium">{label}</label>
      <Select value={value || "__none__"} onValueChange={(next) => onChange(next === "__none__" ? "" : next)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {optional && <SelectItem value="__none__">Not included</SelectItem>}
          {!optional && <SelectItem value="__none__" disabled>Select a column</SelectItem>}
          {inspection?.headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm"><FileSpreadsheet className="h-4 w-4 text-primary" />Import statement CSV</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input type="file" accept=".csv,text/csv" className="h-9 max-w-sm text-xs" onChange={(event) => chooseFile(event.target.files?.[0])} />
          <span className="text-xs text-muted-foreground">CSV only, 2 MB and 5,000 rows maximum</span>
        </div>

        {inspection && (
          <>
            <div className="flex items-center gap-2 text-xs"><CheckCircle className="h-4 w-4 text-emerald-500" />{inspection.row_count} data rows found in {file?.name}</div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {selectColumn("Transaction date", mapping.transactionDate, (value) => { setMapping({ ...mapping, transactionDate: value }); setPreview(null); })}
              {selectColumn("Description", mapping.description, (value) => { setMapping({ ...mapping, description: value }); setPreview(null); })}
              {selectColumn("Posted date", mapping.postedDate, (value) => { setMapping({ ...mapping, postedDate: value }); setPreview(null); }, true)}
              {selectColumn("Running balance", mapping.balance, (value) => { setMapping({ ...mapping, balance: value }); setPreview(null); }, true)}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Amount layout</label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={mapping.mode === "amount" ? "default" : "outline"} className="h-7 text-xs" onClick={() => { setMapping({ ...mapping, mode: "amount" }); setPreview(null); }}>Single amount</Button>
                <Button type="button" size="sm" variant={mapping.mode === "debit_credit" ? "default" : "outline"} className="h-7 text-xs" onClick={() => { setMapping({ ...mapping, mode: "debit_credit" }); setPreview(null); }}>Debit + credit</Button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {mapping.mode === "amount" ? selectColumn("Amount", mapping.amount, (value) => { setMapping({ ...mapping, amount: value }); setPreview(null); }) : (
                <>
                  {selectColumn("Debit / withdrawal", mapping.debit, (value) => { setMapping({ ...mapping, debit: value }); setPreview(null); })}
                  {selectColumn("Credit / deposit", mapping.credit, (value) => { setMapping({ ...mapping, credit: value }); setPreview(null); })}
                </>
              )}
            </div>
            <Button size="sm" variant="outline" disabled={!body() || validate.isPending} onClick={() => { const data = body(); if (data) validate.mutate({ id: statementId, data }); }}>
              {validate.isPending ? "Validating all rows..." : "Validate and preview"}
            </Button>
          </>
        )}

        {preview && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{preview.valid_rows} valid</Badge>
              <Badge variant={preview.errors.length ? "destructive" : "outline"}>{preview.errors.length} errors</Badge>
              <Badge variant={duplicateCount ? "secondary" : "outline"}>{duplicateCount} duplicates</Badge>
            </div>
            {preview.errors.length > 0 && (
              <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{preview.errors.slice(0, 8).map((error) => <div key={`${error.row}-${error.message}`}>Row {error.row}: {error.message}</div>)}</AlertDescription></Alert>
            )}
            {duplicateCount > 0 && (
              <div className="flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/5 p-3">
                <Checkbox id={`skip-duplicates-${statementId}`} checked={skipDuplicates} onCheckedChange={(checked) => setSkipDuplicates(checked === true)} />
                <label htmlFor={`skip-duplicates-${statementId}`} className="text-xs">Skip {duplicateCount} duplicate row{duplicateCount === 1 ? "" : "s"} and import the remaining validated rows</label>
              </div>
            )}
            {preview.sample_rows.length > 0 && (
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full min-w-[620px] text-xs">
                  <thead className="bg-muted/50"><tr><th className="px-3 py-2 text-left">CSV row</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Balance</th></tr></thead>
                  <tbody>{preview.sample_rows.map((row) => <tr key={row.sourceRow} className="border-t border-border"><td className="px-3 py-2">{row.sourceRow}</td><td className="px-3 py-2 font-mono">{row.transaction_date}</td><td className="px-3 py-2">{row.description}</td><td className="px-3 py-2 text-right font-mono">{formatCurrency(row.amount)}</td><td className="px-3 py-2 text-right font-mono">{row.balance_after == null ? "—" : formatCurrency(row.balance_after)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          {preview && <Button size="sm" disabled={!canImport || importCsv.isPending} onClick={() => { const data = body(); if (data) importCsv.mutate({ id: statementId, data: { ...data, skip_duplicates: skipDuplicates ? "true" : "false" } }); }}><Upload className="mr-1.5 h-4 w-4" />{importCsv.isPending ? "Importing..." : "Import validated rows"}</Button>}
        </div>
      </CardContent>
    </Card>
  );
}

function StatementDetail({ statementId, onRefreshList }: { statementId: string; onRefreshList: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddLine, setShowAddLine] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [matchingLine, setMatchingLine] = useState<StatementLine | null>(null);

  const { data, isLoading, error } = useGetStatement(statementId, {
    query: { queryKey: getGetStatementQueryKey(statementId) }
  });

  const lineForm = useForm<LineFormValues>({
    resolver: zodResolver(lineSchema),
    defaultValues: { transaction_date: "", description: "", amount: 0, balance_after: undefined, notes: "" },
  });

  const addLines = useAddStatementLines({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetStatementQueryKey(statementId) });
        queryClient.invalidateQueries({ queryKey: getListStatementsQueryKey() });
        toast({ title: "Line added" });
        lineForm.reset();
        setShowAddLine(false);
      },
      onError: () => toast({ title: "Failed to add line", variant: "destructive" }),
    }
  });

  const updateLine = useUpdateStatementLine({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetStatementQueryKey(statementId) });
        queryClient.invalidateQueries({ queryKey: getListStatementsQueryKey() });
      },
      onError: () => toast({ title: "Failed to update line", variant: "destructive" }),
    }
  });

  function onAddLine(values: LineFormValues) {
    addLines.mutate({
      id: statementId,
      data: {
        lines: [{
          transaction_date: values.transaction_date || null,
          description: values.description,
          amount: values.amount,
          balance_after: values.balance_after ?? null,
          notes: values.notes || null,
        }]
      }
    });
  }

  function handleIgnoreLine(lineId: string) {
    updateLine.mutate({ id: lineId, data: { status: "ignored" } });
  }

  function handleUnmatchLine(lineId: string) {
    updateLine.mutate({ id: lineId, data: { status: "unmatched" } });
  }

  if (isLoading) return <div className="px-6 py-4"><Skeleton className="h-32 w-full" /></div>;
  if (error || !data) return (
    <div className="px-6 py-3 text-xs text-destructive">Failed to load statement lines.</div>
  );

  const { statement, lines } = data;
  const isArchived = Boolean(statement.archived_at);
  const unmatched = lines.filter(l => l.status === "unmatched").length;
  const matched = lines.filter(l => l.status === "matched").length;

  return (
    <div className="bg-muted/10 border-t border-border px-6 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>{lines.length} lines</span>
          <span className="text-green-600">{matched} matched</span>
          {unmatched > 0 && <span className="text-red-600">{unmatched} unmatched</span>}
        </div>
        {isArchived ? (
          <Badge variant="outline">Archived read-only record</Badge>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setShowCsvImport(!showCsvImport); setShowAddLine(false); }}>
              <Upload className="w-3 h-3 mr-1" />Import CSV
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setShowAddLine(!showAddLine); setShowCsvImport(false); }}>
              <Plus className="w-3 h-3 mr-1" />Add Line
            </Button>
          </div>
        )}
      </div>

      {showCsvImport && (
        <CsvImportPanel
          statementId={statementId}
          onCancel={() => setShowCsvImport(false)}
          onImported={() => {
            setShowCsvImport(false);
            queryClient.invalidateQueries({ queryKey: getGetStatementQueryKey(statementId) });
            queryClient.invalidateQueries({ queryKey: getListStatementsQueryKey() });
            onRefreshList();
          }}
        />
      )}

      {showAddLine && (
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-4">
            <Form {...lineForm}>
              <form onSubmit={lineForm.handleSubmit(onAddLine)} className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <FormField control={lineForm.control} name="transaction_date" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Date</FormLabel>
                      <FormControl><Input type="date" className="h-8 text-xs" {...field} /></FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )} />
                  <FormField control={lineForm.control} name="description" render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel className="text-xs">Description</FormLabel>
                      <FormControl><Input className="h-8 text-xs" placeholder="OpenAI API" {...field} /></FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )} />
                  <FormField control={lineForm.control} name="amount" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Amount</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                          <Input type="number" step="0.01" className="h-8 text-xs pl-5" placeholder="0.00" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )} />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAddLine(false)}>Cancel</Button>
                  <Button type="submit" size="sm" className="h-7 text-xs" disabled={addLines.isPending}>
                    {addLines.isPending ? "Adding..." : "Add Line"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {lines.length > 0 && (
        <div className="rounded border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Balance After</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Matched To</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map(line => (
                <tr key={line.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">
                    {line.transaction_date ? formatDate(line.transaction_date) : "—"}
                  </td>
                  <td className="px-3 py-2 max-w-[200px] truncate">{line.description ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-right whitespace-nowrap">{formatCurrency(line.amount)}</td>
                  <td className="px-3 py-2 font-mono text-right text-muted-foreground whitespace-nowrap">
                    {line.balance_after != null ? formatCurrency(line.balance_after) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${LINE_STATUS_CLASS[line.status] ?? ""}`}>
                      {line.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[160px] truncate">
                    {(line as StatementLine & { matched_transaction_description?: string }).matched_transaction_description ?? (line.matched_transaction_id ? "Transaction" : "—")}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1 justify-end">
                      {!isArchived && (
                        <>
                      {line.status === "unmatched" && (
                        <>
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => setMatchingLine(line)}>
                            <Link2 className="w-3 h-3 mr-1" />Match
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground" title="Ignore" onClick={() => handleIgnoreLine(line.id)}>
                            <Minus className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                      {(line.status === "matched" || line.status === "ignored") && (
                        <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-muted-foreground" onClick={() => handleUnmatchLine(line.id)}>
                          Unmatch
                        </Button>
                      )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lines.length === 0 && !showAddLine && (
        <p className="text-xs text-muted-foreground text-center py-4">
          {isArchived ? "No statement lines were recorded." : 'No lines yet. Click "Add Line" to begin reconciliation.'}
        </p>
      )}

      {matchingLine && (
        <MatchDialog
          line={matchingLine}
          onClose={() => setMatchingLine(null)}
          onMatched={() => {
            queryClient.invalidateQueries({ queryKey: getGetStatementQueryKey(statementId) });
            queryClient.invalidateQueries({ queryKey: getListStatementsQueryKey() });
            onRefreshList();
          }}
        />
      )}
    </div>
  );
}

export default function Statements() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const params = {
    ...(accountFilter ? { account_id: accountFilter } : {}),
    ...(showArchived ? { include_archived: true } : {}),
  };
  const { data: statements, isLoading, error } = useListStatements(params, {
    query: { queryKey: getListStatementsQueryKey(params) }
  });

  const { data: accounts } = useListAccounts({}, { query: { queryKey: getListAccountsQueryKey({}) } });

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      account_id: "",
      statement_month: new Date().toISOString().slice(0, 7) + "-01",
      opening_balance: undefined,
      closing_balance: undefined,
    },
  });

  const create = useCreateStatement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListStatementsQueryKey() });
        toast({ title: "Statement created" });
        form.reset();
        setShowForm(false);
      },
      onError: () => toast({ title: "Failed to create statement", variant: "destructive" }),
    }
  });

  const archiveStatement = useArchiveStatement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListStatementsQueryKey() });
        toast({ title: "Statement archived", description: "Its lines and reconciliation history were retained." });
        setExpandedId(null);
        setArchiveConfirmId(null);
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: msg ?? "Failed to archive statement", variant: "destructive" });
        setArchiveConfirmId(null);
      },
    }
  });

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id);
  }

  function refreshList() {
    queryClient.invalidateQueries({ queryKey: getListStatementsQueryKey(params) });
  }

  const unmatchedTotal = statements?.reduce((s, stmt) => s + ((stmt as { unmatched_count?: number }).unmatched_count ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Statements</h1>
          <p className="text-sm text-muted-foreground mt-1">Bank statements and reconciliation</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)} data-testid="button-add-statement">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Statement
        </Button>
      </div>

      {unmatchedTotal > 0 && (
        <Alert className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/10">
          <AlertCircle className="h-4 w-4 text-yellow-500" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-400">
            {unmatchedTotal} unmatched statement line{unmatchedTotal !== 1 ? "s" : ""} across all statements.
          </AlertDescription>
        </Alert>
      )}

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">New Statement</CardTitle></CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(v => create.mutate({ data: v }))} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="account_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-account"><SelectValue placeholder="Select account" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {accounts?.map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.name}{a.last_four ? ` (…${a.last_four})` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="statement_month" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Statement Month</FormLabel>
                      <FormControl>
                        <Input type="month"
                          value={field.value?.slice(0, 7) ?? ""}
                          onChange={e => field.onChange(e.target.value + "-01")}
                          data-testid="input-month"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="opening_balance" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Opening Balance <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                          <Input type="number" step="0.01" className="pl-7" placeholder="0.00" {...field} value={field.value ?? ""} data-testid="input-opening" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="closing_balance" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Closing Balance <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                          <Input type="number" step="0.01" className="pl-7" placeholder="0.00" {...field} value={field.value ?? ""} data-testid="input-closing" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating..." : "Create Statement"}</Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Select value={accountFilter || "__all__"} onValueChange={v => setAccountFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-48 h-8 text-sm" data-testid="select-account-filter">
            <SelectValue placeholder="All Accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Accounts</SelectItem>
            {accounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {accountFilter && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setAccountFilter("")}>Clear</Button>}
        <Button variant={showArchived ? "secondary" : "outline"} size="sm" className="h-8" onClick={() => setShowArchived((value) => !value)}>
          <Archive className="w-3.5 h-3.5 mr-1.5" />{showArchived ? "Hide Archive" : "Show Archive"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load statements.</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !statements?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No statements yet. Add one to begin reconciliation.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {statements.map((stmt, idx) => {
            const isExpanded = expandedId === stmt.id;
            const lineCount = (stmt as { line_count?: number }).line_count ?? 0;
            const unmatchedCount = (stmt as { unmatched_count?: number }).unmatched_count ?? 0;
            return (
              <div key={stmt.id} className={idx > 0 ? "border-t border-border" : ""}>
                <div
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-muted/20 transition-colors ${isExpanded ? "bg-muted/10" : ""}`}
                  onClick={() => toggleExpand(stmt.id)}
                  data-testid={`row-statement-${stmt.id}`}
                >
                  <span className="text-muted-foreground">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-sm">{stmt.account_name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{stmt.statement_month?.slice(0, 7)}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASS[stmt.status] ?? "bg-muted text-muted-foreground"}`}>
                        {stmt.status.charAt(0).toUpperCase() + stmt.status.slice(1)}
                      </span>
                      {lineCount > 0 && (
                        <span className="text-xs text-muted-foreground">{lineCount} lines</span>
                      )}
                      {unmatchedCount > 0 && (
                        <Badge variant="destructive" className="text-xs h-4 px-1.5">{unmatchedCount} unmatched</Badge>
                      )}
                      {lineCount > 0 && unmatchedCount === 0 && (
                        <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm font-mono shrink-0" onClick={e => e.stopPropagation()}>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Open</p>
                      <p>{stmt.opening_balance != null ? formatCurrency(stmt.opening_balance) : "—"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Close</p>
                      <p>{stmt.closing_balance != null ? formatCurrency(stmt.closing_balance) : "—"}</p>
                    </div>
                    {stmt.archived_at ? (
                      <Badge variant="outline">Archived</Badge>
                    ) : archiveConfirmId === stmt.id ? (
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <span className="text-xs font-medium whitespace-nowrap">Archive?</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-6 text-xs px-2"
                          disabled={archiveStatement.isPending}
                          onClick={() => archiveStatement.mutate({ id: stmt.id })}
                        >
                          Yes
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => setArchiveConfirmId(null)}
                        >
                          No
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground"
                        onClick={() => setArchiveConfirmId(stmt.id)}
                        title="Archive statement"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <StatementDetail statementId={stmt.id} onRefreshList={refreshList} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
