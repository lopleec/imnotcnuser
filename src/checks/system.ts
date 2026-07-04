import process from "node:process";
import { CHINESE_LOCALE_PATTERNS, COMMAND_TIMEOUTS, INPUT_METHOD_RISK_PATTERN, RISK_TIME_ZONES, SCORE_WEIGHTS } from "../config.js";
import { checkResult } from "../scoring.js";
import type { AuditOptions, CheckResult, Evidence } from "../types.js";
import { runCommand, runPowerShell } from "../utils/command.js";

const RISK_TIME_ZONE_SET = new Set<string>(RISK_TIME_ZONES);

export async function runSystemChecks(options: AuditOptions): Promise<CheckResult[]> {
  const localeSignals = await collectLocaleSignals(options);
  return [
    await checkTimeZone(),
    checkLanguage(localeSignals),
    checkRegionAndFormats(localeSignals),
    await checkInputMethods(options)
  ];
}

async function checkTimeZone(): Promise<CheckResult> {
  const intlTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  const envTimeZone = process.env.TZ ?? "";
  const allZones = [intlTimeZone, envTimeZone].filter(Boolean);
  const risky = allZones.some((zone) => RISK_TIME_ZONE_SET.has(zone.toLowerCase()));

  return checkResult({
    id: "system.timezone",
    category: "system",
    title: "System time zone",
    status: risky ? "fail" : "pass",
    weight: SCORE_WEIGHTS.system.timeZone,
    scoreImpact: risky ? -SCORE_WEIGHTS.system.timeZone : 0,
    summary: risky ? "Time zone points to China, Hong Kong, Macau, Urumqi, or Taiwan." : "Time zone does not match the configured high-risk list.",
    evidence: [
      { label: "intl_timezone", value: intlTimeZone || null },
      { label: "TZ", value: envTimeZone || null }
    ]
  });
}

function checkLanguage(signals: string[]): CheckResult {
  const risky = signals.some(isChineseLocaleLike);
  return checkResult({
    id: "system.language",
    category: "system",
    title: "System language",
    status: risky ? "fail" : "pass",
    weight: SCORE_WEIGHTS.system.language,
    scoreImpact: risky ? -SCORE_WEIGHTS.system.language : 0,
    summary: risky ? "Language or UI locale contains Simplified/Traditional Chinese signals." : "No obvious Chinese UI language signal was found.",
    evidence: summarizeSignals(signals, "locale_signal")
  });
}

function checkRegionAndFormats(signals: string[]): CheckResult {
  const regionRisk = signals.some((signal) => /(^|[_-])(cn|hk|mo|tw)(\.|@|$|[_-])/i.test(signal) || /currency=cny/i.test(signal));
  const dateLocale = Intl.DateTimeFormat().resolvedOptions().locale;
  const numberLocale = Intl.NumberFormat().resolvedOptions().locale;
  const risky = regionRisk || [dateLocale, numberLocale].some(isChineseLocaleLike);

  return checkResult({
    id: "system.region_formats",
    category: "system",
    title: "Region, date, and currency format",
    status: risky ? "fail" : "pass",
    weight: SCORE_WEIGHTS.system.regionFormats,
    scoreImpact: risky ? -SCORE_WEIGHTS.system.regionFormats : 0,
    summary: risky ? "Region/date/number/currency settings look China-adjacent." : "Region and formatting settings do not show obvious China-adjacent signals.",
    evidence: [
      { label: "date_locale", value: dateLocale },
      { label: "number_locale", value: numberLocale },
      ...summarizeSignals(signals, "region_signal").slice(0, 8)
    ]
  });
}

