import type { AuditReport, CheckCategory, CheckResult } from "./types.js";

const CATEGORY_ORDER: CheckCategory[] = ["network", "system", "apps", "human"];

export function formatReport(report: AuditReport): string {
  const lines: string[] = [];
  const color = makeColor();

  lines.push(color.bold("imnotcnuser environment audit"));
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Platform: ${report.platform.platform} ${report.platform.arch} ${report.platform.release}, Node ${report.platform.node}`);
  lines.push(`Score: ${colorScore(report.score, report.riskLevel, color)} / 100 (${report.riskLevel} risk), confidence ${report.confidence}%`);
  lines.push("");
  lines.push(report.disclaimer);
  lines.push("");

  for (const category of CATEGORY_ORDER) {
    const checks = report.checks.filter((check) => check.category === category);
    if (checks.length === 0) {
      continue;
    }
    lines.push(color.bold(category.toUpperCase()));
    for (const check of checks) {
      lines.push(formatCheck(check, color));
    }
    lines.push("");
  }

  const deductions = report.checks
    .filter((check) => check.status !== "unknown" && check.scoreEarned < check.scoreMax)
    .sort((a, b) => (a.scoreEarned - a.scoreMax) - (b.scoreEarned - b.scoreMax));

  lines.push(color.bold("SCORE MISSES"));
  if (deductions.length === 0) {
    lines.push("No missed points.");
  } else {
    for (const item of deductions) {
      lines.push(`- ${item.title}: ${formatPoints(item)} ${item.summary}`);
    }
  }

  if (report.skipped.length > 0) {
    lines.push("");
    lines.push(`Skipped: ${report.skipped.join(", ")}`);
  }

  return lines.join("\n");
}

function formatCheck(check: CheckResult, color: ReturnType<typeof makeColor>): string {
  const status = colorStatus(check.status, color);
  const lines = [`${check.title}: ${check.summary} (${formatPoints(check)}, ${status})`];
  for (const item of check.evidence.slice(0, 14)) {
    lines.push(`  - ${item.label}: ${formatValue(item.value)}`);
  }
  return lines.join("\n");
}

function formatPoints(check: CheckResult): string {
  if (check.status === "unknown" || check.status === "error") {
    return `unknown/${formatNumber(check.scoreMax)}`;
  }
  return `${formatNumber(check.scoreEarned)}/${formatNumber(check.scoreMax)}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatValue(value: string | number | boolean | null): string {
  if (value === null || value === "") {
    return "unknown";
  }
  return String(value);
}

function colorScore(score: number, riskLevel: AuditReport["riskLevel"], color: ReturnType<typeof makeColor>): string {
  if (riskLevel === "low") {
    return color.green(String(score));
  }
  if (riskLevel === "medium") {
    return color.yellow(String(score));
  }
  return color.red(String(score));
}

function colorStatus(status: CheckResult["status"], color: ReturnType<typeof makeColor>): string {
  if (status === "pass") {
    return color.green(status.toUpperCase());
  }
  if (status === "warn" || status === "unknown") {
    return color.yellow(status.toUpperCase());
  }
  if (status === "fail" || status === "error") {
    return color.red(status.toUpperCase());
  }
  return status.toUpperCase();
}

function makeColor() {
  const enabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  const wrap = (code: number, value: string) => enabled ? `\u001b[${code}m${value}\u001b[0m` : value;

  return {
    bold: (value: string) => wrap(1, value),
    green: (value: string) => wrap(32, value),
    yellow: (value: string) => wrap(33, value),
    red: (value: string) => wrap(31, value)
  };
}
