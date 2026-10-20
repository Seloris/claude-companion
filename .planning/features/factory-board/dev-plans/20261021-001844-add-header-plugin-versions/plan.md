# Factory boards: the plugin versions in the header

Feature: `factory-board` · Components: `api`, `web` · Spec: FR-38, FR-39, FR-40, FR-41, BR-07

## Context

The spec commit `5b43a8f` adds FR-38 to FR-41 and BR-07: the application's header shows, at its top right on every page, the installed versions of the factory plugin and of the factory-board mod (`factory 0.8.0 · factory-board 0.11.0`). The version shown is the most recently installed or updated install across every project and scope (FR-39); a plugin with no install, or a plugins file missing or unreadable, reads `non installé` (FR-40); a new install shows at the latest at the next page load (FR-41). The plugins file is read only (BR-07).

Today the api already reads `~/.claude/plugins/installed_plugins.json` (`readInstalledPlugins` in `api/src/features/factory/factory.source.ts`), but only inside `GET /v1/factory`, only when a board exists, and per board root (`versionFor`: the project's install first, else the user scope). The header belongs to no project and must show even without a board, so this iteration adds a dedicated route, `GET /v1/factory/plugins`, that reads the file at every call and picks the latest install of each plugin. The web's `AppLayout` reads it once per page load and passes the text to `NavBar`, which draws it at the top right.

The board's own per-project plugin line (`FactoryBoardView`, `board.plugins`) stays as it is.

## Decisions

- **A separate route** `GET /v1/factory/plugins` rather than a field of `GET /v1/factory` → the header shows on every page without a board, and the layout does not poll the boards (the factory query polls every second, only on the pages that show boards).
- **The response reuses the `FactoryPluginVersions` component** (`{ factory: string | null, factoryBoard: string | null }`) → one shape for both meanings; its comment is rewritten to say which rule each use follows.
- **Recency** → an install's `lastUpdated`, else its `installedAt` (FR-39 says "installed or updated"); the parse of `installedAt` is added to `readInstalledPlugins`. The board's `versionFor` keeps its own rule and keeps ordering by `lastUpdated` only (the spec keeps the board line as it is).
- **No cache** → the route reads the file at each call (FR-41); the web does not poll.

## Decisions taken autonomously

- Run the grill on the plan? → yes, autonomous. Every question below took its recommended answer, and none had no recommendation.
- Branch → stay on `feat/factory-board-header-versions`, which holds the spec commit `5b43a8f` (not the base branch; the instruction for this run).
- Feature slug → `factory-board`, existing. The spec is `Approved` and already carries FR-38 to FR-41 and BR-07: no spec delta, no status change.
- Plan type and name → `add-header-plugin-versions` (`add` → `feat` stage commits).
- Stages → `api` then `web`, the manifest's order. A review after every stage → yes (the autonomous default).
- Where does the header get the versions: the existing `GET /v1/factory` or a new route? → A new route, `GET /v1/factory/plugins` (the header shows without a board; the layout must not poll the boards).
- Which install wins across projects and scopes (FR-39)? → The one with the latest `lastUpdated`, else `installedAt`, every scope and project together; on a tie, the first in the file (a deterministic order; ties do not happen in practice, Claude Code stamps each install to the millisecond).
- How is a plugin matched? → By the name before the `@` of its key, the same as the board (`readInstalledPlugins`); no marketplace filter (the real file holds `factory@webapp-factory` and `factory-board@webapp-factory`, no homonym).
- The `installedAt` fallback on the board's `versionFor`? → Not applied (the board line stays as it is; a missing `lastUpdated` does not happen in practice).
- Cache the plugins read? → No (the file is a few kB, read once per page load; FR-41).
- How fresh in the web? → One query per page load, no `refetchInterval`; TanStack's defaults (refetch on mount and on window focus) stay. A full page load creates a new query client, so FR-41 holds.
- What does the header show while the request loads, or when the api call fails? → Nothing (no placeholder, no error in the header): FR-40's `non installé` is for a missing plugin or file, which the api serves as `null`; a failed api call is no information about the plugins.
- How does the header draw it? → A new optional string prop `note` on `shared/ui/NavBar`, drawn after the links, pushed to the right (`margin-left: auto`), muted, smaller; no feature word in the component (the `shared/ui` rule).
- Text → `factory {factory} · factory-board {factoryBoard}`, each version replaced by `non installé` when null; new keys `layout.plugins.versions` and `layout.plugins.missing` (the board's `factory.board.*` keys stay with the board).
- On a narrow screen? → The bar already wraps (`flex-wrap`); the note wraps to its own line, aligned right, its text kept on one line (`white-space: nowrap`); no horizontal scroll at 375 px.
- Is the note a link? → No (spec decision).
- Demo dataset → unchanged: the demo writes no `installed_plugins.json`, so the demo header reads `non installé` twice, which checks FR-40; the real versions are checked against the real api (the file read only).
- Api unit tests on a service function? → No: route tests cover every rule (the `api/CLAUDE.md` way for this feature).
- Implementation, stage 1: `test/setup.ts`, not listed by the plan → its factory wrapper forwards `getPluginVersions` (the test context wraps the service; the new route answered 500 without it).
- Implementation, stage 1: the review's note on a missing tie test (same recency, the first in the file wins) → not added (the plan's Tests do not ask for it; ties do not happen in practice).
- Implementation, stage 2: the final review's nit that a failed background refetch hides versions already loaded (`AppLayout`) → kept as planned (the plan's decision: nothing in the header when the api call fails; a failed call is no information about the plugins).
- Implementation, stage 2: the final review's note on the missing tie test (api) → not added, as decided in stage 1.

