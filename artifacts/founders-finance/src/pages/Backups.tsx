import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetBackupOverviewQueryKey,
  useCreateEncryptedBackup,
  useGetBackupOverview,
  useRestoreEncryptedBackup,
  useRunBackupRecoveryDrill,
  useVerifyEncryptedBackup,
  type BackupMetadata,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DatabaseBackup,
  Download,
  FileArchive,
  HardDrive,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type BackupAction = "verify" | "recovery" | "restore";

function formatDate(value: string | null | undefined) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function StatusBadge({ status }: { status: BackupMetadata["verification_status"] }) {
  if (status === "verified") {
    return (
      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Verified
      </Badge>
    );
  }
  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  return (
    <Badge variant="outline" className="border-slate-600 text-slate-400">
      <Clock3 className="mr-1 h-3 w-3" /> Pending
    </Badge>
  );
}

function ProtectionMetric({
  icon: Icon,
  label,
  value,
  detail,
  positive = false,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  detail: string;
  positive?: boolean;
}) {
  return (
    <div className="border-l border-border px-4 first:border-l-0 first:pl-0">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        <Icon className={cn("h-3.5 w-3.5", positive ? "text-emerald-400" : "text-sky-300")} />
        {label}
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-foreground" title={value}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export default function Backups() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const overview = useGetBackupOverview({
    query: { queryKey: getGetBackupOverviewQueryKey(), refetchInterval: 15_000 },
  });
  const createBackup = useCreateEncryptedBackup();
  const verifyBackup = useVerifyEncryptedBackup();
  const recoveryDrill = useRunBackupRecoveryDrill();
  const restoreBackup = useRestoreEncryptedBackup();
  const [createPassphrase, setCreatePassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [selected, setSelected] = useState<{ backup: BackupMetadata; action: BackupAction } | null>(null);
  const [actionPassphrase, setActionPassphrase] = useState("");
  const [restoreConfirmation, setRestoreConfirmation] = useState("");

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetBackupOverviewQueryKey() });
  };

  const operationPending = verifyBackup.isPending || recoveryDrill.isPending || restoreBackup.isPending;
  const latest = overview.data?.backups.find((backup) => backup.status === "complete");
  const latestDrill = overview.data?.backups.find((backup) => backup.recovery_drill_status === "verified");

  async function handleCreate() {
    if (createPassphrase !== confirmPassphrase) {
      toast({ title: "Passphrases do not match", variant: "destructive" });
      return;
    }
    try {
      const result = await createBackup.mutateAsync({
        data: { passphrase: createPassphrase, passphrase_confirmation: confirmPassphrase },
      });
      setCreatePassphrase("");
      setConfirmPassphrase("");
      await refresh();
      toast({ title: "Encrypted backup created", description: `${result.file_name} passed its integrity verification.` });
    } catch (error) {
      toast({ title: "Backup failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  }

  function openAction(backup: BackupMetadata, action: BackupAction) {
    setSelected({ backup, action });
    setActionPassphrase("");
    setRestoreConfirmation("");
  }

  async function handleAction() {
    if (!selected) return;
    try {
      if (selected.action === "verify") {
        await verifyBackup.mutateAsync({ id: selected.backup.id, data: { passphrase: actionPassphrase } });
        toast({ title: "Integrity verified", description: "The database dump and every evidence file passed fingerprint checks." });
      }
      if (selected.action === "recovery") {
        await recoveryDrill.mutateAsync({ id: selected.backup.id, data: { passphrase: actionPassphrase } });
        toast({ title: "Recovery drill passed", description: "The backup restored into an isolated database and all table counts matched." });
      }
      if (selected.action === "restore") {
        await restoreBackup.mutateAsync({
          id: selected.backup.id,
          data: { passphrase: actionPassphrase, confirmation: "RESTORE FOUNDERS FINANCE" },
        });
        toast({ title: "Restore completed", description: "A pre-restore backup was created and post-restore counts matched." });
      }
      setSelected(null);
      setActionPassphrase("");
      setRestoreConfirmation("");
      await refresh();
    } catch (error) {
      toast({ title: "Operation failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  }

  if (overview.isLoading) {
    return <div className="space-y-5"><Skeleton className="h-20 w-full" /><Skeleton className="h-56 w-full" /><Skeleton className="h-72 w-full" /></div>;
  }

  if (overview.error || !overview.data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Backup status could not be loaded. Confirm PostgreSQL tools and storage paths are configured.</AlertDescription>
      </Alert>
    );
  }

  const actionTitle = selected?.action === "verify"
    ? "Verify backup integrity"
    : selected?.action === "recovery"
      ? "Run recovery drill"
      : "Restore live workspace";
  const actionDescription = selected?.action === "verify"
    ? "Decrypts the package and checks the database dump plus every evidence-file fingerprint."
    : selected?.action === "recovery"
      ? "Restores into a disposable PostgreSQL database and compares every table row count. Your live data is not changed."
      : "Creates a fresh pre-restore backup, replaces the live database and evidence files, then verifies row counts.";

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-sky-300">
            <ShieldCheck className="h-4 w-4" /> Data protection
          </div>
          <h1 className="mt-2 text-2xl font-bold">Backup & Restore</h1>
          <p className="mt-1 text-sm text-muted-foreground">Encrypted recovery packages for the complete financial workspace.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void overview.refetch()} disabled={overview.isFetching}>
          <RefreshCw className={cn("h-4 w-4", overview.isFetching && "animate-spin")} /> Refresh
        </Button>
      </div>

      <section className="grid gap-5 border-y border-border py-5 sm:grid-cols-2 xl:grid-cols-4" aria-label="Protection status">
        <ProtectionMetric icon={DatabaseBackup} label="Latest backup" value={formatDate(latest?.completed_at)} detail={latest ? formatBytes(latest.bytes) : "No recovery point exists"} positive={Boolean(latest)} />
        <ProtectionMetric icon={ShieldCheck} label="Latest verification" value={formatDate(overview.data.latest_verified_at)} detail="Payload fingerprints checked" positive={Boolean(overview.data.latest_verified_at)} />
        <ProtectionMetric icon={RotateCcw} label="Recovery drill" value={formatDate(latestDrill?.last_recovery_drill_at)} detail="Clean-database restore test" positive={Boolean(latestDrill)} />
        <ProtectionMetric icon={HardDrive} label="Storage" value={overview.data.storage_destination} detail={`${overview.data.encryption} encryption`} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <div className="rounded-md border border-sky-500/35 bg-card/70 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-sky-400/40 bg-sky-500/10 text-sky-300">
              <FileArchive className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Create encrypted recovery point</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Packages the PostgreSQL database, audit history, and all files under the evidence storage root.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="backup-passphrase" className="mb-1.5 block text-xs font-medium text-muted-foreground">Backup passphrase</label>
              <Input id="backup-passphrase" type="password" autoComplete="new-password" value={createPassphrase} onChange={(event) => setCreatePassphrase(event.target.value)} placeholder="12 characters minimum" />
            </div>
            <div>
              <label htmlFor="backup-passphrase-confirm" className="mb-1.5 block text-xs font-medium text-muted-foreground">Confirm passphrase</label>
              <Input id="backup-passphrase-confirm" type="password" autoComplete="new-password" value={confirmPassphrase} onChange={(event) => setConfirmPassphrase(event.target.value)} placeholder="Repeat passphrase" />
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-xs text-amber-200/80"><KeyRound className="h-3.5 w-3.5" /> The passphrase is never stored and cannot be recovered.</p>
            <Button onClick={() => void handleCreate()} disabled={createBackup.isPending || createPassphrase.length < 12 || confirmPassphrase.length < 12}>
              {createBackup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
              {createBackup.isPending ? "Creating..." : "Create backup"}
            </Button>
          </div>
        </div>

        <div className="border-l border-border px-1 lg:pl-6">
          <h2 className="text-sm font-semibold">Recovery standard</h2>
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><div><p className="font-medium">Encrypted at rest</p><p className="mt-0.5 text-xs text-muted-foreground">AES-256-GCM with a memory-hard scrypt key.</p></div></div>
            <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><div><p className="font-medium">Evidence included</p><p className="mt-0.5 text-xs text-muted-foreground">Each file is copied and fingerprinted independently.</p></div></div>
            <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><div><p className="font-medium">Restore is reversible</p><p className="mt-0.5 text-xs text-muted-foreground">A new encrypted recovery point is created before every live restore.</p></div></div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-base font-semibold">Recovery history</h2>
            <p className="mt-1 text-xs text-muted-foreground">{overview.data.backups.length} encrypted package{overview.data.backups.length === 1 ? "" : "s"}</p>
          </div>
          {overview.data.active_operation && (
            <Badge variant="outline" className="border-sky-400/40 bg-sky-500/10 text-sky-200">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> {overview.data.active_operation.type.replace("_", " ")}
            </Badge>
          )}
        </div>

        {overview.data.backups.length === 0 ? (
          <div className="py-14 text-center">
            <DatabaseBackup className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm font-medium">No recovery points yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Create the first encrypted backup above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-semibold uppercase text-muted-foreground">
                  <th className="px-3 py-3">Created</th>
                  <th className="px-3 py-3">Package</th>
                  <th className="px-3 py-3">Integrity</th>
                  <th className="px-3 py-3">Recovery drill</th>
                  <th className="px-3 py-3">Contents</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {overview.data.backups.map((backup) => (
                  <tr key={backup.id} className="border-b border-border/70 align-top hover:bg-slate-900/35">
                    <td className="px-3 py-4"><p className="font-medium">{formatDate(backup.completed_at ?? backup.created_at)}</p><p className="mt-1 text-xs text-muted-foreground">{formatBytes(backup.bytes)}</p></td>
                    <td className="max-w-[230px] px-3 py-4"><p className="truncate font-mono text-xs text-slate-300" title={backup.file_name}>{backup.file_name}</p>{backup.error && <p className="mt-1 line-clamp-2 text-xs text-red-300">{backup.error}</p>}</td>
                    <td className="px-3 py-4"><StatusBadge status={backup.verification_status} /><p className="mt-1.5 text-xs text-muted-foreground">{formatDate(backup.last_verified_at)}</p></td>
                    <td className="px-3 py-4"><StatusBadge status={backup.recovery_drill_status} /><p className="mt-1.5 text-xs text-muted-foreground">{formatDate(backup.last_recovery_drill_at)}</p></td>
                    <td className="px-3 py-4 text-xs"><p>{backup.database_table_count} database tables</p><p className="mt-1 text-muted-foreground">{backup.evidence_file_count} evidence files</p></td>
                    <td className="px-3 py-4">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openAction(backup, "verify")} disabled={backup.status !== "complete"}>Verify</Button>
                        <Button variant="ghost" size="sm" onClick={() => openAction(backup, "recovery")} disabled={backup.status !== "complete"}>Test restore</Button>
                        {backup.status === "complete" ? (
                          <Button variant="ghost" size="icon" asChild title="Download encrypted backup">
                            <a href={`/api/backups/${encodeURIComponent(backup.id)}/download`}><Download className="h-4 w-4" /><span className="sr-only">Download</span></a>
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" disabled title="Backup package unavailable"><Download className="h-4 w-4" /></Button>
                        )}
                        <Button variant="ghost" size="icon" className="text-red-300 hover:bg-red-500/10 hover:text-red-200" onClick={() => openAction(backup, "restore")} disabled={backup.status !== "complete"} title="Restore this backup">
                          <RotateCcw className="h-4 w-4" /><span className="sr-only">Restore</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !operationPending) setSelected(null); }}>
        <DialogContent className={cn(selected?.action === "restore" && "border-red-500/50")}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected?.action === "restore" ? <AlertTriangle className="h-5 w-5 text-red-400" /> : <ShieldCheck className="h-5 w-5 text-sky-300" />}
              {actionTitle}
            </DialogTitle>
            <DialogDescription>{actionDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label htmlFor="action-passphrase" className="mb-1.5 block text-xs font-medium text-muted-foreground">Backup passphrase</label>
              <Input id="action-passphrase" type="password" autoComplete="current-password" value={actionPassphrase} onChange={(event) => setActionPassphrase(event.target.value)} />
            </div>
            {selected?.action === "restore" && (
              <div>
                <label htmlFor="restore-confirmation" className="mb-1.5 block text-xs font-medium text-red-300">Type RESTORE FOUNDERS FINANCE</label>
                <Input id="restore-confirmation" value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} className="border-red-500/40 focus-visible:ring-red-400" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)} disabled={operationPending}>Cancel</Button>
            <Button
              variant={selected?.action === "restore" ? "destructive" : "default"}
              onClick={() => void handleAction()}
              disabled={operationPending || actionPassphrase.length < 12 || (selected?.action === "restore" && restoreConfirmation !== "RESTORE FOUNDERS FINANCE")}
            >
              {operationPending ? <Loader2 className="h-4 w-4 animate-spin" /> : selected?.action === "recovery" ? <RotateCcw className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              {operationPending ? "Working..." : selected?.action === "restore" ? "Restore live workspace" : selected?.action === "recovery" ? "Run recovery drill" : "Verify backup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
