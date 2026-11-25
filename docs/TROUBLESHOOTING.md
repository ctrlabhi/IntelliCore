# IntelliCore operational troubleshooting guide

## 1. Common Operational Scenarios

### 1.1 Port 3000 Collision on Host
- **Symptom**: `Error: listen EADDRINUSE: address already in use :::3000` when running the application directly on the host.
- **Cause**: Port 3000 is occupied by another process. In development, PID `4940` (`Antigravity IDE.exe`) typically binds port 3000 for internal VS Code Live Preview services.
- **Resolution**:
  1. The containerized application runs safely inside Docker where port 3000 is mapped cleanly:
     ```powershell
     docker compose ps
     ```
  2. If running locally without Docker, specify an alternate port:
     ```bash
     PORT=3001 npm start
     ```
  3. Or identify and terminate the conflicting host process:
     ```powershell
     Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
     Stop-Process -Id <PID>
     ```

### 1.2 Prisma Migration Ledger Desynchronization
- **Symptom**: `PrismaClientKnownRequestError: Migration failed to apply cleanly` or `Database error code 1142: CREATE command denied`.
- **Cause**: The runtime MySQL user `intellicore_app` has `DML` privileges (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) but is denied `DDL` privileges (`CREATE`, `ALTER`, `DROP`) by security policy. Migrations must be run with administrative database credentials.
- **Resolution**:
  Use administrative credentials for migrations:
  ```bash
  DATABASE_URL="mysql://root:intellicore_root_secret@127.0.0.1:3306/intellicore_db" npx prisma migrate deploy
  ```

### 1.3 Firebase Token Verification Errors in Development
- **Symptom**: `FirebaseAuthError: Decoding Firebase ID token failed` or `Token used before issued`.
- **Cause**: System clock drift between host machine and Google Auth servers, or token issued by mismatched Firebase project.
- **Resolution**:
  1. Ensure system clock is synchronized with NTP.
  2. Confirm `FIREBASE_PROJECT_ID=intellicore-dev` in `.env`.
  3. Ensure client uses `intellicore-dev` web app configuration.

### 1.4 Private File Storage Permission Errors
- **Symptom**: `AppError: Private storage is temporarily unavailable (503)`.
- **Cause**: Node.js process lacks write permissions to `storage/phase06` directory, or directory ownership mismatch in Docker volume.
- **Resolution**:
  ```bash
  mkdir -p storage/phase06
  chmod 700 storage/phase06
  ```

### 1.5 Email Delivery Failures
- **Symptom**: Outbox jobs remain in `PENDING` or throw SMTP connection errors.
- **Cause**: Application is in `CAPTURE` mode by design to prevent accidental external email dispatch during development.
- **Resolution**:
  Inspect captured emails via database:
  ```sql
  SELECT id, recipient_email, subject, status, created_at FROM email_outbox ORDER BY created_at DESC LIMIT 10;
  ```
