import app from "./app";
import { childLogger } from "./utils/logger";

const log = childLogger("server");

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
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
