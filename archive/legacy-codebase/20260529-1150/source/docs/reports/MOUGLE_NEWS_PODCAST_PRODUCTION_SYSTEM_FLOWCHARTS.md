# Mougle News / Podcast / Debate / Production House — System Flowcharts

**Date:** 2026-05-22
**Scope:** Documentation-only Mermaid architecture package covering the News Room, Podcast Room, Debate Studio, Production House, 3D/4D/Unreal simulation, Distribution, Admin dashboard wiring, Safety/Approval state machine, and the Algorithmic/Mathematical decision layer.
**Source inputs:**
- `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_CONSOLIDATION_AUDIT.md` (T1)
- `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_LINK_SURFACING_T2_REPORT.md` (T2)
- `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_WIRING_T3_REPORT.md` (T3)
- `client/src/App.tsx` (route inventory)
- `client/src/pages/admin/AdminDashboard.tsx` (zone declarations)
- `server/services/safe-mode-service.ts` (safety flags)

**This document changes no code, no route, no schema, no migration, no safe-mode flag, no service behavior.** It only adds Mermaid diagrams and explanations.

---

## Executive summary

Mougle's News / Podcast / Debate / Production system is a six-zone admin operation backed by ~30 service modules. All "live" capabilities (publishing, render, Unreal, 4D hardware, autonomous moderation) are gated **behind explicit manual approval and dry-run defaults**. Verified knowledge flows one-way from the News Room into reference layers consumed by Podcast Room and Debate Studio. Production House is the shared finishing/preview layer; 3D/4D/Unreal is the simulation-only screen director; Distribution is the manual export/publish surface. Cross-cutting layers — Approval Board, Readiness Center, Safe-Mode service, Omni-Channel Audience Safety, Audit/Retention — observe and gate every stage.

This package contains **10 Mermaid diagrams** (full system, 6 pipeline diagrams, dashboard link map, safety/approval state machine, algorithmic decision layer), a **Mathematical / Algorithmic section** with 10 formula families (A–J), and a consolidated safety-constraints + open-questions section.

---

## Diagram index

| # | Title | Mermaid type |
|---|---|---|
| 1 | Full system overview | `flowchart TD` |
| 2 | News Room pipeline | `flowchart TD` |
| 3 | Podcast Room pipeline | `flowchart TD` |
| 4 | Debate Studio pipeline | `flowchart TD` |
| 5 | Production House shared layer | `flowchart TD` |
| 6 | 3D / 4D / Unreal simulation layer | `flowchart TD` |
| 7 | Distribution layer | `flowchart TD` |
| 8 | Admin dashboard link map | `graph LR` |
| 9 | Safety / Approval state machine | `stateDiagram-v2` |
| 10 | Algorithmic decision layer | `flowchart TD` + `sequenceDiagram` |

---

## Diagram 1 — Full system overview

End-to-end view showing how the six operational zones connect to the shared Production House, simulation layer, distribution, and the cross-cutting safety/approval/audit substrate.

```mermaid
flowchart TD
    subgraph SRC["External Sources"]
        RSS["RSS Feeds<br/>10+ AI/News sources"]
        EXTAGT["External AI Agents API"]
        USER["Human Users<br/>and verified posters"]
    end

    subgraph NEWS["News Room Studio"]
        N_ING["News Ingestion"]
        N_PKG["Newsroom Package"]
        N_BRIEF["Broadcast Brief"]
        N_BC["Broadcasts<br/>dry-run preview"]
        N_PQ["Playout Queue"]
    end

    subgraph DEBATE["Debate Studio"]
        D_N2D["News-to-Debate"]
        D_PKG["Debate Topic Package"]
        D_LIVE["Live Debate Studio<br/>admin-controlled"]
    end

    subgraph PODCAST["Podcast Room Studio"]
        P_SCR["Podcast Script Package"]
        P_VOX["Voice Jobs<br/>podcast-primary"]
    end

    subgraph PROD["Production House"]
        PH_PREVIEW["Preview Studio<br/>embedded"]
        PH_VR["Video Render<br/>dry-run only"]
        PH_AVATAR["Avatar Studio"]
        PH_READY["Readiness Center"]
        PH_APPROVE["Approval Board"]
    end

    subgraph SIM["3D / 4D / Unreal Simulation"]
        S_4D["Cinema 4D Control<br/>mock only"]
        S_NEURAL["Neural Newsroom<br/>Virtual Screen Director"]
    end

    subgraph DIST["Distribution"]
        DI_SHORTS["Shorts Approval Queue"]
        DI_YT["YouTube Publishing<br/>manual approval"]
        DI_SOC["Social Distribution<br/>manual / export-first"]
        DI_HUB["Social Hub"]
    end

    subgraph MEDIA["Media Pipeline Compat"]
        M_COMPAT["8 legacy links<br/>preserved verbatim"]
    end

    subgraph SAFE["Cross-cutting Safety and Audit"]
        SAFEMODE["Safe-Mode Service<br/>4 pause flags"]
        AUDIENCE["Omni-Channel<br/>Audience Safety"]
        AUDIT["Audit and Retention"]
        PTO["Founder PTO and<br/>Panic Button"]
    end

    RSS --> N_ING
    USER --> N_ING
    EXTAGT --> N_ING
    N_ING --> N_PKG
    N_PKG --> N_BRIEF
    N_BRIEF --> N_BC
    N_BC --> N_PQ

    N_PKG -. "verified reference (read-only)" .-> D_N2D
    N_PKG -. "verified reference (read-only)" .-> P_SCR
    D_LIVE -. "transcript reference (export)" .-> P_SCR

    D_N2D --> D_PKG --> D_LIVE
    P_SCR --> P_VOX

    N_PQ --> PROD
    P_VOX --> PROD
    D_LIVE --> PROD

    PROD --> SIM
    SIM --> PH_APPROVE
    PROD --> PH_APPROVE

    PH_APPROVE --> DI_SHORTS
    PH_APPROVE --> DI_YT
    PH_APPROVE --> DI_SOC
    DI_SOC --> DI_HUB

    MEDIA -. "compatibility links" .-> NEWS
    MEDIA -. "compatibility links" .-> PODCAST
    MEDIA -. "compatibility links" .-> DEBATE
    MEDIA -. "compatibility links" .-> DIST

    SAFE -.-> NEWS
    SAFE -.-> PODCAST
    SAFE -.-> DEBATE
    SAFE -.-> PROD
    SAFE -.-> SIM
    SAFE -.-> DIST
```

