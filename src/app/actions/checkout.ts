"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CheckoutLine = {
  product_id: string;
  quantity: number;
  price: number;
  source?: "regular" | "return";
};

export async function checkoutAction(lines: CheckoutLine[]) {
  const supabase = await createClient();
  const d = new Date();
  const receipt = `PHB-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Date.now().toString(36).toUpperCase()}`;
  const createdAtIso = d.toISOString();

  const { data, error } = await supabase.rpc("fn_checkout", {
    p_receipt: receipt,
    p_lines: lines,
  });

  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/pos");
  revalidatePath("/sales");
  revalidatePath("/inventory");
  return { ok: true as const, saleId: data as string, receipt, createdAtIso };
}
