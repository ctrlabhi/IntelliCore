/**
 * DISABLED PER OWNER DATABASE ACCESS POLICY
 * 
 * The remote MariaDB database belongs to an external hosting account.
 * Standalone password rotation by the application is strictly prohibited.
 * Refer to: docs/DATABASE_ACCESS_POLICY.md
 */

console.error('❌ EXECUTION BLOCKED: Database password rotation is disabled per owner policy.');
console.error('   The remote MariaDB database is managed by an external administrator.');
console.error('   See docs/DATABASE_ACCESS_POLICY.md for details.');
process.exit(1);
