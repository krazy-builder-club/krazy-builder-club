import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

/** Server-generated opaque UUID primary key. */
export const id = () => uuid('id').primaryKey().defaultRandom();

/** UTC `timestamptz`; the application always reads/writes `Date`s. */
export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const createdAt = () => ts('created_at').notNull().defaultNow();
export const updatedAt = () => ts('updated_at').notNull().defaultNow();

/** SQL `IN (...)` check body for a closed vocabulary shared with `@bob/contracts`. */
export const oneOf = (column: string, values: readonly string[]) =>
  sql.raw(`${column} in (${values.map((v) => `'${v.replaceAll("'", "''")}'`).join(', ')})`);
