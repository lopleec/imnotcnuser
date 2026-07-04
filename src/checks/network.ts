import process from "node:process";
import { COMMAND_TIMEOUTS, NETWORK_ENDPOINTS, NETWORK_THRESHOLDS, PACKAGE_INFO, SCORE_PENALTIES, SCORE_WEIGHTS } from "../config.js";
import { checkResult } from "../scoring.js";
import type { AuditOptions, CheckResult, Evidence } from "../types.js";
import { runCommand } from "../utils/command.js";

export async function runNetworkChecks(options: AuditOptions): Promise<CheckResult[]> {
  return [
    await checkSystemProxy(options),
    await checkExitIp(options),
    await checkGeminiAccess(options)
  ];
}

async function checkSystemProxy(options: AuditOptions): Promise<CheckResult> {
  const envProxy = [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy"
  ].filter((name) => Boolean(process.env[name]));

  const evidence: Evidence[] = [
    { label: "env_proxy_vars", value: envProxy.length > 0 ? envProxy.join(",") : "none" }
  ];

  let systemProxyEnabled = false;
  let systemProxySummary = "not detected";

  if (process.platform === "darwin") {
    const result = await runCommand("scutil", ["--proxy"], { timeoutMs: Math.min(options.timeoutMs, COMMAND_TIMEOUTS.defaultMs) });
    if (result.ok) {
      const out = result.stdout;
      systemProxyEnabled = /\b(HTTPEnable|HTTPSEnable|SOCKSEnable)\s*:\s*1\b/.test(out);
      const hosts = out.match(/\b(?:HTTPProxy|HTTPSProxy|SOCKSProxy)\s*:\s*(.+)/g) ?? [];
      systemProxySummary = systemProxyEnabled ? hosts.join("; ") || "enabled" : "disabled";
      evidence.push({ label: "macos_scutil", value: systemProxySummary });
    } else {
      evidence.push({ label: "macos_scutil", value: result.timedOut ? "timeout" : "unavailable" });
    }
  } else if (process.platform === "win32") {
    const result = await runCommand("reg", [
      "query",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
      "/v",
      "ProxyEnable"
    ], { timeoutMs: Math.min(options.timeoutMs, COMMAND_TIMEOUTS.defaultMs) });
    if (result.ok) {
      systemProxyEnabled = /0x1\b/i.test(result.stdout);
      systemProxySummary = systemProxyEnabled ? "enabled" : "disabled";
      evidence.push({ label: "windows_proxy", value: systemProxySummary });
    } else {
      evidence.push({ label: "windows_proxy", value: result.timedOut ? "timeout" : "unavailable" });
    }
  } else if (process.platform === "linux") {
    const result = await runCommand("gsettings", ["get", "org.gnome.system.proxy", "mode"], { timeoutMs: 1500 });
    if (result.ok) {
      const mode = result.stdout.trim().replaceAll("'", "");
      systemProxyEnabled = mode !== "none" && mode.length > 0;
      systemProxySummary = mode || "unknown";
      evidence.push({ label: "gnome_proxy_mode", value: systemProxySummary });
    } else {
      evidence.push({ label: "gnome_proxy_mode", value: "unavailable" });
    }
  }

  const hasAnyProxy = envProxy.length > 0 || systemProxyEnabled;

  return checkResult({
    id: "network.proxy",
    category: "network",
    title: "Proxy configuration",
    status: hasAnyProxy ? "pass" : "warn",
    weight: SCORE_WEIGHTS.network.proxy,
    scoreImpact: hasAnyProxy ? 0 : SCORE_PENALTIES.network.missingProxy,
    summary: hasAnyProxy
      ? "A proxy configuration was found."
      : "No obvious proxy configuration was found; some tools may connect directly.",
    evidence,
    hints: hasAnyProxy ? [] : ["Some CLIs ignore system proxy settings and only read HTTP_PROXY/HTTPS_PROXY/ALL_PROXY."]
  });
}

