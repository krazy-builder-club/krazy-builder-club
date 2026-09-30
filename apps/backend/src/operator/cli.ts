import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { ALL_CAPABILITIES, Capability } from '@bob/contracts';
import {
  createDatabase,
  insertApiKey,
  insertWorkspace,
  listApiKeys,
  recordAudit,
  revokeApiKey,
  withWorkspace,
} from '@bob/storage';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { loadDotEnv } from '../config/env.js';
import { generateApiKey } from '../modules/identity/api-keys.js';

/**
 * IAM-restricted operator tooling: workspace/key lifecycle is not a public API route.
 * Runs with the migrator/operator database URL (OPERATOR_DATABASE_URL, else DATABASE_URL).
 * Plaintext keys are printed exactly once and never stored.
 */
const USAGE = `Usage: pnpm operator <command> [options]

  workspace:create --name <name>
  key:create       --workspace <id> --name <name> --capabilities <all|cap,cap>
                   (--all-customers | --customers <id,id>) [--expires-days <n>]
  key:list         --workspace <id>
  key:revoke       --workspace <id> --key <key_id>
  dev:login-roles  --api-password <pw> --worker-password <pw>   (local databases only)

Capabilities: ${ALL_CAPABILITIES.join(', ')}`;

const OperatorEnv = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().optional(),
  OPERATOR_DATABASE_URL: z.string().optional(),
  API_KEY_PEPPER: z.string().min(32).optional(),
});

async function main(argv: string[]) {
  loadDotEnv();
  const env = OperatorEnv.parse(process.env);
  const url = env.OPERATOR_DATABASE_URL ?? env.DATABASE_URL;
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      name: { type: 'string' },
      workspace: { type: 'string' },
      key: { type: 'string' },
      capabilities: { type: 'string' },
      'all-customers': { type: 'boolean' },
      customers: { type: 'string' },
      'expires-days': { type: 'string' },
      'api-password': { type: 'string' },
      'worker-password': { type: 'string' },
    },
  });
  if (!command || !url) {
    console.error(USAGE);
    if (!url) console.error('\nOPERATOR_DATABASE_URL or DATABASE_URL is required.');
    process.exit(2);
  }
  const database = createDatabase(url, { max: 1 });
  const need = (value: string | undefined, flag: string) => {
    if (!value) throw new Error(`--${flag} is required\n\n${USAGE}`);
    return value;
  };
  const uuid = (value: string | undefined, flag: string) => z.uuid().parse(need(value, flag));

  try {
    switch (command) {
      case 'workspace:create': {
        const id = randomUUID();
        const name = need(values.name, 'name');
        await withWorkspace(database.db, id, async (tx) => {
          await insertWorkspace(tx, { id, name });
          await recordAudit(tx, {
            workspaceId: id,
            actorType: 'operator',
            eventType: 'workspace.created',
            targetId: id,
          });
        });
        console.log(JSON.stringify({ workspace_id: id, name, data_kind: 'synthetic' }, null, 2));
        return;
      }
      case 'key:create': {
        if (!env.API_KEY_PEPPER) throw new Error('API_KEY_PEPPER is required to issue keys');
        const workspaceId = uuid(values.workspace, 'workspace');
        const caps = need(values.capabilities, 'capabilities');
        const capabilities =
          caps === 'all'
            ? [...ALL_CAPABILITIES]
            : caps.split(',').map((c) => Capability.parse(c.trim()));
        const allCustomers = values['all-customers'] === true;
        const customerIds = values.customers
          ? values.customers.split(',').map((c) => z.uuid().parse(c.trim()))
          : [];
        if (allCustomers === customerIds.length > 0) {
          throw new Error('Choose exactly one of --all-customers or --customers');
        }
        const days = values['expires-days']
          ? z.coerce.number().int().positive().parse(values['expires-days'])
          : undefined;
        const generated = generateApiKey(env.API_KEY_PEPPER);
        const key = await withWorkspace(database.db, workspaceId, async (tx) => {
          const row = await insertApiKey(tx, {
            workspaceId,
            name: need(values.name, 'name'),
            prefix: generated.prefix,
            keyHash: generated.keyHash,
            capabilities,
            allCustomers,
            customerIds,
            expiresAt: days ? new Date(Date.now() + days * 86_400_000) : undefined,
          });
          await recordAudit(tx, {
            workspaceId,
            actorType: 'operator',
            eventType: 'api_key.created',
            targetId: row.id,
          });
          return row;
        });
        console.log(
          JSON.stringify(
            { key_id: key.id, prefix: key.prefix, capabilities, all_customers: allCustomers },
            null,
            2,
          ),
        );
        console.log(`\nAPI key (shown once, store it securely):\n${generated.token}`);
        return;
      }
      case 'key:list': {
        const workspaceId = uuid(values.workspace, 'workspace');
        const keys = await withWorkspace(database.db, workspaceId, listApiKeys);
        console.log(JSON.stringify(keys, null, 2));
        return;
      }
      case 'key:revoke': {
        const workspaceId = uuid(values.workspace, 'workspace');
        const keyId = uuid(values.key, 'key');
        const revoked = await withWorkspace(database.db, workspaceId, async (tx) => {
          const ok = await revokeApiKey(tx, keyId);
          if (ok)
            await recordAudit(tx, {
              workspaceId,
              actorType: 'operator',
              eventType: 'api_key.revoked',
              targetId: keyId,
            });
          return ok;
        });
        console.log(JSON.stringify({ key_id: keyId, revoked }));
        return;
      }
      case 'dev:login-roles': {
        if (env.NODE_ENV === 'production')
          throw new Error('dev:login-roles is for local databases only');
        const api = need(values['api-password'], 'api-password');
        const worker = need(values['worker-password'], 'worker-password');
        for (const [role, group, password] of [
          ['bob_api_local', 'bob_api', api],
          ['bob_worker_local', 'bob_worker', worker],
        ] as const) {
          await database.db.execute(sql.raw(`DROP ROLE IF EXISTS ${role}`));
          await database.db.execute(
            sql.raw(
              `CREATE ROLE ${role} LOGIN PASSWORD '${password.replaceAll("'", "''")}' IN ROLE ${group}`,
            ),
          );
        }
        console.log('Created bob_api_local and bob_worker_local login roles.');
        return;
      }
      default:
        console.error(USAGE);
        process.exitCode = 2;
    }
  } finally {
    await database.close();
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
