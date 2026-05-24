import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import { getDb } from "./db/index.js";
import { registerRoutes } from "./routes/index.js";
import { handleWebSocket } from "./websocket/handler.js";
import { logger } from "./lib/logger.js";

async function main() {
  getDb();

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
  logger.info(`Cider server running at http://${config.host}:${config.port}`);
}

main().catch((err) => {
  logger.error(err, "Failed to start server");
  process.exit(1);
});