**Reading guide:**
- **Solid arrows** are package handoffs (ID-carrying).
- **Dotted arrows** are read-only references or compatibility links — they never mutate upstream storage.
- The Safety substrate gates every zone; it is not an in-line node in the data flow but a guard observed at every transition.

---

## Diagram 2 — News Room pipeline

Full RSS → ingestion → claim extraction → human verification → newsroom package → broadcast → playout → shorts cutter flow, with every safety gate enumerated.

```mermaid
flowchart TD
    subgraph IN["Ingestion"]
        F["RSS / News Feeds"]
        ING["newsService.ingest<br/>30 min cadence"]
        DEDUP["URL + Title Hash<br/>Dedup"]
    end

    subgraph ENRICH["Processing and Enrichment"]
        SUM["OpenAI Summarizer<br/>2-sentence"]
        CLASS["Classifier<br/>Research / Product / Policy / etc."]
        IMPACT["Impact Score<br/>High / Medium / Low"]
    end

    subgraph CLUSTER["Clustering and Claims"]
        CLUS["Topic Cluster<br/>Jaccard + time-window"]
        CLAIM["Claim Extraction"]
        EVID["Evidence Linker"]
    end

    subgraph VERIFY["Human Verification"]
        HV["Human Verification Step"]
        VPKG["Verified Newsroom<br/>Data Package"]
    end

    subgraph BRIEF["Broadcast Brief"]
        BRF["Broadcast Brief Review"]
        SCREEN["Newsroom Screen Data"]
        LEGAL["Legal Event Visual Resolver"]
    end

    subgraph DIRECT["Direction Layer"]
        VSD["Virtual Screen Director<br/>SIMULATION ONLY"]
        ANCHOR["Anchor Mode Picker"]
        PREVIEW["Preview Studio<br/>embedded"]
    end

    subgraph PRODNEWS["Production"]
        NPKG["Production House<br/>news_video_package"]
        READY["Readiness Center"]
        APPROVE["Approval Board"]
    end

    subgraph OUT["Output"]
        PLAYOUT["Playout Queue"]
        CUT["Shorts Cutter"]
        DISTAPPR["Distribution Approval"]
    end

    subgraph SG["Hard Safety Gates"]
        G1["No copyrighted video reuse"]
        G2["No logo or watermark removal"]
        G3["No publicUrl until approval"]
        G4["No signedUrl until approval"]
        G5["realSendAllowed = false"]
        G6["executionEnabled = false"]
        G7["No Unreal execution"]
        G8["No real 4D hardware"]
        G9["No Spyder / Barco / Novastar direct commands"]
        G10["No autonomous publishing<br/>pauseAutonomousPublishing"]
    end

    F --> ING --> DEDUP --> SUM --> CLASS --> IMPACT --> CLUS --> CLAIM --> EVID --> HV --> VPKG --> BRF --> SCREEN --> LEGAL --> VSD --> ANCHOR --> PREVIEW --> NPKG --> READY --> APPROVE --> PLAYOUT
    APPROVE --> CUT --> DISTAPPR

    LEGAL -.-> G1
    LEGAL -.-> G2
    APPROVE -.-> G3
    APPROVE -.-> G4
    APPROVE -.-> G5
    APPROVE -.-> G6
    VSD -.-> G7
    VSD -.-> G8
    VSD -.-> G9
    DISTAPPR -.-> G10
```

