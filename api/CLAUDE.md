# api — ingests the Claude Code session logs into PGlite and serves the workspace and session recap

```component
kind: api
stack: react-express
layers: [db, services, routes]
commands:
  build: npm run build
  test: npx vitest run
  lint: npx eslint {files}
  handoff: npx tsx scripts/export-openapi.ts openapi.json
  serve: npm run dev
serve_url: http://localhost:3100
```

All commands run from this component's path. The `test` command runs every test, route tests included: they use an in-memory PGlite database and touch no external system. Narrow it while iterating with `npx vitest run {file or folder}` or `-t "{test name}"`.

## Structure

One folder per feature, the same files in every feature:

```
src/
  app.ts                    createApp({ db, clock }): the Express app, no listen (tests use it)
  server.ts                 reads the configuration, binds the port, then opens and migrates the database and attaches the app
  config.ts                 environment variables (zod) and the `--web-dir` flag (`parseArgs`), read once at start-up
  db/
    schema.ts               re-exports every feature's tables (the Drizzle schema entry point)
    client.ts               opens the database: PGlite locally and in tests, node-postgres in deployment
  features/{feature}/
    {feature}.schema.ts     zod contracts of the routes (params, query, body, responses), registered for OpenAPI
    {feature}.table.ts      Drizzle tables and relations of the feature
    {feature}.repository.ts the only place that queries the feature's tables
    {feature}.service.ts    business rules: takes plain inputs, returns plain outputs, throws AppErrors
    {feature}.routes.ts     the Express router: guard, validation, call to the service, response
  shared/
    errors.ts               AppError and its subclasses, the problem-details middleware
    validate.ts             the zod validation middleware
    clock.ts                the Clock interface and its system implementation
    openapi.ts              the OpenAPI registry and document builder
    web.ts                  serves the built front and its SPA fallback when the API is started with `--web-dir`
drizzle/                    generated migrations (SQL + meta), never edited by hand
scripts/export-openapi.ts   imports the features' schema modules and the registry, writes the OpenAPI document; no database, no listen
test/
  setup.ts                  in-memory PGlite, migrations, createApp, test clock
  {feature}/                one test file per router (route tests) and per service when its rules need it
```

The layers are the plan's sections, in this order: `db` (tables, migration), `services` (repository and service, with their tests), `routes` (contracts, router, route tests).

## Package scripts

