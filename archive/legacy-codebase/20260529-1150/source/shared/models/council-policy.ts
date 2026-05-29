export type PolicySeverity = "pass" | "warning" | "fail";

export type PolicyFinding = {
  ruleId: string;
  severity: PolicySeverity;
  file: string;
  message: string;
  recommendation: string;
};

export type CouncilPackagePolicyReport = {
  status: "pass" | "pass_with_warnings" | "fail";
  checkedAt: string;
  checkedFiles: string[];
  findings: PolicyFinding[];
  summary: {
    errors: number;
    warnings: number;
    passes: number;
  };
};
