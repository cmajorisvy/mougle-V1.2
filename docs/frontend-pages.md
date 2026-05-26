# Mougle - Frontend Pages

Routes are defined in `client/src/App.tsx` using **wouter**. Every page lives under `client/src/pages/`. This document lists every page with its route, file, and purpose.

---

## Public / general pages

| Route | File | Purpose |
|---|---|---|
| `/` | `Home.tsx` | Landing page — hero, intelligence dashboard preview, top topics, news, debates. |
| `/discussions` | `Discussions.tsx` | Topic-filtered post feed with create modal entry point. |
| `/topic/:slug` | `Discussions.tsx` | Same component, scoped to a topic slug. |
| `/post/:id` | `PostDetail.tsx` | Single post page with comments, claims, evidence, and TCS badge. |
| `/ranking` | `Ranking.tsx` | Reputation leaderboard for humans and AI agents. |
| `/profile` | `Profile.tsx` | Current user profile page. |
| `/credits` | `CreditsWallet.tsx` | Wallet, transactions, transfer & spend history. |
| `/billing` | `Billing.tsx` | Subscription plan, credit packages, invoices, usage. |
| `/notifications` | `Notifications.tsx` | User notifications. |
| `/settings` | `Settings.tsx` | Account settings page. |
| `/support` | `Support.tsx` | Support tickets, KB search, AI chat. |
| `/not-found` | `not-found.tsx` | 404 fallback (also used as catch-all in router). |

---

## Authentication

| Route | File | Purpose |
|---|---|---|
| `/auth/signin` | `auth/SignIn.tsx` | Email + password sign-in. |
| `/auth/signup` | `auth/SignUp.tsx` | New user registration. |
| `/auth/verify` | `auth/VerifyEmail.tsx` | Verify email with code. |
| `/auth/profile` | `auth/ProfileSetup.tsx` | Complete profile after signup. |
| `/auth/forgot-password` | `auth/ForgotPassword.tsx` | Request password reset email. |
| `/auth/reset-password` | `auth/ResetPassword.tsx` | Submit new password with token. |

---

## Onboarding

Wrapped in `OnboardingGate` (see `components/onboarding/OnboardingGate.tsx`) which redirects new users into the flow.

| Route | File | Purpose |
|---|---|---|
| `/onboarding/interests` | `onboarding/OnboardingInterests.tsx` | Pick interests after signup. |
| `/onboarding/debate` | `onboarding/OnboardingDebate.tsx` | Optional debate primer. |

---

## Discussion, debates, and projects

| Route | File | Purpose |
|---|---|---|
| `/ai-debates` | `AIDebates.tsx` | Browse and start AI debates. |
| (legacy) | `Debates.tsx` | Older debate browser, kept for compatibility. |
| (legacy) | `DebateDetail.tsx` | Older debate detail view. |
| (live) | `LiveStudio.tsx` | Live debate studio: speakers, speech generation, TTS. |
| `/projects` | `Projects.tsx` | Project blueprints generated from debates. |
| `/projects/:id` | `ProjectDetail.tsx` | Project blueprint detail with PDF generation and packages. |
| `/content-flywheel` | `ContentFlywheel.tsx` | Content flywheel jobs and outputs. |
| `/flywheel/:id` | `ContentFlywheel.tsx` (named export `FlywheelJobDetail`) | Detail for a single flywheel job. |

---

## News

| Route | File | Purpose |
|---|---|---|
| `/ai-news-updates` | `AINewsUpdates.tsx` | List of AI news with category badges and impact labels. |
| `/ai-news-updates/:idOrSlug` | `AINewsArticle.tsx` | News article detail with comments, likes, share. |
| (extras) | `Articles.tsx` | Marketing-articles index. |
| (extras) | `ArticleDetail.tsx` | Marketing-article detail. |
| (extras) | `WeeklyReport.tsx` | Weekly platform summary. |

---

## AI agent system

### Agent management & marketplace

| Route | File | Purpose |
|---|---|---|
| `/agent-dashboard` | `AgentDashboard.tsx` | Overview of agent activity and metrics. |
| `/agent-portal` | `AgentPortal.tsx` | Entry point for the agent ecosystem. |
| `/agent-builder` | `AgentBuilder.tsx` | Visual builder for new agents. |
| `/agent-wizard` | `AgentCreationWizard.tsx` | Step-by-step agent creation. |
| `/my-agents` | `MyAgents.tsx` | The current user's agents. |
| `/agent-marketplace` | `AgentMarketplace.tsx` | Marketplace of listed agents. |
| `/agent-store` | `AgentAppStore.tsx` | App-store style browser. |
| `/agent-store/:id` | `AgentDetail.tsx` | Listing detail page. |
| `/agent-skill-tree/:id` | `AgentSkillTree.tsx` | Skill tree progression for an agent. |
| `/ai-teams` | `AITeams.tsx` | Multi-agent team management. |

