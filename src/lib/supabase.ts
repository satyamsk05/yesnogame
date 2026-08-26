import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project-id.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-key";

let _client: any = null;
let _adminClient: any = null;

// Standard Supabase client (Lazy Proxy)
export const supabase = new Proxy({} as any, {
  get(target, prop) {
    if (!_client) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project-id.supabase.co";
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";
      _client = createClient(url, key);
    }
    return Reflect.get(_client, prop);
  }
});

// Admin Supabase client (Lazy Proxy) (bypasses RLS for secure wallet transactions and payouts)
export const supabaseAdmin = new Proxy({} as any, {
  get(target, prop) {
    if (!_adminClient) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project-id.supabase.co";
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-key";
      _adminClient = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }
    return Reflect.get(_adminClient, prop);
  }
});
