# Current Feature

## Status

Not Started

## Goals

<!-- Bullet points of what success looks like. Populated by /feature load. -->

## Notes

<!-- Additional context, constraints, or details from the spec. -->

## History

### Prisma 7 + Neon PostgreSQL Setup — completed 2026-08-28

Phase 1 database foundation. Prisma 7.10.0 (pinned exact) wired to Neon Postgres, the full domain schema, and a hot-reload-safe client singleton. Merged to `main` as `ba3b6bd`.

**Delivered**

- `prisma/schema.prisma` — `User`, `Subscription`, `UsagePeriod`, `Apiary`, `Hive`, `Inspection`, `PdfGenerationJob`, `AiReport`, plus Auth.js `Account` / `Session` / `VerificationToken`; five enums; cascade deletes down the user → apiary → hive → inspection → pdf job chain; `@@index([hiveId, inspectedAt])` and friends.
- `prisma.config.ts` — v7 config, loads `.env.local` explicitly so the CLI and Next.js share one env file; prefers `DIRECT_DATABASE_URL` for migrations when set.
- `app/lib/prisma.ts` — `PrismaClient` through the `@prisma/adapter-pg` driver adapter behind a dev-safe global singleton.
- Migration `20260828141044_init` applied to the Neon **development** branch (`br-old-bonus-b1yjip8c`). Production branch untouched.
- Scripts: `db:migrate`, `db:deploy`, `db:studio`, and `postinstall` → `prisma generate`.

**Decisions worth remembering**

- **It's Prisma 7, not 8.** The spec was titled "Prisma 8" but every requirement in it described Prisma 7 — and `@prisma/client` has no 8.x release at all (the `8.0.0-rc` exists only for the CLI package). Prisma 8 is a rewritten ORM: no `PrismaClient`, no driver adapters, contract-based schemas, TS graph migrations, and no published Neon or Vercel guidance. Prisma's own docs still call 7 the right choice for production.
- **`@prisma/adapter-pg`, not `adapter-neon`** — direct TCP against Neon's *pooled* endpoint. Neon's pooler does the real pooling, so each serverless instance keeps `max: 5`. Revisit only if edge runtime is needed.
- **`connectionTimeoutMillis: 10_000` is explicit.** Driver adapters inherit node-postgres' default of `0` (never time out), unlike pre-v7 Prisma's 5s — a half-open socket would otherwise hang a request forever, the exact field-connectivity failure this phase exists to fix.
- **`sslmode=verify-full`, never `require`.** node-postgres treats them identically today, but pg v9 switches `require` to libpq semantics that skip certificate verification. Use `verify-full` in Vercel's production variable too.
- **`Hive.currentInspectionId` is `onDelete: SetNull`** — deleting an inspection must not delete the hive. Forms a two-table FK cycle with `Inspection.hive`, which Postgres permits.
- **Auth.js fields stay snake_case** (`refresh_token`, …) — `@auth/prisma-adapter` binds to those column names.
- **Client output is `generated/prisma` at the repo root**, not `src/generated/prisma`; this repo has no `src/`. Gitignored, rebuilt by `postinstall`.
- **`vitest.config.mts` aliases `@` to the project root.** Vite ignores tsconfig `paths`, so any suite importing the Prisma singleton failed to resolve the generated client.

**Verified:** full `User → Apiary → Hive → Inspection → PdfGenerationJob` round trip against the live dev branch (JSON section columns, derived scalars, the denormalized pointer, the indexed history query, and cascade deletes), plus TLS certificate validation via `socket.authorized`. `tsc --noEmit`, `eslint`, `vitest run` (189 tests) and `next build` all green.

**Left open:** `DATABASE_URL` for the Neon **production** branch still needs adding to the Vercel project settings before the first deploy.

**Follow-ups noted, not done:** `context/coding-standards.md` still carries a stale Sanity/monorepo section and assumes a `src/` directory this repo doesn't have.

### Demo User Seed Script — completed 2026-08-28

Idempotent `prisma db seed` that stands up a full demo account. Merged to `main` as `2f7f687` (feature commit `5e8db37`).

**Delivered**

- `prisma/seed.ts` — `demo@getapiary.app` / Jan Pszczelarz (bcrypt of `demo1234`, 10 rounds), `PREMIUM` + `active` subscription with all Stripe fields null, current-month `UsagePeriod` (3 PDFs / 1 AI report), `Pasieka Turawa` apiary, and five `WIELKOPOLSKI` hives `Ul 1`–`Ul 5`. All five steps in one interactive transaction, each logging a `[seed] …` line.
- `prisma.config.ts` — `migrations.seed: 'tsx prisma/seed.ts'`.
- `package.json` — `db:seed` script; `bcryptjs@3.0.3` and `tsx@4.23.12` added as devDependencies.

**Decisions worth remembering**

