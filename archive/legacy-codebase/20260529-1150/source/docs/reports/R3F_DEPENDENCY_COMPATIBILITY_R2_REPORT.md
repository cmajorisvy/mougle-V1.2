# R2 — R3F Dependency Compatibility & Install Plan

**Date:** 2026-05-22
**Status:** **PLAN-ONLY — no install performed in this task.** Awaiting explicit founder approval to run the install command in §6.
**Predecessor:** [R1 design](./R3F_WEBGL_UNITY_PRODUCTION_HOUSE_INTEGRATION_R1_DESIGN.md) §1, §13.A.2
**Scope hard-rules honored:** no 3D UI built, no route added, no schema added, no rendering enabled, no source code modified.

---

## 1. Current project baseline (verified live at R2 execution time)

| Dep | Installed version | Source |
|---|---|---|
| `react` | **19.2.3** | `node_modules/react/package.json` (semver `^19.2.0`) |
| `react-dom` | **19.2.3** | `node_modules/react-dom/package.json` (semver `^19.2.0`) |
| `vite` | **7.3.1** | semver `^7.1.9` |
| `typescript` | **5.6.3** | exact pin |
| `three` | **`^0.183.0`** (already installed in R1 baseline) | top-level dep |
| `@react-three/*` | **none installed** | greenfield |
| `package-lock.json` size | **12 973 lines** (pre-install baseline) | `wc -l` |
| `npm audit` baseline | **50 vulnerabilities** (0 critical · 10 high · 14 moderate · 1 low) | pre-existing; NOT caused by R3F |
| `tsc --noEmit` baseline | **4 pre-existing errors** in `server/services/production-house-service.ts` (lines 4333, 4648, 4649, 8316 — `unrealSceneManifest` property + production preview type mismatch) | unrelated to R3F |

> The 4 pre-existing TS errors and the 50 pre-existing npm-audit findings are documented here as the **baseline**. R2 must add **zero** to either count.

---

## 2. Exact package versions selected

| Package | Selected version | Channel | Role |
|---|---|---|---|
| `@react-three/fiber` | **`9.6.1`** (`^9`) | dependencies | R3F runtime — React 19 renderer for three.js |
| `@react-three/drei` | **`10.7.7`** (`^10`) | dependencies | Helper-component allow-list (R1 §13.A.2) |
| `@react-three/test-renderer` | **`9.1.0`** (`^9`) | **devDependencies** | Unit-test renderer (R1 §9, §13.A.2) |

Available v9 line of fiber confirmed: 9.0.3 → 9.0.4 → 9.1.0 → … → **9.6.1 (latest)**.
Available v9 line of test-renderer: 9.0.0-rc.* → 9.0.0 → 9.0.1 → 9.1.0 (latest).

**Rationale for choosing latest in each line:** all three are actively maintained, the v9 line is stable (16 releases of fiber, 4 stable releases of test-renderer), and the breaking-change boundary is the v8→v9 React-19 migration we are explicitly opting into. No reason to pin to an older 9.x.

---

## 3. Peer-dependency check

### 3.1 `@react-three/fiber@9.6.1`
```json
"peerDependencies": {
  "react":      ">=19 <19.3",  // ✅ have 19.2.3
  "react-dom":  ">=19 <19.3",  // ✅ have 19.2.3 (optional peer)
  "three":      ">=0.156",     // ✅ have ^0.183.0
  "react-native":   ">=0.78",  // optional peer — not used
  "expo":           ">=43.0",  // optional peer — not used
  "expo-asset":     ">=8.4",   // optional peer — not used
  "expo-file-system": ">=11.0",// optional peer — not used
  "expo-gl":        ">=11.0"   // optional peer — not used
}
```
Optional peers (verified via `peerDependenciesMeta`): `react-dom`, `react-native`, `expo`, `expo-asset`, `expo-file-system`, `expo-gl`. **Result: zero peer-dep warnings expected.**

### 3.2 `@react-three/drei@10.7.7`
```json
"peerDependencies": {
  "react":              "^19",        // ✅
  "react-dom":          "^19",        // ✅ (optional)
  "three":              ">=0.159",    // ✅ (we have 0.183)
  "@react-three/fiber": "^9.0.0"      // ✅ (we will install 9.6.1)
}
```
Optional peer: `react-dom`. **Result: zero peer-dep warnings expected.**