**Notes:**
- Every transition from "draft" to "publishable" requires a human approval — the dashboard cannot fast-path past this.
- `Legal Event Visual Resolver` gates G1 and G2; only license-cleared media is selectable.
- `Virtual Screen Director` is mock-only (see Diagram 6).

---

## Diagram 3 — Podcast Room pipeline

Verified newsroom data + debate references → script → voice → preview → production → distribution. Podcast reads upstream data **as references only**; it never mutates newsroom storage.

```mermaid
flowchart TD
    subgraph SRC2["Reference Inputs (read-only)"]
        NREF["Verified Newsroom Reference"]
        DREF["Debate Transcript Reference"]
    end

    subgraph SCRIPT["Script Layer"]
        PSC["Podcast Script Package"]
        ROLE["Host / Guest Role Plan"]
    end

    subgraph AUDIO["Audio Layer"]
        VJ["Voice Jobs<br/>podcastVoiceService.generateVoiceJob"]
        PAUSE["Gate: pausePodcastAudioGeneration"]
    end

    subgraph VIS["Visual / Avatar"]
        AVA["Host / Guest Avatar Setup"]
        SCENE["Podcast Room Scene<br/>mock"]
    end

    subgraph PRP["Preview and Production"]
        PRV["Podcast Room Preview"]
        PHPKG["Production House<br/>podcast_video_package"]
        PHREADY["Readiness Center"]
        PHAPPR["Approval Board"]
    end

    subgraph OUTP["Output"]
        CLIPS["Podcast Clips"]
        DISTAPP["Distribution Approval"]
    end

    NREF -. "read-only" .-> PSC
    DREF -. "read-only" .-> PSC
    PSC --> ROLE --> VJ
    VJ -.-> PAUSE
    VJ --> AVA --> SCENE --> PRV --> PHPKG --> PHREADY --> PHAPPR --> CLIPS --> DISTAPP

    classDef refOnly stroke-dasharray: 5 5
    class NREF,DREF refOnly
```

**Invariants:**
- `NREF` and `DREF` arrows are dashed: Podcast Room **never** writes back to newsroom or debate tables.
- Podcast Room and News Room are separate operational surfaces (see §11 for the Voice Jobs scoping decision).
- If `pausePodcastAudioGeneration = true`, the audio leg short-circuits and no voice job is dispatched.

---

## Diagram 4 — Debate Studio pipeline

Verified news → debate topic → live/debate studio → transcript → optional video export → Production House. Debate exports references to Podcast Room **only through an explicit export flow** — never in-place.

```mermaid
flowchart TD
    subgraph SRC3["Inputs"]
        VNEWS["Verified Newsroom Data"]
    end

    subgraph TOPIC["Topic Layer"]
        N2D["News-to-Debate Package"]
        DTOP["Debate Topic Package"]
    end

    subgraph ROLES["Roles"]
        MOD["Moderator Role"]
        GUESTS["Guest / Panelist Roles"]
    end

    subgraph LIVE["Live Layer"]
        DLIVE["Live Debate Studio<br/>/admin/live-studio"]
        TRANS["Debate Transcript and Discussion"]
        CONSENSUS["Consensus and<br/>Disagreement Summary"]
    end

    subgraph EXP["Export Layer (explicit)"]
        D2P["Debate-to-Podcast<br/>reference export"]
        DVID["Debate Video Package"]
    end

    subgraph PRD["Production"]
        PHD["Production House<br/>debate_video_package"]
        APPR["Approval Board"]
        DIST["Distribution"]
    end

    VNEWS --> N2D --> DTOP --> DLIVE
    MOD --> DLIVE
    GUESTS --> DLIVE
    DLIVE --> TRANS --> CONSENSUS
    CONSENSUS -. "explicit export only" .-> D2P
    CONSENSUS --> DVID --> PHD --> APPR --> DIST
```

**Notes:**
- `D2P` (Debate → Podcast reference export) is an opt-in handoff, not an automatic event. Podcast Room remains separate.
- Debate video export to Production House is opt-in: many debates have no video deliverable.

---

## Diagram 5 — Production House shared layer

Production House accepts five distinct package types and **must identify the type before dispatching tools**. It never assumes "all packages are news packages."

```mermaid
flowchart TD
    subgraph INPUTS["Package Inputs (typed)"]
        K1["news_video_package"]
        K2["podcast_video_package"]
        K3["debate_video_package"]
        K4["social_clip_package"]
        K5["cinematic_4d_package"]
    end

    subgraph ROUTER["Package Router<br/>identifies type before dispatch"]
        ROUTE["Type detection<br/>and capability matrix"]
    end

    subgraph TOOLS["Shared Tools"]
        T1["Preview Studio"]
        T2["Cinema 4D Studio<br/>mock"]
        T3["Avatar Studio"]
        T4["Media Package Studio"]
        T5["Package Viewer"]
        T6["Asset Library"]
        T7["Readiness Center"]
        T8["Approval Board"]
    end

    K1 --> ROUTE
    K2 --> ROUTE
    K3 --> ROUTE
    K4 --> ROUTE
    K5 --> ROUTE

    ROUTE --> T1
    ROUTE --> T2
    ROUTE --> T3
    ROUTE --> T4
    ROUTE --> T5
    ROUTE --> T6
    T1 --> T7
    T2 --> T7
    T3 --> T7
    T4 --> T7
    T7 --> T8
```

