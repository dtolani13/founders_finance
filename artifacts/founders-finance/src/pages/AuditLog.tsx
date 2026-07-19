import { useMemo, useState } from "react";
import { getListAuditRecordsQueryKey, useListAuditRecords } from "@workspace/api-client-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, FileClock, RotateCcw } from "lucide-react";

const tables = [
  "transactions", "transaction_lines", "expense_allocations", "entities", "documents",
  "statements", "statement_lines", "intercompany_links", "reimbursement_requests",
  "owner_contributions", "owner_draws", "monthly_close_periods", "vendors", "backups", "auth",
];

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function prettyJson(value: string | null | undefined): string {
  if (!value) return "No value recorded";
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

export default function AuditLog() {
  const [tableName, setTableName] = useState("");
  const [action, setAction] = useState("");
  const [recordId, setRecordId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const params = useMemo(() => ({
    ...(tableName ? { table_name: tableName } : {}),
    ...(action ? { action } : {}),
    ...(recordId ? { record_id: recordId } : {}),
    ...(fromDate ? { from: new Date(`${fromDate}T00:00:00`).toISOString() } : {}),
    limit: 300,
  }), [action, fromDate, recordId, tableName]);
  const { data: records, isLoading, error } = useListAuditRecords(params, {
    query: { queryKey: getListAuditRecordsQueryKey(params) },
  });

  function reset() {
    setTableName("");
    setAction("");
    setRecordId("");
    setFromDate("");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">Immutable history of financial, lifecycle, security, and recovery actions</p>
      </div>

      <div className="grid gap-3 rounded-md border bg-muted/10 p-4 md:grid-cols-[1fr_1fr_1.4fr_1fr_auto]">
        <Select value={tableName || "all"} onValueChange={(value) => setTableName(value === "all" ? "" : value)}>
          <SelectTrigger><SelectValue placeholder="All records" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All record types</SelectItem>{tables.map((table) => <SelectItem key={table} value={table}>{table.replaceAll("_", " ")}</SelectItem>)}</SelectContent>
        </Select>
        <Input value={action} onChange={(event) => setAction(event.target.value)} placeholder="Action, e.g. post" aria-label="Filter by action" />
        <Input value={recordId} onChange={(event) => setRecordId(event.target.value)} placeholder="Record UUID" aria-label="Filter by record ID" />
        <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Audit records from date" />
        <Button variant="outline" size="icon" onClick={reset} title="Clear audit filters"><RotateCcw className="h-4 w-4" /></Button>
      </div>

      {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Audit records could not be loaded. Check the record ID and try again.</AlertDescription></Alert>}
      {isLoading ? <Skeleton className="h-64 w-full" /> : !records?.length ? (
        <div className="rounded-md border py-16 text-center">
          <FileClock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No audit records match these filters</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="border-b bg-muted/40">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Time</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Record Type</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Action</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Record</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Memo / Changes</th>
            </tr></thead>
            <tbody>{records.map((record) => (
              <tr key={record.id} className="border-b align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatTimestamp(record.created_at)}</td>
                <td className="px-4 py-3 font-medium">{record.table_name.replaceAll("_", " ")}</td>
                <td className="px-4 py-3"><Badge variant="outline">{record.action}</Badge></td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{record.record_id?.slice(0, 8) ?? "-"}</td>
                <td className="max-w-[420px] px-4 py-3">
                  {record.memo && <p className="mb-1 text-xs">{record.memo}</p>}
                  {(record.previous_value || record.new_value) && (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer select-none">Inspect before / after</summary>
                      <div className="mt-2 grid gap-2 lg:grid-cols-2">
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">{prettyJson(record.previous_value)}</pre>
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">{prettyJson(record.new_value)}</pre>
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
