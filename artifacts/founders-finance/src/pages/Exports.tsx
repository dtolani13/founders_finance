import { useState } from "react";
import {
  useGetExport, getGetExportQueryKey,
  useListEntities, getListEntitiesQueryKey,
} from "@workspace/api-client-react";

type ExportType =
  | "all_transactions"
  | "expenses_by_entity"
  | "expenses_by_category"
  | "owner_contributions"
  | "owner_draws"
  | "company_retention"
  | "reimbursements"
  | "intercompany_balances"
  | "tax_reserve_activity"
  | "document_index"
  | "personal_non_deductible"
  | "monthly_close_summary"
  | "statement_reconciliation_summary";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Download, FileText, Printer } from "lucide-react";

const EXPORT_TYPES: { value: ExportType; label: string; description: string; entityFilter?: boolean; monthFilter?: boolean }[] = [
  { value: "all_transactions", label: "All Transactions", description: "Every transaction across all entities", monthFilter: true },
  { value: "expenses_by_entity", label: "Expenses by Entity", description: "Allocated expense amounts per entity", entityFilter: true, monthFilter: true },
  { value: "expenses_by_category", label: "Expenses by Category", description: "Expense allocations grouped by category", entityFilter: true, monthFilter: true },
  { value: "owner_contributions", label: "Owner Contributions", description: "Capital contributions and owner loans", entityFilter: true, monthFilter: true },
  { value: "owner_draws", label: "Owner Draws", description: "Owner distributions linked to posted journals", entityFilter: true, monthFilter: true },
  { value: "company_retention", label: "Company Retention", description: "Closed and archived companies with recordkeeping dates" },
  { value: "reimbursements", label: "Reimbursements", description: "All reimbursement requests and status", entityFilter: true },
  { value: "intercompany_balances", label: "Intercompany Balances", description: "Intercompany payables and receivables", entityFilter: true },
  { value: "tax_reserve_activity", label: "Tax Reserve Rules", description: "Reserve percentages and rule basis by entity", entityFilter: true },
  { value: "document_index", label: "Document Index", description: "Evidence vault document metadata", entityFilter: true, monthFilter: true },
  { value: "personal_non_deductible", label: "Personal / Non-Deductible", description: "Personal expenses allocated to founder", monthFilter: true },
  { value: "monthly_close_summary", label: "Monthly Close Summary", description: "Close checklist status per entity/month", entityFilter: true, monthFilter: true },
  { value: "statement_reconciliation_summary", label: "Reconciliation Summary", description: "Statement line match status by account", entityFilter: true, monthFilter: true },
];

