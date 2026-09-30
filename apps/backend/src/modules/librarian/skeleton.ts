import { MEMORY_SCHEMA_VERSION } from '@bob/contracts';
import type { schema } from '@bob/storage';
import { emptyMemory, signatureOf } from './memory.js';
import { renderDocuments } from './render.js';

/**
 * The deterministic empty brain (version 1) committed with every new customer (ADR 0008), so a
 * brain always exists and readers never special-case "no brain". It is the only snapshot the API
 * role may insert: migration 0002 pins version 1, no base, watermark 0 and no model version.
 */
export function skeletonSnapshot(
  workspaceId: string,
  customerId: string,
  createdAt: Date,
): typeof schema.brainSnapshots.$inferInsert {
  const memory = emptyMemory();
  return {
    workspaceId,
    customerId,
    version: 1,
    baseVersion: null,
    structured: memory,
    documents: renderDocuments(memory, {
      version: 1,
      sourceWatermark: 0,
      asOf: createdAt.toISOString(),
    }),
    signature: signatureOf(memory),
    sourceWatermark: 0,
    modelVersion: null,
    promptVersion: 'skeleton',
    schemaVersion: MEMORY_SCHEMA_VERSION,
  };
}
