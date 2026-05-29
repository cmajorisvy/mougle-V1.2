# Mougle Admin Dashboard Redesign Report

## 1. Files Changed

- `client/src/pages/admin/AdminDashboard.tsx`
- `client/src/App.tsx`
- `docs/architecture/MOUGLE_ADMIN_DASHBOARD_REDESIGN_REPORT.md`

## 2. Old Dashboard Problems Found

The previous `/admin/dashboard` mixed too many jobs into one screen:

- A long tab list combined overview, users, posts, topics, debates, agents, flywheel, social, promotion, growth, SEO, authority, gravity, civilization, trust, teams, stability, autonomous controls, and systems.
- Several widgets had unclear operational purpose for a root-admin deciding what needs attention now.
- Some sections exposed old or low-value prototype surfaces beside current Phase 35/36/36C readiness work.
- The dashboard linked to sparse or confusing routes such as `/admin/users` and `/admin/billing`.
- Media, marketplace, Gluon, and autonomous-looking concepts were not visually separated enough from live operational systems.
- The visual hierarchy started with broad statistics instead of safety, pending decisions, test health, and active risks.
- Dangerous or future capabilities were visually close to ordinary navigation, making readiness boundaries harder to scan.

## 3. New Dashboard Structure

The redesigned dashboard is now a clean founder/root command center.

Primary structure:

1. Command Overview
   - Readiness label
   - Manual approval and dry-run status
   - Release caution card
   - User, agent, safe-mode, E2E, civilization, graph, council, and credits summaries
   - Manual review and risk queue
   - Founder command shortcuts

2. Safety & Governance
   - Safe Mode
   - Council Governance
   - Risk Center
   - Policy Governance
   - Compliance

3. Agents & Civilization
   - System Agents
   - External Agents
   - Civilization Health
   - AI Cost Monitor
   - Agent Cost Analytics

4. Knowledge & Truth
   - Knowledge Graph
   - Knowledge Economy
   - Truth Alignment
   - Knowledge Alignment

5. Media & Content Pipeline
   - News to Debate
   - Podcast Scripts
   - Voice Jobs
   - Video Render
   - YouTube Publishing
   - Social Distribution
   - Live Studio

6. Marketplace & Economy
   - Marketplace Clones
   - Revenue Analytics
   - Revenue Flywheel
   - AI CFO

7. Operations
   - Support
   - Staff Permissions
   - Operations Center
   - Founder Workday
   - Build Queue
   - Marketing
   - SEO

## 4. UI/UX Improvements Made

- Replaced the crowded tabbed prototype with a scannable command-center layout.
- Added a sticky grouped side navigation for desktop.
- Added consistent cards, spacing, icon treatment, and status badges.
- Added explicit status badges:
  - Live
  - Dry run
  - Manual approval required
  - Disabled
  - Needs attention
  - Admin only
  - Root only
- Moved critical attention items above deep analytics.
- Added a manual review queue for safe mode, E2E health, media approval, marketplace sandbox, Gluon safety, and council governance.
- Added tooltips for safe mode, council governance, external agents, knowledge graph, knowledge economy/Gluon, and marketplace safe-clone boundaries.
- Added bottom learning blocks:
  - How to use this
  - What this means
  - What cannot happen from this screen
- Made the dashboard copy match current admin-beta readiness instead of implying production automation.
- Removed direct inline user/post/topic/debate mutation panels from the main dashboard; deep admin surfaces remain accessible through appropriate pages.

## 5. Routes Hidden, Removed, or Redirected

No backend route, table, service, or model was removed.

Frontend route handling changed:

- `/admin/users` now redirects to `/admin/dashboard`.
- `/admin/billing` now redirects to `/admin/revenue`.

Reason:

- Existing Playwright artifacts identified these as sparse primary admin pages.
- User operations and billing/revenue are still reachable through better current surfaces:
  - `/admin/staff`
  - `/admin/support`
  - `/admin/revenue`
  - `/admin/flywheel`
  - `/admin/ai-cfo`

## 6. Safety Constraints Preserved

Preserved:

- Existing admin/root-admin access checks through `useAdminAuth`.
- Staff redirection to `/staff/dashboard` when the actor is not root/main admin.
- Existing backend services, routes, tables, and schemas.
- Existing media publishing gates.
- Existing safe mode controls.
- Existing Council Governance read-only/dry-run framing.
- Existing Gluon boundary as contribution identity, not money.
- Existing marketplace safe-clone sandbox boundary.
- Existing provider non-disclosure and no-provider-call posture.
- Existing private memory separation.

Not added:

- No autonomous publishing.
- No provider calls.
- No worker or queue execution.
- No schema changes.
- No `db:push`.
- No payout, cashout, checkout, or marketplace deployment.
- No public exposure of admin-only information.

## 7. Commands Run

```bash
git status --short
find docs -type f -name '*.md' | sort
rg --files client/src | rg 'admin|Admin|Dashboard|Nav|Sidebar|Layout|App\.tsx'
rg -n "Admin|admin|dashboard|Dashboard|safe mode|Safe Mode|governance|Council|Gluon|knowledge graph|Knowledge|marketplace|Marketplace|E2E|Playwright|manual|approval|publishing|provider|memory" docs
npm run check
curl -fsSL -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5001/admin/dashboard
HOST=127.0.0.1 PORT=5001 npm run dev
HOST=127.0.0.1 PORT=5001 NODE_ENV=development node --import tsx server/index.ts
HOST=127.0.0.1 PORT=5001 NODE_ENV=development node --import dotenv/config --import tsx server/index.ts
node --import tsx script/council-policy-check.ts --json
git diff --check
npm run build
```

