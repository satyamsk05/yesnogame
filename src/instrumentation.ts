export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { tickEngine } = await import("./lib/engine");

    console.log("[Heartbeat] Initializing engine loop...");
    
    // Execute immediately on startup
    tickEngine().catch((err) => {
      console.error("[Heartbeat] Startup tick error:", err);
    });

    // Run the engine tick every 2 seconds
    setInterval(() => {
      tickEngine().catch((err) => {
        console.error("[Heartbeat] Loop tick error:", err);
      });
    }, 2000);
  }
}
