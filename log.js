// Optional prediction log in Supabase (for verification evidence).
// If config.js has no URL/key, nothing is sent and the app works normally.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

let client = null;

async function getClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!client) {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}

export async function logPrediction(inputs, result) {
  try {
    const sb = await getClient();
    if (!sb) return;
    const { error } = await sb.from("predictions").insert({
      inputs,
      probability: result.probability,
      tier: result.tier,
      action: result.action,
      model_version: "lr-orange-3.39-v1",
    });
    if (error) console.warn("Supabase log failed:", error.message);
  } catch (err) {
    console.warn("Supabase log failed:", err);
  }
}
