import app from "./app";

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log("=== Auth Boilerplate Backend ===\n");
    const server = app.listen(PORT, () => {
      console.log(`✓ HTTP Server listening on port ${PORT}`);
    });

    console.log("\n=== Server started successfully ===\n");

    const shutdown = async () => {
      console.log("\nShutting down gracefully...");
      server.close(() => {
        console.log("Server closed");
        process.exit(0);
      });
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
