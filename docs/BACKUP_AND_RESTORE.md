# Backup and Restore

## Overview

All financial data lives in a single PostgreSQL database. No data is stored in the application process or on the filesystem (file paths in the `documents` table are metadata references only — actual evidence files must be backed up separately).

---

## 1. Database Backups

### Creating a backup (manual)

```bash
# Full compressed dump — run this from your server or developer tools shell
pg_dump "$DATABASE_URL" --no-owner --no-acl -F c -Z 9 \
  -f "db-dumps/founders-finance-$(date +%Y%m%d-%H%M%S).dump"
```

> **Never commit `.dump` files to git.** They are excluded by `.gitignore`.

### Restoring from a dump

```bash
# Restore into a fresh database
pg_restore --no-owner --no-acl -d "$DATABASE_URL" path/to/backup.dump
```

### Automated backups

developer tools's PostgreSQL add-on performs automatic daily snapshots. To trigger a manual snapshot or restore from a developer tools snapshot, use the PostgreSQL administration tools.

For production deployments, consider setting up a cron job using `pg_dump` piped to an S3-compatible object store (e.g. Cloudflare R2, Backblaze B2).

---

## 2. Evidence File Backups

Evidence files (receipts, bank statements, contracts) are referenced by `file_path` in the `documents` table but stored on the filesystem. They are **not** backed up by `pg_dump`.

### Backup evidence directory

```bash
tar -czf "backups/evidence-$(date +%Y%m%d).tar.gz" evidence/
```

### Restore evidence files

```bash
tar -xzf backups/evidence-YYYYMMDD.tar.gz
```

Ensure the restored paths match the `file_path` values stored in the database.

---

## 3. Export JSON Snapshots

For point-in-time human-readable snapshots, use the built-in export endpoints:

```bash
# All transactions
curl "$BASE_URL/api/exports/all_transactions" | jq . > snapshots/transactions-$(date +%Y%m).json

# Monthly close summary
curl "$BASE_URL/api/exports/monthly_close_summary" | jq . > snapshots/monthly-close-$(date +%Y%m).json

# Document index
curl "$BASE_URL/api/exports/document_index" | jq . > snapshots/documents-$(date +%Y%m).json
```

These JSON exports are useful for accountant handoff and audit trails but are **not** a substitute for a full `pg_dump`.

---

## 4. Backup Checklist (Monthly)

Run at close of each month before marking the period closed:

- [ ] `pg_dump` completed and stored off-server
- [ ] Evidence directory archived and stored off-server
- [ ] JSON export snapshots saved for the period
- [ ] Backups tested by spot-checking record counts

---

## 5. Recovery Testing

At least quarterly, restore a backup into a scratch database and verify:

```bash
# Count records in key tables after restore
psql "$TEST_DATABASE_URL" -c "SELECT count(*) FROM transactions;"
psql "$TEST_DATABASE_URL" -c "SELECT count(*) FROM expense_allocations;"
psql "$TEST_DATABASE_URL" -c "SELECT count(*) FROM monthly_close_periods;"
```

---

## 6. What Is NOT Backed Up Automatically

| Item | Status |
|------|--------|
| PostgreSQL database | developer tools auto-snapshots daily; manual `pg_dump` recommended |
| Evidence files on disk | **Manual backup required** |
| `.env` secrets | Store separately in a password manager — never in git |
| developer tools workflow config | Stored in `local service config` — committed to git |