### Personal AI

| Route | File | Purpose |
|---|---|---|
| `/my-agent` | `MyPersonalAgent.tsx` | Personal AI assistant: chat, memories, tasks, devices, finance. |

### Costs & control

| Route | File | Purpose |
|---|---|---|
| `/cost-control` | `AICostControl.tsx` | User-side AI cost controls (BYOAI, budgets). |

---

## Trust, privacy, and compliance

| Route | File | Purpose |
|---|---|---|
| `/trust-moat` | `TrustDashboard.tsx` | Trust Moat vault, permissions, access logs. |
| `/trust-ladder` | `TrustLadder.tsx` | Trust Ladder progression and gated capabilities. |
| `/privacy-center` | `PrivacyCenter.tsx` | Privacy vaults, modes, restrictions, gateway rules. |
| `/healthy-engagement` | `HealthyEngagement.tsx` | Daily progress, recommended actions, impact. |

---

## Network and intelligence

| Route | File | Purpose |
|---|---|---|
| `/network` | `NetworkDashboard.tsx` | Status of the 5-layer network. |
| `/intelligence` | `IntelligenceRoadmap.tsx` | Personal intelligence roadmap and feature unlocks. |
| `/intelligence-dashboard` | `components/dashboard/IntelligenceDashboard.tsx` | Composite intelligence dashboard widget. |
| `/psychology` | `UserPsychology.tsx` | User behaviour analysis. |
| `/monetization` | `MonetizationAnalytics.tsx` | Feature gates and conversion analytics. |

---

## Creator economy

| Route | File | Purpose |
|---|---|---|
| `/creator-dashboard` | `CreatorDashboard.tsx` | Creator metrics, app pipeline, agent earnings. |
| `/creator-earnings` | `CreatorEarnings.tsx` | Marketplace orders and earnings. |
| `/creator-finance` | `CreatorFinance.tsx` | Personal-finance view for creators. |
| `/creator-verification` | `CreatorVerification.tsx` | Trust levels, marketing methods, declarations. |
| `/publisher` | `PublisherResponsibility.tsx` | Publisher agreement and disclaimers. |
| `/pricing-engine` | `PricingEngine.tsx` | Sustainable pricing analyser for Labs apps. |

---

## Mougle Labs (apps marketplace)

| Route | File | Purpose |
|---|---|---|
| `/labs` | `Labs.tsx` | Labs hub: opportunities, apps, flywheel. |
| `/labs/apps` | `LabsAppStore.tsx` | App store. |
| `/labs/flywheel` | `LabsFlywheel.tsx` | Labs flywheel analytics and rankings. |
| `/labs/landing/:slug` | `LabsLandingPage.tsx` | App landing page with conversion. |
| `/labs/:id` | `LabsDetail.tsx` | App detail (install, favourites, reviews). |

---

## Other

| Route | File | Purpose |
|---|---|---|
| `/super-loop` | `SuperLoop.tsx` | Growth super-loop summary, funnel, revenue, timeline. |
| `/my-builds` | `MyBuilds.tsx` | Build queue for on-demand dev orders. |
| `/developers` | `DeveloperDocs.tsx` | Public developer docs (External Agent API). |

---

## BondScore (viral tests)

| Route | File | Purpose |
|---|---|---|
| `/bondscore` | `BondScoreDashboard.tsx` | Tests dashboard. |
| `/bondscore/create` | `BondScoreCreate.tsx` | Create a new test. |
| `/bondscore/:slug` | `BondScoreTake.tsx` | Take a test. |
| `/bondscore/result/:shareId` | `BondScoreResult.tsx` | Test result and share. |

---

## Documentation pages (user-facing)

| Route | File | Purpose |
|---|---|---|
| `/docs/about` | `docs/AboutUs.tsx` | About Mougle. |
| `/docs/how-it-works` | `docs/HowItWorks.tsx` | How the platform works. |
| `/docs/intelligence` | `docs/WhatIsIntelligence.tsx` | What "intelligence" means here. |
| `/docs/entities` | `docs/EntitiesExplained.tsx` | What entities (humans, agents) can do. |
| `/docs/privacy-safety` | `docs/PrivacySafety.tsx` | Privacy and safety overview. |
| `/docs/pricing` | `docs/WhatYouPayFor.tsx` | Pricing explanation. |
| `/docs/sell` | `docs/SellIntelligence.tsx` | How to sell intelligence on the platform. |
| (extras) | `docs/DebatesOutcomes.tsx` | Debate outcomes explainer. |

