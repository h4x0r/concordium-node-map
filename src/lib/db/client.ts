import { createClient, type Client } from '@libsql/client';
import { SCHEMA } from './schema';

let client: Client | null = null;

/**
 * Get or create the Turso database client
 * Uses environment variables for configuration
 */
export function getDbClient(): Client {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error('TURSO_DATABASE_URL environment variable is required');
  }

  client = createClient({
    url,
    authToken,
  });

  return client;
}

/**
 * Initialize database schema
 * Creates tables and indexes if they don't exist
 */
export async function initializeSchema(): Promise<void> {
  const db = getDbClient();

  // Create tables
  await db.execute(SCHEMA.nodes);
  await db.execute(SCHEMA.node_sessions);
  await db.execute(SCHEMA.snapshots);
  await db.execute(SCHEMA.events);

  // Create indexes
  for (const indexSql of SCHEMA.indexes) {
    await db.execute(indexSql);
  }
}

/**
 * Create an in-memory client for testing
 */
export function createTestClient(): Client {
  return createClient({
    url: ':memory:',
  });
}

/**
 * Set the client (useful for testing)
 */
export function setDbClient(newClient: Client): void {
  client = newClient;
}

/**
 * Reset the client (useful for testing)
 */
export function resetDbClient(): void {
  client = null;
}