- **`migrations.seed` in `prisma.config.ts`, not the `package.json` `"prisma"` key.** The v7 location; the old key is silently ignored.
- **No `@types/bcryptjs`.** `bcryptjs@3` ships its own declarations. The DefinitelyTyped package is stale v2 defs that shadow them — installed it, then removed it.
- **Interactive `$transaction(async (tx) => …)`, not the array form.** The array form dispatches every promise before any resolves, so ordered per-step logging is impossible with it. Timeouts raised to `{ maxWait: 10_000, timeout: 20_000 }` — the 2s/5s defaults are too tight for a cold Neon compute.
- **`process.exitCode = 1`, never `process.exit(1)` in the `.catch`.** `process.exit` terminates before `.finally` can run `$disconnect()`, leaking a connection on every failed seed. (The spec's own snippet had this bug.)
- **The seed builds its own `PrismaClient` on `PrismaPg` with `max: 1`** and imports `./generated/prisma/client` relatively. The app singleton in `app/lib/prisma.ts` isn't reusable from a CLI process, and since the schema declares no datasource `url`, an adapter is mandatory even outside Next.js.
- **Seed loads `.env.local` itself via dotenv.** `prisma db seed` inherits env from the CLI process, but `tsx prisma/seed.ts` run directly does not.
- **Existence check, not `upsert`** — a partial seed must never leave a user row without its related records.

**Verified** against the live Neon **development** branch (`br-old-bonus-b1yjip8c`): first run printed the spec's expected stdout (`periodStart` → `2026-08-01`), second run printed only the skip line; SQL confirmed 1/1/1/1/5 rows with no duplicates, correct enum and null-Stripe values, all `currentInspectionId` null, and 0 inspections / PDF jobs / AI reports; a throwaway probe confirmed `bcrypt.compare('demo1234')` → true, wrong password → false, and that a deliberate mid-transaction throw left zero rows. `tsc --noEmit`, `eslint`, `vitest run` (199 tests) and `next build` all green.

**Left open:** `periodStart` uses the spec's literal `now.getFullYear()` / `now.getMonth()` (local getters) inside `Date.UTC`. In UTC+2, seeding between 00:00 and 02:00 local on the 1st yields the new month while `now` is still the previous month in UTC. Harmless for a demo seed; switch to `getUTCFullYear`/`getUTCMonth` if this ever backs real usage-quota logic.

### Dashboard Spec 1 — Static Layout — completed 2026-08-28

Post-login dashboard shell at `/dashboard`, built mobile-first with the desktop mock restored at `lg`. All data hardcoded; Spec 2 swaps in the seeded apiary. Merged to `main` as `068497c` (feature commit `995afce`).

**Delivered**

- `app/(dashboard)/layout.tsx` — shell owning the sidebar rail + scrolling `<main>` at `lg`, and `<main>` + bottom tab bar below it. `<main>` is the only scroll container, so each page's topbar sticks to the content rather than the viewport.
- `app/(dashboard)/dashboard/page.tsx` — topbar, page header, 3 alerts, 8 hive cards, all constants.
- `app/components/dashboard/` — `Sidebar`, `MobileNav`, `Topbar`, `AlertCard`, `HiveCard`, `StrengthDots`, `icons.tsx`, plus `nav.ts` (one `NAV_ITEMS` list, two presentations) and `status.ts` (`HiveStatus` / `QueenStatus` / label maps — the contract Spec 2's seeded records must satisfy).
- `app/globals.css` — palette retuned to the reference; `--accent-hover`, `--border-2`, `--border-3` added with `@theme inline` entries.
- `app/layout.tsx` — `viewport` export with `viewportFit: 'cover'` and `themeColor`.

**Decisions worth remembering**

- **A new `@theme` key is not picked up by a running `next dev`.** Turbopack hot-swaps changed `:root` *values* fine, but the three new keys generated no utilities in an already-running server, so `border-border-2` silently fell back to `currentColor` — green avatar ring, muted button ring, dead `hover:` tints. `next build` and a fresh compile emit all of them. **If the hairlines ever look wrong, restart the dev server before debugging the CSS.**
- **Colored card edges are declared per side, never via a `border` shorthand + override.** `AlertCard` sets top/right/bottom explicitly and the accent left separately; `HiveCard` does the same with the accent on top. Hover lightens only the neutral sides, so it can't repaint the amber or red edge. A shorthand `hover:border-border-2` would have.
- **`h-dvh`, not `h-screen`, and the 640px `min-h` floor is `lg:`-only.** `100vh` counts the collapsing mobile URL bar; the floor pushed the tab bar off a 390px-tall landscape phone. Verified at 844×390 — shell exactly 390, tab bar on screen.
- **`viewportFit: 'cover'` is mandatory for the tab bar's `pb-[env(safe-area-inset-bottom)]`** — without it `env()` resolves to 0 and the bar sits under the iOS home indicator.
- **Touch targets sized for gloved, one-handed outdoor use:** "Przegląd" 48px, "Szczegóły" and topbar buttons 44px, tabs 56px. Card buttons stack below `lg`; side by side inside a half-width card left each ~66px wide.
- **Spec vs. template, resolved deliberately:** template wins on look (palette, nav icons, `Dashboard` as the first nav item — the spec's `/apiary` list left nothing active on `/dashboard`); spec wins on its explicit callouts (`Hivewise` wordmark, green `Premium` badge). Components live in `app/components/dashboard/`, not the spec's root `components/`, per repo convention.
- **Empty `StrengthDots` border uses `--subtle`** (template) rather than the spec's `--surface-3`; after the retune those are no longer the same value and `--subtle` stays legible.
- **Tailwind canonical spacing steps over arbitrary px** (`gap-2.25`, not `gap-[9px]`) — the project's IntelliSense flags the arbitrary forms. Same output.
- **The badge was left inline in `AlertCard`** rather than extracted as the `Badge` component the spec's markup implies: seven classes used once.

**Verified** on the production build at 320 / 390 / 768 / 844×390 / 1440: no horizontal scroll and no element past the viewport at any width; sidebar exactly 192px and pinned through a scroll; `<main>` the only scroll container; topbar `sticky`/`z-10`; grids 4/3 at `lg`, 2/1 on phones; every border read side-by-side (hive 4 = `2px red / 0.06 / 0.06 / 0.06`, lifting to `0.1` on hover with the red intact); every touch target measured. `tsc --noEmit`, `eslint`, `prettier`, `vitest run` (199 tests) and `next build` all green; `/dashboard` prerenders static.

**Left open:** `prefetch={false}` on the nav links is a TODO — the router was prefetching `/analytics` and `/settings`, which don't exist yet, as two console 404s per load. Drop it when those routes land. The sidebar footer (avatar / name / plan) has no mobile equivalent; `Ustawienia` covers it for now. Hive grid is 2-up on phones — trades card width for fewer scrolls; a one-line change if 1-up is preferred.

### Auth Phase 1 — NextAuth v5 + Google OAuth — completed 2026-08-28

Auth.js v5 with the Prisma adapter, JWT sessions, and Google OAuth protecting `/dashboard/*`. Provider switched from the spec's GitHub to Google by user decision. Merged to `main` as `a497ad9` (feature commit `f8379db`).

**Delivered**

- `auth.config.ts` — provider list + the `authorized` callback. `auth.ts` — same config plus `PrismaAdapter`, `session.strategy: 'jwt'`, and `jwt` / `session` callbacks that carry `user.id`.
- `proxy.ts` (repo root, level with `app/`) — `export const proxy = auth`, `matcher: ['/dashboard/:path*']`.
- `app/api/auth/[...nextauth]/route.ts`, `types/next-auth.d.ts`.
- Migration `20260828201002_auth_user_oauth_fields` — `passwordHash` → nullable, `emailVerified` and `image` added. Applied to the Neon **development** branch.
- `next-auth@5.0.0-beta.32` and `@auth/prisma-adapter@2.11.3`, both pinned exact per the Prisma convention.

**Decisions worth remembering**

- **`callbacks.authorized` is what protects routes — without it nothing is protected.** next-auth defaults `authorized` to `true`, so a bare `export const proxy = auth` attaches `req.auth` and lets every request through. `/dashboard` returned 200 until the callback existed. **And the export must stay bare:** in `next-auth/lib/index.js` the `userMiddlewareOrRoute` branch is checked *before* `!authorized`, so wrapping it as `auth(fn)` suppresses next-auth's built-in redirect to `/api/auth/signin?callbackUrl=…`.
- **Augment `@auth/core/jwt`, not `next-auth/jwt`.** Auth.js's docs say the latter, but on this version `next-auth/jwt` is a bare `export * from "@auth/core/jwt"` — augmenting a re-exporting module declares a second, unused `JWT` instead of merging, leaving `token.id` as `unknown` (which narrows to `{}` under a truthiness check).
- **`prisma migrate dev` applied the migration but did NOT regenerate the client**, while reporting success. The generated client kept `passwordHash` required and had no `emailVerified` / `image` at all, so `PrismaAdapter.createUser` failed with `Argument 'passwordHash' is missing` — a Prisma-client validation error that never reached Postgres. **No gate could catch this:** `tsc`, `eslint` and `next build` all passed, because no app code references those fields and `PrismaAdapter(prisma)` is loosely typed. Only a real sign-in surfaced it. Fix: explicit `npx prisma generate` plus `rm -rf .next/dev` so Turbopack drops the bundled stale client. **Run `prisma generate` explicitly after any schema change.**
- **The split config is right, but not for the documented reason.** Next 16 runs Proxy on the Node.js runtime (`runtime` config throws), and Auth.js now scopes the edge problem to "versions prior to 16". Prisma in `proxy.ts` would work. The split stays because Proxy runs ahead of every matched request and the Next docs say to read the cookie, not the database.
- **`...authConfig.callbacks` must be spread inside `auth.ts`'s `callbacks`** — a bare `callbacks: {…}` after `...authConfig` replaces the object wholesale and silently drops `authorized`.
- **No `access_type: 'offline'` / `prompt: 'consent'`.** Refresh tokens exist for calling Google APIs on the user's behalf, which this app never does, and `prompt: 'consent'` would force the consent screen on every sign-in. `Account.refresh_token` stays null by design.
- **`allowDangerousEmailAccountLinking: true`** — safe specifically because Google verifies every email it returns. Currently dormant (no Google account matches `demo@getapiary.app`); it exists so Phase 2 credentials users can also sign in with Google.
- **Google removes the need to make `User.email` nullable.** Auth.js's canonical `User.email` is optional; this repo's is `String @unique`. That would have been a live failure with GitHub, where users can hide their address.
- **Provider takes no arguments** — Auth.js infers `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` from the `AUTH_<PROVIDER>_*` convention.
- **Spec paths were all `src/`-prefixed; this repo has no `src/`.** Everything moved to the root or `app/`. `proxy.ts` at the root is required by Next, not a preference.

**Verified** end to end against the Neon **development** branch: Google consent created `borderlandsmaniak@gmail.com` with `image` set and `passwordHash` null, linked one `google` / `oidc` `Account` with an `access_token` and no refresh token, wrote **zero** `Session` rows (confirming the JWT strategy), and left the seeded demo user and its apiary untouched. Signed out, `/dashboard` 307s to `/api/auth/signin?callbackUrl=…` while `/` and `/api/generate-pdf` stay public. The client ID and redirect URI were also validated directly against Google's authorize endpoint. `tsc --noEmit`, `eslint`, `prettier`, `vitest run` (199 tests) and `next build` all green.

**Left open:** a fresh Google user has no apiary, so once Dashboard Spec 2 lands they hit its `apiary === null` → `/onboarding` redirect, and that route does not exist. Accepted deliberately: only the demo user shows seeded data for now. Until Spec 2, `/dashboard` renders Spec 1's static mock for any signed-in user, so Phase 1's happy path is clean. `AUTH_SECRET` and the two Google values are in `.env.local` only; Vercel still needs them, plus a production redirect URI on the OAuth client. The consent screen is in **Testing** status — only listed test users can sign in. No sign-out UI yet (Phase 3). `emailVerified` stays null: the Prisma adapter only sets it for email-link flows, not OAuth.

### Auth Phase 2 — Credentials (Email/Password) Provider — completed 2026-08-28

Email/password sign-in alongside Google OAuth, the registration endpoint behind it, and a sidebar sign-out button. Merged to `main` as `dcf9c47` (feature commit `2a3f819`).

**Delivered**

- `app/lib/auth.schema.ts` — `signInSchema` / `registerSchema` with Polish messages, shared by the route handler and the `authorize` callback so both sides of the wire enforce one set of rules.
- `auth.config.ts` — Credentials placeholder (`authorize: () => null`); `googleProvider` exported so `auth.ts` reuses it by reference instead of redeclaring its options.
- `auth.ts` — the real `authorize`: Prisma lookup, `bcrypt.compare`, `null` on every failure path.
- `app/api/auth/register/route.ts` — `POST /api/auth/register`.
- `app/lib/auth-actions.ts` + `Sidebar` — `signOutAction` in a `<form>` at the sidebar footer, with a `SignOutIcon` added to `icons.tsx`. Added on user request mid-feature; Phase 3 folds it into the avatar dropdown.
- `package.json` — `bcryptjs` moved from devDependencies to dependencies.

**No migration.** `User.passwordHash` was already nullable from `20260828201002_auth_user_oauth_fields`, exactly as the load notes predicted.

**Decisions worth remembering**

- **A new `'use server'` module is not picked up by a running `next dev`.** The action goes unregistered on the server while the client renders and posts its `$ACTION_ID`, so sign-out died with `Cannot read properties of undefined (reading 'apply')` pointed at `<Sidebar />` — a null-looking error with nothing wrong in the code. A fresh server ran the same action in 10ms. **Restart the dev server after adding a server action.** Direct sibling of Spec 1's `@theme` lesson.
- **Never run two `next dev` processes on this project.** They share one `.next` directory and corrupt each other. Clearing `.next/dev` under a live server is what turned the staleness above into a hard failure.
- **Email is normalised *before* it is validated** — `z.string().trim().toLowerCase().pipe(z.email(…))`. Zod v4 runs the format check ahead of chained transforms, so `z.email().trim()` rejects a pasted address with a trailing space. The lowercasing is not cosmetic: `User.email` is `@unique` and Postgres compares case-sensitively, so without it `Jan@…` and `jan@…` are two rows and whoever capitalised at registration could never sign in.
- **`providers` is overwritten after `...authConfig`, deliberately** — the opposite of `callbacks`, where overwriting silently drops `authorized`. The placeholder in `auth.config.ts` can never sign anyone in, which is harmless because `config.matcher` never routes `/api/auth/*` through Proxy.
- **`authorize` returns `null`, never throws.** A throw surfaces as `CallbackRouteError` (a server fault); `null` gives one `CredentialsSignin` for every failure, so an unknown address, an OAuth-only account and a wrong password are indistinguishable. It also returns named fields rather than the row, so `passwordHash` cannot reach the JWT.
- **Registration 409s on a taken address instead of setting a password on the existing row.** Doing the latter would hand a Google user's account to anyone who knows their email. Linking only runs the other way, via `allowDangerousEmailAccountLinking` on a verified Google sign-in.
- **The 409 leaks account existence, accepted knowingly.** A register endpoint cannot both create the account and hide the collision, and a vague error strands someone who forgot they had signed up. Sign-in stays generic. `P2002` is caught for the race the existence check cannot close.
- **No auto-sign-in after registration** — Phase 3's spec says redirect to sign-in, and minting a session from a plain route handler would bypass Auth.js's own callbacks.
- **Zod, matching the eight existing `*.schema.ts` files**, with `z.flattenError` giving Phase 3's form field-keyed messages.
- **`/api/auth/register` resolves ahead of `[...nextauth]`** — the App Router matches static segments before a catch-all. Confirmed in the build output, where both appear as separate routes.
- **Sign-out is a server action in a `<form>`, not an `onClick`** — `auth.ts` pulls in Prisma, so a client component may only hold a reference to the action, and a GET that destroys a session is a CSRF hazard.

**Verified** against the Neon **development** branch: registration normalised `  TEST@Test.com ` to `test@test.com` and stored a `$2b$10$` hash at cost 10 (matching the seed), then answered 409 duplicate, 409 against the Google account, 400 field errors, 400 malformed JSON and 405 on GET. Sign-in reached `/dashboard` for both the seeded demo account and a new registration, including with an uppercased address; wrong password, unknown address and the `passwordHash`-null Google account all failed identically as `CredentialsSignin`. Zero `Session` rows, one Google `Account`, seed untouched. In the browser at 1440×900: signed in through the form, clicked sign-out → `POST /dashboard 303` → `signOutAction()` in 10ms → `/`, and `/dashboard` bounced back to sign-in. `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (199 tests) and `next build` all green.

**Left open:** **no tests were written** — `/feature test` was skipped, so `auth.schema.ts` (the email pipe, the byte-length rule, the confirm-password refinement) and the register handler's branches have no unit coverage despite being the most testable code in the feature. Everything above was verified by hand instead. Registration is still curl-only — no `/register` or `/sign-in` page until Phase 3, so a new user has to sign in through next-auth's default page. That page also warns about missing `autocomplete` attributes; Phase 3 replaces it. Sign-out is desktop-only, since the sidebar footer has no mobile equivalent. Password rules are minimum 8 characters and at most 72 bytes (bcrypt's silent truncation point) with no complexity requirement. No rate limiting on either the register route or credentials sign-in — the obvious next hardening step. Timing still distinguishes a known address from an unknown one, since bcrypt only runs when a hash exists; the 409 already leaks the same fact, so closing one without the other buys nothing.

### Dashboard Spec 2 — Real Data from Database — completed 2026-08-29

`/dashboard` now renders the signed-in user's own apiary from Postgres, keeping Spec 1's layout. Merged to `main` as `1d30ff0` (feature commit `e55f5dd`).

**Delivered**

- `types/inspection.ts` — all six `Json` columns typed by **deriving from the form schemas that write them** (`QueenValues`, `ColonyValues`, …) rather than hand-copying the spec's interfaces, plus `HiveWithCurrentInspection` / `ApiaryWithHives` payload types.
- `app/lib/dashboard.ts` — every derivation as a pure function with `now` injected: status, alert description, strength, date and greeting formatting, name helpers, Polish plural helpers, `latestInspectionDate`.
- `app/lib/dashboard.test.ts` — 37 tests. Suite total 199 → 236.
- `app/(dashboard)/dashboard/page.tsx` — one `findUnique` with a nested include, derive, render; empty state when the user has no apiary.
- `app/(dashboard)/layout.tsx` — now async: session guard plus a `Subscription.tier` lookup for the sidebar footer.
- `Sidebar` takes `userName` / `userInitials` / `isPremium`; `HiveCard` takes a string `label` and a nullable `queenStatus`; `Topbar` drops its separator when an apiary has no location.

**Decisions worth remembering**

- **The spec's `ColonyData` was wrong in two ways, and deriving the types is what caught it.** `colony` carries no `honey_stores` or `honey_kg` — those are the scalar columns `honeyKg` / `honeySufficiency`, computed server-side from the comb frames — and `frames_covered` validates to **0–20**, not 0–10. `payload.ts` is the authority on what actually reaches each column.
- **Strength scales across 0–20, and never returns 0 for an inspected colony.** The spec's halving assumes a range the form does not enforce, so a 12-frame colony would render identically to a 20-frame one. Zero dots is reserved for "never inspected", which must not look like a weak colony.
- **`orderBy: { createdAt: 'asc' }` alone is nondeterministic here.** The seed creates all five hives inside one transaction, so Postgres' `now()` stamps them identically and the sort has no tiebreaker — the grid silently reshuffled to `Ul 5, 1, 2, 3, 4` the moment four rows were updated. `label` is now a secondary sort. Found by testing, not by reading; it would never have appeared on a freshly seeded database. **Lexicographic, so `Ul 10` sorts before `Ul 2`** — a natural sort is needed once labels reach double digits.
- **Empty state, not the spec's `redirect('/onboarding')`.** That route does not exist and three live accounts reach the branch (both Google users, and the production demo account). A redirect would have shipped a 404 as the happy path for every new sign-up.
- **`HiveStatus` stays three-valued.** The spec adds `'never_inspected'` and then says treat it as `'ok'`; a fourth member would have to be handled by `CARD_TOP_EDGE`, `STATUS_DOT` and `StrengthDots.FILLED_BY_STATUS`. "Never inspected" is carried as `queenStatus === null`, which had to exist anyway, and the card mutes both the dot and the label so an uninspected hive cannot be misread as healthy.
- **Derivations live in `app/lib/dashboard.ts`, not inline in the page.** The spec says "in the page component, not in child components"; the half that matters is that no component derives anything. A function nested in a server component cannot be unit-tested, and these branches only fire on data the seed does not contain.
- **`flatMap` over `filter` + `map` for the alert list** — inside the non-`'ok'` branch TypeScript narrows `status` to `AlertVariant` on its own, so `variant` needs neither a cast nor a type predicate.
- **`now` is captured once per render** and threaded through every derivation, so two calls either side of midnight cannot disagree about what is overdue.
- **Greeting and dates are pinned to `Europe/Warsaw`**, not Vercel's UTC, and the hour uses `hourCycle: 'h23'` — `hour12: false` renders midnight as "24" in some ICU versions, which would read as the evening greeting at 00:30.
- **Polish plurals are computed, not hardcoded** — `Intl.PluralRules` gives 1 ul / 2–4 ule / 5+ uli, the matching verb (`wymaga` vs `wymagają`), and adjective agreement for the hive-type line.
- **`/dashboard` is dynamic now** (`ƒ`), where Spec 1 prerendered it. Reading the session forces that; it is expected, not a regression.

**Verified** against the Neon **development** branch. Seeded state: `5 uli · brak przeglądów · 0 wymaga uwagi`, `5 uli wielkopolskich`, five cards with empty dots, no alerts section, sidebar `JP` / `Jan P.` / `Premium` — every acceptance criterion the spec lists, with its demo address corrected. With temporary inspections covering every branch (created, checked, deleted): a missing queen produced a red `Alarm` whose reason beat the swarm cells on the same hive, `not_seen_brood_ok` produced amber, a 30-day-old inspection produced `Przegląd przeterminowany · 30 dni`, and 16/8/12/20 frames produced 4/2/3/5 dots. A throwaway account with no apiary rendered the empty state with a muted `Free` badge, confirming the no-subscription branch. `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (236 tests) and `next build` all green.

**Left open:** **production still shows the empty state** — the prod demo account was created through `/api/auth/register`, so it has no subscription, apiary or hives, and the prod Google user has none either. Backfill with `db:create-account` or the seed before demoing prod. `/onboarding` still does not exist, so nothing turns the empty state into an apiary; `Dodaj ul` and `Nowy przegląd` remain inert, as do `Szczegóły` and `Przegląd`. The mobile layout has no sidebar footer, so name, plan and sign-out are desktop-only. Hive labels sort lexicographically. The layout's subscription lookup is a second query per request alongside the page's apiary query — fine at this size, worth folding into one if the shell grows. Google sign-in on prod is still broken pending the `AUTH_URL` / redirect-URI fix recorded in Auth Phase 1.

### Auth Phase 3 — Sign In, Register & Sign Out UI — completed 2026-08-29

Custom `/sign-in` and `/register` replacing next-auth's built-in pages, a reusable avatar, and an account dropdown that finally exists on mobile. Merged to `main` as `7ddc015` (feature commit `e314bd6`).

**Delivered**

- `app/(auth)/` — shared split-screen shell plus both pages. The layout also bounces a signed-in visitor to `/dashboard`: Proxy only matches `/dashboard/*`, so nothing above it turns away someone arriving from a bookmark or the back button.
- `AuthBackdrop` — the drifting honeycomb, wash and scrims. `AuthShowcase` — the `lg`-only brand copy.
- `app/components/auth/` — `SignInForm`, `RegisterForm`, `GoogleButton`, and a small `fields.tsx` vocabulary built on Ark UI's `Field`.
- `app/components/ui/Avatar.tsx` — Google photo, initials fallback, plus recovery from a photo URL that 404s.
- `app/components/dashboard/UserMenu.tsx` — one Ark UI menu in two variants: the sidebar footer row, and an avatar-only trigger in `Topbar` below `lg`.
- `app/lib/callback-url.ts` + 11 tests. Suite 236 → 247.
- `auth.config.ts` gains `pages.signIn`; both `redirect('/api/auth/signin')` calls now point at `/sign-in`.
- `next.config.ts` — `images.remotePatterns` for `lh3.googleusercontent.com/a/**`.
- `context/coding-standards.md` — a new **Comments** rule, on user request.

**Decisions worth remembering**

- **`pages.signIn` belongs in `auth.config.ts`, not `auth.ts`.** The redirect that matters is the one the `authorized` callback fires, and that runs on the Proxy instance, which is built from `auth.config.ts` alone. Putting it in `auth.ts` would leave Proxy still sending people to `/api/auth/signin`.
- **`signIn()` throws on both outcomes.** Success calls `redirect()`, which throws `NEXT_REDIRECT`; failure throws `AuthError`. The catch must return only for `AuthError` and rethrow everything else, or the navigation is swallowed and the form appears to do nothing. Confirmed in `@auth/core`: with `raw` set, `isAuthError && isRaw && !isRedirect` rethrows.
- **Sign-out from a menu item uses `requestSubmit()` on a form rendered *outside* the menu content.** Selecting an item closes the menu, and a submit button the menu is hiding in the same tick is not something to depend on. `lazyMount` + `unmountOnExit` are on for a second reason: below `lg` both `UserMenu` variants mount (the sidebar's inside a `display:none` aside), so the panel markup would otherwise sit in the document twice.
- **The comb is rendered exactly once.** It is an SVG `<pattern>` referenced by `url(#auth-comb)`; the obvious "one backdrop per column" approach would put two elements with the same id in one document. Hence one absolutely positioned layer, `w-full` on phones and `lg:w-1/2` above.
- **The drift travels exactly one pattern tile.** That is what makes the loop seamless — the last frame is pixel-identical to the first, one cell over. `--comb-tile` is set inline from the same constant that builds the pattern, so the keyframes in `globals.css` cannot fall out of step. The svg is a tile wider than its box and offset left by a tile, so `overflow-hidden` on the parent is load-bearing: without it the overhang becomes horizontal page scroll.
- **The avatar is the menu trigger and `/profile` is an item inside it.** The spec asked for both a dropdown on avatar click and a click-through to `/profile`; one element cannot do both.
- **`next.config.ts` had a dead `module.exports = {…}`.** `allowedDevOrigins` was never in effect — the config loader reads the default export, and `export default` compiles to `exports.default` on the object `module.exports` had just replaced. Phone-on-LAN dev access should work now for the first time.
- **`safeCallbackUrl` rejects `/\evil.example` as well as `//evil.example`** — browsers normalise the backslash and read both as another host, and a naive `startsWith('//')` misses the second form.
- **Register posts to the route handler, not a server action.** 409-for-taken vs 400-for-invalid is the contract Phase 2 tested, and the repo's standards put anything needing specific status codes in a route handler.
- **`Topbar` is async and reads the session itself** rather than taking it as a prop, so no page that renders a topbar has to thread the user through. A JWT cookie decode, not a query.

**Verified** in the browser at 1440×900, 1280, 1024 and 390×844 against the Neon **development** branch: empty-form validation, a wrong password producing one generic message, a correct password reaching `/dashboard`, `/dashboard` while signed out redirecting to `/sign-in?callbackUrl=…`, `/sign-in` while signed in redirecting to `/dashboard`, register with mismatched passwords, a duplicate address landing its 409 on the email field, a new account redirecting to `/sign-in?registered=1` with the confirmation banner, and signing in afterwards with the lowercased form of an address registered with mixed case and a trailing space. Sign-out works from both the sidebar and the mobile top bar. A Google avatar loaded through `/_next/image` (32px decoded), and a deliberately broken URL fell back to initials. The drift was measured seamless: `translateX(59.997px)` at 11999ms, `translateX(0)` at the wrap. No horizontal overflow at any width. `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (247 tests) and `next build` all green.

**Left open:** **`/profile` does not exist**, so the menu item 404s — it carries `prefetch={false}` like the `/analytics` and `/settings` nav links. **No tests for `auth.schema.ts` or the register route** — Phase 2's gap is still open; only `callback-url.ts` gained coverage. `callbackUrl` deep links are dropped rather than honoured: next-auth writes an absolute URL and `safeCallbackUrl` accepts only relative paths, so everything lands on `/dashboard`. Harmless while `/dashboard` is the only protected page; revisit when `/dashboard/hive/:id` exists. The apiary image half is still CSS art — drop a photo in `public/` and render an `<Image fill>` under the scrims. **The dev server logs sign-in passwords in plaintext** (`ƒ signInAction({"email":…,"password":…})`) — Next 16 traces server-action arguments in dev; switching the action to `FormData` would hide it. Google sign-in on prod is still broken pending the `AUTH_URL` / redirect-URI fix from Auth Phase 1, and production still shows the empty dashboard state. **Turbopack served stale CSS** after an edit to `globals.css` and needed a dev-server restart — add that to the `@theme` and `'use server'` staleness list.

### Email Verification — Resend — completed 2026-08-29

Registration now mails a verification link and `/dashboard` stays closed until it is clicked. Merged to `main` as `fa54d60` (feature commit `fb33b8b`).

**Delivered**

- `app/lib/email/` — `verification-token.ts` (generation, 24h expiry, `resolveAppUrl`, URL building) with 19 tests; `resend.ts` lazy client; `send-verification-email.ts`; `issue-verification.ts`, the shared write-then-send step; `verification-actions.ts` with both re-send actions. Suite 247 → 266.
- `app/api/auth/verify-email/route.ts` — consumes the link; every outcome redirects to `/sign-in` with `verified=true`, `verified=already` or `error=invalid_token`.
- `app/(auth)/(anonymous)/register/check-email/page.tsx` and `app/(auth)/verify-email/page.tsx`, both with a re-send button; `ResendVerificationButton`, `SignOutButton`, `MailIcon`.
- `auth.ts` — `events.linkAccount` stamps `emailVerified` for Google. `app/(dashboard)/layout.tsx` — the gate, folded into the existing subscription query.
- Migrations `20260829120000_add_email_verification` and `20260829130000_backfill_email_verified`. Applied to **both** Neon branches.
- `public/email/comb-backdrop.png` — the auth honeycomb rasterised for the email.

**Decisions worth remembering**

- **The spec's two token rules contradict each other.** "Consume the token" and "second click → `verified=already`" cannot both hold: nulling it makes the second click indistinguishable from a forged one, which the first implementation did — it returned `invalid_token`. The token now stays on the row and `emailVerified` is what makes it inert. A double click is the ordinary case; mail clients and link scanners fetch the URL before the user does.
- **`events.linkAccount` fires only at link time, so it cannot fix accounts linked earlier.** Every existing account on both branches had `emailVerified: null` and would have been locked out with no way back. The backfill migration grandfathers everything that existed when verification shipped; everything after must verify. **A stamping event always needs a backfill companion.**
- **The `(auth)` group had to split.** Its layout bounced every signed-in visitor to `/dashboard`, which would have made `/verify-email` — the one page in that shell needing a session — an infinite redirect. Shell stays in `app/(auth)/layout.tsx`; the guard moved to `app/(auth)/(anonymous)/layout.tsx`. A session whose user row is gone is let through rather than redirected, or it bounces against `/verify-email`.
- **Resend's SDK resolves `{ data, error }` — it does not reject.** The spec's bare `await resend.emails.send(...)` reports success for a refused message.
- **`onboarding@resend.dev` only delivers to the API key owner** — confirmed live, and it rejects plus-aliases too. So registration returns 201 with `emailSent: false` rather than 500 when the send fails; the token is already stored and the re-send button recovers it. Otherwise a mail outage would strand a user retrying into a 409 on their own address.
- **`emailVerified` stays `DateTime?`.** The spec's `Boolean @default(false)` would break `@auth/prisma-adapter`, whose `AdapterUser` types it as `Date | null`.
- **`APP_URL`, not `NEXT_PUBLIC_APP_URL`.** The link is built inside the send helper and never reaches the browser.
- **The email is tables, inline styles and a flat PNG.** No client renders an SVG `<pattern>` or runs CSS animation, so the drift is dropped. `bgcolor` beside `background-image` is load-bearing — images are blocked by default, and without it the light text would land on white.

**Verified** against the Neon **development** branch and in the browser: registration stores a token with a 24h expiry; the link stamps `emailVerified` and returns `verified=true`; a second click returns `verified=already`; missing, unknown and expired tokens all return `error=invalid_token` and leave the account unverified. Signing in unverified lands on `/verify-email`, and `/dashboard` bounces there; the demo account signs straight through to a full dashboard. All three sign-in notices render, none when the params are absent. Two real messages were accepted by Resend. `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (266 tests) and `next build` all green.

**Production was brought up to date in the same session:** both migrations applied via the direct endpoint, the two OAuth-only accounts purged on user instruction (one belonged to a second tester), and the demo account reseeded with full content. Prod now holds exactly one verified user with 1 apiary / 5 hives / 5 inspections.

**Left open:** **Vercel needs `RESEND_API_KEY` and `APP_URL`** — without the latter the verification link and the email's backdrop both point at `http://localhost:3000`, so the pattern never loads and the link is dead. **A domain must be verified at resend.com/domains before anyone but the key owner can register**, and the `from` address is a hardcoded constant, so switching it is a code change rather than an env var. **`events.linkAccount` has not been exercised against a live Google consent** — the backfill covers every current account, so nothing is broken, but the first new Google sign-in is its real test. No rate limiting on either re-send action: `/register/check-email`'s takes an address from the query string and is reachable signed out, which is the classic spam vector — it only mails unverified credentials accounts and answers identically either way, but nothing throttles it. Still no tests for `auth.schema.ts` or the register route, open since Phase 2. The prod demo password is `demo1234`, set deliberately via `DEMO_PASSWORD`; rotate before any real launch. `scripts/purge-users.ts` and `scripts/seed-demo.ts` are gitignored per user decision, but their `package.json` entries are committed and will point at missing files on any other checkout.

### Email Verification Toggle — completed 2026-08-29

One switch turns the whole verification requirement on or off, so the app can be demoed and tested before a sender domain exists. Merged to `main` as `9e67a4b` (feature commit `781c14e`).

**Delivered**

- `app/lib/email/config.ts` — `isEmailVerificationEnabled(env = process.env)`, the only reader of `EMAIL_VERIFICATION_ENABLED`. `config.test.ts`, 22 tests. Suite 266 → 288.
- `app/api/auth/register/route.ts` — stamps `emailVerified` and skips the send when off; returns `verificationRequired` alongside `emailSent`; a dev-only `console.info` on the skip.
- `app/components/auth/RegisterForm.tsx` — branches on that field, going to `/sign-in?registered=1` instead of `/register/check-email`.
- `app/(dashboard)/layout.tsx` — the gate is now `isEmailVerificationEnabled() && !user.emailVerified`.
- `app/(auth)/verify-email/page.tsx` → `/dashboard`, `app/(auth)/(anonymous)/register/check-email/page.tsx` → `/sign-in`, both re-send actions return early.
- `app/(auth)/(anonymous)/sign-in/page.tsx` — the `?registered=1` banner, restored.
- `.env.example` — the variable, its default, and the trade-off.

**No migration.** `emailVerified` is `DateTime?` already and every existing account is stamped.

**Decisions worth remembering**

- **Stamping `emailVerified` at creation is the whole feature.** Skipping only the *send* would leave a population of `emailVerified: null` rows that sign in fine while the flag is off and are all locked out the moment it goes on — the failure `20260829130000_backfill_email_verified` had to repair for accounts predating verification. Writing the stamp at creation means no backfill is ever needed. Verified live by flipping the flag: an account registered while off still reached `/dashboard` after it was switched on.
- **`/verify-email` needs `export const dynamic = 'force-dynamic'`.** With the flag off its redirect fires before any dynamic API is touched, so the page prerendered (`○` in the build output) and Next baked "redirect to `/dashboard`" into the build — switching the flag on would have had no effect until a rebuild. **Any page whose only env-dependent branch short-circuits before `auth()` or `searchParams` has this problem.**
- **`verificationRequired` in the 201 body, not a `NEXT_PUBLIC_` twin.** `RegisterForm` is `'use client'` and cannot read a server-only var. `emailSent: false` alone is ambiguous between "verification is off" and "the send failed", and those need opposite next screens. The client checks `=== false`, so a body that fails to parse falls through to the existing check-email path.
- **Default off when unset.** Enabled-by-default is the broken state while `onboarding@resend.dev` is the sender. The cost is recorded in `.env.example`: a forgotten variable in a deployment ships verification disabled rather than failing loudly.
- **`true` / `1` / `yes` / `on` all enable, case- and whitespace-insensitive.** Since unset means off, someone writing `=yes` and silently getting verification switched off is the expensive direction to guess wrong in. Quoted values (`"true"`) and trailing comments still read as off.
- **Both re-send actions check the flag themselves.** The pages' redirects hide the buttons but do not disable the endpoints — a server action is reachable by anyone holding its `$ACTION_ID`, including a tab left open across the flip.
- **`/api/auth/verify-email` is deliberately untouched**, so links already in the wild keep working after the flag goes off.
- **The `?registered=1` banner had to come back.** Phase 3 added it, the verification feature displaced it, and nothing rendered it any more — the flag-off flow lands there again.

**Verified** against the Neon **development** branch, flipping the flag between two production servers on port 3101. Flag off: register → 201 `verificationRequired: false`, row stamped with no token, `/dashboard` 200, `/verify-email` → `/dashboard`, `/register/check-email` → `/sign-in`, `?registered=1` banner rendering and no banner without params. Flag on: register → 201 `verificationRequired: true` with a token and 24h expiry, `emailVerified: null`, `/dashboard` → `/verify-email`, that page rendering the right address, `/register/check-email` 200. Across the flip: an account created while off reached `/dashboard` with the flag on; a token minted while on returned `verified=true`, then `verified=already`, then `error=invalid_token` for a bad token, after it was switched off. Three test accounts created and deleted. `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (288 tests) and `next build` all green.

**Left open:** **Vercel needs `EMAIL_VERIFICATION_ENABLED`** — set it `false` (or leave it unset) until a domain is verified at resend.com/domains, since `FROM` in `send-verification-email.ts` is still `onboarding@resend.dev` and turning it on now would strand every new signup. Turning it on later is: verify the domain, change that constant (a code change, not an env var), set the variable, redeploy — Vercel bakes env vars into a deployment, so the value alone does nothing. **The re-send guards were verified by reading, not by request** — invoking a server action needs a page that renders its button, and with the flag off both such pages redirect. Everything the previous feature left open still stands: no rate limiting on either re-send action, no tests for `auth.schema.ts` or the register route (open since Phase 2), `events.linkAccount` still unexercised against a live Google consent, `/profile` still missing, and the prod demo password still `demo1234`.

### Forgot Password — completed 2026-08-30

`/forgot-password` and `/reset-password`, backed by the previously unused Auth.js `VerificationToken` table. Merged to `main` as `39ee04d` (feature commit `bfe3185`).

**Delivered**

- `app/lib/email/password-reset-token.ts` — generation, 1h expiry, the `password-reset:` identifier namespace and its reader, `buildPasswordResetUrl`. 21 tests.
- `app/lib/email/send-password-reset-email.ts` and `issue-password-reset.ts` — the write-then-send step, mirroring `issueVerificationEmail`.
- `app/api/auth/forgot-password/route.ts` and `app/api/auth/reset-password/route.ts`.
- `app/(auth)/(anonymous)/forgot-password/page.tsx` + `ForgotPasswordForm`; `app/(auth)/reset-password/page.tsx` + `ResetPasswordForm`.
- `app/lib/auth.schema.ts` — `forgotPasswordSchema`, `resetPasswordSchema`, `resetPasswordRequestSchema`, and a strengthened `newPassword`. `auth.schema.test.ts`, 43 tests — the gap open since Auth Phase 2.
- `PasswordField` in `fields.tsx` with a reveal toggle and a requirements checklist; `EyeIcon` / `EyeOffIcon`. Used on sign-in, register and both reset fields.
- `/sign-in` — the "Nie pamiętasz hasła?" link and the `reset=1` notice.
- `prisma/seed.ts` and `scripts/seed-demo.ts` — demo account moved to `demo@hivewise.app` / `Demo2026Miodowy`; `scripts/purge-users.ts` `KEEP_EMAILS` emptied. Suite 288 → 353.

**No migration.** The `VerificationToken` table has existed since `20260828141044_init` and had never been read or written — this feature is its first consumer, exactly as the load notes predicted.

**Decisions worth remembering**

- **The identifier is namespaced `password-reset:<email>`, and the prefix is checked on every read.** `@auth/prisma-adapter` writes a bare email as `identifier` for magic-link sign-in; that provider is not configured, but the prefix means enabling it later cannot make an adapter token spendable as a password reset. Verified live by planting a bare-identifier row: both the API and the page rejected it, **and left it in place** — a token belonging to another flow must not be destroyed by a failed reset attempt.
- **Reset tokens behave the opposite way to verification tokens, deliberately.** 1h rather than 24h, and deleted on consumption rather than left inert by `emailVerified`. A reset token has no natural inertness: leaving it live would let anyone who later reads the link (mail archive, forwarded thread, browser history) set the password again. Deletion is scoped to the identifier, so any other outstanding link for that address dies with it, and a fresh request drops the previous token first.
- **`deleteMany`, not `delete`, when consuming.** A double submit would make the second call throw `P2025` on a row the first already removed.
- **A reset may set a password on an OAuth-only account.** Registration refuses this because an unauthenticated request proves nothing; a reset link proves control of the mailbox, which is the same thing Google verified. Refusing would strand those users behind a generic message that cannot explain itself.
- **A successful reset stamps `emailVerified` when it is null.** Same proof, and without it a user could reset their password and still be parked on `/verify-email`.
- **`/forgot-password` answers `200 {ok:true}` for every address that parses** — known, unknown, OAuth-only and unverified alike. The opposite of the register route's 409, which has an excuse this endpoint does not. A send failure is swallowed and logged rather than returned, because a 500 would say "this address exists and our mailer is down".
- **`/reset-password` sits outside the `(anonymous)` group.** That layout redirects anyone with a live session, which would swallow the link for a user still signed in elsewhere and burn a token they cannot spend. `/forgot-password` stays inside it.
- **Both endpoints are route handlers, not server actions.** Beyond the status codes the forms branch on, Next traces server-action arguments in the dev console — a password submitted through an action is printed in plaintext, the bug `signInAction` still has.
- **`EMAIL_VERIFICATION_ENABLED` does not gate this flow.** Gating it would remove the only recovery path whenever the flag is off.
- **Sessions are JWTs, so a reset cannot revoke one.** An attacker already holding a valid cookie keeps it until expiry. Noted, not solved.
- **The password policy uses composition rules on user instruction, against NIST SP 800-63B**, which warns they produce `Password1!`. The weak-base blocklist is the part that earns its keep: `Password12345` satisfies every composition rule and is rejected. Letter classes are `\p{Lu}` / `\p{Ll}`, not `[A-Z]` — `Ą` has to count as a capital in a Polish app.
- **One `PASSWORD_REQUIREMENTS` list drives both the Zod checks and the on-screen checklist**, so they cannot drift into telling the user different things. `superRefine` reports every unmet rule at once rather than stopping at the first.
- **`PasswordField` tracks its own value in local state rather than the form's `watch()`.** `watch` trips `react-hooks/incompatible-library`, and local state keeps typing re-renders inside the field. The checklist appears only once the field is in error and clears itself when the password becomes valid.
- **The reveal button is `type='button'` with `tabIndex={-1}`.** A bare `<button>` inside a form submits it; the toggle exposes nothing a screen-reader user cannot already read, and sitting between the field and submit it would add a stop to every keyboard pass.
- **`tsc` type-checks `scripts/` even though it is gitignored** — which is what caught `Subscription.status` and `Apiary.location` being nullable in the SQL generator.

**Verified** against the Neon **development** branch and in the browser at 1440×900. API: malformed JSON, invalid address, unknown address (no token written), a known address with mixed case and whitespace normalised, a second request replacing the first token, superseded / unknown / empty / missing tokens, short and mismatched passwords, and each new password rule rejected with its own message. A successful reset changed the `$2b$10$` hash, left `emailVerified` intact, deleted only the reset token, and a replay returned 400 with the password unchanged. Expiry returned 400 and cleaned the row. An OAuth-only account (`passwordHash: null`) gained a password; an unverified account came back stamped. Browser: the full forgot → link → reset → `/sign-in?reset=1` → sign-in loop, the requirements checklist ticking live as the password is typed, both reset-form toggles independent, and a 44×44 touch target. Resend accepted a real message to the key owner's address. `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (353 tests) and `next build` all green; both new routes are `ƒ`.

**Demo account rebuilt in the same session.** `demo@getapiary.app` / `demo1234` no longer satisfies the policy the app enforces, so it moved to `demo@hivewise.app` / `Demo2026Miodowy`. Dev was purged and reseeded through `db:purge-users` + `db:seed-demo`. **Production was applied by the user**, who ran a generated SQL script in the Neon console and confirmed the account: the sandbox blocked every path to a prod connection string, so `scripts/gen-demo-sql.ts` replays the seeded dev rows as literal SQL, wrapped in `BEGIN`/`COMMIT` and date-relative via `now() - interval` so the dashboard states do not drift. All four prod users were deleted, including a second tester's, on explicit confirmation.

**Left open:** **No rate limiting on `/forgot-password`** — the classic mail-spam vector, joining the two unthrottled re-send actions. **Resend still cannot mail anyone but the API key owner**: `FROM` is the hardcoded `onboarding@resend.dev`, so a reset link reaches nobody else until a domain is verified at resend.com/domains and that constant is changed. Vercel still needs `RESEND_API_KEY`, `APP_URL` and `EMAIL_VERIFICATION_ENABLED`; without `APP_URL` the reset link points at `localhost:3000`. Timing still separates a known address from an unknown one, since only the found branch mails. **The generated `scripts/seed-demo.sql` carries a bcrypt hash and is gitignored**, along with `gen-demo-sql.ts` — their `package.json` siblings still point at files absent from a fresh checkout. `/profile` still does not exist, and `events.linkAccount` is still unexercised against a live Google consent.

### Profile Page — completed 2026-08-30

`/profile` — account identity, apiary stats, plan usage, change password and a typed-phrase account deletion. The route `UserMenu` has linked to since Auth Phase 3 finally exists. Merged to `main` as `cde6a71` (feature commit `50edd2f`).

**Delivered**

- `app/(dashboard)/profile/page.tsx` — one `findUnique`, derive, render: identity card, apiary/hive stats, usage bars, password form, danger zone. Local `Stat` and `UsageBar` presenters.
- `app/lib/profile.ts` — `PLAN_LIMITS`, `planTierOf`, `formatPlanName`, `formatLongDate`, `currentPeriodStart` / `nextPeriodStart`, `usageOf`, `usagePercent`, `hasBillableSubscription`, `DELETE_CONFIRMATION_PHRASE` / `isDeleteConfirmed`. 37 tests.
- `app/api/account/change-password/route.ts` and `app/api/account/delete/route.ts`, each with a test suite — 29 tests, the first mocked suites in this repo.
- `app/components/profile/` — `ChangePasswordForm` (react-hook-form + the existing `PasswordField`), `DeleteAccountDialog` (Ark UI `Dialog`).
- `app/lib/auth.schema.ts` — `changePasswordSchema`, `deleteAccountSchema`. `app/lib/dashboard.ts` — `formatHiveCount` extracted from `buildSummaryLine`.
- `TopbarShell` extracted from `Topbar`; `TrashIcon` / `LockIcon` / `WarningIcon`; `/profile` added to the Proxy matcher; `prefetch={false}` dropped from the menu link. Suite 353 → 419.

**No migration.** Every column the page reads has existed since `20260828141044_init` or the auth migrations.

**Decisions worth remembering**

- **Premium deletion blocks on `status === 'active' && stripeSubscriptionId !== null`, not on the tier** — user's call among three options put to them at `/start`. Stripe is Phase 4, so no row satisfies it and seeded Premium accounts including the demo stay deletable; it starts biting the moment billing lands. A tier-wide block would have trapped every Premium account behind a cancel flow that does not exist — a right-to-erasure problem, and it would have made the demo account undeletable. Premium-but-unbilled accounts get a forfeit warning in the dialog instead. **There is a test pinning exactly this** (`deletes a seeded Premium account, which has no Stripe id`), because the "simplification" to `tier === 'PREMIUM'` is the obvious future mistake.
- **Account deletion removes `VerificationToken` rows for both identifiers** — the `password-reset:` namespace and the bare address the Auth.js adapter would write. That table has no relation to `User`, so cascade never reaches it and a link would outlive the account, spendable if the address is registered again. This is the deliberate opposite of Forgot Password's rule that a *failed reset* must leave another flow's token alone: erasing an account is the one operation that should take everything tied to the address.
- **`passwordHash` presence decides the change-password form, not the provider.** `/api/auth/reset-password` explicitly lets an OAuth-only user set a password, so a `some` on `Account` would hide the form from someone who has one. Verified on an account holding both a Google `Account` row and a hash.
- **The delete endpoint re-checks the phrase.** The dialog's disabled button is presentation; the endpoint is reachable by anyone who can make a request. The literal lives once in `profile.ts` and `deleteAccountSchema` validates presence only, so the phrase is never duplicated into a Zod literal.
- **`hasBillableSubscription` and `isDeleteConfirmed` are pure functions, so the block and the phrase are testable without a database.** The tier is not even selected by the delete query — only `status` and `stripeSubscriptionId`.
- **The client signs out after a successful delete**, via `requestSubmit()` on a hidden form rendered *outside* `Dialog.Content` — `unmountOnExit` would otherwise take it with the closing dialog. Sessions are JWTs: the cookie survives the row and nothing server-side can revoke it. `pending` is deliberately left on through the redirect.
- **`currentPeriodStart` uses `getUTCFullYear` / `getUTCMonth`**, closing the bug `prisma/seed.ts` left open — local getters inside `Date.UTC` read the wrong month for two hours a year in UTC+2, and this function is what a usage row is looked up by.
- **Plan limits are one exported constant**, per `context/project-overview.md`'s instruction that pricing is configuration, not logic. `usagePercent` clamps both ends because a counter can outrun its limit on a downgrade; the bar and the counter both turn amber when it does.
- **`Apiary.userId` is `@unique`, so "total apiaries" could only ever read 0 or 1** — the spec's stat would have been meaningless. The card shows the apiary's name (or `Brak pasieki`) instead.
- **`TopbarShell` was extracted rather than duplicated.** A page that rolls its own header silently loses sign-out on mobile, where the sidebar footer does not exist. `Topbar` is now that shell plus the two apiary buttons.
- **`vitest.config.mts`'s `restoreMocks: true` does not clear a bare `vi.fn()`'s call history** — only spies. Two "did not delete" assertions passed for the wrong reason until both suites called `vi.clearAllMocks()` in `beforeEach`. The shared config was left alone rather than flipping `clearMocks` for 19 existing suites.
- **bcrypt is not mocked in the change-password suite.** The endpoint turns on whether the current password verifies and whether the stored hash is the new one; a faked `compare` asserts neither.
- **Both endpoints are route handlers, not server actions** — the forms branch on status codes, and Next traces action arguments in the dev console in plaintext.

**Verified** against the Neon **development** branch and in the browser at 1440×900 and 390×844, on a production server. Anonymous `/profile` 307s to `/sign-in?callbackUrl=…` (confirming the new matcher entry); both endpoints 401 signed out and 405 on GET. Change password: a weak new password caught client-side by the shared policy, a wrong current password landing its message on that field, a real change and revert both writing `$2b$10$`. Delete: the confirm button stayed disabled for `deletemyaccount` and armed only on the exact phrase, the field reset between openings, and wrong-case / partial / empty / missing phrases all 400d through `fetch` without deleting. Two accounts deleted end to end, cascading `Subscription`, `UsagePeriod` and `Account`, followed by sign-out and a dead session; a replay returned `200 {ok:true}`. A planted `password-reset:` token **and** a bare-identifier one both vanished with the account. A fabricated `sub_probe` subscription produced the 409 and the block notice; clearing only `stripeSubscriptionId` while leaving `tier: PREMIUM` lifted it immediately. An account with `passwordHash: null` hid the form and 409d the endpoint. Free branch rendered `Brak pasieki` / `0 uli` / `0 / 15` / `0 / 5`; a 50/50 and 26/25 account rendered both bars amber with the second clamped. No horizontal overflow at 390. Three throwaway accounts created and deleted; demo account restored to `Demo2026Miodowy`. `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (419 tests) and `next build` all green; `/profile` and both routes are `ƒ`.

**Guards were mutation-checked**, since passing tests prove nothing on their own: disabling the server-side phrase re-check failed 4 tests, broadening the Premium block to `status === 'active'` failed the seeded-Premium test, and skipping `bcrypt.compare` failed the wrong-current-password test. All three routes restored and confirmed byte-identical by `git diff`.

**Left open:** **No rate limiting on `/api/account/change-password`** — it verifies a current password, so it is a new brute-force surface, joining `/forgot-password` and the two unthrottled re-send actions. **The `Anuluj subskrypcję` path does not exist**, so if a Stripe subscription ever becomes active before Phase 4 ships a cancel flow, that account is blocked from deleting with nothing to click; the block is a no-op today, but the two must land together. **The register route still has no tests**, open since Auth Phase 2 and untouched here. `/analytics` and `/settings` still 404 and keep their `prefetch={false}`. The `Stat` cards, `UsageBar` and `deletionSummary` live in the page file rather than `app/components/profile/` — each is used once. Usage counters are still only ever written by the seed, so the bars show real numbers for the demo account and zeros for everyone else until PDF generation lands. Everything the previous features left open still stands: Vercel needs `RESEND_API_KEY`, `APP_URL` and `EMAIL_VERIFICATION_ENABLED`; Resend cannot mail anyone but the API key owner; `events.linkAccount` is still unexercised against a live Google consent; and `scripts/gen-demo-sql.ts` / `seed-demo.sql` remain gitignored with committed `package.json` siblings.

### Honeycomb Backdrop — completed 2026-08-30

The drifting comb from the auth screens extracted into a reusable layer and applied, static, to three more surfaces. Merged to `main` as `5960d06` (feature commit `71e9ca9`).

**Delivered**

- `app/lib/honeycomb.ts` — tile geometry (`HONEYCOMB_TILE`, `honeycombTileHeight`) and the mask source (`honeycombMaskUri`) as pure functions. `honeycomb.test.ts`, 13 tests. Suite 419 → 432.
- `app/components/ui/HoneycombBackdrop.tsx` — the layer: `tone`, `opacity`, `tile`, `fade`, `animated`, `debug`, `className`, plus a `data-honeycomb` marker attribute.
- `AuthBackdrop` rewritten on top of it — 71 lines to 27, visually unchanged.
- Placements: `Sidebar`'s `<aside>` (tile 44, opacity 0.07, `fade='top'`), the `/profile` identity `<section>` (40 / 0.08 / `left`), and `NoApiary` on `/dashboard` (64 / 0.1 / `center`).
- `context/features/honeycomb-backdrop-spec.md` — the spec, including the rejected-surface list.

**No migration, no new dependency, no `@theme` key.** The `.comb-drift` keyframes and `--comb-tile` in `globals.css` were reused untouched.

**Decisions worth remembering**

- **The old comb was never 6% — it was ~12%.** `AuthBackdrop` stroked at `text-accent/6`, but adjacent hexes share every edge, so each was painted twice and composited to ~0.116. A mask paints each edge once, so a literal port at 0.06 came out washed out. Measured in-page on a canvas before picking the number: old peak pixel `rgb(20,44,29)`, mask at 0.06 `rgb(16,27,20)`, mask at 0.12 `rgb(20,40,27)`. **The component default is 0.12 and the three placements are tuned relative to that, not to the 0.06 in the old source** — which is exactly the "simplification" a future edit will reach for.
- **`mask-image`, not the spec's `background-image`.** Both avoid the SVG `<pattern>` id that made the old component single-instance-only, but a mask keeps the tint as a Tailwind class (`bg-accent`) instead of a hex baked into the URI, so the pattern still follows the design tokens. The `fade` gradient is a second mask on the wrapper element rather than `mask-composite`, whose keywords still differ across engines.
- **`encodeURIComponent` does not escape `(` or `)`**, and every cell carries a `translate()`. Safe inside the quoted `url("…")` the component emits, silently broken the moment someone unquotes it — so they are encoded explicitly, with a test pinning it. The `#` hazard the spec predicted never arose, because no colour reaches the URI at all.
- **`-z-10` on the layer plus `isolate` on the host, rather than `relative` on every sibling.** One rule for all four call sites. Without `isolate` the negative index escapes the host and the comb hides behind an ancestor's background; with it, the layer paints above the host's own background and below all of its content. `overflow-hidden` stays mandatory — the animated layer is a tile wider than its host.
- **The sidebar fades out at the *top*.** Both directions were compared live: `fade='bottom'` put texture behind the three nav labels and left the empty column bare, which is backwards. `fade='top'` keeps the nav on clean surface and fills only the dead space below it.
- **Rejected placements are written down in the spec, with reasons** — hive and alert cards (8 and 3 per viewport), `MobileNav`, `Topbar`, the inspection form, `StepSummary`, `DeleteAccountDialog`, and the email PNG. The tempting future addition is the hive cards, which is the exact "too eye-catching" failure the brief ruled out.
- **The component is imported into `Sidebar`, a `'use client'` file**, so it ships in that bundle. It holds no hooks or server-only imports, so it works in both worlds untouched.

**Verified** on a production build at 320 / 390 / 768 / 1440, against the Neon **development** branch. Auth: the drift measured seamless (`translateX(59.995px)` at 11999ms, `0` at 12000ms — matching Auth Phase 3's original measurement), the layer 780px wide inside a 720px half, `prefers-reduced-motion: reduce` still resolving to `animation: none`. Signed in: two backdrops coexisting on `/dashboard` with **zero SVG ids in the document** and no duplicate-id or console warnings, `document.scrollWidth === innerWidth` and no element past the viewport at any of the four widths, the active nav item's `border-l-accent` and `bg-accent/5` still reading over the comb, every card hairline intact. Checked with the seeded demo account and a throwaway no-apiary account for the empty state, deleted afterwards. `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (432 tests) and `next build` all green.

**Left open:** **`fade` has no two-ended variant**, so a surface wanting the pattern clear at both the top and the bottom cannot express it — the sidebar wanted this and settled for `top`. **No responsive control:** `opacity` and `tile` are single values, so the profile card carries the same 0.08 at 390px, where the card is full of text, as at 1440px where it is mostly empty; `className` can carry a responsive `opacity-*` utility if that ever matters. The `debug` prop was written but never exercised in the browser. **Running a production build on a non-3000 port needs `AUTH_TRUST_HOST=true`** or the credentials callback 500s with `UntrustedHost` — pre-existing, unrelated to this feature, but it costs a confused minute every time. Everything the previous features left open still stands: no rate limiting on `/forgot-password`, the two re-send actions or `/api/account/change-password`; the register route still has no tests; Vercel still needs `RESEND_API_KEY`, `APP_URL` and `EMAIL_VERIFICATION_ENABLED`; Resend still cannot mail anyone but the API key owner; `/analytics` and `/settings` still 404; and `events.linkAccount` is still unexercised against a live Google consent.

### Voice Panel Scroll Lock — completed 2026-08-31

Expanding the voice chat to full screen and closing it without collapsing first left the page permanently unscrollable, with a reload — and the whole inspection — as the only way out. Merged to `main` as `bbbab25` (fix commit `23ac1b0`).

**Delivered**

- `app/lib/scroll-lock.ts` — `lockBodyScroll()` returning a release, `releaseAllScrollLocks()` for unmount paths, `scrollLockDepth()` as a test seam. `scroll-lock.test.ts`, 12 tests. Suite 432 → 444.
- `app/components/inspection/VoicePanel.tsx` — the docked conversation extracted as a `Conversation` component that mounts only while `open`; it owns `expanded`, the scroll lock and the follow-the-newest-turn behaviour. `VoicePanel` keeps the launcher and the unsupported note.
- `app/components/inspection/InspectionForm.tsx` — `useEffect(() => releaseAllScrollLocks, [])`, a safety net so nothing inside the form can strand a lock on the way out.

**No schema, dependency or config change.** jsdom was already a devDependency and `vitest.config.mts` already documented the `// @vitest-environment jsdom` opt-in; this is the first suite to use it.

**Decisions worth remembering**

- **The bug was a cleanup keyed to the wrong variable.** The effect watched `expanded`, but what takes the panel off screen is `open`. `VoicePanel` stays mounted for its launcher button, so closing the conversation changed neither `expanded` nor the mounted-ness of the component — the cleanup never ran, and the chevron that would have undone it was gone with the panel. **The general shape: an effect that owns a global side effect must be keyed to whether the thing is on screen, not to a flag that merely describes it.**
- **The fix is an extraction, not the two patches the spec proposed.** Keying on `open && expanded` plus resetting `expanded` when `open` goes false needs `setState` inside an effect, which `react-hooks/set-state-in-effect` rejects — and the rule was pointing at the better answer. A component that only exists while the bar is on screen gets the release from React's own unmount cleanup and the docked-on-reopen reset for free.
- **The lock is counted, not captured.** Remember-and-restore is correct only while exactly one thing in the app locks scroll; the second locker records `'hidden'` as its "previous" and puts `'hidden'` back for good, which is this same bug with no single-component fix. The helper restores `''` outright.
- **Releases carry an epoch, and a test is what found the need.** React unmounts parent-first, so `InspectionForm`'s `releaseAllScrollLocks` runs *before* the panel's own release. Without the epoch that late release decremented the fresh count to `-1`, after which the next `lockBodyScroll()` saw a non-zero depth and never set `overflow: hidden` at all — the lock silently stops working. A release now ignores itself once the epoch has moved.
- **`window.scrollTo` works while locked, so it cannot verify any of this.** `overflow: hidden` blocks *user* scrolling only. Any check — here or in future — must use a real wheel event, the `End` key or touch. This is what makes the bug easy to dismiss from a console.
- **Exercising the panel on a desktop browser needs two steps**: stub `window.SpeechRecognition` (`isSpeechSupported()` wants it plus `speechSynthesis`), *then* force `InspectionForm` to remount, because `useSpeechIO` reads support through a `useMemo(…, [])`. `← Ule` and back into a hive does it.

**Verified** on a production build at 390×844 with real wheel and keyboard input. Untouched page: wheel → 700, `End` → 1165. Chat expanded: `overflow: hidden`, wheel → 0, `End` → 0 — the lock still does its original job. Closed while expanded: panel gone, `overflow` unset, wheel → 700, `End` → 1165, matching the untouched baseline. Reopening after that close comes back **docked** (`aria-expanded="false"`, not covering the viewport). Collapse-then-close stays clean at every step. Leaving the form with the chat open lands on the hive picker with no lock. `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (444 tests) and `next build` all green.

**Left open:** **`context/fixes/` is untracked by user decision** — both `voice-panel-scroll-lock.md` and `pdf-submit-silent-failure.md` exist on disk only, so the Notes reference above points at a file absent from a fresh checkout, the same wart `scripts/gen-demo-sql.ts` already has. One `git add context/fixes` reverses it. **The `pdf-submit-silent-failure.md` fix is written up but not implemented** — "Zapisz i pobierz PDF" still does nothing at all when the form is invalid, which remains the more damaging of the two bugs found this session. **The unmount safety net is unreachable by clicking**: stranding a lock requires navigating away while the chat is full screen, and full screen covers every navigation control by design, so it is covered by the unit suite rather than in the browser. **Form state is still not persisted**, so any reload — including the one this bug used to force — costs the entire inspection; that is the fix that would make both of this session's bugs annoying rather than catastrophic. The form also keeps its `pb-[46dvh]` while `voiceOpen`, including on the summary step where `VoicePanel` is not rendered at all; harmless padding today.

### PDF Submit Silent Failure — completed 2026-08-31

On the summary, "Zapisz i pobierz PDF" could do nothing at all: no label change, no request, no error anywhere on screen. Merged to `main` as `1a3f49b` (fix commit `96ff1b8`).

**Delivered**

- `app/components/inspection/validation.ts` — `stepOfField`, `stepsWithErrors`, `describeInvalidSteps` (the Polish "Popraw błędy w sekcji: Matka." line) and `markValidatedSteps`. `validation.test.ts`, 11 tests.
- `app/components/inspection/InspectionForm.tsx` — `handleSubmit` gained an `onInvalid` branch; the spoken walk validates before it marks; a step's mark expires when its data changes; a refused stepper navigation re-validates instead of failing silently. One `role='alert'` banner rendered outside every `Steps.Content`, beside the untouched request-failure line.
- `app/lib/voice/useInspectionDialogue.ts` — `goToStep` may return a promise and the walk awaits it, so a navigator that has to validate first can.
- `InspectionForm.test.tsx`, 7 jsdom tests — the first component suite in the project. Suite 444 → 462.
- `context/fixes/` is now tracked (both spec files), reversing the wart the previous entry left open.

**No schema, dependency or config change.** Nothing here relaxes a validation rule.

**Decisions worth remembering**

- **The stepper's guard is on the step you are *leaving*, not the one you are entering.** `isValidStepNavigation` in `@zag-js/steps` returns true for any `target <= current` and otherwise asks `isStepValid(current)`. So `isStepValid(SUMMARY_INDEX)` — the `size >= 7` count — never actually gates anything; what unlocks the summary is `validatedSteps.has(6)`, the mark on the step you press it from. The spec's reading was close but the mechanism matters for anyone changing this.
- **A refused navigation is silent, which is the same bug in a new place.** Marking honestly means the stepper starts refusing clicks it used to allow, with nothing on screen. `onStepInvalid` is what makes that safe: it re-runs `methods.trigger` for real, lets the step through and marks it if it passes, and names it if it does not. That also self-heals a mark that went stale for any reason.
- **Marks expire on edit, via `methods.subscribe`, not `methods.watch`.** `watch()` trips `react-hooks/incompatible-library` — the React Compiler refuses to memoize any component that calls it. `subscribe({ formState: { values: true } })` is the compiler-safe equivalent. Separately, `handleSubmit(onValid, onInvalid)` must be built inside the click handler, not during render, or `react-hooks/refs` errors on the ref the invalid branch touches.
- **Expiring marks on *any* edit beats the spec's `handleEdit` deletion.** The spec's smallest version misses the route it names in its own acceptance criteria: leaving the summary by the **step indicator** rather than the "Edytuj" button never runs `handleEdit`, so the mark survives and the edit is never re-checked.
- **After fixes 2 and 3, the invalid-submit branch is unreachable from the UI.** Every route to the summary now re-validates, and there are no cross-step schema rules, so a walk that passes each step's `trigger` passes the full schema. Three attempts to construct the state in a test — including a commit-timing race — were all correctly blocked. It stays as the net for whatever comes next (a future cross-step rule, a new navigation path), covered by unit tests for the message and mapping plus the four component tests that prove the same banner renders visibly.
- **A control's value reaches the form a microtask after its click — sometimes.** Ark's `RadioGroup` lands a tick late; `Checkbox` and a `register`ed textarea land synchronously. A component test that clicks a radio and then something that validates must `await` between them, or it validates stale values. This cost an hour of chasing a phantom resolver bug.
- **Role queries are the visibility assertion.** `getByRole` skips anything the accessibility tree hides, including `[hidden]` subtrees — which is exactly how the original messages were invisible. `getByText` alone would have passed on the broken build. The suite adds a `visible()` helper that re-checks for a hidden ancestor.

**Verified** `tsc --noEmit`, `eslint`, `prettier --check .`, `vitest run` (462 tests, 25 files) and `next build` all green. The jsdom suite covers: a blocked navigation naming the section and staying put; Dalej refusing the same way; an edit re-validated on the way back by the step indicator, with both the banner and "Znakowana matka musi mieć kolor" asserted visible; a corrected step passing without a second click; a full seven-step walk reaching the summary unobstructed; a valid submit showing "Generowanie…" while the request is out and going quiet after; and the request-failure message still appearing on a 502.

**Left open:** **No browser verification.** Everything above is the automated suite; the fix was not exercised on a production build against a phone, and the voice route in particular — the one that produced the reported failure — has no test at all, since `SpeechRecognition` does not exist in jsdom. **The spoken walk can now be blocked mid-conversation**: if a section's answers do not validate, the screen stays on it (with the banner naming it) while the dialogue carries on to the next section's questions. The answers still land in the form, but screen and voice are out of step until the beekeeper fixes the field. Whether that is better than the old silent laundering is a field question. **Editing a section and returning now costs the re-validation** — a real behaviour change beekeepers will notice, and the intended one. **Form state is still not persisted**, so a reload still costs the whole inspection; that remains the fix that would make this class of bug annoying rather than catastrophic. Everything the previous entries left open still stands, minus the `context/fixes/` tracking, which this one closes.

### Auth Security Review Fixes — completed 2026-09-02

Six of the seven findings from `docs/audit-results/AUTH_SECURITY_REVIEW.md`, audited the same day. Rate limiting — the seventh, and the one the report ranked highest-impact — was deliberately deferred to its own feature. Merged to `main` as `7b4318a` (`70e76f4`).

**Delivered**

- **Timing-based user enumeration closed.** `/api/auth/forgot-password` and `resendVerificationForEmailAction` both returned a deliberately uniform body but `await`ed the Resend round trip inside their `if (user)` branch, putting "this address exists" back on the wire as several hundred milliseconds of latency. Both now schedule the send with `after()` from `next/server`, so known and unknown addresses leave in the same time. The cost is that a failed send can no longer be reported on the resend path, so its `FAILED` return is unreachable and the result is unconditional.
- **Sessions are revoked when a password is written.** New `User.passwordChangedAt`, stamped by `/api/account/change-password` and `/api/auth/reset-password`; a new `pwdAt` claim records when a token was issued; the `jwt` callback returns `null` for any token older than the stamp. Migration `20260902122751_add_password_changed_at`.
- **Google linking checks `email_verified`.** A `signIn` callback in `auth.ts` returns `profile?.email_verified === true` for the Google provider.
- **`logging.serverFunctions: false`** in `next.config.ts`.
- **bcrypt cost 10 → 12**, consolidated into `app/lib/password.ts` (`BCRYPT_ROUNDS`, `hashPassword`, `needsRehash`, `isSessionRevoked`) and read by all five write paths. `authorize` re-hashes on a successful sign-in so existing accounts migrate.
- **Schema comment corrected** — `verificationToken` is not nulled on consumption, and now says so.

**Decisions worth remembering**

- **Changing your password signs you out, and that is not a bug.** A JWT carries nothing that distinguishes the session making the request from any other, so "revoke everything older than this change" necessarily includes the browser doing the changing. `ChangePasswordForm` therefore signs out deliberately and lands on `/sign-in?reset=1`, reusing the reset flow's notice; the old success banner is gone because there is no page left to show it on. Keeping the current session alive would need `SessionProvider` and a client-side `update()`, which this app does not have — it reads sessions server-side everywhere.
- **The re-hash path must never stamp `passwordChangedAt`.** Re-hashing is not a password change. Stamping it there would sign a user out of every other device on an ordinary sign-in, for a reason they could not possibly infer. There is a comment on it in `auth.ts` because it looks like an omission.
- **A null `passwordChangedAt` revokes nothing.** Every account predating the column has one, and reading null as "changed at the epoch" would sign the entire user base out on deploy. A token with no `pwdAt` counts as issued at 0, so it only starts failing once a real change happens — which is the wanted behaviour, not a leniency.
- **The revocation query is in `auth.ts` only.** `proxy.ts` builds its instance from `auth.config.ts`, which has no `jwt` callback, so the Proxy hop stays cookie-only and database-free exactly as documented there. A revoked user still passes Proxy's optimistic check and is turned away by the layout's `auth()` — one indexed lookup per `auth()` call is the price.
- **`isSessionRevoked` was extracted rather than left inline** for the reason `profile.ts` extracts its derivations: a function nested in a config object cannot be unit-tested, and its branches (no stamp, unstamped token, same-millisecond) are the ones worth pinning.
- **The audit's Passed Checks section is a "do not touch" list.** Several deliberate behaviours read as bugs at a glance — the un-cleared verification token, the register route's 409 enumeration tradeoff, `authorize` disclosing no failure reason. None were changed.

**Verified** `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (476 tests, 26 files — up from 462) and `next build` all green. New coverage: `app/lib/password.test.ts` for the cost floor, hashing, re-hash detection and every revocation branch; a `passwordChangedAt` stamping assertion on the change-password route. The test that pinned cost 10 now asserts against `BCRYPT_ROUNDS` instead of a literal, so it tracks the constant rather than needing to be remembered alongside it.

**Left open:** **Rate limiting is still absent** on every auth endpoint — credentials sign-in, register, forgot-password, resend, reset — and raising the bcrypt cost has made each unthrottled sign-in attempt roughly four times more expensive to serve. That is the next feature, spec already drafted at `context/features/rate-limiting-spec.md` (Upstash Redis), and it should not slip. **No browser verification** — everything above is the automated suite plus a production build; the sign-out-on-password-change flow in particular has not been walked by hand, and it is the one with a real UX change. **The migration is applied to the Neon development branch only**; production needs `db:deploy`. **The Google `email_verified` check has not been exercised against a real Google account** — it typechecks and the logic is trivial, but no one has signed in through it since the callback landed. **Existing sessions were not invalidated by this deploy**, by design; every cost-10 hash also stays cost-10 until its owner next signs in.

### Rate Limiting & PDF Access Gate — completed 2026-09-02

Upstash sliding-window limiters on every auth entry point, plus the two openings that surfaced while wiring them up. Merged to `main` as `d9462ab`.

**Delivered**

- `app/lib/ratelimit.ts` — six limiters, one bucket per threat surface: sign-in 5/1min, register 3/10min, resend-verify 3/10min, reset-request 3/10min, reset-submit 10/10min (all per IP), and PDF 20/hour per `userId`. Each carries its own `prefix`, `analytics: true` and its own `ephemeralCache`.
- `app/lib/ratelimit-helpers.ts` — `getIp()`, `checkRateLimit()`, `formatRetryAfter()`, `rateLimitedResponse()`, with 32 tests in `ratelimit-helpers.test.ts`.
- Gates at the top of `signInAction`, `/api/auth/register`, both resend actions, `/api/auth/forgot-password` and `/api/auth/reset-password` — before any Prisma query and before bcrypt.
- `/api/generate-pdf` now requires a session and is limited per `userId`.
- `/` routes by session, the inspection wizard moved to `/inspection`, and the dashboard topbar's "Nowy przegląd" button finally does something.
- `.env.example` documents both Upstash variables and why leaving them blank is a supported state.

**Decisions worth remembering**

- **The public root route is why the PDF endpoint was open.** `app/page.tsx` rendered the inspection wizard to anyone, so `proxy.ts` listed `/api/generate-pdf` as public and the route never checked a session — anyone who knew the path could bill the Render service. Requiring auth on the endpoint and leaving the wizard public were mutually exclusive, so the routing change is part of the security fix rather than a separate feature.
- **Both failure modes fail open, deliberately.** Missing Upstash credentials build `null` limiters instead of throwing at module load — `Redis.fromEnv()` would take down sign-in itself on any clone, CI run or deployment missing a variable — and Redis errors let the request through. Failing closed would mean an Upstash outage locks every user out of their own account: an outage in a defensive layer becoming an outage in authentication. The trade is real and worth naming — whoever can take Upstash down can also switch the limiters off. Revisit if the threat model changes.
- **`x-vercel-forwarded-for` beats `x-forwarded-for`.** The spec said take `split(',')[0]`, which is correct behind Vercel — but it is a list a client can prepend to if a proxy ever appends rather than replaces, and an identifier the caller chooses is no identifier at all. The platform header cannot be set by the caller.
- **`headers()` is async in Next 16**, so `getIp()` is async too. The spec's synchronous helper would not have compiled.
- **Reset-submit got its own bucket, beyond the spec.** Sharing the mail bucket would mean that asking for a second link — because the first never arrived — could leave a user without the budget to spend one. Locking someone out of a password reset is a support ticket, not a defence.
- **`/` is deliberately outside the proxy matcher.** It has to render for anonymous visitors in order to redirect them; listing it would hand that branch to next-auth and the page would never run. `/api/generate-pdf` is outside for the opposite reason — a `fetch()` needs a 401 it can read, not a redirect into an HTML login form.
- **`/inspection` sits outside the `(dashboard)` group.** The wizard's voice panel claims 46dvh at the bottom of the viewport, and that group's shell puts a fixed tab bar in the same space on phones.
- **A hook strips comments from newly created files**, so `app/lib/ratelimit.ts` carries none at all — out of step with the rest of this codebase. The window sizing rationale lives in this entry and in `.env.example` instead.

**Verified** `tsc --noEmit`, `eslint .`, `vitest run` (508 tests, 27 files — up from 476) and `next build` all green. Routing and the auth gate were smoke-tested against `next start` with a minted session cookie: `/` anonymous → `/sign-in`, `/` signed in → `/dashboard`, `/inspection` anonymous → `/sign-in?callbackUrl=…`, `/inspection` signed in → 200, `POST /api/generate-pdf` anonymous → 401. Note for anyone repeating that: `next start` needs `AUTH_TRUST_HOST=true` or Auth.js rejects localhost as an untrusted host and every session reads as anonymous. `next dev` does not.

**Left open:** **`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are not set in Vercel**, so production logs a startup warning and enforces nothing until they are — the one step that makes this feature real. **The R2 storage half of the spec was not built**: private bucket, signed URLs, ownership checks and the monthly `UsagePeriod` quota all depend on persisted inspections, and nothing writes `Inspection`, `PdfGenerationJob` or `UsagePeriod` yet — the PDF flow still posts a form-built payload with no `inspectionId` anywhere. The spec stays at `context/features/rate-limiting-spec.md` for that pass. **No limiter has been exercised against a real Redis** — the suite mocks Upstash, so the windows themselves are unverified end to end. **`/api/account/change-password` is still unlimited**, judged acceptable because it is session-gated and only reaches the caller's own account. **`/analytics` and `/settings` in `NAV_ITEMS` remain dead links**, pre-existing and untouched.

### Inspection Flow — Hive → Form → Database — completed 2026-09-08

The "Przegląd" button on each dashboard hive card now opens `/inspect/[hiveId]` — the existing 7-step inspection form, scoped to one real hive, drafting to localStorage and writing an `Inspection` row on submit. This is the first thing in the app that persists an inspection. Merged to `main` as `c9a3624` (feature commit `3a10e41`).

**Delivered**

- `app/inspect/[hiveId]/page.tsx` — server component: `await params`, session guard → `/sign-in`, and a `findFirst` filtered on `apiary: { userId }` that is the ownership check; unknown id and another user's hive both fall through to one `notFound()`. Loads `currentInspection`'s six JSON columns for prefill and `_count.inspections` for the default review number.
- `app/components/inspection/HiveInspection.tsx` — client half: resolves the saved draft, shows the resume prompt, then renders `InspectionForm` wired to the save action. `app/lib/use-saved-draft.ts` — `useSyncExternalStore` hook that reads the draft on mount with no hydration mismatch and no set-state-in-effect.
- `app/lib/inspection-draft.ts` (+13 tests) — `saveDraft` / `loadDraft` / `clearDraft` / `formatDraftAge`, key `hivewise:draft:<hiveId>`, 24h TTL, every access wrapped. `types/inspection-draft.ts` — `{ values: Partial<FormValues>; savedStep; savedAt }`.
- `app/components/inspection/prefill-values.ts` (+7 tests) — `buildInitialValues` (draft > last inspection > defaults) and `prefilledKeys`. `prefill.tsx` — a context + `usePrefilled(name)` + `PrefillNote`, the per-field "· z poprzedniego przeglądu" badge.
- `app/components/inspection/db-payload.ts` (+8 tests) — `buildInspectionRecord(FormValues)`: the six section objects stored as-is, plus `honeyKg` / `honeySufficiency` / `combCondition` derived through the existing `deriveComb()` with lowercase→enum maps. `submit-inspection.ts` — `'use server'` action: re-runs auth + ownership, `fullSchema.safeParse`, `$transaction` (create + `Hive.currentInspectionId`), `redirect('/dashboard?inspected=…')`.
- `InspectionForm.tsx` — additive optional props (`hiveLabel`, `backLabel`, `initialValues`, `initialStep`, `prefilledFields`, `persistKey`, `onSave`). Draft is checkpointed in `onStepChange`; the summary button becomes "Zapisz przegląd" when `onSave` is set; the prefill mark for a field is dropped in the existing `methods.subscribe` when it is edited.
- `fields.tsx` — all ten field components consult `usePrefilled` and dim + badge until touched. `StepSummary.tsx` — `mode='save'` drops the PDF copy and the weather card and shows the hive label. `HiveCard.tsx` — "Przegląd" is now `<Link href={/inspect/${hiveId}}>`. `dashboard/page.tsx` — awaits `searchParams`, renders `InspectionSavedToast` (clears the draft, strips `?inspected=` only after it closes). `proxy.ts` — `/inspect/:path*` added to the matcher.

**No migration.** Every `Inspection` column this writes has existed since `20260828141044_init`.

**Decisions worth remembering**

- **The spec was substantially stale and the codebase won every conflict.** It predates the built form: it describes a section-nested `InspectionDraft`, a "every comb frame sums to exactly 10" submit rule, `honey_stores` on `colony`, and a three-value sufficiency enum. The real form (`schema.ts`) is one flat object; comb frames are tenths with `brood + honey + pollen ≤ 10` and a separate empty/foundation remainder; `colony` carries no honey fields (a `types/inspection.ts` comment already said so); `HoneySufficiency` has four members. The draft type is therefore flat-plus-meta and hands straight to `reset()`, and validation is one `fullSchema.safeParse` rather than the spec's hand-rolled section checks.
- **The route sits outside `(dashboard)`, where the spec put it inside.** Same reason `/inspection` is outside, recorded in the Rate Limiting entry: the voice panel claims 46dvh at the bottom of the viewport and the dashboard shell puts a fixed tab bar there on phones. `proxy.ts` still guards it, and the page re-checks with `auth()`.
- **`params` is a `Promise`.** Next 16, confirmed against `node_modules/next/dist/docs`. The spec's synchronous `params: { hiveId: string }` would not compile.
- **The draft is read with `useSyncExternalStore`, not an effect.** `react-hooks/set-state-in-effect` rejects the obvious "load in `useEffect`, `setState`" shape, and a `useMemo(() => loadDraft(), [])` read (the house pattern in `useSpeechIO`) would hydrate `resume-banner` over a server-rendered `form`. The store hook's server snapshot is `null`, so the server and first client paint agree; the real draft arrives after hydration. `getSnapshot` is cached against the raw localStorage string or it loops.
- **`InspectionForm` was extended, not forked.** ~900 lines of stepper / voice / comb logic; every new behaviour is gated on a new optional prop being present, so the generic `/inspection` wizard and its 7-test `InspectionForm.test.tsx` still pass untouched. The summary's PDF path (`downloadPdf`) is still there — `onSave` just replaces the button's handler and label.
- **Scalar columns are derived through `deriveComb()`, the function the summary already previews.** One source for the honey number the beekeeper saw and the honey number stored. The lowercase domain values (`sufficient`, `good`) are mapped to the Prisma enums (`SUFFICIENT`, `GOOD`) in `db-payload.ts`.
- **`combCondition` is derived now, not hardcoded `'GOOD'`.** The load note carried the spec's placeholder forward; `deriveComb` already computes it from the worst frame wear, so there was no reason to store a lie.
- **The toast clears the draft and strips `?inspected=` — but strips it only after it has closed.** `router.replace('/dashboard')` re-renders the server component, which drops `<InspectionSavedToast>` from the tree; doing it on mount would cut the toast to a single frame.
- **Per-field prefill marking covers the six schema-driven steps, not comb.** `StepComb` is a custom frame grid, not `fields.tsx` inputs; its values are still prefilled, just not individually badged. `prefilledKeys` still lists `frames` / `slots` etc., but nothing reads `usePrefilled` for them, so those marks are inert.

**Verified:** `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (535 tests, 30 files — up from 508) and `next build` all green; `/inspect/[hiveId]` builds as `ƒ`. The three new suites cover the draft lifecycle (TTL boundary, malformed/invalid entries, genitive age strings), the `FormValues` → columns mapping (section pass-through, notes trim, frame renumber, honey/sufficiency/condition derivation), and the initial-values priority order.

**Left open:** **No browser verification.** Everything above is the automated suite and a production build — the flow has not been walked against the Neon dev branch: the ownership 404, the resume banner, the per-field badges clearing on edit, the transactional write and the dashboard toast are all unexercised by a real click. That is the first thing `/feature review` should do, ideally with a fresh inspection created through the new flow so prefill is testing this feature's own write shape rather than the gitignored seed script's. **The "Nr przeglądu" field is vestigial on the save path** — there is no such column, so it feeds only the (unused) PDF meta; it is still rendered and editable. **The generic `/inspection` wizard still uses hardcoded `BEEHIVES`** and posts to the PDF service without persisting — untouched by decision, so there are now two inspection entry points with different backends. **No rate limiting on `submitInspectionAction`** — an authenticated user can create inspection rows without bound; the spec named a limiter it never called. **`_count.inspections` adds one aggregate per page load**, fine at this size. **Prefill from a pre-existing (seed-script) inspection is unverified** — those rows may not match `fullSchema`, in which case the prefilled form would flag errors on first navigation to the affected step; the submit `safeParse` still guards the write.

### Hive Detail Page — Summary, Charts & Print — completed 2026-09-08

`/hive/[hiveId]`, reached from the "Szczegóły" button on each dashboard hive card: current state from the last inspection, a Recharts honey-trend line, the full inspection history, and a browser-print report. Merged to `main` as `93848d2` (feature commit `46b3f8f`).

**Delivered**

- `app/(dashboard)/hive/[hiveId]/page.tsx` — server component. `auth()` + `prisma.hive.findFirst({ where: { id, apiary: { userId } } })`, so an unknown id and another user's hive fall through to the same `notFound()`; signed-out redirects to `/sign-in`. One query pulls `apiary` (name/location), the full `currentInspection`, and the `inspections` history; a second reads `Subscription.tier`.
- `app/lib/hive-detail.ts` — `HIVE_TYPE_LABEL`, `deriveQueenStat`, `deriveBroodSummary`, `deriveHoneyLabel`, `formatChartDate`, `deriveHistoryQueenBadge`, `healthHasIssues`, `FREE_HISTORY_WINDOW_DAYS` / `freeHistoryCutoff`. Pure functions, `now` injected, mirroring `app/lib/dashboard.ts`; reuses that module's `deriveHiveStatus` / `deriveStrength` / `formatInspectionDate`.
- `app/components/hive/` — `HoneyChart` (client, Recharts v3, amber line, Polish axis + tooltip, `<2`-point empty states, Free limit notice), `PrintButton` (client, `window.print()`), `StatusPill`, `StatCard`, `HistoryList` (newest-first, queen + health badges, honey, notes marker, Free upgrade banner).
- `app/components/dashboard/icons.tsx` — `ChevronLeftIcon`, `PrinterIcon`. `HiveCard.tsx` — "Szczegóły" is now `<Link href={/hive/${hiveId}}>`. `Topbar.tsx` — `TopbarShell.title` widened to `ReactNode` so the back link keeps the shared bar (and its mobile sign-out). `proxy.ts` — `/hive/:path*` added to the matcher. `globals.css` — a `.print-header` (screen-hidden) plus an `@media print` block.
- `recharts@3.10.1` and `react-is@19.2.8` added to dependencies.

**No migration.** Every column read already existed.

**Decisions worth remembering**

- **The spec's JSON shapes were wrong and the step schemas won.** It assumed `brood` as four booleans (`brood_eggs` …) — the column is `brood_types: ('eggs'|'open'|'capped'|'drone')[]` with a separate `brood_pattern`. It read `health.issues_observed` — the field is `condition_observed`, and `healthHasIssues` also checks a non-empty `conditions[]`. It matched `queen_cells` against two values — the enum has four (`none|emergency|swarm|supersedure`). Strength is 0–20, so `deriveStrength` from `dashboard.ts` is reused rather than the spec's `frames_covered / 2`. `types/inspection.ts` (not the spec's `types/inspection-draft.ts`) is the type source.
- **Spec paths were all wrong for this repo** — `src/`, `@/lib/auth`, `@/lib/prisma`, root `components/`, `redirect('/login')`. Actual: no `src/`, `@/auth`, `@/app/lib/prisma`, `@/app/components/*`, `/sign-in`. Same reconciliation every feature in this log has had to make.
- **`params` is a `Promise<{ hiveId: string }>`.** Next 16, confirmed against `node_modules/next/dist/docs` and matching `app/inspect/[hiveId]/page.tsx`. The spec's synchronous `params` would not compile.
- **The route sits *inside* `(dashboard)`, unlike `/inspect` and `/inspection`.** Those are outside because their voice panel claims the bottom 46dvh where the phone tab bar sits. The detail page is ordinary scrolling content and wants the sidebar shell + the layout's `auth()` / email-verification gates, so it stays in the group. `proxy.ts` still lists it for the optimistic pre-check.
- **`TopbarShell.title` became `ReactNode`, not a new bespoke header.** A page that rolls its own bar silently loses sign-out on mobile (recorded in Auth Phase 3). The prop widening is backward compatible — a `string` still gets the truncating span; a node renders as given.
- **The chart gates on `useSyncExternalStore`, not a mount effect.** `react-hooks/set-state-in-effect` rejects the `useState(false)` + `useEffect(setState(true))` shape (same lesson as the Inspection Flow draft read). Server snapshot `false`, client `true` — first paint is a fixed-height placeholder, so no hydration mismatch and no Recharts "width(0) height(0)" warning. `isAnimationActive={false}` so the line is fully drawn in a print snapshot.
- **Print repaints by overriding the theme tokens, not by restyling every component.** `@theme inline` maps every colour utility to `var(--<token>)`, so an `@media print { :root { --surface: #fff; --foreground: #111827; … } }` block turns the whole dark page into a light document; the honey line keeps a darker amber for paper contrast. Nav chrome is hidden by element (`aside`, `header`, `nav`) since those are real semantic tags. `main` gets `overflow: visible` so the report is not clipped to one viewport.
- **`isPremium = subscription?.tier === 'PREMIUM'`** — no subscription row reads as Free (a `/api/auth/register` account has none), matching the dashboard layout. The 3-month window is applied in the Prisma `where`, so a Free account never over-fetches.

**Verified** against the Neon **development** branch in the browser (signed in as the seeded `demo@hivewise.app`, Premium): Ul 1 rendered the hero, four populated stat cards (`Widziana` / 4 dots / `jaja + otwarty + kryty` / `~5,6 kg`), a two-point amber trend line with a Polish tooltip, and a newest-first history; Ul 5 (never inspected) rendered `—` across all four cards, the muted "Brak przeglądów" pill, and both empty states. Print emulation confirmed `aside` / `header` / `nav` all `display: none`, `.print-header` shown, `body` white, `--foreground` `#111827`, and the chart SVG intact. No console errors. `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (535 tests) and `next build` all green; `/hive/[hiveId]` builds as `ƒ`.

**Left open:** **No unit tests** — `/feature test` was skipped, so `app/lib/hive-detail.ts` (the brood ordering, the Polish honey formatter, the severity-ordered queen badge, the Free cutoff) has no coverage despite being the most testable code here. **The Free-tier path was verified by reading only** — the demo account is Premium and no Free account was created, so the `chart-limit-notice` / `history-limit-banner` render and the 3-month query cutoff are unexercised by a real request. **`/settings/billing` does not exist** — both upgrade links point at it and will 404, like `/analytics` and `/settings` from the nav. **The status pill still shows on the printed report** — the spec didn't say to hide it and it reads fine on white, but it's dark-theme tinted (`bg-accent/12`). **Second query per load** for the subscription tier, alongside the hive query — same minor duplication the dashboard layout already carries. **No `generateMetadata`** — the tab title is a static "Szczegóły ula · Hivewise" rather than the hive label.