## api

### services

`src/features/factory/factory.source.ts`:

- `pluginInstallSchema` gains `installedAt: z.string().optional()`.
- `PluginInstall` gains `installedAt: string` (`""` when absent), filled in `readInstalledPlugins` like `lastUpdated`.
- No other change: the file is still read with `readFile` only (BR-07).

`src/features/factory/factory.service.ts`:

- New exported pure function `latestPluginVersions(plugins: PluginInstall[]): FactoryPluginVersions`: for `factory` and `factory-board`, among every install of that name (any scope, any project), the version of the install whose recency (`lastUpdated || installedAt`) is the greatest (ISO strings, compared as strings, the way `versionFor` does); a strict `>` keeps the first on a tie; `null` when the plugin has no install. Comment: `// FR-39: the header belongs to no project: the latest install or update of each plugin, every scope together.`
- New service method `getPluginVersions(): Promise<FactoryPluginVersions>`: `latestPluginVersions(await readInstalledPlugins(pluginsFile))`. No cache, no dependency on the boards (FR-41). A missing or invalid file gives `[]` from `readInstalledPlugins`, hence both `null` (FR-40).
- Returned from `createFactoryService` beside `getFactoryState`; `FactoryService` (the inferred type) carries it.
- `versionFor` and `pluginVersionsFor` unchanged.

### routes

`src/features/factory/factory.schema.ts`:

- `factoryPluginVersionsSchema`'s comment becomes: `// The factory and factory-board versions Claude Code installed; null when none is installed or the plugins file cannot be read. On a board: the install of its project (project or local scope first, else the user scope). From /v1/factory/plugins: the latest install or update, every scope together (FR-39).`
- Register the path:
  - `method: "get"`, `path: "/v1/factory/plugins"`, `summary: "The factory and factory-board versions installed, for the header"`;
  - `200`: `description: "The installed plugin versions"`, `application/json`, schema `factoryPluginVersionsSchema` (the `FactoryPluginVersions` component).

`src/features/factory/factory.routes.ts`:

- `router.get("/v1/factory/plugins", async (_req, res) => { res.json(await factory.getPluginVersions()); });`, declared before nothing else that could shadow it (`/v1/factory` is an exact path, no conflict). Public, like every route (`app.ts` says so).

Handoff: `npx tsx scripts/export-openapi.ts openapi.json`; `api/openapi.json` gains the path, `FactoryPluginVersions` keeps its shape (its description changes if the generator emits comments; it emits none today).

## web

### data

