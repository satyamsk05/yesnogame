import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { createClient as createSupabaseClient } from "@/utils/supabase/middleware";

import { NextResponse } from "next/server";

// Define which routes are protected.
// Public routes: Home (/), Webhook, Rounds API, and dev Admin Simulation.
const isProtectedRoute = createRouteMatcher([
  "/profile(.*)",
  "/api/bets(.*)",
  "/api/deposits(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      // If it is an API call, return a clean 401 JSON response instead of redirecting to HTML login page
      if (req.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
      await auth.protect();
    }
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