function ExportTable({ records, limit }: { records: Record<string, unknown>[]; limit?: number }) {
  const visibleRecords = typeof limit === "number" ? records.slice(0, limit) : records;
  const headers = Object.keys(records[0]);

  return (
    <table className="w-full text-xs" data-testid="table-export-preview">
      <thead>
        <tr className="bg-muted/50">
          {headers.map((header) => (
            <th key={header} className="whitespace-nowrap px-3 py-2 text-left font-medium uppercase tracking-wider text-muted-foreground">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {visibleRecords.map((row, index) => (
          <tr key={index} className={`border-t border-border ${index % 2 === 1 ? "bg-muted/10" : ""}`}>
            {headers.map((header) => (
              <td key={header} className="whitespace-nowrap px-3 py-1.5 font-mono">
                {row[header] == null ? "—" : String(row[header])}
              </td>
            ))}
          </tr>
        ))}
        {typeof limit === "number" && records.length > limit && (
          <tr>
            <td colSpan={headers.length} className="px-3 py-2 text-center text-muted-foreground">
              Showing first {limit} of {records.length} rows. Download CSV or print for all records.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function ExportPreview({ exportType, exportLabel, entityId, periodMonth }: {
  exportType: ExportType;
  exportLabel: string;
  entityId: string;
  periodMonth: string;
}) {
  const params = {
    ...(entityId && { entity_id: entityId }),
    ...(periodMonth && { period_month: periodMonth }),
  };
  const { data, isLoading, error } = useGetExport(exportType, params, {
    query: { queryKey: getGetExportQueryKey(exportType, params) }
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (error) return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>Failed to generate export.</AlertDescription>
    </Alert>
  );
  if (!data) return null;

  function downloadCSV() {
    if (!data?.records?.length) return;
    const headers = Object.keys(data.records[0]);
    const rows = data.records.map((r: Record<string, unknown>) =>
      headers.map(h => {
        const v = r[h];
        if (v == null) return "";
        const str = String(v);
        return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.export_type}_${data.generated_at.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="print-report">
      <div className="print-export-header">
        <p className="print-brand">Founders Finance</p>
        <h1>{exportLabel}</h1>
        <p>{data.record_count} records · generated {new Date(data.generated_at).toLocaleString()}</p>
      </div>
      <CardHeader className="screen-export-header pb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{data.record_count} records · generated {new Date(data.generated_at).toLocaleString()}</p>
          </div>
          <div className="print-controls flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!data.records?.length} data-testid="button-print-export">
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Print / Save PDF
            </Button>
            <Button size="sm" variant="outline" onClick={downloadCSV} disabled={!data.records?.length} data-testid="button-download-csv">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="print-report-content">
        {!data.records?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">No records found for this export.</p>
        ) : (
          <>
            <div className="screen-export-preview max-h-96 overflow-auto rounded border border-border">
              <ExportTable records={data.records as Record<string, unknown>[]} limit={100} />
            </div>
            <div className="print-export-preview">
              <ExportTable records={data.records as Record<string, unknown>[]} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function Exports() {
  const [selectedType, setSelectedType] = useState<ExportType | "">("");
  const [entityId, setEntityId] = useState<string>("");
  const [periodMonth, setPeriodMonth] = useState<string>("");
  const [runExport, setRunExport] = useState(false);

  const { data: entities } = useListEntities(undefined, { query: { queryKey: getListEntitiesQueryKey() } });

  const selectedMeta = EXPORT_TYPES.find(t => t.value === selectedType);

  function handleGenerate() {
    if (!selectedType) return;
    setRunExport(true);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Exports</h1>
        <p className="text-sm text-muted-foreground mt-1">Generate and download financial data exports</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {EXPORT_TYPES.map(et => (
          <button
            key={et.value}
            onClick={() => { setSelectedType(et.value); setRunExport(false); }}
            className={`text-left p-3 rounded-lg border transition-colors ${selectedType === et.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
            data-testid={`button-export-type-${et.value}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium leading-tight">{et.label}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-snug">{et.description}</p>
          </button>
        ))}
      </div>

      {selectedType && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{selectedMeta?.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 items-end flex-wrap">
              {selectedMeta?.entityFilter && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Entity (optional)</label>
                  <Select value={entityId || "__all__"} onValueChange={v => { setEntityId(v === "__all__" ? "" : v); setRunExport(false); }}>
                    <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-export-entity">
                      <SelectValue placeholder="All entities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All entities</SelectItem>
                      {entities?.map(e => <SelectItem key={e.id} value={e.id}>{e.display_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {selectedMeta?.monthFilter && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Period Month (optional)</label>
                  <Input
                    type="month"
                    className="h-8 text-sm w-40"
                    onChange={e => { setPeriodMonth(e.target.value ? e.target.value + "-01" : ""); setRunExport(false); }}
                    data-testid="input-export-month"
                  />
                </div>
              )}
              <Button size="sm" onClick={handleGenerate} data-testid="button-generate-export">
                Generate
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {runExport && selectedType && (
        <ExportPreview
          exportType={selectedType}
          exportLabel={selectedMeta?.label ?? selectedType}
          entityId={entityId}
          periodMonth={periodMonth}
        />
      )}
    </div>
  );
}
