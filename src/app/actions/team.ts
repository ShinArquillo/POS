"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hashAccessCode, LOGIN_GATE_KEY, LOGIN_GATE_PLAIN_KEY } from "@/lib/loginGate";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/types/database";

const roles: Role[] = ["admin", "manager", "staff"];
const DEFAULT_TEAM_PASSWORD =
process.env.DEFAULT_TEAM_PASSWORD || (process.env.NODE_ENV === "development" ? "12345" : "")

async function requireAdmin() {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "admin") {
    return { ok: false as const, message: "Only administrators can do this." };
  }
  if (profile.is_active === false) {
    return { ok: false as const, message: "Your account is inactive." };
  }
  return { ok: true as const, profile };
}

export async function updateMemberRoleAction(userId: string, role: string) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  if (!roles.includes(role as Role)) {
    return { ok: false as const, message: "Invalid role." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: role as Role })
    .eq("id", userId);

  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/team");
  return { ok: true as const };
}

export async function setMemberActiveAction(userId: string, isActive: boolean) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", userId);

  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/team");
  return { ok: true as const };
}

export async function createTeamMemberAction(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "staff") as Role;

  if (!email || !password) {
    return { ok: false as const, message: "Email and password are required." };
  }
  if (password.length < 8) {
    return { ok: false as const, message: "Password must be at least 8 characters." };
  }
  if (!roles.includes(role)) {
    return { ok: false as const, message: "Invalid role." };
  }

  try {
    const admin = createServiceRoleClient();
    const { data, error: cu } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });

    if (cu || !data.user) {
      return { ok: false as const, message: cu?.message ?? "Could not create user." };
    }

    const { error: pu } = await admin
      .from("profiles")
      .update({
        role,
        full_name: fullName,
        is_active: true,
      })
      .eq("id", data.user.id);

    if (pu) {
      return { ok: false as const, message: pu.message };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server configuration error.";
    return { ok: false as const, message: msg };
  }

  revalidatePath("/team");
  return { ok: true as const };
}

export async function resetMemberPasswordToDefaultAction(userId: string) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!userId) return { ok: false as const, message: "User ID is required." };
if (DEFAULT_TEAM_PASSWORD.length < 5) {
    return {
      ok: false as const,
      message:
        "DEFAULT_TEAM_PASSWORD must be set in environment (8+ chars) before resetting passwords.",
    };
  }

  try {
    const admin = createServiceRoleClient();
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: DEFAULT_TEAM_PASSWORD,
    });
    if (error) return { ok: false as const, message: error.message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server configuration error.";
    return { ok: false as const, message: msg };
  }

  revalidatePath("/team");
  return {
    ok: true as const,
    message: `Password reset to default: ${DEFAULT_TEAM_PASSWORD}`,
  };
}

export async function setLoginAccessCodeAction(code: string) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const normalized = code.trim();
  if (normalized.length < 4) {
    return { ok: false as const, message: "Access code must be at least 4 characters." };
  }

  try {
    const admin = createServiceRoleClient();
    const { error } = await admin.from("app_settings").upsert([
      {
        key: LOGIN_GATE_KEY,
        value: hashAccessCode(normalized),
        updated_by: gate.profile.id,
      },
      {
        key: LOGIN_GATE_PLAIN_KEY,
        value: normalized,
        updated_by: gate.profile.id,
      },
    ]);
    if (error) return { ok: false as const, message: error.message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server configuration error.";
    return { ok: false as const, message: msg };
  }

  revalidatePath("/team");
  revalidatePath("/login");
  return { ok: true as const, message: "Login access code saved." };
}

export async function clearLoginAccessCodeAction() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("app_settings")
      .delete()
      .in("key", [LOGIN_GATE_KEY, LOGIN_GATE_PLAIN_KEY]);
    if (error) return { ok: false as const, message: error.message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server configuration error.";
    return { ok: false as const, message: msg };
  }

  revalidatePath("/team");
  revalidatePath("/login");
  return { ok: true as const, message: "Login access code removed." };
}

export async function getLoginAccessCodeAction() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", LOGIN_GATE_PLAIN_KEY)
      .maybeSingle();
    if (error) return { ok: false as const, message: error.message };
    if (!data?.value) {
      return { ok: false as const, message: "No readable code found. Set a new code to enable viewing." };
    }
    return { ok: true as const, code: data.value };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server configuration error.";
    return { ok: false as const, message: msg };
  }
}
