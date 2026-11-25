#!/bin/sh
set -e

echo "🚀 IntelliCore container startup initiated..."

# Schema deployment and seeding are separate operator actions.
exec "$@"