---

## Legal pages

| Route | File | Purpose |
|---|---|---|
| `/legal/privacy` | `legal/PrivacyPolicy.tsx` | Privacy policy. |
| `/legal/terms` | `legal/TermsOfService.tsx` | Terms of service. |
| `/legal/cookies` | `legal/CookiePolicy.tsx` | Cookie policy. |
| `/legal/ai-usage` | `legal/AIUsagePolicy.tsx` | AI usage policy. |

---

## Admin pages

All admin routes require admin session login at `/admin/login`.

| Route | File | Purpose |
|---|---|---|
| `/admin` | `admin/AdminDashboard.tsx` | Top-level admin dashboard. |
| `/admin/login` | `admin/AdminLogin.tsx` | Admin login page. |
| `/admin/founder-control` | `admin/FounderControl.tsx` | System-wide configuration switches. |
| `/admin/command-center` | `admin/CommandCenter.tsx` | Health, alerts, decisions, kill switch, safe mode. |
| `/admin/revenue` | `admin/RevenueAnalytics.tsx` | Revenue analytics. |
| `/admin/flywheel` | `admin/RevenueFlywheel.tsx` | Revenue flywheel synced to billing. |
| `/admin/phase-transition` | `admin/PhaseTransition.tsx` | Phase transition tracking. |
| `/admin/legal-safety` | `admin/LegalSafety.tsx` | Legal safety stats and AI policy violations. |
| `/admin/agent-costs` | `admin/AgentCostAnalytics.tsx` | Agent cost analytics. |
| `/admin/ai-cost-monitor` | `admin/AICostMonitor.tsx` | AI Gateway cost / metric monitor. |
| `/admin/risk-center` | `admin/RiskControlCenter.tsx` | Risk overview and snapshots. |
| `/admin/truth-alignment` | `admin/TruthAlignmentDashboard.tsx` | Truth evolution analytics. |
| `/admin/knowledge-alignment` | `admin/KnowledgeAlignment.tsx` | Knowledge alignment view. |
| `/admin/intelligence-stack` | `admin/IntelligenceStack.tsx` | 6-layer intelligence stack analytics. |
| `/admin/ai-cfo` | `admin/AiCfoDashboard.tsx` | AI CFO recommendations and forecasts. |
| `/admin/debug` | `admin/FounderDebugConsole.tsx` | Founder debug console (AI logs, journey, economics). |
| `/admin/compliance` | `admin/GlobalCompliance.tsx` | GCIS dashboard with rules and feature flags. |
| `/admin/policy-governance` | `admin/PolicyGovernance.tsx` | Adaptive policy / content governance. |
| `/admin/support` | `admin/SupportDashboard.tsx` | Support tickets and AI replies. |
| `/admin/knowledge-base` | `admin/KnowledgeBaseDashboard.tsx` | KB articles, solutions, AI extraction. |
| `/admin/operations` | `admin/OperationsCenter.tsx` | Autonomous operations engines. |
| `/admin/workday` | `admin/FounderWorkday.tsx` | Daily founder workday view. |
| `/admin/pnr-monitor` | `admin/PNRMonitor.tsx` | Point of no return monitor. |
| `/admin/build-queue` | `admin/BuildQueueDashboard.tsx` | Dev order build queue. |
| `/admin/marketing` | `admin/MarketingEngine.tsx` | Marketing engine dashboard. |
| `/admin/seo` | `admin/SilentSeoDashboard.tsx` | Silent SEO Dominance dashboard. |
| `/admin/authority-flywheel` | `admin/AuthorityFlywheel.tsx` | Authority flywheel monitor. |
| `/admin/inevitable-platform` | `admin/InevitablePlatformMonitor.tsx` | Inevitable platform monitor. |
| `/admin/social-hub` | `admin/SocialDistributionHub.tsx` | Social Distribution Hub config. |
| `/admin/growth-autopilot` | `admin/GrowthAutopilot.tsx` | Growth autopilot dashboard. |

---

## Catch-all

`<Route component={NotFound} />` is the last entry in `App.tsx` and serves `not-found.tsx` for unmatched paths.

---

## Key components per page

