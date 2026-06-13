import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Monorepo root (KODA/), stable regardless of process.cwd(). */
export const repoRoot = path.resolve(__dirname, "../../..");

loadEnv({ path: path.join(repoRoot, ".env") });
loadEnv({ path: path.join(repoRoot, ".env.local") });
loadEnv();

function resolveFromRepo(relativeOrAbsolute: string): string {
  return path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.resolve(repoRoot, relativeOrAbsolute);
}

export const config = {
  host: process.env.CIDER_HOST ?? "127.0.0.1",
  port: Number(process.env.CIDER_PORT ?? 3847),
  dataDir: resolveFromRepo(process.env.CIDER_DATA_DIR ?? "data"),
  dbPath: process.env.CIDER_DB_PATH ? resolveFromRepo(process.env.CIDER_DB_PATH) : "",
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
  },
  deriv: {
    apiToken: process.env.DERIV_API_TOKEN ?? "",
    appId: process.env.DERIV_APP_ID ?? "65398",
  },
  encryptionSecret: process.env.CIDER_ENCRYPTION_SECRET ?? "cider-dev-secret-change-in-prod",
  githubToken: process.env.GITHUB_TOKEN ?? "",
  rootDir: path.resolve(__dirname, "../.."),
  defaultProject: resolveFromRepo(process.env.CIDER_DEFAULT_PROJECT ?? "."),
  autoApproveTools: process.env.CIDER_AUTO_APPROVE_TOOLS !== "false",
  maxUploadBytes: Number(process.env.CIDER_MAX_UPLOAD_MB ?? 500) * 1024 * 1024,
};

export function getDbPath(): string {
  return config.dbPath || path.join(config.dataDir, "cider.db");
}

export function getProjectsWorkspace(): string {
  return path.join(config.dataDir, "projects");
}
