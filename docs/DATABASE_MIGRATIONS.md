# Database Migrations

Founders Finance uses committed, ordered Drizzle SQL migrations in `lib/db/drizzle/`. Schema push is development-only and must never be used against a database containing financial records.

## Normal Update

1. Create and verify an encrypted backup.
2. Inspect migration state:

```powershell
pnpm run db:migrate:status
```

3. Apply pending migrations:

```powershell
pnpm run db:migrate
```

4. Confirm `pending` is `0`, then run tests and the application health check.

Migrations run in database transactions. A failed migration rolls back instead of leaving a partially changed schema.

## Changing The Schema

Edit the relevant file under `lib/db/src/schema/`, then generate and inspect the SQL:

```powershell
pnpm run db:generate
pnpm run db:migrate:acceptance
```

The acceptance command creates disposable databases and proves both a blank database and a copy of the current database converge to the same columns, constraints, and indexes without changing table row counts. It removes the disposable databases afterward.

Do not hand-edit generated snapshot files. A generated SQL migration may be edited only when the intended data transition cannot be represented safely by generation alone; document and test that edit before application.

## Existing Untracked Database

`pnpm run db:migrate:baseline` is only for a database created before migrations were introduced. It compares every public table, column, type, nullability rule, and primary key to the committed baseline before recording baseline adoption. Any mismatch aborts the operation.

Never baseline a blank database, a database already carrying migration history, or a database whose mismatch has not been explained. Normal installations use `pnpm run db:migrate` only.

## Recovery Rule

Never drop a production database to solve a migration problem. Preserve the error, verify the pre-migration encrypted backup, correct the migration in source, rerun the disposable acceptance drill, and then retry. Use the guarded restore workflow in [Backup and Restore](BACKUP_AND_RESTORE.md) only when rollback through normal migration behavior is insufficient.
