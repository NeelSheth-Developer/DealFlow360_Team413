import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['sales_rep', 'sales_manager', 'finance', 'admin']);
export const tierEnum = pgEnum('tier', ['bronze', 'silver', 'gold']);
export const subjectKindEnum = pgEnum('subject_kind', ['staff', 'customer']);

/**
 * Internal staff. Everyone self-registers as `sales_rep`; only an admin promotes.
 * Emails are stored already lower-cased and trimmed (see `lib/sanitize.ts`), so the
 * unique index is a reliable "one account per address" guarantee.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 120 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull().default('sales_rep'),
    team: varchar('team', { length: 120 }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_key').on(table.email)],
);

/**
 * Customers. `seq` is a database-assigned identity; the public `CUST-0001` code is
 * derived from it (see `lib/customer-code.ts`) rather than stored, so two concurrent
 * signups can never be handed the same code.
 */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seq: integer('seq').generatedByDefaultAsIdentity().notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    contactName: varchar('contact_name', { length: 120 }),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    tier: tierEnum('tier').notNull().default('bronze'),
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('customers_email_key').on(table.email),
    uniqueIndex('customers_seq_key').on(table.seq),
  ],
);

/**
 * Refresh tokens live here rather than in Redis: they must survive a cache flush,
 * and revoking one has to be durable. Only the SHA-256 hash is stored, so a database
 * leak does not hand out working sessions.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    subjectId: uuid('subject_id').notNull(),
    subjectKind: subjectKindEnum('subject_kind').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: varchar('user_agent', { length: 255 }),
    ip: varchar('ip', { length: 45 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('refresh_tokens_hash_key').on(table.tokenHash),
    index('refresh_tokens_subject_idx').on(table.subjectId, table.subjectKind),
    // Lets the cleanup job find dead rows without a full scan.
    index('refresh_tokens_expires_idx').on(table.expiresAt),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  refreshTokens: many(refreshTokens),
}));

/** `true` when the row has completed OTP verification and may sign in. */
export const isVerified = sql<boolean>`email_verified_at is not null`;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type Tier = (typeof tierEnum.enumValues)[number];
export type SubjectKind = (typeof subjectKindEnum.enumValues)[number];
