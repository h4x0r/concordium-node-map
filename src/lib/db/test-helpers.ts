/**
 * Test helpers for database tests
 * Provides utilities for initializing in-memory databases
 */

import { createClient, type Client } from '@libsql/client';
import { SCHEMA } from './schema';

/**
 * Create an in-memory database with all schema initialized
 */
export async function createTestDb(): Promise<Client> {
  const db = createClient({ url: ':memory:' });

  // Initialize all tables in order
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

  // Create all indexes
  for (const indexSql of SCHEMA.indexes) {
    await db.execute(indexSql);
  }

  return db;
}
