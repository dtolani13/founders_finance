# Backup and Restore

Founders Finance creates encrypted recovery packages containing both the PostgreSQL database and the configured evidence directory. A package is not considered verified until it has been decrypted, its manifest and SHA-256 fingerprints have been checked, and PostgreSQL has accepted the dump catalog.

## In-App Control Center

Open **Backup & Restore** in the application navigation.

The control center shows:

- Latest successful backup and verified recovery point
- Backup storage destination and encryption format
- Database table and evidence-file counts
- Integrity verification and clean-database recovery-drill results
- Download and guarded live-restore actions

### Create a Backup

1. Enter and confirm a backup passphrase of at least 12 characters.
2. Select **Create backup**.
3. Wait for the package to be created and automatically verified.
4. Download the `.ffbackup` package and copy it to a second physical or cloud location.

The passphrase is never stored by Founders Finance and cannot be recovered. Store it in a password manager. Losing it makes the encrypted backup unusable.

### Run a Recovery Drill

Select **Test restore** on a completed backup and enter its passphrase. Founders Finance will:

1. Verify the encrypted package and every payload fingerprint.
2. Create an isolated temporary PostgreSQL database.
3. Restore the dump into that clean database.
4. Compare every public table's row count with the signed manifest.
5. Terminate connections and remove the temporary database.

The live workspace is not changed by a recovery drill.

### Restore the Live Workspace

Use live restore only when recovery is required. The workflow requires the backup passphrase and the exact phrase `RESTORE FOUNDERS FINANCE`.

Before changing live data, Founders Finance automatically creates a new encrypted pre-restore backup using the supplied passphrase. It then restores the selected database and evidence files and compares post-restore row counts with the package manifest.

Restoring an older database can invalidate the current owner session. Unlock the workspace again after recovery if prompted.

## Package Security

Each `.ffbackup` package uses:

- AES-256-GCM authenticated encryption
- scrypt key derivation with a random salt
- A unique random initialization vector
- SHA-256 fingerprints for the database dump and every evidence file
- A manifest containing table row counts for recovery comparison
- Archive path validation before extraction

Unencrypted staging files are created only in the operating system temporary directory and are removed after every success or failure path.

## Storage Strategy

The local backup directory is configured with `BACKUP_STORAGE_ROOT` and defaults to `./backups`. Local copies protect against application mistakes but do not protect against disk loss, theft, or ransomware.

Keep at least three copies:

1. The working Founders Finance data.
2. An encrypted `.ffbackup` package on a separate local drive.
3. An encrypted `.ffbackup` package in a reputable cloud or off-site location.

Because the package is encrypted before it leaves Founders Finance, it can be stored in OneDrive, Google Drive, Dropbox, Backblaze B2, an encrypted external SSD, or another location you control. Keep the passphrase separately.

## Command-Line Operations

The same backup engine is available for scheduled and administrative use.

```powershell
$env:BACKUP_PASSPHRASE = "your-password-manager-passphrase"
pnpm run backup
```

The command creates and verifies a package under `BACKUP_STORAGE_ROOT`.

```powershell
$env:BACKUP_PASSPHRASE = "your-password-manager-passphrase"
pnpm run backup:verify -- <backup-id>
pnpm run verify-restore -- <backup-id>
```

`verify-restore` performs the same isolated clean-database recovery drill used by the application.

## Configuration

```dotenv
DATABASE_URL=postgresql://...
EVIDENCE_STORAGE_ROOT=./evidence
BACKUP_STORAGE_ROOT=./backups
# POSTGRES_BIN=C:\Program Files\PostgreSQL\16\bin
```

`pg_dump`, `pg_restore`, and `tar` must be installed. On Windows, Founders Finance automatically searches standard PostgreSQL installation directories; `POSTGRES_BIN` can override that location.

## Operating Schedule

- Create a backup before every monthly close.
- Create a backup before bulk imports or major corrections.
- Copy successful packages off the application machine.
- Run a recovery drill at least quarterly and after changing PostgreSQL versions.
- Retain packages according to your legal, tax, and company recordkeeping requirements.

Human-readable CSV exports remain useful for accountant handoff, but they are not substitutes for an encrypted recovery package.
