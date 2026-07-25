import app from "./app";
import { childLogger } from "./utils/logger";
import { validateEnv } from "./utils/validateEnv";

const log = childLogger("server");

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Before listening: a misconfigured environment should fail here, not as a
    // 500 on the first request that needs the missing secret.
    validateEnv();

    const server = app.listen(PORT, () => {
      log.info({ port: PORT }, "HTTP server listening");
    });

    const shutdown = async () => {
      log.info("Shutting down");
      server.close(() => {
        log.info("Server closed");
        process.exit(0);
      });
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (error) {
    log.error({ err: error }, "Failed to start server");
    process.exit(1);
  }
}

startServer();