**Capability matrix (illustrative):**

| Package type | Preview | Cinema 4D | Avatar | Media Pkg | Readiness | Approval |
|---|---|---|---|---|---|---|
| `news_video_package` | ✅ | optional | optional | ✅ | ✅ | ✅ |
| `podcast_video_package` | ✅ | optional | ✅ | ✅ | ✅ | ✅ |
| `debate_video_package` | ✅ | optional | ✅ | ✅ | ✅ | ✅ |
| `social_clip_package` | ✅ | — | — | ✅ | ✅ | ✅ |
| `cinematic_4d_package` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Diagram 6 — 3D / 4D / Unreal simulation layer

Mock-only simulation. Every output is dry-run preview. Hardware and external rendering are explicitly disabled.

```mermaid
flowchart TD
    subgraph ASSETS["Asset Inputs (human-made + generated)"]
        A1["Human-made 3D / 4D room assets"]
        A2["Cinema 4D generated scripts"]
        A3["Avatar / Anchor manifests"]
        A4["Screen data package"]
        A5["Legal b-roll / event visual plan"]
    end

    subgraph SIM6["Simulation Layer"]
        S1["Scene Manifest Generator<br/>cinema-control-service mock"]
        S2["4D Cue Manifest<br/>mock"]
        S3["Virtual Screen Director<br/>simulation"]
        S4["Unreal Dry-Run Renderer<br/>placeholder, throws 503 on live"]
    end

    subgraph PVW["Preview"]
        P1["Preview Studio<br/>watermark: DRY RUN INTERNAL PREVIEW"]
    end

    subgraph APPR2["Approval"]
        AP1["Approval Gate"]
    end

    subgraph HARD["Hard Disabled (NEVER executed)"]
        H1["No real Unreal execution"]
        H2["No Movie Render Queue"]
        H3["No real Cinema 4D render"]
        H4["No real 4D hardware"]
        H5["No Spyder / Barco / Novastar commands"]
        H6["No FFmpeg / Remotion / avatar-video-render-service calls<br/>from cinema-control-service"]
    end

    A1 --> S1
    A2 --> S1
    A3 --> S1
    A4 --> S3
    A5 --> S3
    S1 --> S2 --> S3 --> S4 --> P1 --> AP1

    S4 -. "blocked" .-> H1
    S4 -. "blocked" .-> H2
    S4 -. "blocked" .-> H3
    S2 -. "blocked" .-> H4
    S2 -. "blocked" .-> H5
    S1 -. "blocked" .-> H6
```

**Hard-disabled list is enforced in `server/services/cinema-control-service.ts` header comment + `server/services/avatar-video-render-service.ts:1123–1130` (throws 503 for any non-`dry_run` provider).**

---

## Diagram 7 — Distribution layer

Approved package → Shorts queue / YouTube publishing / Social distribution. Every step is manual. Kill-switch / safe-mode flags can block at any boundary.

```mermaid
flowchart TD
    APR["Approved Package<br/>from Production House"]

    subgraph SHORTS["Shorts Path"]
        SHQ["/admin/shorts<br/>Approval Queue"]
        SHAP["approveShort<br/>flips DB flags only"]
    end

    subgraph YT["YouTube Path"]
        YTPKG["YouTube Publishing<br/>Package"]
        YTGATES["Blocking Checklist<br/>manual_trigger_only"]
        YTAPR["Root-admin Approval"]
    end

    subgraph SOC["Social Path"]
        SOCPKG["Social Distribution Package"]
        SOCMODE["Mode: manual OR safe_automation"]
        SOCEXPORT["Export-first export"]
    end

    subgraph KILL["Kill Switches and Safe Mode"]
        SM1["pauseYouTubeUploads"]
        SM2["pauseSocialDistributionAutomation"]
        SM3["pauseAutonomousPublishing"]
        PB["Founder Panic Button<br/>4 platform modes"]
    end

    APR --> SHQ --> SHAP
    APR --> YTPKG --> YTGATES --> YTAPR
    APR --> SOCPKG --> SOCMODE --> SOCEXPORT

    SM1 -. blocks .-> YTAPR
    SM2 -. blocks .-> SOCEXPORT
    SM3 -. blocks .-> SHAP
    PB -. global .-> APR
```

**Hard rules:**
- YouTube: manual approval only — `manualApprovalRequired: true`, `manual_trigger_only` blocking check (`server/services/youtube-publishing-service.ts:240, 299`).
- Social: manual / export-first union of modes (`server/services/social-distribution-approval-service.ts:24`).
- Shorts: `approveShort` flips `approved=true` only and **does not post externally** (`server/services/shorts-cutter-service.ts:13–14, 542–554`).

