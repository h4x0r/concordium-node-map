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
  await db.execute(SCHEMA.network_snapshots);
  await db.execute(SCHEMA.peers);
  await db.execute(SCHEMA.peer_connections);
  await db.execute(SCHEMA.shodan_scans);
  await db.execute(SCHEMA.osint_cache);
  await db.execute(SCHEMA.validators);
  await db.execute(SCHEMA.validator_transitions);
  await db.execute(SCHEMA.consensus_snapshots);
  await db.execute(SCHEMA.blocks);
  await db.execute(SCHEMA.consensus_alerts);
  await db.execute(SCHEMA.quorum_health_history);

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

/**
 * Retention period in milliseconds (30 days)
 */
const RETENTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Clean up old data beyond the retention period (30 days)
 * Acts as a ring buffer - deletes data older than retention period
 * Returns the number of rows deleted from each table
 */
export async function cleanupOldData(): Promise<{
  snapshots: number;
  events: number;
  networkSnapshots: number;
  sessions: number;
}> {
  const db = getDbClient();
  const cutoffTimestamp = Date.now() - RETENTION_PERIOD_MS;

  // Delete old snapshots (main storage consumer)
  const snapshotsResult = await db.execute({
    sql: 'DELETE FROM snapshots WHERE timestamp < ?',
    args: [cutoffTimestamp],
  });

  // Delete old events
  const eventsResult = await db.execute({
    sql: 'DELETE FROM events WHERE timestamp < ?',
    args: [cutoffTimestamp],
  });

  // Delete old network snapshots
  const networkSnapshotsResult = await db.execute({
    sql: 'DELETE FROM network_snapshots WHERE timestamp < ?',
    args: [cutoffTimestamp],
  });

  // Delete old completed sessions (keep active ones)
  const sessionsResult = await db.execute({
    sql: 'DELETE FROM node_sessions WHERE end_time IS NOT NULL AND end_time < ?',
    args: [cutoffTimestamp],
  });

  return {
    snapshots: snapshotsResult.rowsAffected,
    events: eventsResult.rowsAffected,
    networkSnapshots: networkSnapshotsResult.rowsAffected,
    sessions: sessionsResult.rowsAffected,
  };
}