Validation status:

- `npm run check`: passed.
- `git diff --check`: passed.
- `node --import tsx script/council-policy-check.ts --json`: passed.
- `npm run build`: passed with the existing large bundle/chunk warning.
- Local server probe: failed because the dev server was not running on `127.0.0.1:5001`.
- `npm run dev`: blocked by the local `tsx` IPC pipe permission issue in this sandbox before the Mougle server booted.
- Direct `node --import tsx`: reached Mougle code but required normal runtime database environment.
- Direct `node --import dotenv/config --import tsx`: loaded runtime configuration silently, but database hostname resolution failed in this sandbox and the server bind to `127.0.0.1:5001` was blocked with `EPERM`.

## 8. Validation and Polish Pass Results

### Visual Inspection Result

Live visual inspection could not be completed in this environment because the local dev server could not bind to `127.0.0.1:5001`.

Code-level UI polish completed during this pass:

- Fixed a nested interactive element issue in dashboard link cards. Tooltips are no longer rendered inside a parent button.
- Kept the dashboard layout as a single founder command center rather than redesigning it again.
- Rechecked status wording for provider, publishing, marketplace, Gluon, checkout, payout, and autonomous-action claims.

### Routes Intended for Visual Check

These routes remain the requested manual/browser validation set once the dev server is running:

| Route | Validation status |
|---|---|
| `/admin/dashboard` | Blocked by local server bind failure |
| `/admin/revenue` | Blocked by local server bind failure |
| `/admin/staff` | Blocked by local server bind failure |
| `/admin/support` | Blocked by local server bind failure |
| `/admin/council-governance` | Blocked by local server bind failure |
| `/admin/safe-mode` | Blocked by local server bind failure |
| `/admin/knowledge-graph` | Blocked by local server bind failure |
| `/admin/marketplace-clones` | Blocked by local server bind failure |

### Redirect Result

Redirects are implemented in `client/src/App.tsx`:

| Source route | Redirect target | Status |
|---|---|---|
| `/admin/users` | `/admin/dashboard` | Implemented; browser verification blocked until server runs |
| `/admin/billing` | `/admin/revenue` | Implemented; browser verification blocked until server runs |

### Playwright/Admin Smoke Result

A focused non-destructive Playwright smoke spec was added:

- `tests/e2e/admin-dashboard-command-center.spec.ts`

The spec verifies:

- `/admin/dashboard` renders for the saved admin storage state.
- The `Founder Command Center` heading is visible.
- The main command-center zones are visible:
  - Command Overview
  - Safety & Governance
  - Agents & Civilization
  - Knowledge & Truth
  - Media & Content Pipeline
  - Marketplace & Economy
  - Operations
- `Manual approval required` and `Dry run` badges are visible.
- The bottom safety learning block is visible.
- `/admin/users` redirects to `/admin/dashboard`.
- `/admin/billing` redirects to `/admin/revenue`.

The spec was not executed because the app server could not start or bind in this sandbox. Once the server is running locally, run:

```bash
npm run e2e -- tests/e2e/admin-dashboard-command-center.spec.ts --workers=1 --headed
```

### Screenshots and Artifacts

No new screenshots were generated because Playwright could not run without the local server.

When the smoke test runs successfully, it will write:

- `output/playwright/admin-dashboard-redesign-5001/admin-dashboard-command-center.png`

### Remaining UI Issues

- Live visual inspection is still required on desktop and mobile widths.
- The focused smoke spec should be run from a local terminal where `127.0.0.1:5001` can bind.
- If the dashboard feels too tall after visual review, the next polish pass should collapse lower-priority zone groups instead of adding more cards.

### Final Recommendation

Proceed with local visual validation from the user terminal, then run the new focused Playwright smoke spec. If those pass, this dashboard redesign is ready for review as a clean admin command-center phase.

## 9. Remaining Risks

- The dashboard should still be visually reviewed in Chrome after the local dev server is started.
- The existing worktree contains unrelated dirty files that should stay out of this dashboard phase.
- `/admin/users` is now hidden/redirected from primary navigation, but a future real user-ops page may still be useful.
- `/admin/billing` is redirected to revenue analytics, but a future billing-ops page may be useful if it is scoped and not confused with Gluon.
- Some deep admin pages may still need their own cleanup, but they were intentionally not redesigned in this phase.
- Fresh Playwright visual testing is still blocked until the local server is active.

## 10. Recommended Next Improvements

1. Start the local server and visually inspect `/admin/dashboard`.
2. Run the Chrome local smoke/sweep Playwright tests.
3. Create a dedicated `/admin/user-ops` page if direct user operations are still needed.
4. Create a dedicated `/admin/billing-ops` page if billing support needs a clearer home.
5. Add a tiny admin dashboard smoke test once the server/auth state is stable.
6. Continue cleaning deep admin pages one zone at a time:
   - Safety
   - Agents
   - Knowledge
   - Media
   - Marketplace
   - Operations
7. Keep tooltips and bottom learning blocks mandatory for complex admin concepts.
