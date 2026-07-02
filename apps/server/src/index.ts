import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { eq } from "drizzle-orm";
import { config } from "./config.js";
import { getDb, schema } from "./db/index.js";
import { decryptSecret } from "./lib/security.js";
import { registerRoutes } from "./routes/index.js";
import { deepseek } from "./services/deepseek.js";
import { handleWebSocket } from "./websocket/handler.js";
import { logger } from "./lib/logger.js";

async function loadStoredDeepSeekApiKey() {
  const db = getDb();
  if (!config.deepseek.apiKey) {
    const stored = await db
      .select()
      .from(schema.credentials)
      .where(eq(schema.credentials.key, "deepseek_api_key"))
      .limit(1);
    if (stored[0]) {
      try {
        deepseek.setApiKey(decryptSecret(stored[0].encryptedValue));
      } catch (err) {
        logger.warn({ err }, "Failed to load stored DeepSeek API key");
      }
    }
  }
}

async function main() {
  await loadStoredDeepSeekApiKey();

  const app = Fastify({
    logger: false,
    bodyLimit: config.maxUploadBytes,
  });

  app.setErrorHandler((error: unknown, _request, reply) => {
    const err = error as { statusCode?: number; message?: string };
    const statusCode = err.statusCode ?? 500;
    logger.error({ err: error, statusCode }, "Request error");
    reply.status(statusCode).send({
      error: err.message ?? "Internal Server Error",
      statusCode,
    });
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: config.maxUploadBytes,
      files: 10_000,
      fields: 10,
    },
  });

  await app.register(websocket);
  await registerRoutes(app);

  app.get("/ws", { websocket: true }, (socket) => {
    handleWebSocket(socket);
  });

  await app.listen({ host: config.host, port: config.port });
  logger.info(`KODA server running at http://${config.host}:${config.port}`);
}

main().catch((err) => {
  logger.error(err, "Failed to start server");
  process.exit(1);
});