---

## Diagram 8 — Admin dashboard link map

Per T2/T3, six new dashboard zones surface 33 unique `/admin/...` hrefs through 44 link cards. Cross-zone duplicates and the one intentional route alias are shown explicitly.

```mermaid
graph LR
    subgraph ZN["Newly added zones (T2)"]
        ZNR["News Room"]
        ZPR["Podcast Room"]
        ZDB["Debate"]
        ZPH["Production"]
        Z3D["3D / 4D"]
        ZDI["Distribution"]
    end

    subgraph ZM["Preserved compat zone"]
        ZMC["Media and Content Pipeline"]
    end

    subgraph RT["Selected admin routes"]
        R_NSRC["/admin/news-sources"]
        R_N2D["/admin/news-to-debate"]
        R_BBR["/admin/broadcast-briefs"]
        R_BC["/admin/broadcasts"]
        R_NP["/admin/newsroom-package"]
        R_NPS["/admin/newsroom-packages"]
        R_PQ["/admin/playout-queue"]
        R_BRO["/admin/broll-plan-review"]
        R_ANC["/admin/anchor-modes"]
        R_AUT["/admin/autopilot-newsroom"]
        R_NEU["/admin/neural-newsroom"]
        R_OCA["/admin/omni-channel-audience"]
        R_SH["/admin/shorts"]
        R_PSC["/admin/podcast-scripts"]
        R_VJ["/admin/voice-jobs"]
        R_VR["/admin/video-render"]
        R_LS["/admin/live-studio"]
        R_CG["/admin/council-governance"]
        R_PH["/admin/production-house"]
        R_AJ["/admin/ai-jobs"]
        R_AW["/admin/ai-workers"]
        R_AO["/admin/ai-ops"]
        R_AR["/admin/ai-retention"]
        R_BQ["/admin/build-queue"]
        R_4D["/admin/4d-cinema-control"]
        R_CC["/admin/cinema-control (alias)"]
        R_YT["/admin/youtube-publishing"]
        R_SD["/admin/social-distribution"]
        R_SH2["/admin/social-hub"]
        R_MK["/admin/marketing"]
        R_SEO["/admin/seo"]
        R_GA["/admin/growth-autopilot"]
        R_AF["/admin/authority-flywheel"]
    end

    ZNR --> R_NSRC
    ZNR --> R_N2D
    ZNR --> R_BBR
    ZNR --> R_BC
    ZNR --> R_NP
    ZNR --> R_NPS
    ZNR --> R_PQ
    ZNR --> R_BRO
    ZNR --> R_ANC
    ZNR --> R_AUT
    ZNR --> R_NEU
    ZNR --> R_OCA
    ZNR --> R_SH

    ZPR --> R_PSC
    ZPR --> R_VJ
    ZPR --> R_VR
    ZPR --> R_SH

    ZDB --> R_N2D
    ZDB --> R_LS
    ZDB --> R_CG
    ZDB --> R_VR
    ZDB --> R_SH

    ZPH --> R_PH
    ZPH --> R_VJ
    ZPH --> R_VR
    ZPH --> R_AJ
    ZPH --> R_AW
    ZPH --> R_AO
    ZPH --> R_AR
    ZPH --> R_BQ

    Z3D --> R_4D
    Z3D --> R_CC
    Z3D --> R_NEU
    Z3D --> R_PH
    Z3D --> R_VR

    ZDI --> R_SH
    ZDI --> R_YT
    ZDI --> R_SD
    ZDI --> R_SH2
    ZDI --> R_MK
    ZDI --> R_SEO
    ZDI --> R_GA
    ZDI --> R_AF

    ZMC --> R_N2D
    ZMC --> R_PSC
    ZMC --> R_VJ
    ZMC --> R_VR
    ZMC --> R_SH
    ZMC --> R_YT
    ZMC --> R_SD
    ZMC --> R_LS

    R_4D === R_CC
```

**Legend:**
- An `===` link between `/admin/4d-cinema-control` and `/admin/cinema-control` denotes the **intentional route alias** (both routes resolve to the same `CinemaControl` component, `client/src/App.tsx:269-270`).
- Any href appearing under multiple zone subgraphs is a **cross-zone duplicate** (per T3 §G).

---

## Diagram 9 — Safety / approval state machine

State machine of a package as it traverses Mougle's safety substrate. Each transition is gated by one or more enforcement checks.

