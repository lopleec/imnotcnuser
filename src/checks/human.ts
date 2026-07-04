import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { COMMAND_TIMEOUTS, HARDWARE_THRESHOLDS, SCORE_PENALTIES, SCORE_WEIGHTS } from "../config.js";
import { checkResult } from "../scoring.js";
import type { AuditOptions, CheckResult, Evidence } from "../types.js";
import { runCommand, runPowerShell } from "../utils/command.js";
import { pathExists } from "../utils/files.js";

export async function runHumanChecks(options: AuditOptions): Promise<CheckResult[]> {
  return [
    await checkContainerOrVm(options),
    checkMemory(),
    await checkStorage(options),
    await checkCamera(options),
    await checkMicrophone(options)
  ];
}

async function checkContainerOrVm(options: AuditOptions): Promise<CheckResult> {
  const evidence: Evidence[] = [];
  let container = false;
  let vm = false;

  if (process.platform === "linux") {
    container = await pathExists("/.dockerenv") || await pathExists("/run/.containerenv");
    evidence.push({ label: "container_marker", value: container });

    try {
      const cgroup = await fs.readFile("/proc/1/cgroup", "utf8");
      if (/docker|containerd|kubepods|lxc|podman/i.test(cgroup)) {
        container = true;
        evidence.push({ label: "cgroup", value: "container-like" });
      }
    } catch {
      evidence.push({ label: "cgroup", value: null });
    }

    const detectVirt = await runCommand("systemd-detect-virt", [], { timeoutMs: COMMAND_TIMEOUTS.shortMs });
    if (detectVirt.ok && detectVirt.stdout.trim()) {
      const virt = detectVirt.stdout.trim();
      vm = virt !== "none";
      evidence.push({ label: "systemd_detect_virt", value: virt });
    }

    for (const file of ["/sys/class/dmi/id/product_name", "/sys/class/dmi/id/sys_vendor"]) {
      try {
        const value = (await fs.readFile(file, "utf8")).trim();
        evidence.push({ label: path.basename(file), value });
        if (/virtualbox|vmware|kvm|qemu|xen|parallels|hyper-v|bhyve/i.test(value)) {
          vm = true;
        }
      } catch {
        // Ignore missing DMI files.
      }
    }
  } else if (process.platform === "darwin") {
    const model = await runCommand("sysctl", ["-n", "hw.model"], { timeoutMs: Math.min(options.timeoutMs, COMMAND_TIMEOUTS.defaultMs) });
    if (model.ok) {
      const value = model.stdout.trim();
      evidence.push({ label: "hw.model", value });
      if (/virtual|vmware|parallels|virtualbox|qemu/i.test(value)) {
        vm = true;
      }
    }
    const profiler = await runCommand("system_profiler", ["SPHardwareDataType"], { timeoutMs: Math.min(options.timeoutMs, COMMAND_TIMEOUTS.profilerMs) });
    if (profiler.ok) {
      const lower = profiler.stdout.toLowerCase();
      evidence.push({ label: "system_profiler", value: lower.includes("model name") ? "available" : "limited" });
      if (/virtualbox|vmware|parallels|qemu|virtual machine/i.test(lower)) {
        vm = true;
      }
    }
  } else if (process.platform === "win32") {
    const result = await runPowerShell("(Get-CimInstance Win32_ComputerSystem | Select-Object -ExpandProperty Manufacturer); (Get-CimInstance Win32_ComputerSystem | Select-Object -ExpandProperty Model)", { timeoutMs: Math.min(options.timeoutMs, COMMAND_TIMEOUTS.windowsDeviceMs) });
    if (result.ok) {
      const value = result.stdout.trim().replace(/\r?\n/g, " ");
      evidence.push({ label: "computer_system", value });
      if (/virtualbox|vmware|kvm|qemu|xen|parallels|hyper-v|virtual machine/i.test(value)) {
        vm = true;
      }
    }
  }

  const impact = container ? SCORE_PENALTIES.human.container : vm ? SCORE_PENALTIES.human.virtualMachine : 0;

  return checkResult({
    id: "human.container_vm",
    category: "human",
    title: "Container or virtual machine",
    status: container || vm ? "fail" : evidence.length === 0 ? "unknown" : "pass",
    weight: SCORE_WEIGHTS.human.containerVm,
    scoreImpact: impact,
    summary: container ? "Container runtime signals were found." : vm ? "Virtual machine signals were found." : evidence.length === 0 ? "No virtualization data was available." : "No obvious container or VM signal was found.",
    evidence: evidence.length > 0 ? evidence : [{ label: "virtualization_signal", value: null }]
  });
}

