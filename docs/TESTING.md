# IntelliCore Testing & Verification Guide

**Testing Framework:** Vitest  
**HTTP Assertion Library:** Supertest  
**Environment:** Local Development  

---

## 1. Testing Philosophy

Automated testing validates application stability, API contracts, security protections, and database resilience without polluting development data.

---

## 2. Test Suite Organization

```
tests/
├── unit/
│   ├── config.test.js           # Environment & config validation
│   └── utils.test.js            # Response envelope & custom error utilities
└── integration/
    ├── health.test.js           # /health and /ready probe verification
    ├── apiV1.test.js            # /api/v1 endpoints contract tests
    ├── security.test.js         # Helmet headers, rate limiting, blocked paths
    └── staticServing.test.js    # Static asset and dashboard route mapping
```

---

## 3. Running Automated Tests

```powershell
# Run the full test suite
npm test

# Run tests in watch mode
npm run test:watch

# Generate code coverage report
npm run test:coverage
```

---

## 4. Verification Checklist for Phase 1

1. **Liveness & Readiness:**
   - `GET /health` returns HTTP 200 with status `UP`.
   - `GET /ready` returns HTTP 200 when database is connected, or 503 when disconnected.
2. **API Routing & Versioning:**
   - `GET /api/v1` returns API version details with valid request ID.
   - Unknown `/api/v1/*` routes return HTTP 404 with standard error JSON.
3. **Security Headers:**
   - Helmet headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`) present.
   - Rate limit headers (`RateLimit-Limit`, `RateLimit-Remaining`) returned on API calls.
4. **Static Frontend & Legacy Aliases:**
   - `GET /` serves `frontend/index.html` with HTTP 200.
   - `GET /founder-dashboard.html` serves the Founder dashboard.
   - `GET /Photos/favicon.png` resolves successfully.
   - Access to `.env` or `prisma/schema.prisma` is rejected with 404/403.

## Phase 04 isolated integration tests

The default test run uses an unreachable loopback database and excludes the MySQL suites. It covers unit checks, HTTP contracts, static routes, and RBAC and onboarding guards with mocked identity and persistence where needed.

For the complete suite, provision a disposable MySQL 8.4 database and a dedicated user scoped to that database. Both names must begin with `intellicore_test_`. Use a loopback MySQL endpoint with an explicit port and set `INTELLICORE_TEST_DATABASE_URL` privately. The runner rejects the normal application schema, privileged usernames, non-loopback hosts and URL options. The MySQL suites also check that the configured application URL equals the validated test URL. Generate Prisma Client from the current schema before running `npm test` with the test URL.

Fixture setup deploys the Prisma chain, seeds the catalog and creates a synthetic Founder in the isolated schema. The suite exercises real MySQL writes, foreign keys, concurrent transactions, audit rollback and ownership. Firebase verification is mocked. Browser tests with synthetic identities and actual development Firebase sign-in are separate checks.

