import process from "node:process";
import { runAllChecks } from "./checks/index.js";
import { CLI_TIMEOUTS } from "./config.js";
import { formatReport } from "./format.js";
import { buildReport } from "./scoring.js";
import type { AuditOptions } from "./types.js";

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv);

  if (options.help) {
    process.stdout.write(helpText());
    return 0;
  }

  const { checks, skipped } = await runAllChecks(options);
  const report = buildReport(checks, skipped);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatReport(report)}\n`);
  }

  if (options.strictExitCode && report.score < 70) {
    return 2;
  }
  return 0;
}

interface ParsedOptions extends AuditOptions {
  help: boolean;
}

function parseArgs(argv: string[]): ParsedOptions {
  const options: ParsedOptions = {
    json: false,
    noNetwork: false,
    timeoutMs: CLI_TIMEOUTS.defaultMs,
    strictExitCode: false,
    verbose: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--no-network") {
      options.noNetwork = true;
    } else if (arg === "--strict-exit-code") {
      options.strictExitCode = true;
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg === "--timeout") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--timeout requires a value in milliseconds");
      }
      options.timeoutMs = parsePositiveInteger(value, "--timeout");
      index += 1;
    } else if (arg?.startsWith("--timeout=")) {
      options.timeoutMs = parsePositiveInteger(arg.slice("--timeout=".length), "--timeout");
    } else if (arg === "--ip") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--ip requires an IP address");
      }
      options.ip = value;
      index += 1;
    } else if (arg?.startsWith("--ip=")) {
      options.ip = arg.slice("--ip=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.timeoutMs = Math.max(CLI_TIMEOUTS.minMs, Math.min(options.timeoutMs, CLI_TIMEOUTS.maxMs));
  return options;
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function helpText(): string {
  return `imnotcnuser - cross-platform environment risk audit CLI

Usage:
  imnotcnuser [options]
  incu [options]

Options:
  --json                 Print machine-readable JSON.
  --no-network           Skip IP reputation APIs and Gemini reachability.
  --ip <address>         Audit a specific exit IP instead of the current public IP.
  --timeout <ms>         Network and system command timeout, default ${CLI_TIMEOUTS.defaultMs}.
  --strict-exit-code     Exit with code 2 when score is below 70.
  -v, --verbose          Reserved for future verbose diagnostics.
  -h, --help             Show this help.

Notes:
  The score is a heuristic. It cannot guarantee access, anonymity, compliance,
  or bypass of any service policy.
`;
}