| Script | Does |
|---|---|
| `build` | `tsc -p tsconfig.build.json`: type-checks and emits `dist/` |
| `dev` | `tsx watch src/server.ts` |
| `start` | `node dist/server.js`; with `--web-dir {folder}` it also serves the built front (the root's `npm start` passes `../web/dist`) |
| `db:generate` | `drizzle-kit generate` |
| `db:migrate` | `drizzle-kit migrate`, a second process on the PGlite folder: only with the API stopped; the API applies the migrations itself at start-up |

## Conventions

- **TypeScript strict**, ES modules, no `any` (use `unknown` and narrow); no default exports.
- **Contracts first:** every route's params, query, body and response have a zod schema in `{feature}.schema.ts`; the TypeScript types come from `z.infer`, never declared a second time. Every schema is registered in the OpenAPI registry with the route, so the handoff document is complete. A schema the front reads by name (an entity, `ProblemDetails`) becomes an OpenAPI component with `.meta({ id: "Order" })`: `src/shared/openapi.ts` does not call `extendZodWithOpenApi`, so `.openapi(...)` and `registry.register(...)` fail at start-up.
- **Routes are thin:** guard, `validate(...)`, one service call, the status code and the response. No query, no business rule in a router.
- **Services** take the repository and the `Clock` as parameters (`createOrderService({ orders, clock })`); no import of the database client in a service. Time always through `clock.now()`, never `new Date()` or `Date.now()` in services or repositories.
- **Errors:** a service throws a typed `AppError` (`NotFoundError`, `ForbiddenError`, `ConflictError`, `BusinessRuleError` with a stable `code`); the error middleware turns it into a problem details response (`application/problem+json`, RFC 9457). Validation failures are `400` (a body that is not valid JSON too), missing entities `404`, scope violations `403`. Never `throw new Error(...)` for an expected case. Express 5 forwards rejected promises to the middleware: no `try`/`catch` in routers.
- **Authorization:** every router declares its guard, or says explicitly that it is public (an application without sign-in says so once, in `app.ts`). Data access filters by the caller's scope (tenant, owner) inside the service or repository, never in the router.
- **Persistence:** Drizzle query builder or relational queries, no raw SQL except a documented case (`sql` template, parameterised); select only the columns a response needs; no N+1 (a join or one `inArray` query). Writes that span several tables run in `db.transaction(...)`.
- **Naming:** camelCase in TypeScript, snake_case in the database (Drizzle `casing: "snake_case"`); booleans with the `is`/`has`/`can` prefix; identifiers in English.
- Comments explain why, never what.

## Database

| Item | Value |
|---|---|
| Engine | PostgreSQL: PGlite locally and in tests, a PostgreSQL server in deployment |
| Schema entry point | `src/db/schema.ts` |
| Drizzle config | `drizzle.config.ts` (`dialect: "postgresql"`, `driver: "pglite"` locally) |
| Migrations folder | `drizzle/` |
| Local database | `.data/pglite` (git-ignored) |
| Connection in deployment | `DATABASE_URL` |
| Migration naming | `--name {snake_case_description}`; Drizzle prefixes the sequence number |

The `drizzle-migrations` skill reads this table.

## Testing

- **Vitest** for everything. Services with business rules get unit tests with an in-memory repository fake or the test database; routes get Supertest tests against `createApp` on an in-memory PGlite (see the table below). Names read as sentences: `it("returns 404 when the order does not exist")`; `// Arrange` / `// Act` / `// Assert` sections.
- Test data comes from the factories of `test/factories.ts` (`buildOrder(overrides)`), inserted through the repository or the seed helpers; never a hand-built row a factory can produce.
- The test clock is fixed (`testClock.set(...)`); a test never depends on the real time.

## API tests

| Item | Value |
|---|---|
| Setup | `test/setup.ts`: `createTestContext()` returns `{ app, db, clock, seed, reset }` on an in-memory PGlite with the migrations applied; one context per file (`beforeAll`), `reset()` truncates every table in `beforeEach` |
| HTTP client | Supertest: `request(app).post("/v1/orders").send(body)` |
| Authenticated calls | none: the API has no accounts, every route is public |
| Factories | `test/factories.ts`, `build{Entity}(overrides)` |
| Database assertion | read back through `db` (Drizzle) after every write |
| Problem details type | `ProblemDetails` from `src/shared/errors.ts` |
| Reference tests | `test/health/health.routes.test.ts` (the skeleton's health route test) until the project has richer ones |

The `write-api-tests` skill reads this table.

## Local run

- Prerequisites: Node 22, `npm ci`. Nothing else: the database is PGlite, created in `.data/pglite` on first start.
- Run: `npm run dev` → http://localhost:3100. The API applies the pending migrations at start-up (restart it after a new migration); `test-in-browser` runs `serve` only when the API does not answer, so PGlite's folder is free.
- The port is bound before PGlite is opened, so a second instance on the same port (`npm start` at the root, or `npm run dev`) exits before touching the database. An instance on another `PORT` with the same `PGLITE_DIR` is not guarded.
- PGlite allows one process per data folder: stop the API before `npm run db:migrate` or `drizzle-kit studio`, and say so in the report.
- Reset the local database: stop the API, delete `.data/pglite`, start it again.
- Source data: the Claude Code session logs, read only, from `~/.claude/projects` (one folder per workspace, one `{session id}.jsonl` per session); `CLAUDE_PROJECTS_DIR` points elsewhere (tests, another machine). The live state of the running sessions is read the same way, from `~/.claude/sessions` (one `{pid}.json` per running process; the `*.key` files beside them hold credentials and are never opened); `CLAUDE_SESSIONS_DIR` points elsewhere. The refresh also reads those status files (`*.json` only), solely for `hostSessionId`: the desktop app's `local_<uuid>` of a session, behind the desktop link `claude://claude.ai/epitaxy/{id}`, which appears in no session log. The log retention (`cleanupPeriodDays`, nothing else) is read from Claude Code's user settings, `~/.claude/settings.json`; `CLAUDE_SETTINGS_FILE` points elsewhere. The API never writes in any of these three places.