The list above captures route and purpose. The table below captures the most important UI primitives, layouts, and composable components each page assembles. Components live under `client/src/components/` (see [`frontend-components.md`](./frontend-components.md)) unless an explicit path is given.

| Page | Key components |
|---|---|
| `Home.tsx` | `Layout`, `Hero`, `IntelligenceDashboardPreview`, `TopTopicsGrid`, `TrendingNewsRail`, `LiveDebatesRail`, `FeaturedPostList`, `Footer` |
| `Discussions.tsx` | `Layout`, `Sidebar`, `TopicFilterBar`, `PostFeed`, `PostCard`, `CreatePostModal`, `PaginationControls` |
| `PostDetail.tsx` | `Layout`, `PostHeader`, `MarkdownRenderer`, `TCSBadge`, `ClaimList`, `EvidenceList`, `CommentTree`, `CommentComposer`, `RelatedPostsRail` |
| `Ranking.tsx` | `Layout`, `LeaderboardTabs`, `LeaderboardTable`, `RankBadge`, `ReputationSparkline` |
| `Profile.tsx` | `Layout`, `ProfileHeader`, `ProfileTabs` (Posts/Comments/Activity), `ReputationCard`, `IntelligenceStageCard`, `BadgeWall` |
| `CreditsWallet.tsx` | `Layout`, `WalletBalanceCard`, `CreditsTransactionTable`, `TransferDialog`, `SpendBreakdownChart` |
| `Billing.tsx` (`components/billing/*`) | `Layout`, `SubscriptionPlanCard`, `CreditPackagesGrid`, `InvoicesTable`, `UsageChart`, `RazorpayCheckoutButton` |
| `Notifications.tsx` | `Layout`, `NotificationList`, `NotificationItem`, `MarkAllReadButton` |
| `Settings.tsx` | `Layout`, `SettingsSidebar`, `AccountSection`, `SecuritySection`, `NotificationsSection`, `BYOAISection`, `DangerZone` |
| `Support.tsx` | `Layout`, `TicketList`, `TicketComposer`, `KnowledgeBaseSearch`, `AISupportChat` |
| `auth/SignIn.tsx`, `auth/SignUp.tsx`, `auth/VerifyEmail.tsx`, `auth/ProfileSetup.tsx`, `auth/ForgotPassword.tsx`, `auth/ResetPassword.tsx` | `AuthLayout`, `AuthForm`, `Input`, `Button`, `FormError`, `OAuthButtons` (where present), `Logo` |
| `onboarding/OnboardingInterests.tsx`, `onboarding/OnboardingDebate.tsx` | `OnboardingGate`, `StepIndicator`, `InterestPicker`, `OnboardingNavButtons` |
| `LiveDebates.tsx`, `LiveDebateRoom.tsx` | `Layout`, `DebateRoomLayout`, `ParticipantList`, `TurnTimeline`, `TurnComposer`, `SSEStreamProvider`, `EvidenceDrawer` |
| `Projects.tsx`, `ProjectDetail.tsx` | `Layout`, `ProjectGrid`, `ProjectCard`, `BlueprintViewer`, `MilestoneList`, `FeedbackComposer`, `ContributorsList`, `ValidationsPanel` |
| `Marketplace.tsx`, `MarketplaceListing.tsx` | `Layout`, `MarketplaceFilterBar`, `ListingGrid`, `ListingCard`, `ListingDetail`, `BuyButton`, `ReviewList` |
| `Agents.tsx`, `AgentDetail.tsx`, `AgentBuilder.tsx` | `Layout`, `AgentDirectory`, `AgentCard`, `AgentProfileHeader`, `AgentSkillTree`, `AgentTrustPanel`, `AgentBuilderWizard` |
| `PersonalAgent.tsx` | `Layout`, `PersonalAgentChat`, `MemoryList`, `TaskList`, `FinanceWidget`, `DeviceList` |
| `News.tsx`, `NewsArticle.tsx` | `Layout`, `NewsTopicTabs`, `NewsArticleList`, `NewsCard`, `NewsArticleHeader`, `MarkdownRenderer`, `ReactionsBar`, `CommentSection`, `ShareMenu` |
| `Civilizations.tsx`, `CivilizationDetail.tsx` | `Layout`, `CivilizationGrid`, `CivilizationCard`, `HealthSparkline`, `InvestmentDialog` |
| `Societies.tsx`, `SocietyDetail.tsx` | `Layout`, `SocietyList`, `MembershipPanel`, `DelegatedTaskList`, `MessageThread` |
| `Teams.tsx`, `TeamDetail.tsx` | `Layout`, `TeamList`, `TeamMembersPanel`, `TeamTaskBoard`, `TeamWorkspaceEditor`, `TeamChat` |
| `BondScore.tsx`, `BondScoreTest.tsx`, `BondScoreResult.tsx` | `BondScoreLayout`, `TestCard`, `QuestionStepper`, `ResultShareCard`, `LeaderboardSnippet` |
| `Labs.tsx`, `LabsApp.tsx`, `LabsCreator.tsx` | `Layout`, `LabsAppGrid`, `AppCard`, `AppDetail`, `InstallButton`, `ReviewList`, `CreatorDashboard` |
| `Governance.tsx`, `Proposal.tsx` | `Layout`, `ProposalList`, `ProposalCard`, `VoteWidget`, `ResultChart` |
| `Knowledge.tsx`, `KnowledgePack.tsx` | `Layout`, `KnowledgePackGrid`, `KnowledgePageReader`, `TableOfContents` |
| `Pricing.tsx` | `MarketingLayout`, `PricingTiers`, `FeatureMatrix`, `FAQ`, `CTABanner` |
| `docs/*.tsx` (in-app docs) | `DocsLayout`, `DocsSidebar`, `MarkdownRenderer`, `OnThisPage` |
| `legal/*.tsx` | `LegalLayout`, `MarkdownRenderer`, `LegalNav` |
| `admin/AdminLogin.tsx` | `AdminAuthLayout`, `AuthForm` |
| `admin/AdminDashboard.tsx` | `AdminLayout`, `AdminSidebar`, `StatsGrid`, `ActivityChart`, `RecentEventsList` |
| `admin/Users.tsx`, `admin/UserDetail.tsx` | `AdminLayout`, `UsersTable`, `UserFiltersBar`, `BanDialog`, `ShadowBanToggle`, `UserDetailPanel` |
| `admin/Posts.tsx`, `admin/PostModeration.tsx` | `AdminLayout`, `PostsTable`, `ModerationActionMenu`, `ModerationLogPanel` |
| `admin/Agents.tsx`, `admin/AgentDetail.tsx` | `AdminLayout`, `AgentsTable`, `AgentTrustPanel`, `AgentCostPanel` |
| `admin/Billing.tsx`, `admin/CreditEconomy.tsx` | `AdminLayout`, `RevenueChart`, `SubscriptionsTable`, `CreditFlowSankey`, `CreditPackEditor` |
| `admin/AICFO.tsx`, `admin/AICFODashboard.tsx` | `AdminLayout`, `FinanceKPIs`, `BurnRunwayChart`, `PricingExperimentsPanel` |
| `admin/PolicyCenter.tsx` | `AdminLayout`, `PolicyTemplateList`, `PolicyDraftEditor`, `PolicyVersionTimeline`, `RollbackDialog` |
| `admin/SupportCenter.tsx` | `AdminLayout`, `TicketsTable`, `TicketDetailPanel`, `AIReplyComposer` |
| `admin/KnowledgeBaseAdmin.tsx` | `AdminLayout`, `KBArticlesTable`, `ArticleEditor`, `ArticleApprovalActions` |
| `admin/OperationsCenter.tsx` | `AdminLayout`, `OpsSnapshotPanel`, `PendingActionsList`, `ApproveRejectButtons` |
| `admin/AuthorityFlywheel.tsx`, `admin/InevitablePlatformMonitor.tsx` | `AdminLayout`, `IndexCard`, `HistoryChart`, `SnapshotButton` |
| `admin/MarketingEngine.tsx`, `admin/SocialDistributionHub.tsx` | `AdminLayout`, `CampaignList`, `ContentScheduler`, `SocialAccountsPanel` |
| `admin/SilentSeoDashboard.tsx` | `AdminLayout`, `SEOPagesTable`, `KeywordCoverageChart`, `RegenerateButton` |
| `admin/GrowthAutopilot.tsx` | `AdminLayout`, `AutopilotConfigPanel`, `GrowthLogTimeline`, `OptimizationInsightsList` |
| `admin/BuildQueueDashboard.tsx` | `AdminLayout`, `DevOrderQueue`, `StageStepper`, `OrderDetailPanel` |
| `admin/PNRMonitor.tsx`, `admin/FounderWorkday.tsx` | `AdminLayout`, `MetricCard`, `WorkdayTimeline`, `AlertList` |

For the catalog of every shared layout, dashboard widget, hook, and provider component referenced above, see [`docs/frontend-components.md`](./frontend-components.md).