### 3.3 `@react-three/test-renderer@9.1.0`
```json
"peerDependencies": {
  "react":              "^19.0.0",   // ✅
  "three":              ">=0.156",   // ✅
  "@react-three/fiber": ">=9.0.0"    // ✅
}
```
No optional peers, no react-dom requirement (it's a non-DOM renderer). **Result: zero peer-dep warnings expected.**

### 3.4 Existing `react` upper-bound check
- R3F caps React at `<19.3`. Our `package.json` declares `"react": "^19.2.0"` which permits 19.x but not 20.x. If React minor-bumps to 19.3 in the future, **R3F 9.6.1 will refuse to install** (or warn). Mitigation: monitor R3F release notes; v9 has been tracking React 19 minor bumps within ~2 weeks historically.
- **Action required of R2 review:** none — current React is 19.2.3, well within the `<19.3` cap.

---

## 4. Transitive-dependency profile

### 4.1 `@react-three/fiber@9.6.1` direct deps (10)
`@babel/runtime`, `@types/webxr`, `base64-js`, `buffer`, `its-fine`, `react-use-measure`, `scheduler`, `suspend-react`, `use-sync-external-store`, `zustand`. **All are tiny utility libs already common in React ecosystems.** `scheduler` and `use-sync-external-store` will likely dedupe against React's existing tree.

### 4.2 `@react-three/drei@10.7.7` direct deps (21)
`@babel/runtime`, `@mediapipe/tasks-vision`, `@monogrid/gainmap-js`, `@use-gesture/react`, `camera-controls`, `cross-env`, `detect-gpu`, `glsl-noise`, `hls.js`, `maath`, `meshline`, `stats-gl`, `stats.js`, `suspend-react`, `three-mesh-bvh`, `three-stdlib`, `troika-three-text`, `tunnel-rat`, `use-sync-external-store`, `utility-types`, `zustand`.

**Bundle-impact notes (per R1 §13.A.2 scope guardrail):**
- Drei ships per-export ESM and **tree-shakes well** with Vite 7. The R1 §13.A.2 allow-list (9 imports: `useGLTF`, `useTexture`, `useEnvironment`, `useAnimations`, `useVideoTexture`, `<Instances>`, `<PerformanceMonitor/>`, `<AdaptiveDpr/>`, `<Html/>`) **pulls only a subset of these transitive deps into the client bundle.** Specifically:
  - `useGLTF` / `useTexture` / `useEnvironment` → pulls `three-stdlib` (GLTF/EXR/HDR loaders).
  - `useVideoTexture` → no extra heavy dep.
  - `<Instances>` → no extra heavy dep.
  - `<PerformanceMonitor/>` + `<AdaptiveDpr/>` → no extra heavy dep.
  - `<Html/>` → small DOM-portal helper.
- Heavy deps NOT pulled by the allow-list (kept out of client bundle): `@mediapipe/tasks-vision` (~7 MB), `hls.js` (~250 KB), `camera-controls`, `troika-three-text`, `three-mesh-bvh`, `stats-gl`, `stats.js`, `detect-gpu`, `@monogrid/gainmap-js`, `meshline`, `maath`.
- `cross-env` is drei's DEV dep and shouldn't reach the production bundle.
- R10's "drei surface audit" subsection (mandated by R1 §13.A.2) will produce the exact post-build measurement via `vite-bundle-visualizer`.

### 4.3 `@react-three/test-renderer@9.1.0`
**Zero declared runtime dependencies.** Pulls only peer-resolved fiber + three. DevDependency, so zero production-bundle impact.

### 4.4 dedup expectations
- `scheduler`, `use-sync-external-store`, `@babel/runtime`, `zustand`, `suspend-react` already exist (or will dedupe) in `node_modules`. Lockfile growth will reflect only genuinely new packages.

---

## 5. Package-lock delta (estimated; exact figure measured at install)

**Sandbox restriction:** `npm install --dry-run` is blocked in this environment (packager tool only). The dry-run cannot be executed without performing the actual install. The following is the **estimated** delta based on `npm view` metadata; the **exact** delta will be captured in §10 once the install runs.

| Metric | Pre-install baseline | Estimated post-install | Delta |
|---|---|---|---|
| `package-lock.json` lines | 12 973 | ~13 250 – 13 600 | +280 – +630 |
| Top-level packages in lock | (current count) | +3 declared (fiber, drei, test-renderer) | +3 |
| New transitive packages | — | ~25–35 newly added after dedup | +25 – +35 |
| Production-bundle deps adding | — | fiber (10) + drei (21) ≈ 31 direct, ~20–25 net new after dedup | — |
| Dev-only deps adding | — | test-renderer (0 transitive) | +1 net |

**Why "estimated":** the only way to get an exact number without `--dry-run` is to install. The R2 deliverable is the report + plan; the install is gated.

---

## 6. Install command (frozen — runs ONLY on explicit founder approval)

```bash
# Runtime deps:
npm install @react-three/fiber@^9 @react-three/drei@^10
# Dev dep:
npm install -D @react-three/test-renderer@^9
```

Or as a single combined run (preferred — single lockfile mutation):
```bash
npm install @react-three/fiber@^9 @react-three/drei@^10 \
  && npm install -D @react-three/test-renderer@^9
```

In the Replit sandbox this must be executed via the `packager_tool`, language=`nodejs`:
```
packager_tool(install: [
  "@react-three/fiber@^9",
  "@react-three/drei@^10",
  "@react-three/test-renderer@^9"   // dev dep — package.json will need manual fix-up
])
```
*(Note: the Replit packager installs as runtime dep by default. After install, manually move `@react-three/test-renderer` from `dependencies` to `devDependencies` in `package.json` and re-run `npm install --package-lock-only` to refresh the lockfile.)*

---

## 7. Build / typecheck implications

### 7.1 Pre-install baseline (recorded above in §1)
- `tsc --noEmit`: 4 pre-existing errors in `server/services/production-house-service.ts` (`unrealSceneManifest` + production preview type mismatch). **NOT touched by R2.**
- `npm audit`: 50 findings (0 critical, 10 high, 14 moderate, 1 low). **NOT touched by R2.**

### 7.2 Post-install expectations
- **TypeScript:** R3F v9 ships first-party `.d.ts`; drei ships `.d.ts`; test-renderer ships `.d.ts`. No `@types/*` companion packages needed. Expect `tsc --noEmit` to remain at the same 4 pre-existing errors and no new R3F-attributable errors (because R2 introduces ZERO source-file imports of these packages).
- **Vite build:** these packages register no Vite plugin and require no `vite.config.ts` change. The existing `@vitejs/plugin-react` config is sufficient. Build output will be unchanged in R2 because nothing imports them yet.
- **Test runner:** test-renderer needs no jsdom WebGL polyfill (it's a non-DOM renderer). Per R1 §12.7 — confirmed.
- **HMR:** unchanged.
- **ESM/CJS:** all three packages are ESM-first with CJS fallback. Vite 7 + `moduleResolution: bundler` handles both.

### 7.3 Acceptance bar
After install (when authorized), R2 verification MUST confirm:
- [ ] `tsc --noEmit` shows **exactly the same 4 pre-existing errors** — no R3F-introduced TS errors.
- [ ] `npm audit` total ≤ baseline + small delta with **zero new critical or high** findings attributable to R3F's transitive tree.
- [ ] `npm run build` (Vite production build) succeeds.
- [ ] `npm run dev` workflow restarts cleanly (Start application).
- [ ] Lockfile delta ≤ +700 lines and ≤ +35 net packages (envelope from §5).
- [ ] No runtime behavior change (no R3F module is imported by any source file in R2).

---

## 8. npm audit delta plan

| Check | Action |
|---|---|
| Capture pre-install audit | `npm audit --json > /tmp/audit-pre.json` (run pre-install) |
| Run install | per §6 |
| Capture post-install audit | `npm audit --json > /tmp/audit-post.json` |
| Diff | Document `total / critical / high / moderate / low` deltas |
| Acceptance | **Zero new critical, zero new high.** If R3F's transitive tree introduces a high or critical, R2 must investigate before mark-complete; consider pinning a transitive override or escalating to founder. |

Known-quiet expectation: R3F v9's direct deps are well-maintained mainstream packages (`zustand`, `scheduler`, `react-use-measure`, etc.). Drei's heavier deps (`@mediapipe/tasks-vision`, `hls.js`) historically appear in `npm audit` with low/moderate findings; allow-listed imports keep them out of the production bundle but they may still register in the audit. R10 will revisit during the drei surface audit.

---

## 9. Rollback command

If install causes any regression (peer warning, new high/critical audit, TS error, build failure), roll back with:

```bash
# Single combined rollback (recommended):
npm uninstall @react-three/fiber @react-three/drei @react-three/test-renderer

# Then re-confirm cleanliness:
git --no-optional-locks diff -- package.json package-lock.json
npx tsc --noEmit
npm audit --json | python3 -c "import json,sys; m=json.load(sys.stdin)['metadata']['vulnerabilities']; print(m)"
```

Or via Replit packager:
```
packager_tool(uninstall: [
  "@react-three/fiber",
  "@react-three/drei",
  "@react-three/test-renderer"
])
```

Or — if a commit has already been made — via git checkout:
```bash
git --no-optional-locks log --oneline -- package.json package-lock.json
git checkout <pre-r2-install-commit> -- package.json package-lock.json
npm install   # rebuild node_modules from restored lockfile
```

**Worst-case nuclear rollback:** `rm -rf node_modules package-lock.json && git checkout HEAD -- package.json package-lock.json && npm install` — restores the pre-R2 state byte-for-byte.

---

## 10. Post-install verification template (to fill in after authorized install)

> This section is intentionally blank in the R2-plan version. It MUST be completed in the R2-install task before mark-complete.

```
### 10.1 package-lock.json delta
- Pre-install lines:  12 973
- Post-install lines: _____
- Delta lines:        _____
- New top-level deps: @react-three/fiber@____, @react-three/drei@____, @react-three/test-renderer@____ (dev)
- New transitive packages: _____ (list)
- Dedup hits: _____

### 10.2 npm audit delta
- Pre:  total=50  critical=0  high=10  moderate=14  low=1  info=0
- Post: total=___ critical=__ high=__  moderate=__  low=__ info=__
- New advisories attributable to R3F tree: _____
- Acceptance (zero new critical, zero new high): PASS / FAIL

### 10.3 typecheck delta
- Pre:  4 pre-existing errors (production-house-service.ts:4333,4648,4649,8316)
- Post: _____ errors
- New R3F-attributable errors: _____
- Acceptance (no new errors): PASS / FAIL

### 10.4 build delta
- npm run build exit code: _____
- New warnings: _____
- Acceptance (clean build): PASS / FAIL

### 10.5 workflow restart
- Start application restart: clean? _____
- Acceptance: PASS / FAIL

### 10.6 source-file import check
- rg -l '@react-three/' client/ server/ shared/  →  expected ZERO matches in R2 (no source uses it yet)
- Acceptance: PASS / FAIL
```

---

## 11. Risks (R2-specific)

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 11.1 | drei transitive `@mediapipe/tasks-vision` (~7 MB unpacked) increases `node_modules` footprint | LOW | Not in client bundle (not in §13.A.2 allow-list); only affects dev install time |
| 11.2 | drei transitive `hls.js` may trigger npm-audit moderate finding | LOW–MEDIUM | Acceptable if not critical/high; document in §10.2 |
| 11.3 | R3F v9 peer-cap `react <19.3` blocks a future React minor bump | LOW | Track R3F releases; v9 historically updates within ~2 weeks |
| 11.4 | Lockfile churn from `npm install` adding ~25–35 packages may confuse merge-time review | LOW | Single combined install per §6; one focused commit |
| 11.5 | `@react-three/test-renderer` installed as runtime dep then moved to devDeps causes a brief lockfile re-resolve | LOW | Documented procedure in §6 |
| 11.6 | New `npm audit` high/critical attributable to R3F tree | MEDIUM (unlikely) | Investigate before mark-complete; consider `overrides` block in package.json or escalate |
| 11.7 | Three.js DOM/WebGL polyfill issues in test environment | LOW | test-renderer is non-DOM (verified); jsdom not required |
| 11.8 | Hidden peer-dep on `react-dom` (optional but recommended) | LOW | We have react-dom 19.2.3 — satisfied |

---

## 12. Confirmation — no runtime feature behavior changed

| File | Δ |
|---|---|
| `docs/reports/R3F_DEPENDENCY_COMPATIBILITY_R2_REPORT.md` | **created** — this report |

**Zero packages installed in R2-plan.**
**Zero source files modified.**
**Zero `package.json` / `package-lock.json` modifications.**
**Zero routes added.**
**Zero schemas added.**
**Zero rendering enabled.**
**Zero R3F module imported anywhere in `client/`, `server/`, `shared/`, `tests/`.**
**`Start application` workflow not restarted** (no code change requires it).

Founder Panic Button, Safe-mode flags, all 14 R1 §7 safety constraints — all untouched.

---

## 13. Summary & gate

| Item | Value |
|---|---|
| **Exact versions selected** | `@react-three/fiber@9.6.1` (range `^9`), `@react-three/drei@10.7.7` (range `^10`), `@react-three/test-renderer@9.1.0` (range `^9`, devDep) |
| **Peer-dep status** | ✅ All required peers satisfied (react 19.2.3, react-dom 19.2.3, three 0.183, fiber 9.x will be present). All optional peers (react-native / expo*) skipped — not applicable. |
| **Lockfile delta estimate** | +280 – +630 lines, +25 – +35 net packages |
| **npm audit baseline** | 50 findings (0 critical · 10 high · 14 moderate · 1 low). R2 target: zero new critical or high. |
| **tsc baseline** | 4 pre-existing errors in production-house-service.ts. R2 target: zero new errors. |
| **Install command** | See §6 (combined single install run) |
| **Rollback command** | See §9 |
| **Runtime behavior change in R2-plan** | None |
| **Status** | **AWAITING EXPLICIT FOUNDER APPROVAL to run the §6 install command.** Once approved, a follow-up R2-install task will execute §6, fill in §10, and confirm zero regressions before mark-complete. |

---

### Ask: do you authorize the §6 install now?
- **Yes → install:** I'll run `packager_tool` with the three packages, manually fix-up `@react-three/test-renderer` to `devDependencies`, capture §10 verification, and report back.
- **No / not yet:** R2-plan stands as the locked install spec; nothing is installed until you say go.
