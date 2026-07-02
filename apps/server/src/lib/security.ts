import crypto from "node:crypto";
import path from "node:path";
import { DANGEROUS_COMMAND_PATTERNS } from "@koda/shared";
import { config } from "../config.js";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  "out",
  "__pycache__",
  ".venv",
]);

export function isPathInsideRoot(rootPath: string, targetPath: string): boolean {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function assertPathAllowed(rootPath: string, targetPath: string): string {
  const resolved = path.resolve(rootPath, targetPath);
  if (!isPathInsideRoot(rootPath, resolved)) {
    throw new Error("Path escapes project sandbox");
  }
  return resolved;
}

export function shouldIgnoreEntry(name: string): boolean {
  return IGNORED_DIRS.has(name);
}

export function isDangerousCommand(command: string): boolean {
  return DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(command));
}

function getKey(): Buffer {
  return crypto.createHash("sha256").update(config.encryptionSecret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const data = Buffer.from(encoded, "base64");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
