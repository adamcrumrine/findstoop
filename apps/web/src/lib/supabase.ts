// Single Supabase client for the entire web app.
//
// Re-exports the shared client so the app code AND the shared api/hooks layer
// (useAuth, etc.) share ONE GoTrueClient instance. Creating a second client
// here with the same anon key registered two auth clients against the same
// storage key (sb-<ref>-auth-token), which logs "Multiple GoTrueClient
// instances detected" and can race on the session token.
export { supabase } from '@findstoop/shared/lib/supabase'
