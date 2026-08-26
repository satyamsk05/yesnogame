export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[Heartbeat] Engine background loop disabled (User on-demand mode active).");
  }
}
