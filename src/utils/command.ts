import { spawn } from "node:child_process";
import process from "node:process";

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  error?: string;
}

export interface CommandOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export function runCommand(command: string, args: string[] = [], options: CommandOptions = {}): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? 3000;

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        stdout,
        stderr,
        code: null,
        timedOut,
        error: error.message
      });
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        stdout,
        stderr,
        code,
        timedOut
      });
    });
  });
}

export async function runPowerShell(script: string, options: CommandOptions = {}): Promise<CommandResult> {
  const candidates = process.platform === "win32"
    ? ["powershell.exe", "powershell", "pwsh"]
    : ["pwsh", "powershell"];

  for (const candidate of candidates) {
    if (!await commandExists(candidate)) {
      continue;
    }

    const args = candidate === "pwsh"
      ? ["-NoProfile", "-Command", script]
      : ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script];
    return runCommand(candidate, args, options);
  }

  return {
    ok: false,
    stdout: "",
    stderr: "",
    code: null,
    timedOut: false,
    error: "PowerShell executable not found"
  };
}

export async function commandExists(command: string): Promise<boolean> {
  const checker = process.platform === "win32"
    ? await runCommand("where", [command], { timeoutMs: 1500 })
    : await runCommand("sh", ["-c", `command -v ${quoteShell(command)}`], { timeoutMs: 1500 });
  return checker.ok && checker.stdout.trim().length > 0;
}

function quoteShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