- Prepare: `src/api/schema.d.ts` regenerated from `api/openapi.json`; it gains `/v1/factory/plugins`.
- `src/features/factory/data/factoryKeys.ts`: `plugins: () => [...factoryKeys.all, "plugins"] as const`.
- New `src/features/factory/data/usePluginVersionsQuery.ts`: `useQuery({ queryKey: factoryKeys.plugins(), queryFn: async () => unwrap(await api.GET("/v1/factory/plugins")) })`, no `refetchInterval`. Comment: `// FR-41: read once per page load (and on the query defaults' refetches); the versions change rarely, nothing polls them.`
- `src/features/factory/data/factoryTypes.ts`: unchanged (the layout reads the query's inferred type; no alias needed).

### pages

`src/AppLayout.tsx` (the root layout route, outside `features/`; the layer `pages` by role):

- `const pluginsQuery = usePluginVersionsQuery();`
- `const pluginsNote = pluginsQuery.data === undefined || pluginsQuery.isError ? undefined : t("layout.plugins.versions", { factory: pluginsQuery.data.factory ?? t("layout.plugins.missing"), factoryBoard: pluginsQuery.data.factoryBoard ?? t("layout.plugins.missing") });` with the comment `// FR-38, FR-40: the installed versions at the top right of every page; nothing while loading or when the api call fails.`
- Pass `note={pluginsNote}` to `NavBar`.
- Header comment: `// The shared navigation around every page (FR-14), with the installed plugin versions (factory-board FR-38).`

### ui

`src/shared/ui/NavBar.tsx`:

- New optional prop `note?: string`; comment beside `brand`'s: `// \`note\`: a short text drawn after the links, at the right end of the bar (muted), e.g. versions.`
- Rendered after the `<ul>`, inside `.bar`: `{note !== undefined && <p className={styles.note}>{note}</p>}`.

`src/shared/ui/NavBar.module.css`:

- `.note`: `margin: 0 0 0 auto; padding: 6px 0; color: var(--text-muted); font-size: 0.86em; white-space: nowrap;` (the skin has no small-text token; the shared components size small text in `em`, as `Button.module.css` does). With `flex-wrap`, it wraps to its own line on a narrow screen and stays right-aligned.

`src/shared/lib/i18n/fr.json`:

- `"layout.plugins.versions": "factory {factory} · factory-board {factoryBoard}"`
- `"layout.plugins.missing": "non installé"`

## Conventions

- `web/CLAUDE.md`, Structure: the `AppLayout.tsx` line → `the root layout route: the shared navigation (NavBar, with the live counts and the installed plugin versions) around every page`; in the `shared/ui` list, `NavBar (the navigation: the application's name as \`brand\`, links as props, counts as \`badges\`)` → `NavBar (the navigation: the application's name as \`brand\`, links as props, counts as \`badges\`, a right-hand text as \`note\`)`. Rationale: the layout and the component gain a role.
- `api/CLAUDE.md`, Local run, Source data: after "read from `~/.claude/plugins/installed_plugins.json` and nothing else of that folder", add "; `GET /v1/factory/plugins` reads the same file for the header, the latest install of each across every scope". Rationale: a second reader of the file.
- Root `CLAUDE.md`: unchanged (its hard rule already names the plugins file, for these two versions only).

## Tests

### api

Route tests in `test/factory/factory.routes.test.ts`, a new `describe("GET /v1/factory/plugins")` reusing the `install` and `writePlugins` helpers of `describe("the plugin versions")` (move them to the file's scope if needed), no board written:

- `it("serves the latest install of each plugin across projects and scopes")`: `factory` installed in project A (`0.7.0`, older), project B (`0.8.0`, latest) and the user scope (`0.6.0`, oldest) → `factory: "0.8.0"`; `factory-board` user-scope only → its version. Status `200`.
- `it("orders an install without lastUpdated by its installedAt")`: two `factory` installs, the one without `lastUpdated` with the latest `installedAt` → its version.
- `it("serves null for a plugin with no install and ignores the other plugins")`: only `other@market` and `factory@webapp-factory` → `{ factory: "…", factoryBoard: null }`.
- `it("serves null for both when the plugins file is missing or invalid")`: no file, then `"{ not json"` → `{ factory: null, factoryBoard: null }` both times, status `200`.
- `it("serves a new version as soon as the file changes")`: one request, the file rewritten with a newer install, a second request → the new version (no cache, FR-41).
- `it("serves the versions without any factory board")`: covered by the tests above (none writes a board); no separate test.

The existing `describe("the plugin versions")` tests of the board stay green, unchanged.

### web

None: `web/CLAUDE.md` has no unit tests on the front. The browser test of Validation checks the stage.

## Progress

### Stage 1 — api
Commit: `feat(factory-board): api — the installed plugin versions for the header`
- [x] services: `installedAt` parsed in `readInstalledPlugins`; `latestPluginVersions` and `getPluginVersions` in the factory service
- [x] routes: `GET /v1/factory/plugins` registered (schema comment rewritten) and routed; route tests
- [x] Conventions: `api/CLAUDE.md` Source data line
- [x] Handoff: `api/openapi.json` exported

### Stage 2 — web
Commit: `feat(factory-board): web — the plugin versions at the top right of the header`
- [x] Prepare: client regenerated from `api/openapi.json`
- [x] data: `factoryKeys.plugins`, `usePluginVersionsQuery`
- [x] pages: `AppLayout` passes the versions text to `NavBar`
- [x] ui: `NavBar` `note` prop and `.note` style; `layout.plugins.*` keys
- [x] Conventions: `web/CLAUDE.md` `AppLayout` and `NavBar` lines

## Validation

- [x] Review: the `reviewer` agent on the plan's implementation, its findings settled
- [x] Tests: the full `test` command of `api` green on the plan's final code
- [-] Browser test: not run: autopilot without browser test. The change tested in `web` (`test-in-browser` skill). Scenarios:
  - against the real api (the plugins file read only, never written): every page (workspaces, a workspace, dashboard, live, factory, a session) shows `factory {version} · factory-board {version}` at the top right of the header, after the links, the versions those of the latest installs in `~/.claude/plugins/installed_plugins.json`;
  - against the demo (api `npm run demo`, web `npm run dev:demo`, no plugins file): the header reads `factory non installé · factory-board non installé`, no error;
  - at 375 px: the note wraps to its own line, right-aligned, readable, no horizontal scroll; the live page's wide bar keeps it at its right end;
  - both colour schemes readable.