```mermaid
stateDiagram-v2
    [*] --> Draft

    Draft --> AuthChecked: root_admin_auth + CSRF
    AuthChecked --> HumanVerified: human verification step
    HumanVerified --> LegalCleared: legal visual resolver + copyright check
    LegalCleared --> ReadinessChecked: Readiness Center pass
    ReadinessChecked --> AwaitingApproval: Approval Board queued

    AwaitingApproval --> Approved: founder/root approval
    AwaitingApproval --> Rejected: blocking gate failure

    Approved --> SafeModeChecked: safe-mode flags evaluated
    SafeModeChecked --> DryRunRendered: dry-run only
    SafeModeChecked --> Frozen: pause flag tripped

    DryRunRendered --> PreviewLocked: no publicUrl, no signedUrl
    PreviewLocked --> ManualDispatch: explicit operator action

    ManualDispatch --> Published: realSendAllowed AND executionEnabled
    ManualDispatch --> Held: kill switch or PTO mode
    ManualDispatch --> AuditOnly: notifier snooze active

    Published --> AuditLogged: audit + retention sweep
    Held --> AuditLogged
    AuditOnly --> AuditLogged
    Frozen --> AuditLogged
    Rejected --> AuditLogged

    AuditLogged --> [*]

    note right of SafeModeChecked
      Flags evaluated:
      pauseYouTubeUploads
      pauseSocialDistributionAutomation
      pausePodcastAudioGeneration
      pauseAutonomousPublishing
    end note

    note right of ManualDispatch
      Founder Panic Button
      can force Held at any time:
      NORMAL / SAFE_MODE /
      ECONOMY_PROTECTION /
      EMERGENCY_FREEZE
    end note
```

**Invariants:**
- A package cannot reach `Published` without passing through `Approved` AND `SafeModeChecked` AND `ManualDispatch` (no autonomous shortcut).
- `Frozen` and `Held` are sticky until founder intervention.
- `AuditLogged` is terminal for the package state machine; the audit retention sweep prunes old rows on its own cadence (see Audit-Email + Audience-Retention services in `replit.md`).

---

## Diagram 10 — Algorithmic decision layer

Composite view of the algorithmic decisions taken per package. Top half is the scoring/decision flow; bottom half (sequence diagram) shows how the scores flow between services for a single broadcast dispatch.

### 10a — Decision flow

```mermaid
flowchart TD
    subgraph SCORE["Score Computation"]
        IMP["A. impactScore"]
        BRK["B. isBreaking"]
        CONF["C. confidence"]
        CLU["D. clusterSimilarity Jaccard"]
        CL["E. claimConfidence"]
        MED["F. mediaCandidateScore"]
        SCR["G. screenActionScore"]
    end

    subgraph PRESS["Pressure and Risk"]
        APX["H1. ApexLoad"]
        FLW["H2. FlowState"]
        PCG["H3. PreCognitionRisk"]
    end

    subgraph MOD["Moderation"]
        CHAT["I. chatRiskScore"]
    end

    subgraph COST["Cost"]
        EXP["J. expectedCost"]
    end

    subgraph DECIDE["Decision Gate"]
        D["Dispatch only if<br/>FlowState >= minFlow<br/>AND PreCognitionRisk <= maxRisk<br/>AND ApexLoad <= maxLoad<br/>AND expectedCost <= budget<br/>AND approvalState permits"]
    end

    IMP --> BRK
    CONF --> BRK
    CLU --> CONF
    CL --> CONF
    MED --> SCR
    BRK --> D
    SCR --> D
    APX --> D
    FLW --> D
    PCG --> D
    CHAT --> D
    EXP --> D
```

### 10b — Per-broadcast dispatch sequence

```mermaid
sequenceDiagram
    autonumber
    participant News as News Service
    participant Score as Scoring Engine
    participant Legal as Legal Visual Resolver
    participant VSD as Virtual Screen Director
    participant Flow as FlowState/ApexLoad
    participant Appr as Approval Board
    participant Safe as Safe-Mode Service
    participant Dist as Distribution

    News->>Score: compute impactScore + confidence
    Score-->>News: scores
    News->>Legal: request media candidates
    Legal-->>News: licensed candidates only
    News->>VSD: request screen plan (dry-run)
    VSD-->>News: ScreenTakePlan
    News->>Flow: compute ApexLoad + FlowState + PreCognitionRisk
    Flow-->>News: pressure verdict
    News->>Appr: enqueue for approval
    Appr->>Safe: check pause flags + PTO + panic
    Safe-->>Appr: gates verdict
    Appr-->>News: approved OR rejected
    alt approved AND safe
        News->>Dist: manual dispatch (still dry-run preview)
        Dist-->>News: audit-logged
    else blocked
        News->>News: held + audit-logged
    end
```

---

## Mathematical / Algorithmic formulas

All formulas are **proposed/canonical** definitions for the scoring layer described in the T2 brief. They are illustrative; the running code may use simplified subsets. None of them are changed by this document.

### A. News impact score

```
impactScore = w1·sourceCredibility
            + w2·sourceCoverage
            + w3·eventRecency
            + w4·entityImportance
            + w5·claimConfidence
            + w6·socialVelocity
            - w7·disputeRisk
            - w8·legalRisk

Normalized to [0, 100].
Recommended initial weights: w1=15, w2=20, w3=10, w4=10, w5=20, w6=10, w7=15, w8=20.
```

### B. Breaking news decision

