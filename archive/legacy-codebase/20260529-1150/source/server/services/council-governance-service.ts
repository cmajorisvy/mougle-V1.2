import {
  councilGovernanceOverview,
  debateCouncilAgents,
  newsVerificationCouncilAgents,
  packageContracts,
  sampleLedgerEntries,
  statusTaxonomy,
} from "../data/council-governance-registry";
import type {
  CouncilGovernanceOverview,
  CouncilPackageContractsResponse,
  CouncilResponse,
  CouncilSampleLedgerResponse,
  CouncilStatusTaxonomyResponse,
} from "@shared/models/council-governance";

export const councilGovernanceService = {
  getOverview(): CouncilGovernanceOverview {
    return councilGovernanceOverview;
  },

  getNewsCouncil(): CouncilResponse {
    return {
      councilType: "news_verification_council",
      displayName: "Mougle News Verification Council",
      description:
        "Admin-only static registry for the council that answers what happened, how verified it is, and what must remain gated before publication.",
      agents: newsVerificationCouncilAgents,
    };
  },

  getDebateCouncil(): CouncilResponse {
    return {
      councilType: "debate_council",
      displayName: "Mougle Debate Council",
      description:
        "Admin-only static registry for the council that reviews what verified facts mean, which positions are strongest, and what remains unresolved.",
      agents: debateCouncilAgents,
    };
  },

  getPackageContracts(): CouncilPackageContractsResponse {
    return packageContracts;
  },

  getSampleLedger(): CouncilSampleLedgerResponse {
    return {
      sampleLedgerEntries,
      note: "Planned audit preview only. These entries are static mock data, not database records and not provider output.",
    };
  },

  getStatusTaxonomy(): CouncilStatusTaxonomyResponse {
    return statusTaxonomy;
  },
};
