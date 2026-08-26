import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { createClient as createSupabaseClient } from "@/utils/supabase/middleware";

// Define which routes are protected.
// Public routes: Home (/), Webhook, Rounds API, and dev Admin Simulation.
const isProtectedRoute = createRouteMatcher([
  "/profile(.*)",
  "/api/bets(.*)",
  "/api/deposits(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
  
  // Refresh Supabase cookies on request
  return createSupabaseClient(req);
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