async function checkExitIp(options: AuditOptions): Promise<CheckResult> {
  if (options.noNetwork) {
    return checkResult({
      id: "network.exit_ip",
      category: "network",
      title: "Exit IP reputation",
      status: "unknown",
      weight: SCORE_WEIGHTS.network.exitIp,
      scoreImpact: 0,
      summary: "Skipped because --no-network was used.",
      evidence: []
    });
  }

  const ipApiUrl = `${NETWORK_ENDPOINTS.ipApiBaseUrl}/${options.ip ? encodeURIComponent(options.ip) : ""}?fields=${NETWORK_ENDPOINTS.ipApiFields}`;
  const ipapiUrl = `${NETWORK_ENDPOINTS.ipapiBaseUrl}${options.ip ? `?q=${encodeURIComponent(options.ip)}` : ""}`;

  const [ipApi, ipapi] = await Promise.all([
    fetchJson(ipApiUrl, options.timeoutMs),
    fetchJson(ipapiUrl, options.timeoutMs)
  ]);

  const evidence: Evidence[] = [
    { label: "ip-api", value: ipApi.ok ? "ok" : ipApi.error ?? "failed" },
    { label: "ipapi.is", value: ipapi.ok ? "ok" : ipapi.error ?? "failed" }
  ];

  const ipApiData = ipApi.json as Record<string, unknown> | undefined;
  const ipapiData = ipapi.json as Record<string, unknown> | undefined;

  if (ipApiData) {
    evidence.push({ label: "ip-api.query", value: stringValue(ipApiData.query) });
    evidence.push({ label: "ip-api.status", value: stringValue(ipApiData.status) });
    evidence.push({ label: "ip-api.message", value: stringValue(ipApiData.message) });
    evidence.push({ label: "ip-api.country", value: stringValue(ipApiData.countryCode ?? ipApiData.country) });
    evidence.push({ label: "ip-api.isp", value: stringValue(ipApiData.isp ?? ipApiData.org ?? ipApiData.asname) });
    evidence.push({ label: "ip-api.proxy", value: booleanValue(ipApiData.proxy) });
    evidence.push({ label: "ip-api.hosting", value: booleanValue(ipApiData.hosting) });
    evidence.push({ label: "ip-api.mobile", value: booleanValue(ipApiData.mobile) });
  }

  if (ipapiData) {
    evidence.push({ label: "ipapi.ip", value: firstString(ipapiData, ["ip", "query"]) });
    evidence.push({ label: "ipapi.country", value: getCountry(ipapiData) });
    evidence.push({ label: "ipapi.asn_org", value: firstString(ipapiData, ["asn.org", "asn.name", "company.name", "company.domain"]) });
    evidence.push({ label: "ipapi.datacenter", value: detectAnyBoolean(ipapiData, ["is_datacenter", "datacenter", "privacy.hosting", "hosting"]) });
    evidence.push({ label: "ipapi.proxy_vpn_tor", value: detectAnyBoolean(ipapiData, ["is_proxy", "is_vpn", "is_tor", "proxy", "vpn", "tor", "privacy.proxy", "privacy.vpn", "privacy.tor", "privacy.relay"]) });
    evidence.push({ label: "ipapi.abuse_or_fraud", value: firstNumber(ipapiData, ["fraud_score", "risk.score", "abuse.score"]) });
  }

  const china = isChinaValue(ipApiData?.country) || isChinaValue(ipApiData?.countryCode) || isChinaValue(getCountry(ipapiData));
  const hosting = booleanValue(ipApiData?.hosting) || detectAnyBoolean(ipapiData, ["is_datacenter", "datacenter", "privacy.hosting", "hosting"]);
  const proxyVpnTor = booleanValue(ipApiData?.proxy) || detectAnyBoolean(ipapiData, ["is_proxy", "is_vpn", "is_tor", "proxy", "vpn", "tor", "privacy.proxy", "privacy.vpn", "privacy.tor", "privacy.relay"]);
  const fraudScore = firstNumber(ipapiData, ["fraud_score", "risk.score", "abuse.score"]);
  const bothFailed = !ipApi.ok && !ipapi.ok;
  const ipApiFailed = typeof ipApiData?.status === "string" && ipApiData.status.toLowerCase() === "fail";

  let impact = 0;
  const issues: string[] = [];

  if (bothFailed || ipApiFailed) {
    impact += SCORE_PENALTIES.network.exitIpApiFailure;
    issues.push(bothFailed ? "both IP reputation APIs failed" : "ip-api returned fail");
  }
  if (china) {
    impact += SCORE_PENALTIES.network.exitIpChina;
    issues.push("exit IP appears to be in China");
  }
  if (hosting) {
    impact += SCORE_PENALTIES.network.exitIpHosting;
    issues.push("exit IP looks like datacenter or hosting");
  }
  if (proxyVpnTor) {
    impact += SCORE_PENALTIES.network.exitIpProxyVpnTor;
    issues.push("exit IP is flagged as proxy/VPN/Tor/relay");
  }
  if (typeof fraudScore === "number" && fraudScore >= NETWORK_THRESHOLDS.fraudVeryHigh) {
    impact += SCORE_PENALTIES.network.exitIpFraudVeryHigh;
    issues.push("fraud score is very high");
  } else if (typeof fraudScore === "number" && fraudScore >= NETWORK_THRESHOLDS.fraudHigh) {
    impact += SCORE_PENALTIES.network.exitIpFraudHigh;
    issues.push("fraud score is high");
  }

  const status = issues.length === 0 ? "pass" : china || bothFailed ? "fail" : "warn";

  return checkResult({
    id: "network.exit_ip",
    category: "network",
    title: "Exit IP reputation",
    status,
    weight: SCORE_WEIGHTS.network.exitIp,
    scoreImpact: impact,
    summary: issues.length > 0 ? issues.join("; ") : "Exit IP did not show obvious China/datacenter/proxy risk signals.",
    evidence
  });
}