function checkMemory(): CheckResult {
  const totalGb = os.totalmem() / 1024 / 1024 / 1024;
  const low = totalGb < HARDWARE_THRESHOLDS.minMemoryGb;

  return checkResult({
    id: "human.memory",
    category: "human",
    title: "Physical memory",
    status: low ? "warn" : "pass",
    weight: SCORE_WEIGHTS.human.memory,
    scoreImpact: low ? -SCORE_WEIGHTS.human.memory : 0,
    summary: low ? `Total memory is below ${HARDWARE_THRESHOLDS.minMemoryGb} GB.` : `Total memory is at least ${HARDWARE_THRESHOLDS.minMemoryGb} GB.`,
    evidence: [{ label: "total_memory_gb", value: Number(totalGb.toFixed(2)) }]
  });
}

async function checkStorage(options: AuditOptions): Promise<CheckResult> {
  const storageGb = await getRootStorageGb(options);
  if (storageGb === null) {
    return checkResult({
      id: "human.storage",
      category: "human",
      title: "Root storage size",
      status: "unknown",
      weight: SCORE_WEIGHTS.human.storage,
      scoreImpact: 0,
      summary: "Root storage size could not be detected.",
      evidence: [{ label: "root_storage_gb", value: null }]
    });
  }

  const low = storageGb < HARDWARE_THRESHOLDS.minStorageGb;
  return checkResult({
    id: "human.storage",
    category: "human",
    title: "Root storage size",
    status: low ? "warn" : "pass",
    weight: SCORE_WEIGHTS.human.storage,
    scoreImpact: low ? -SCORE_WEIGHTS.human.storage : 0,
    summary: low ? `Root storage is below ${HARDWARE_THRESHOLDS.minStorageGb} GB.` : `Root storage is at least ${HARDWARE_THRESHOLDS.minStorageGb} GB.`,
    evidence: [{ label: "root_storage_gb", value: Number(storageGb.toFixed(2)) }]
  });
}

async function checkCamera(options: AuditOptions): Promise<CheckResult> {
  const detection = await detectCamera(options);
  return checkResult({
    id: "human.camera",
    category: "human",
    title: "Camera presence",
    status: detection.found ? "pass" : detection.known ? "warn" : "unknown",
    weight: SCORE_WEIGHTS.human.camera,
    scoreImpact: detection.found || !detection.known ? 0 : -SCORE_WEIGHTS.human.camera,
    summary: detection.found ? "A camera was detected." : detection.known ? "No camera was detected." : "Camera data was not available.",
    evidence: detection.evidence
  });
}

async function checkMicrophone(options: AuditOptions): Promise<CheckResult> {
  const detection = await detectMicrophone(options);
  return checkResult({
    id: "human.microphone",
    category: "human",
    title: "Microphone presence",
    status: detection.found ? "pass" : detection.known ? "warn" : "unknown",
    weight: SCORE_WEIGHTS.human.microphone,
    scoreImpact: detection.found || !detection.known ? 0 : -SCORE_WEIGHTS.human.microphone,
    summary: detection.found ? "A microphone/input audio device was detected." : detection.known ? "No microphone/input audio device was detected." : "Microphone data was not available.",
    evidence: detection.evidence
  });
}

async function getRootStorageGb(options: AuditOptions): Promise<number | null> {
  if (process.platform === "win32") {
    const result = await runPowerShell("(Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\" | Select-Object -ExpandProperty Size)", { timeoutMs: Math.min(options.timeoutMs, COMMAND_TIMEOUTS.defaultMs) });
    if (!result.ok) {
      return null;
    }
    const bytes = Number(result.stdout.trim());
    return Number.isFinite(bytes) ? bytes / 1024 / 1024 / 1024 : null;
  }

  const result = await runCommand("df", ["-k", "/"], { timeoutMs: Math.min(options.timeoutMs, COMMAND_TIMEOUTS.defaultMs) });
  if (!result.ok) {
    return null;
  }
  const lines = result.stdout.trim().split(/\r?\n/);
  const data = lines[1]?.trim().split(/\s+/);
  const blocks = data?.[1] ? Number(data[1]) : NaN;
  return Number.isFinite(blocks) ? blocks / 1024 / 1024 : null;
}

