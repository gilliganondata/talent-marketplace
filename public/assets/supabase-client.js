// Safe to expose publicly — this is the publishable key, not the secret key.
const SUPABASE_URL = "https://cadoqeuxqocwjyjgyykk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_TOVYJF42mJXiL2WXw2ZY1g_rQBlO8na";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);