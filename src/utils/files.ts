import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export function homePath(...parts: string[]): string {
  return path.join(os.homedir(), ...parts);
}

export async function findNamesInRoots(roots: string[], needles: string[], options: { maxDepth: number; maxMatches?: number } = { maxDepth: 2 }): Promise<string[]> {
  const matches = new Set<string>();
  const maxMatches = options.maxMatches ?? 20;
  const loweredNeedles = needles.map((needle) => needle.toLowerCase());

  async function walk(root: string, depth: number): Promise<void> {
    if (matches.size >= maxMatches || depth < 0) {
      return;
    }

    let entries;
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (matches.size >= maxMatches) {
        return;
      }

      const entryPath = path.join(root, entry.name);
      const lowered = entry.name.toLowerCase();
      if (loweredNeedles.some((needle) => lowered.includes(needle))) {
        matches.add(entryPath);
      }

      if (depth > 0 && entry.isDirectory() && !shouldSkipDir(entry.name)) {
        await walk(entryPath, depth - 1);
      }
    }
  }

  for (const root of roots.filter(Boolean)) {
    await walk(root, options.maxDepth);
  }

  return [...matches];
}

function shouldSkipDir(name: string): boolean {
  const lowered = name.toLowerCase();
  return lowered === "node_modules"
    || lowered === ".git"
    || lowered === "cache"
    || lowered === "logs"
    || lowered === "temp"
    || lowered === "tmp";
}
