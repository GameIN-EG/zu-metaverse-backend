# ZU Metaverse Backend

Lightweight NestJS backend for the ZU metaverse platform. The only feature
currently implemented is **SAML SSO** against Zayed University ADFS, backed by
PostgreSQL via Drizzle ORM.

## Stack

- [NestJS 11](https://nestjs.com/) (Express)
- [Drizzle ORM](https://orm.drizzle.team/) + `pg` (PostgreSQL)
- [`@node-saml/node-saml`](https://github.com/node-saml/node-saml) for SAML
- JWT access tokens (`@nestjs/jwt`)

## Getting started

```bash
pnpm install
cp .env.example .env   # then fill in values
pnpm db:generate       # generate migration SQL from src/db/schema.ts (already committed)
pnpm start:dev
```

Migrations are applied automatically on boot (see `src/db/migrate.ts`). Set
`RUN_MIGRATIONS_ON_BOOT="false"` to disable and run `pnpm db:migrate` manually.

## Database

Drizzle is configured in `drizzle.config.ts` (dialect `postgresql`, schema at
`src/db/schema.ts`, migrations in `./drizzle`). The connection pool is provided
by `DrizzleModule` (`src/db/drizzle.module.ts`) using `DATABASE_URL`.

Tables: `users`, `external_identities`, `saml_exchange_codes`, `idp_metadata_cache`.

| Script             | Purpose                                  |
| ------------------ | ---------------------------------------- |
| `pnpm db:generate` | Generate SQL migrations from the schema  |
| `pnpm db:migrate`  | Apply migrations                         |
| `pnpm db:push`     | Push schema directly (dev only)          |
| `pnpm db:studio`   | Open Drizzle Studio                      |

## SAML SSO flow

All routes are served under `/api/V1` (global prefix `api` + URI versioning).

| Method | Route                       | Purpose                                                        |
| ------ | --------------------------- | -------------------------------------------------------------- |
| `GET`  | `/api/V1/auth/saml/login`   | SP-initiated login — redirects to the IdP (optional)           |
| `POST` | `/api/V1/auth/saml/acs`     | Assertion Consumer Service — IdP posts the SAML assertion here |
| `POST` | `/api/V1/auth/saml/exchange`| Exchange the one-time code for a JWT access token              |
| `GET`  | `/api/V1/auth/saml/metadata`| SP metadata XML for relying-party registration                 |

Flow:

1. User hits the IdP (directly or via `/login`).
2. IdP posts the signed assertion to `/acs`.
3. Backend validates the assertion, extracts claims, find-or-creates the user,
   links the external identity, and mints a short-lived one-time code.
4. Backend redirects to `SAML_SUCCESS_REDIRECT_URL?code=...` (the frontend
   `/sso/callback` page).
5. Frontend `POST`s the code to `/exchange` and receives the access token + user.

The access token never travels in the redirect URL — only the single-use,
60-second exchange code does.

## Configuration

See [`.env.example`](./.env.example) for the full list. Key values for the IdP
team are the **metadata URL** and **ACS URL**, which are derived from
`PUBLIC_BASE_URL` unless `SAML_SP_ENTITY_ID` / `SAML_SP_ACS_URL` are set
explicitly.

## Deployment (Railway)

The app reads `PORT` and `DATABASE_URL` from the environment, runs migrations on
boot, and starts with `pnpm start:prod` (`node dist/main`). Set `PUBLIC_BASE_URL`
to the Railway public domain so the SAML SP URLs resolve correctly.
