import os from "node:os";
import type { AuditReport, CheckResult, PlatformInfo } from "./types.js";

const DISCLAIMER = "This is a heuristic privacy and environment audit. It cannot guarantee access, anonymity, compliance, or bypass of any service policy.";

export function buildReport(checks: CheckResult[], skipped: string[]): AuditReport {
  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  const knownWeight = checks
    .filter((check) => check.status !== "unknown" && check.status !== "error")
    .reduce((sum, check) => sum + check.weight, 0);
  const earnedWeight = checks
    .filter((check) => check.status !== "unknown" && check.status !== "error")
    .reduce((sum, check) => sum + check.scoreEarned, 0);
  const score = knownWeight === 0 ? 0 : clamp((earnedWeight / knownWeight) * 100, 0, 100);
  const confidence = totalWeight === 0 ? 0 : Math.round((knownWeight / totalWeight) * 100);

  return {
    generatedAt: new Date().toISOString(),
    platform: platformInfo(),
    score,
    riskLevel: riskLevel(score),
    confidence,
    checks,
    skipped,
    disclaimer: DISCLAIMER
  };
}

type CheckResultInput = Omit<CheckResult, "scoreEarned" | "scoreMax">;

export function checkResult(input: CheckResultInput): CheckResult {
  const known = input.status !== "unknown" && input.status !== "error";
  const scoreMax = input.weight;
  const scoreImpact = known ? clamp(input.scoreImpact, -scoreMax, 0) : 0;
  const scoreEarned = known ? clamp(scoreMax + scoreImpact, 0, scoreMax) : 0;

  return {
    ...input,
    scoreEarned,
    scoreMax,
    scoreImpact,
    evidence: input.evidence ?? []
  };
}

function platformInfo(): PlatformInfo {
  return {
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    hostname: os.hostname(),
    node: process.version
  };
}

function riskLevel(score: number): AuditReport["riskLevel"] {
  if (score >= 85) {
    return "low";
  }
  if (score >= 70) {
    return "medium";
  }
  if (score >= 50) {
    return "high";
  }
  return "critical";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