async function checkGeminiAccess(options: AuditOptions): Promise<CheckResult> {
  if (options.noNetwork) {
    return checkResult({
      id: "network.gemini",
      category: "network",
      title: "Gemini web reachability",
      status: "unknown",
      weight: SCORE_WEIGHTS.network.gemini,
      scoreImpact: 0,
      summary: "Skipped because --no-network was used.",
      evidence: []
    });
  }

  const result = await fetchText(NETWORK_ENDPOINTS.geminiAppUrl, options.timeoutMs, {
    "user-agent": PACKAGE_INFO.userAgent
  });

  const evidence: Evidence[] = [
    { label: "url", value: result.url ?? NETWORK_ENDPOINTS.geminiAppUrl },
    { label: "status", value: result.status ?? null }
  ];

  if (!result.ok) {
    const timeout = result.error?.toLowerCase().includes("timeout") ?? false;
    return checkResult({
      id: "network.gemini",
      category: "network",
      title: "Gemini web reachability",
      status: timeout ? "warn" : "fail",
      weight: SCORE_WEIGHTS.network.gemini,
      scoreImpact: timeout ? SCORE_PENALTIES.network.geminiTimeout : SCORE_PENALTIES.network.geminiFailure,
      summary: timeout ? "Gemini timed out." : `Gemini request failed: ${result.error ?? "unknown error"}.`,
      evidence
    });
  }

  const body = result.text.toLowerCase();
  const unsupported = [
    "not currently supported in your country",
    "not available in your country",
    "not available in your region",
    "your country is not supported",
    "service is not available",
    "unsupported country",
    "所在的国家",
    "所在地区",
    "不支持",
    "不可用"
  ].some((pattern) => body.includes(pattern.toLowerCase()));

  const blockedStatus = result.status === 403 || result.status === 451;
  const failed = unsupported || blockedStatus;

  return checkResult({
    id: "network.gemini",
    category: "network",
    title: "Gemini web reachability",
    status: failed ? "fail" : "pass",
    weight: SCORE_WEIGHTS.network.gemini,
    scoreImpact: failed ? SCORE_PENALTIES.network.geminiFailure : 0,
    summary: failed
      ? "Gemini response looks region-blocked or forbidden."
      : "Gemini responded without obvious region-block text.",
    evidence
  });
}

interface FetchJsonResult {
  ok: boolean;
  json?: unknown;
  status?: number;
  error?: string;
}

interface FetchTextResult {
  ok: boolean;
  text: string;
  status?: number;
  url?: string;
  error?: string;
}

async function fetchJson(url: string, timeoutMs: number): Promise<FetchJsonResult> {
  const text = await fetchText(url, timeoutMs);
  if (!text.ok) {
    return withOptionalFetchFields({ ok: false }, text.status, text.error);
  }
  try {
    return withOptionalFetchFields({ ok: true, json: JSON.parse(text.text) }, text.status);
  } catch (error) {
    return withOptionalFetchFields({ ok: false }, text.status, error instanceof Error ? error.message : "invalid json");
  }
}

async function fetchText(url: string, timeoutMs: number, headers: Record<string, string> = {}): Promise<FetchTextResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: "follow"
    });
    const text = await response.text();
    return {
      ok: response.ok,
      text,
      status: response.status,
      url: response.url
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      text: "",
      error: aborted || message === "This operation was aborted" ? "timeout" : message
    };
  } finally {
    clearTimeout(timer);
  }
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function isChinaValue(value: unknown): boolean {
  const normalized = stringValue(value)?.toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized === "cn"
    || normalized.includes("china")
    || normalized.includes("中国")
    || normalized.includes("mainland");
}

function getCountry(data: Record<string, unknown> | undefined): string | null {
  if (!data) {
    return null;
  }
  return firstString(data, ["country_code", "country", "location.country_code", "location.country", "location.country_name"]);
}

function firstString(data: Record<string, unknown> | undefined, paths: string[]): string | null {
  if (!data) {
    return null;
  }
  for (const path of paths) {
    const value = getPath(data, path);
    const str = stringValue(value);
    if (str) {
      return str;
    }
  }
  return null;
}

function firstNumber(data: Record<string, unknown> | undefined, paths: string[]): number | null {
  if (!data) {
    return null;
  }
  for (const path of paths) {
    const value = getPath(data, path);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function detectAnyBoolean(data: Record<string, unknown> | undefined, paths: string[]): boolean {
  if (!data) {
    return false;
  }
  return paths.some((path) => booleanValue(getPath(data, path)));
}

function getPath(data: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, data);
}

function withOptionalFetchFields<T extends FetchJsonResult>(result: T, status?: number, error?: string): T {
  if (typeof status === "number") {
    result.status = status;
  }
  if (error) {
    result.error = error;
  }
  return result;
}
