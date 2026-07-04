import path from "node:path";
import process from "node:process";
import { SCORE_PENALTIES, SCORE_WEIGHTS } from "../config.js";
import { checkResult } from "../scoring.js";
import type { CheckResult, Evidence } from "../types.js";
import { commandExists } from "../utils/command.js";
import { findNamesInRoots, homePath, pathExists } from "../utils/files.js";

export async function runAppChecks(): Promise<CheckResult[]> {
  return [
    await checkMessagingApps(),
    await checkClashApps(),
    await checkMainstreamBrowsers()
  ];
}

async function checkMessagingApps(): Promise<CheckResult> {
  const matches = await findInstalledNames(["wechat", "weixin", "qq", "qqnt", "tencent", "wecom"]);
  const strongMatches = matches.filter((match) => /(wechat|weixin|qq|qqnt|wecom|微信|腾讯)/i.test(match));

  return checkResult({
    id: "apps.tencent_messaging",
    category: "apps",
    title: "WeChat or QQ apps",
    status: strongMatches.length > 0 ? "warn" : "pass",
    weight: SCORE_WEIGHTS.apps.messaging,
    scoreImpact: strongMatches.length > 0 ? -SCORE_WEIGHTS.apps.messaging : 0,
    summary: strongMatches.length > 0 ? "WeChat/QQ/Tencent-related apps were found." : "No WeChat/QQ/Tencent app was found in common install paths.",
    evidence: matchesToEvidence(strongMatches)
  });
}

async function checkClashApps(): Promise<CheckResult> {
  const matches = await findInstalledNames(["clash"]);
  return checkResult({
    id: "apps.clash",
    category: "apps",
    title: "Clash-like apps",
    status: matches.length > 0 ? "warn" : "pass",
    weight: SCORE_WEIGHTS.apps.clash,
    scoreImpact: matches.length > 0 ? SCORE_PENALTIES.apps.clashDetected : 0,
    summary: matches.length > 0 ? "An installed app/path containing 'clash' was found." : "No installed app/path containing 'clash' was found in common install paths.",
    evidence: matchesToEvidence(matches)
  });
}

async function checkMainstreamBrowsers(): Promise<CheckResult> {
  const found = new Set<string>();

  for (const [name, candidates] of Object.entries(browserCandidates())) {
    const exists = await anyPathExists(candidates.paths);
    const commandFound = await anyCommandExists(candidates.commands);
    if (exists || commandFound) {
      found.add(name);
    }
  }

  return checkResult({
    id: "apps.browsers",
    category: "human",
    title: "Mainstream browser presence",
    status: found.size > 0 ? "pass" : "warn",
    weight: SCORE_WEIGHTS.human.browser,
    scoreImpact: found.size > 0 ? 0 : -SCORE_WEIGHTS.human.browser,
    summary: found.size > 0 ? "At least one mainstream browser was found." : "No mainstream browser was found in common paths or PATH.",
    evidence: found.size > 0 ? [...found].map((name) => ({ label: "browser", value: name })) : [{ label: "browser", value: null }]
  });
}

async function findInstalledNames(needles: string[]): Promise<string[]> {
  const roots = installRoots();
  const matches = await findNamesInRoots(roots, needles, { maxDepth: process.platform === "win32" ? 3 : 2, maxMatches: 30 });

  for (const needle of needles) {
    if (await commandExists(needle)) {
      matches.push(`PATH:${needle}`);
    }
  }

  return [...new Set(matches)].sort();
}

function installRoots(): string[] {
  if (process.platform === "darwin") {
    return [
      "/Applications",
      "/System/Applications",
      homePath("Applications")
    ];
  }

  if (process.platform === "win32") {
    return [
      process.env.ProgramFiles ?? "",
      process.env["ProgramFiles(x86)"] ?? "",
      process.env.LOCALAPPDATA ?? "",
      process.env.APPDATA ?? "",
      path.join(process.env.PUBLIC ?? "C:\\Users\\Public", "Desktop")
    ];
  }

  return [
    "/usr/share/applications",
    "/usr/local/share/applications",
    "/var/lib/flatpak/exports/share/applications",
    "/var/lib/snapd/desktop/applications",
    "/opt",
    homePath(".local", "share", "applications")
  ];
}

interface BrowserCandidate {
  paths: string[];
  commands: string[];
}

function browserCandidates(): Record<string, BrowserCandidate> {
  if (process.platform === "darwin") {
    return {
      "Google Chrome": { paths: ["/Applications/Google Chrome.app", homePath("Applications", "Google Chrome.app")], commands: ["google-chrome", "chrome"] },
      Firefox: { paths: ["/Applications/Firefox.app", homePath("Applications", "Firefox.app")], commands: ["firefox"] },
      "Microsoft Edge": { paths: ["/Applications/Microsoft Edge.app", homePath("Applications", "Microsoft Edge.app")], commands: ["microsoft-edge"] },
      Chromium: { paths: ["/Applications/Chromium.app", homePath("Applications", "Chromium.app")], commands: ["chromium"] },
      Safari: { paths: ["/Applications/Safari.app", "/System/Applications/Safari.app"], commands: ["safari"] },
      "360 Browser": { paths: ["/Applications/360Chrome.app", "/Applications/360安全浏览器.app"], commands: ["360chrome"] }
    };
  }

  if (process.platform === "win32") {
    const pf = process.env.ProgramFiles ?? "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const local = process.env.LOCALAPPDATA ?? "";
    return {
      "Google Chrome": { paths: [path.join(pf, "Google", "Chrome", "Application", "chrome.exe"), path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"), path.join(local, "Google", "Chrome", "Application", "chrome.exe")], commands: ["chrome.exe"] },
      Firefox: { paths: [path.join(pf, "Mozilla Firefox", "firefox.exe"), path.join(pf86, "Mozilla Firefox", "firefox.exe")], commands: ["firefox.exe"] },
      "Microsoft Edge": { paths: [path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"), path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe")], commands: ["msedge.exe"] },
      "Internet Explorer": { paths: [path.join(pf, "Internet Explorer", "iexplore.exe"), path.join(pf86, "Internet Explorer", "iexplore.exe")], commands: ["iexplore.exe"] },
      "360 Browser": { paths: [path.join(pf, "360", "360se6", "Application", "360se.exe"), path.join(pf86, "360", "360se6", "Application", "360se.exe")], commands: ["360se.exe"] }
    };
  }

  return {
    "Google Chrome": { paths: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"], commands: ["google-chrome", "google-chrome-stable"] },
    Chromium: { paths: ["/usr/bin/chromium", "/usr/bin/chromium-browser"], commands: ["chromium", "chromium-browser"] },
    Firefox: { paths: ["/usr/bin/firefox"], commands: ["firefox"] },
    "Microsoft Edge": { paths: ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable"], commands: ["microsoft-edge", "microsoft-edge-stable"] },
    "360 Browser": { paths: ["/opt/360/browser360-cn/stable/360browser"], commands: ["360browser"] }
  };
}

async function anyPathExists(paths: string[]): Promise<boolean> {
  for (const candidate of paths) {
    if (candidate && await pathExists(candidate)) {
      return true;
    }
  }
  return false;
}

async function anyCommandExists(commands: string[]): Promise<boolean> {
  for (const command of commands) {
    if (await commandExists(command)) {
      return true;
    }
  }
  return false;
}

function matchesToEvidence(matches: string[]): Evidence[] {
  if (matches.length === 0) {
    return [{ label: "match", value: null }];
  }
  return matches.slice(0, 12).map((match, index) => ({
    label: `match_${index + 1}`,
    value: match
  }));
}