async function checkInputMethods(options: AuditOptions): Promise<CheckResult> {
  const signals: string[] = [];

  if (process.platform === "darwin") {
    const result = await runCommand("defaults", ["read", "com.apple.HIToolbox", "AppleEnabledInputSources"], { timeoutMs: Math.min(options.timeoutMs, COMMAND_TIMEOUTS.defaultMs) });
    if (result.ok) {
      signals.push(...result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    }
  } else if (process.platform === "linux") {
    for (const name of ["GTK_IM_MODULE", "QT_IM_MODULE", "XMODIFIERS"]) {
      if (process.env[name]) {
        signals.push(`${name}=${process.env[name]}`);
      }
    }
    const ibus = await runCommand("ibus", ["engine"], { timeoutMs: 1000 });
    if (ibus.ok && ibus.stdout.trim()) {
      signals.push(`ibus=${ibus.stdout.trim()}`);
    }
    const fcitx = await runCommand("fcitx5-remote", ["-n"], { timeoutMs: 1000 });
    if (fcitx.ok && fcitx.stdout.trim()) {
      signals.push(`fcitx=${fcitx.stdout.trim()}`);
    }
  } else if (process.platform === "win32") {
    const result = await runPowerShell("Get-WinUserLanguageList | ForEach-Object { $_.LanguageTag + ' ' + ($_.InputMethodTips -join ',') }", { timeoutMs: Math.min(options.timeoutMs, COMMAND_TIMEOUTS.defaultMs) });
    if (result.ok) {
      signals.push(...result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    }
  }

  const risky = signals.some((signal) => INPUT_METHOD_RISK_PATTERN.test(signal));

  return checkResult({
    id: "system.input_method",
    category: "system",
    title: "Keyboard and input methods",
    status: risky ? "fail" : signals.length === 0 ? "unknown" : "pass",
    weight: SCORE_WEIGHTS.system.inputMethod,
    scoreImpact: risky ? -SCORE_WEIGHTS.system.inputMethod : 0,
    summary: risky ? "Chinese/Pinyin-like input method signals were found." : signals.length === 0 ? "No input method data was available." : "No Chinese/Pinyin-like input method signal was found.",
    evidence: summarizeSignals(signals, "input_signal")
  });
}

async function collectLocaleSignals(options: AuditOptions): Promise<string[]> {
  const signals = new Set<string>();
  signals.add(Intl.DateTimeFormat().resolvedOptions().locale);
  signals.add(Intl.NumberFormat().resolvedOptions().locale);

  for (const name of ["LANG", "LC_ALL", "LC_MESSAGES", "LC_CTYPE", "LANGUAGE"]) {
    if (process.env[name]) {
      signals.add(`${name}=${process.env[name]}`);
    }
  }

  if (process.platform === "darwin") {
    const locale = await runCommand("defaults", ["read", "-g", "AppleLocale"], { timeoutMs: Math.min(options.timeoutMs, COMMAND_TIMEOUTS.defaultMs) });
    if (locale.ok && locale.stdout.trim()) {
      signals.add(`AppleLocale=${locale.stdout.trim()}`);
    }
    const languages = await runCommand("defaults", ["read", "-g", "AppleLanguages"], { timeoutMs: Math.min(options.timeoutMs, COMMAND_TIMEOUTS.defaultMs) });
    if (languages.ok && languages.stdout.trim()) {
      signals.add(`AppleLanguages=${languages.stdout.trim().replace(/\s+/g, " ")}`);
    }
  } else if (process.platform === "win32") {
    const culture = await runPowerShell("[System.Globalization.CultureInfo]::CurrentCulture.Name; [System.Globalization.CultureInfo]::CurrentUICulture.Name; (Get-WinHomeLocation | Select-Object -ExpandProperty HomeLocation)", { timeoutMs: Math.min(options.timeoutMs, COMMAND_TIMEOUTS.defaultMs) });
    if (culture.ok) {
      for (const line of culture.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
        signals.add(`windows=${line}`);
      }
    }
  }

  return [...signals].filter(Boolean);
}

function isChineseLocaleLike(signal: string): boolean {
  const normalized = signal.toLowerCase().replaceAll(".", "_");
  return CHINESE_LOCALE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function summarizeSignals(signals: string[], label: string): Evidence[] {
  if (signals.length === 0) {
    return [{ label, value: null }];
  }
  return signals.slice(0, 12).map((signal, index) => ({
    label: `${label}_${index + 1}`,
    value: signal.length > 180 ? `${signal.slice(0, 177)}...` : signal
  }));
}