```
isBreaking = (impactScore >= IMPACT_THRESHOLD)
         AND (sourceCoverage >= MIN_SOURCES)
         AND (legalRisk <= MAX_LEGAL_RISK)
         AND (humanVerificationStatus ∈ {verified, expedited_verified})
```

### C. Source coverage and confidence

```
sourceCoverage = uniqueIndependentSources / requiredSources

confidence = 0.4·sourceCoverage
           + 0.3·claimEvidenceScore
           + 0.2·historicalSourceReliability
           + 0.1·crossSourceAgreement
```

### D. Cluster similarity (Jaccard)

```
J(A, B) = |tokens(A) ∩ tokens(B)|
         ─────────────────────────
         |tokens(A) ∪ tokens(B)|

cluster(A, B) iff J(titleA, titleB) >= JACCARD_THRESHOLD
              AND timeDistance(A, B) <= TIME_WINDOW
```

### E. Claim confidence

```
claimConfidence = evidenceStrength
                · sourceReliability
                · corroborationCountFactor
                · freshnessFactor
                · contradictionPenalty

Multiplicative form so any zero-evidence factor collapses the score to 0.
```

### F. Legal media selection score

```
mediaCandidateScore = licenseSafetyWeight
                    + relevanceWeight
                    + visualQualityWeight
                    + geographyMatchWeight
                    + timestampMatchWeight
                    - copyrightRiskPenalty
                    - brandLogoRiskPenalty

Eligibility filter:
  licenseStatus ∈ ALLOWED_LICENSES
  AND copyrightRisk < COPYRIGHT_RISK_THRESHOLD
  AND watermarkRemovalRequired == false
```

### G. Screen director decision score

```
screenActionScore = topicRelevance
                  + urgency
                  + visualSupport
                  + anchorNarrationNeed
                  + viewerComprehensionGain
                  - screenChangeFatigue
                  - legalRisk
                  - mismatchRisk

Allowed actions (one of):
  KEEP_CURRENT, SWITCH_PANEL, ZOOM_VIRTUAL_SCREEN,
  FULLSCREEN_EVENT_VISUAL, LOWER_THIRD_UPDATE,
  TICKER_UPDATE, SOURCE_PANEL_UPDATE,
  CLAIM_TIMELINE_PANEL_UPDATE

Hard rule:
  The anchor/robot may only select from pre-validated virtual screen actions.
  No real hardware commands ever leave the process.
```

### H. ApexLoad / FlowState / PreCognition

```
ApexLoad = a1·queueDepth
         + a2·renderCostEstimate
         + a3·APIQuotaPressure
         + a4·liveUrgency
         + a5·moderationLoad
         + a6·viewerChatVelocity

FlowState = readinessScore
          · safetyScore
          · dataCompleteness
          · componentAvailability
          · operatorOverrideClearance

PreCognitionRisk = p1·sourceRisk
                 + p2·legalRisk
                 + p3·timingRisk
                 + p4·visualMismatchRisk
                 + p5·chatAbuseRisk
                 + p6·providerFailureRisk

Dispatch iff:
  FlowState >= MIN_FLOW
  AND PreCognitionRisk <= MAX_RISK
  AND ApexLoad <= MAX_LOAD
  AND approvalState permits the action
```

### I. Chat / comment moderation score

```
chatRiskScore = toxicityScore
              + spamScore
              + scamScore
              + hateScore
              + piiLeakRisk
              + impersonationRisk
              + platformPolicyRisk
              - trustedUserScore

Action ladder:
  ALLOW            if chatRiskScore < T_LOW
  DELAY            if T_LOW <= chatRiskScore < T_MED
  HIDE             if T_MED <= chatRiskScore < T_HIGH
  FLAG_FOR_MOD     if T_HIGH <= chatRiskScore < T_CRIT
  BLOCK            if T_CRIT <= chatRiskScore < T_BAN
  ESCALATE         if chatRiskScore >= T_BAN
```

(Aligns with the 13-axis Omni-Channel Audience Safety service in `server/services/omni-channel-audience-safety-service.ts`.)

### J. Cost control score

```
expectedCost = LLM_tokens · tokenPrice
             + TTS_seconds · voicePrice
             + renderSeconds · renderPrice
             + storageGB · storagePrice
             + bandwidthGB · bandwidthPrice

Dispatch iff:
  expectedCost <= budgetForImpactTier
  OR founderOverride == true
```

---

## Safety constraints — consolidated checklist

