import type { AuditOptions, CheckResult } from "../types.js";
import { runAppChecks } from "./apps.js";
import { runHumanChecks } from "./human.js";
import { runNetworkChecks } from "./network.js";
import { runSystemChecks } from "./system.js";

export async function runAllChecks(options: AuditOptions): Promise<{ checks: CheckResult[]; skipped: string[] }> {
  const skipped = options.noNetwork ? ["network requests"] : [];
  const groups = await Promise.all([
    runNetworkChecks(options),
    runSystemChecks(options),
    runAppChecks(),
    runHumanChecks(options)
  ]);

  return {
    checks: groups.flat(),
    skipped
  };
}
