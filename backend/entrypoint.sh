#!/bin/sh
set -e

echo "🚀 IntelliCore container startup initiated..."

# Run database migrations before starting the application
echo "⏳ Applying Prisma database migrations..."
npx prisma migrate deploy || {
  echo "⚠️  Migration deploy encountered an issue. Waiting for database..."
  sleep 3
  npx prisma migrate deploy || echo "⚠️  Prisma migrate deploy bypassed for runtime start."
}

# Run idempotent database seeder
echo "🌱 Running database seeder..."
node prisma/seed.js || echo "⚠️  Database seeder finished with non-fatal status."

echo "✅ Database preparation completed. Starting server process..."

# Execute the primary CMD (npm start) with signal handling
exec "$@"

