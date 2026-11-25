# Local development & fresh machine setup guide

## 1. System Requirements

- **Operating System**: Windows 10/11, macOS, or Linux
- **Runtime**: Node.js 24 LTS
- **Package Manager**: npm 10+
- **Containers**: Docker Desktop with Compose v2+
- **Database**: MySQL 8.4 LTS (managed via Docker)

---

## 2. Fresh Installation Steps

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd IntelliCore
```

### Step 2: Install Node Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure the following variables are configured:
```ini
NODE_ENV=development
PORT=3000
DATABASE_URL="mysql://intellicore_app:intellicore_secret_2026@127.0.0.1:3306/intellicore_db"
UPLOAD_DIR="storage"
EMAIL_MODE=CAPTURE
FIREBASE_PROJECT_ID=intellicore-dev
```

### Step 4: Start Infrastructure Containers
```powershell
.\scripts\start.ps1
```
This starts:
- `intellicore_mysql` on port `3306` (healthy).
- `intellicore_app` on port `3000` (healthy).
- `intellicore_phpmyadmin` on port `8080`.

### Step 5: Run Database Migrations & Seeds
```bash
npx prisma migrate deploy
node prisma/seed.js
```

### Step 6: Verify Health Probes
- Liveness: `http://localhost:3000/health` (HTTP 200, `{ status: "ok" }`)
- Readiness: `http://localhost:3000/ready` (HTTP 200, active database connection)

---

## 3. Running Automated Tests

To run the complete automated test suite on an isolated test database:
```bash
# Start disposable MySQL test container (port 33359)
docker run -d --name intellicore-test-db -p 33359:3306 -e MYSQL_ROOT_PASSWORD=test_secret -e MYSQL_DATABASE=intellicore_test_fresh -e MYSQL_USER=intellicore_test_fresh -e MYSQL_PASSWORD=test_secret mysql:8.4

# Run test suite
set INTELLICORE_TEST_DATABASE_URL=mysql://intellicore_test_fresh:test_secret@127.0.0.1:33359/intellicore_test_fresh
npx vitest run --fileParallelism=false
```

---

## 4. Stopping Containers
```powershell
.\scripts\stop.ps1
```
Persistent data volumes (`intellicore_mysql_data` and `intellicore_uploads_data`) are preserved.