interface DeviceDetection {
  found: boolean;
  known: boolean;
  evidence: Evidence[];
}

async function detectCamera(options: AuditOptions): Promise<DeviceDetection> {
  if (process.platform === "darwin") {
    const result = await runCommand("system_profiler", ["SPCameraDataType"], { timeoutMs: Math.min(options.timeoutMs, COMMAND_TIMEOUTS.profilerMs) });
    if (!result.ok) {
      return { found: false, known: false, evidence: [{ label: "camera", value: result.timedOut ? "timeout" : null }] };
    }
    const found = /camera|facetime|webcam|continuity/i.test(result.stdout) && !/No information found/i.test(result.stdout);
    return { found, known: true, evidence: [{ label: "macos_camera", value: found ? "found" : "not_found" }] };
  }

  if (process.platform === "linux") {
    try {
      const dev = await fs.readdir("/dev");
      const cameras = dev.filter((name) => /^video\d+$/.test(name));
      return { found: cameras.length > 0, known: true, evidence: [{ label: "video_devices", value: cameras.join(",") || null }] };
    } catch {
      return { found: false, known: false, evidence: [{ label: "video_devices", value: null }] };
    }
  }

  if (process.platform === "win32") {
    const result = await runPowerShell("Get-PnpDevice -Class Camera -Status OK | Select-Object -First 5 -ExpandProperty FriendlyName", { timeoutMs: Math.min(options.timeoutMs, COMMAND_TIMEOUTS.windowsDeviceMs) });
    const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return { found: result.ok && lines.length > 0, known: result.ok, evidence: [{ label: "windows_camera", value: lines.join(",") || null }] };
  }

  return { found: false, known: false, evidence: [{ label: "camera", value: null }] };
}

async function detectMicrophone(options: AuditOptions): Promise<DeviceDetection> {
  if (process.platform === "darwin") {
    const result = await runCommand("system_profiler", ["SPAudioDataType"], { timeoutMs: Math.min(options.timeoutMs, COMMAND_TIMEOUTS.profilerMs) });
    if (!result.ok) {
      return { found: false, known: false, evidence: [{ label: "audio", value: result.timedOut ? "timeout" : null }] };
    }
    const lower = result.stdout.toLowerCase();
    const found = /(input|microphone|built-in microphone|external microphone)/i.test(lower);
    return { found, known: true, evidence: [{ label: "macos_microphone", value: found ? "found" : "not_found" }] };
  }

  if (process.platform === "linux") {
    const arecord = await runCommand("arecord", ["-l"], { timeoutMs: COMMAND_TIMEOUTS.shortMs });
    if (arecord.ok) {
      const found = /card \d+:/i.test(arecord.stdout);
      return { found, known: true, evidence: [{ label: "arecord", value: found ? "found" : "not_found" }] };
    }
    const pulse = await runCommand("pactl", ["list", "short", "sources"], { timeoutMs: COMMAND_TIMEOUTS.shortMs });
    if (pulse.ok) {
      const found = pulse.stdout.split(/\r?\n/).some((line) => line.trim() && !line.includes(".monitor"));
      return { found, known: true, evidence: [{ label: "pactl_sources", value: found ? "found" : "not_found" }] };
    }
    return { found: false, known: false, evidence: [{ label: "audio_sources", value: null }] };
  }

  if (process.platform === "win32") {
    const result = await runPowerShell("Get-PnpDevice -Class AudioEndpoint -Status OK | Where-Object { $_.FriendlyName -match 'Microphone|Mic|Input' } | Select-Object -First 5 -ExpandProperty FriendlyName", { timeoutMs: Math.min(options.timeoutMs, COMMAND_TIMEOUTS.windowsDeviceMs) });
    const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return { found: result.ok && lines.length > 0, known: result.ok, evidence: [{ label: "windows_microphone", value: lines.join(",") || null }] };
  }

  return { found: false, known: false, evidence: [{ label: "microphone", value: null }] };
}