| # | Constraint | Enforcement site |
|---|---|---|
| 1 | No copyrighted video reuse | Legal Visual Resolver (eligibility filter §F) |
| 2 | No logo / watermark removal | Same — `watermarkRemovalRequired == false` |
| 3 | No `publicUrl` until approval | Approval Board state machine §9 |
| 4 | No `signedUrl` until approval | Approval Board state machine §9 |
| 5 | `realSendAllowed = false` until manual dispatch | §9 `ManualDispatch` transition |
| 6 | `executionEnabled = false` for renders | `avatar-video-render-service.ts:1123–1130` |
| 7 | No Unreal execution | Same service throws 503 for non-`dry_run` |
| 8 | No real 4D hardware | `cinema-control-service.ts:13–22` header |
| 9 | No Spyder / Barco / Novastar commands | Same |
| 10 | No autonomous publishing | `safe-mode-service.ts:16` `pauseAutonomousPublishing` |
| 11 | YouTube manual approval only | `youtube-publishing-service.ts:240, 299` |
| 12 | Social distribution manual / export-first | `social-distribution-approval-service.ts:24` |
| 13 | Shorts approval flips DB flags only | `shorts-cutter-service.ts:13–14, 542–554` |
| 14 | Broadcast dry-run default + token-gate | `broadcast-compositor-service.ts:87–88, 379, 455, 479` |
| 15 | Council governance read-only audit preview | `council-governance-service.ts:49` |
| 16 | PTO mode + Panic Button override | `FounderPtoMode`, Panic Button service |
| 17 | Audience safety simulation only | `omni-channel-audience-safety-service.ts` — `commandMode: simulation_only` |

---

## Open questions / future tasks

| # | Question | Status |
|---|---|---|
| 1 | Confirm voice-job ownership clarification — should Production House have its own queue, or remain a cross-link to the podcast queue? | T4 UX-polish item; no service change planned |
| 2 | Should `/admin/cinema-control` (alias) be redirected or removed? | Requires founder go-ahead; out of T4 scope |
| 3 | Add a "Debate → Export" discoverability card under Debate Studio | T4 UX-polish item |
| 4 | Group six ungrouped admin routes into a future "Strategy & Health" zone | Future scope, not T4 |
| 5 | Should default scoring weights (§A, §H, §I) be promoted into a single `server/config/scoring-weights.ts`? | Future task — purely additive |
| 6 | Should each diagram in this document be split into its own `.md` for embedding into individual zone pages? | Documentation polish |
| 7 | Mermaid render verification in production docs site (CI) — currently manual | Future docs CI task |

---

## Mermaid syntax verification

**Sanity checks applied to every diagram block in this document:**

| Check | Method | Result |
|---|---|---|
| Each block starts with a valid Mermaid keyword (`flowchart TD`, `graph LR`, `stateDiagram-v2`, `sequenceDiagram`) | Manual inspection | ✅ Pass — 10 / 10 blocks |
| Node IDs are simple identifiers (`A`, `R_NSRC`, `S1`) — no spaces or special characters | Manual inspection | ✅ Pass |
| Labels with parentheses or slashes are quoted (e.g. `"Voice Jobs<br/>podcastVoiceService.generateVoiceJob"`) | Manual inspection | ✅ Pass — parentheses removed from raw labels; `<br/>` used for line breaks |
| Arrow operators used only in supported forms (`-->`, `-.->`, `-. label .->`, `==>`, `===`) | Manual inspection | ✅ Pass |
| `stateDiagram-v2` uses valid `state --> state: trigger` transitions | Manual inspection | ✅ Pass |
| `sequenceDiagram` uses `participant Alias as Name` and `autonumber` | Manual inspection | ✅ Pass |
| Subgraph IDs are unique within each diagram | Manual inspection | ✅ Pass |
| No unescaped `(` `)` `[` `]` `{` `}` inside unquoted labels | Manual inspection | ✅ Pass — all such labels are quoted |
| Diagrams are split into 10 readable blocks (not one mega-graph) | Per `<13>` requirement | ✅ Pass |

**Automated Mermaid CLI:** not available in this Replit sandbox by default. To re-verify locally:

```bash
# Optional, only if you want to add it to CI later
npx -y @mermaid-js/mermaid-cli -i docs/reports/MOUGLE_NEWS_PODCAST_PRODUCTION_SYSTEM_FLOWCHARTS.md -o /tmp/mougle-flowcharts.svg
```

No automated tool was run in this task to avoid installing dev dependencies.

---

## Confirmations

- **Document path:** `docs/reports/MOUGLE_NEWS_PODCAST_PRODUCTION_SYSTEM_FLOWCHARTS.md`
- **Diagrams created:** 10 (full system, news, podcast, debate, production-house, 3D/4D, distribution, dashboard link map, safety state machine, algorithmic layer with embedded sequence diagram)
- **Key systems covered:** News Room Studio, Podcast Room Studio, Debate Studio, Production House, 3D/4D/Unreal simulation, Distribution, Media & Content Pipeline compatibility, Omni-Channel Audience Safety, Approval/Readiness/Audit substrate, Algorithmic decision layer (10 formula families A–J), Safety constraints (17 enforcement sites)
- **Mermaid syntax checked:** Manual inspection per the §"Mermaid syntax verification" table; no automated CLI run (avoided dev-dependency install)
- **No source code, route, schema, migration, safe-mode flag, render path, publishing path, Unreal/4D hardware path, or backend behavior changed.** Only this Markdown report was created.

End of document.
