# Local development runtime recovery

Phase 08 started from `c9da6dd`. The existing database is `intellicore_db` on the local Docker Desktop Linux engine, using MySQL 8.4.13, `intellicore_mysql_data` and UTC. The application uses the separate `intellicore_uploads_data` volume. The MySQL ports are private to Docker. phpMyAdmin publishes only `127.0.0.1:8080`.

## Diagnosis and evidence

Four migrations finished. `20261125000000_add_attendance_leave_and_reports` was unfinished with zero applied steps. Its log showed a DDL permission denial. The runtime account has only schema-scoped SELECT, INSERT, UPDATE and DELETE. The dedicated migration account exists with grants restricted to the application and shadow schemas. The approved local `MIGRATION_DATABASE_URL` was absent. The backup restored on isolated MySQL matched the schema derived from the first four tracked migrations. This additional comparison established the absence of partial Phase 05 schema effects in the snapshot.

The application container listens internally on port 3000, with a healthy app and MySQL. The existing app container lacks a published port. Compose specifies `127.0.0.1:3000:3000`, but Antigravity IDE owns the current listener. Preserve that process pending release of the port by its owner.

## Approved recovery sequence

The owner approved resolving the exact failed ledger entry and redeploying after prerequisites. Keep the development stack isolated from production throughout.

1. Configure the existing dedicated migration credential as `MIGRATION_DATABASE_URL` in the ignored local `.env`, using the Docker DNS name `mysql` and the exact approved schema. Configure the corresponding shadow URL if needed. Prove both credentials and effective grants with a read-only connection and the guarded migration `status` command. Do not rotate or substitute credentials.
2. Reconfirm the running container, schema, expected named volumes, migration file checksums and precise ledger failure. Pause writers and the notification worker for a deployment maintenance window. Keep email in CAPTURE and Calendar event writes disabled during recovery.
3. Run `scripts/backup.ps1` from the local workspace. It identifies the Docker engine and named volume, streams an InnoDB-consistent dump without printing secrets and records its SHA-256. The ignored backup contains private development records. Restrict directory access and use only a disposable recovery target for testing restore. Take a new backup at the maintenance boundary if writes could have occurred since the rehearsal.
4. Restore the backup on an isolated MySQL 8.4 instance and compare structure with the first four migrations and business table data against the source snapshot. If structural differences exist, stop the live ledger operation and reassess the reconciliation plan.
5. Build the local app image and use the dedicated maintenance process for `docker compose run --rm --no-deps migrate node backend/src/scripts/migrateDatabase.js resolve-phase05`, then `docker compose run --rm --no-deps migrate`. The fixed guarded action calls Prisma `migrate resolve --rolled-back 20261125000000_add_attendance_leave_and_reports`. This sequence was rehearsed with Prisma 6.19.3 against the restored copy. Never manually edit the ledger or rewrite previous migrations. [Prisma failed migration recovery](https://www.prisma.io/docs/orm/prisma-migrate/workflows/patching-and-hotfixing).
6. Compare all migration checksums, verify zero unexpected drift, check legacy record counts and hashes, and run the existing controlled seed process for Phase 08 permission grants. Preserve application and upload volumes.
7. After port 3000 is free, recreate only the app service using `docker compose up -d --no-deps app`. Verify the effective IPv4 loopback binding, app and MySQL health, private database networking, runtime upload access, authenticated phpMyAdmin and `/`, `/health`, `/ready`, and `/api-docs/`. Start only the dedicated, table-scoped CAPTURE worker and recheck real development Founder authentication.

The current execution and outstanding gates are recorded in [the Phase 08 report](PHASE_08_REPORT.md).
