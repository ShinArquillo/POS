import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const LOGIN_GATE_KEY = "login_access_code_hash";
export const LOGIN_GATE_PLAIN_KEY = "login_access_code_plain";
export const LOGIN_GATE_COOKIE = "login_gate_token";

export function hashAccessCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export async function getLoginGateHash() {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", LOGIN_GATE_KEY)
      .maybeSingle();
    if (error) return null;
    return data?.value ?? null;
  } catch {
    return null;
  }
}
