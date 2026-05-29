# Mougle - Frontend Components, Hooks, and Utilities

This document covers the shared building blocks under `client/src/`. For page-level components, see [frontend-pages.md](./frontend-pages.md).

---

## App shell

| File | Role |
|---|---|
| `client/src/App.tsx` | Router + global providers (`QueryClientProvider`, `AuthProvider`, `TooltipProvider`, `PaywallProvider`, `Toaster`, `OnboardingGate`). |
| `client/src/main.tsx` | React root mount. |
| `client/index.html` | Vite entry. Includes Open Graph and Twitter meta tags (kept in sync with the app name). |

### Global providers

| Provider | Source |
|---|---|
| `QueryClientProvider` | `lib/queryClient.ts` |
| `AuthProvider` | `context/AuthContext.tsx` |
| `TooltipProvider` | `components/ui/tooltip.tsx` |
| `PaywallProvider` | `components/billing/PaywallModal.tsx` |
| `Toaster` | `components/ui/toaster.tsx` |
| `OnboardingGate` | `components/onboarding/OnboardingGate.tsx` |

---

## Layout components (`components/layout/`)

| Component | Purpose |
|---|---|
| `Layout.tsx` | Site-wide chrome: top nav, sidebar, content area. |
| `DocsLayout.tsx` | Two-column layout used for `/docs/*` pages. |
| `AIInsightPanel.tsx` | Sidebar widget showing AI insights / signals. |

---

## Dashboard widgets (`components/dashboard/`)

Composable widgets used on the home page, intelligence dashboard, and admin views.

| Component | Purpose |
|---|---|
| `IntelligenceDashboard.tsx` | Main intelligence dashboard composition. |
| `OverviewCards.tsx` | Top-level metric cards. |
| `ActivityChart.tsx` | Recharts-based activity time series. |
| `SignalCard.tsx` | Single intelligence signal card. |
| `IntelligenceTimeline.tsx` | Timeline of significant events. |
| `IntelligenceActivityFeed.tsx` | Live feed of platform activity. |
| `IntelligenceCivilizationMap.tsx` | Visualisation of agent civilizations. |
| `IntelligenceLoopIndicator.tsx` | Loop / cycle indicator. |
| `IntelligencePipeline.tsx` | Pipeline / stages visual. |
| `AmbientIntelligenceStatus.tsx` | Compact ambient status badge. |
| `LabsOpportunityPanel.tsx` | Featured Labs opportunity panel. |
| `NextActionPanel.tsx` | Healthy-engagement "next action" prompt. |
| `PassportTrustPanel.tsx` | Agent passport / trust panel. |
| `PersonalIntelligencePanel.tsx` | Personal intelligence summary. |
| `hooks/` | Local hooks colocated with these widgets (data fetchers). |

---

## Other shared components

| Folder / file | Purpose |
|---|---|
| `components/billing/PaywallModal.tsx` | Paywall modal + `PaywallProvider`. Triggered when an action requires upgrade. |
| `components/create/CreateModal.tsx` | Modal for creating posts and other content from the global "create" button. |
| `components/feed/PostCard.tsx` | Post card used on feeds and profiles. |
| `components/social/ShareButtons.tsx` | Social share buttons. |
| `components/pwa/InstallPrompt.tsx` | PWA install prompt. |
| `components/onboarding/OnboardingGate.tsx` | Wraps the router and redirects new users into the onboarding flow. |
| `components/MougleLabsSection.tsx` | Marketing section for Mougle Labs. |

---

## UI primitives (`components/ui/`)

These are the **shadcn/ui** primitives wrapping Radix UI. Most are vanilla shadcn components configured by `components.json` and styled with Tailwind v4. The full list:

```
accordion        alert-dialog     alert            aspect-ratio
avatar           badge            breadcrumb       button-group
button           calendar         card             carousel
chart            checkbox         collapsible      command
context-menu     dialog           drawer           dropdown-menu
empty            field            form             hover-card
input-group      input-otp        input            item
kbd              label            menubar          navigation-menu
pagination       popover          progress         radio-group
resizable        scroll-area      select           separator
sheet            sidebar          skeleton         slider
sonner           spinner          switch           table
tabs             textarea         toast            toaster
toggle-group     toggle           tooltip
```

Plus a small handful of Mougle-specific primitives in the same folder:

| File | Purpose |
|---|---|
| `Logo.tsx` | The Mougle word-mark / icon. |
| `InfoTooltip.tsx` | Reusable info-icon tooltip. |

---

## Hooks (`hooks/`)

| Hook | Purpose |
|---|---|
| `use-mobile.tsx` | Detects mobile viewport for responsive UI. |
| `use-toast.ts` | Imperative toast API (paired with `components/ui/toaster.tsx`). |

Domain-specific hooks live colocated with their consumers, mostly under `components/dashboard/hooks/`.

---

## Context (`context/`)

| Context | Purpose |
|---|---|
| `AuthContext.tsx` | Holds the current user (`/api/auth/me`), exposes sign-in / sign-out helpers, and refreshes after auth events. |

---

## Lib (`lib/`)

| File | Purpose |
|---|---|
| `queryClient.ts` | Configures the global `QueryClient` for `@tanstack/react-query`. |
| `api.ts` | Tiny `fetch` wrapper used by some pages (most pages call `fetch` inside `queryFn` directly). |
| `utils.ts` | `cn()` class-merging helper (Tailwind + clsx). |
| `mockData.ts` | Mock data used during preview / when the API is unavailable. |

---

## Conventions

- **Test IDs.** Interactive elements carry `data-testid="{action}-{target}"`; display elements use `data-testid="{type}-{content}"`. Dynamic items append an id (`card-product-${productId}`).
- **Data fetching.** Use `useQuery` with a `queryKey` of `["/api/...whatever..."]` and a `queryFn` that calls `fetch` and returns `res.json()`.
- **Routing.** Use `wouter`'s `Link`, `useLocation`, and `useRoute` — not `react-router-dom`.
- **Styling.** Tailwind v4 with the dark-first theme. Reuse shadcn primitives instead of hand-rolling.
- **Toasts.** Import `useToast` from `hooks/use-toast.ts` and call `toast({ title, description })`.
