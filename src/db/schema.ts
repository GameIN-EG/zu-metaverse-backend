import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Minimal user record. Users are provisioned on first successful SAML login.
 * Password-based auth is intentionally omitted — this backend only supports SSO.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email'),
    name: text('name'),
    isEmailVerified: boolean('is_email_verified').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('users_email_uq').on(table.email)],
);

/**
 * Links an external identity provider account (e.g. ZU ADFS via SAML) to a local user.
 * `provider` + `externalId` together uniquely identify a federated identity.
 */
export const externalIdentities = pgTable(
  'external_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull(),
    externalId: text('external_id').notNull(),
    nameId: text('name_id'),
    upn: text('upn'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('external_identities_provider_external_id_uq').on(table.provider, table.externalId),
    index('external_identities_user_id_idx').on(table.userId),
  ],
);

/**
 * One-time codes issued after a successful SAML assertion. The frontend exchanges
 * the code for an access token, so the token never travels in the redirect URL.
 */
export const samlExchangeCodes = pgTable(
  'saml_exchange_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    codeHash: text('code_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    relayState: text('relay_state'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('saml_exchange_codes_code_hash_uq').on(table.codeHash),
    index('saml_exchange_codes_expires_at_idx').on(table.expiresAt),
  ],
);

/**
 * Cached IdP federation metadata (signing certificates). Refreshed on boot and daily,
 * persisted so the service can start even if the IdP metadata endpoint is temporarily down.
 */
export const idpMetadataCache = pgTable('idp_metadata_cache', {
  id: text('id').primaryKey(),
  entityId: text('entity_id').notNull(),
  signingCerts: jsonb('signing_certs').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type ExternalIdentity = typeof externalIdentities.$inferSelect;
export type SamlExchangeCode = typeof samlExchangeCodes.$inferSelect;
export type IdpMetadataCache = typeof idpMetadataCache.$inferSelect;
