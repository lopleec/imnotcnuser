export type CheckCategory = "network" | "system" | "apps" | "human";

export type CheckStatus = "pass" | "warn" | "fail" | "info" | "unknown" | "error";

export interface Evidence {
  label: string;
  value: string | number | boolean | null;
}

export interface CheckResult {
  id: string;
  category: CheckCategory;
  title: string;
  status: CheckStatus;
  weight: number;
  scoreEarned: number;
  scoreMax: number;
  scoreImpact: number;
  summary: string;
  evidence: Evidence[];
  hints?: string[];
}

export interface AuditOptions {
  ip?: string;
  json: boolean;
  noNetwork: boolean;
  timeoutMs: number;
  strictExitCode: boolean;
  verbose: boolean;
}

export interface PlatformInfo {
  platform: NodeJS.Platform;
  arch: string;
  release: string;
  hostname: string;
  node: string;
}

export interface AuditReport {
  generatedAt: string;
  platform: PlatformInfo;
  score: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  confidence: number;
  checks: CheckResult[];
  skipped: string[];
  disclaimer: string;
}
