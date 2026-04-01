"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  createBatchAction,
  deleteBatchAction,
  getBatchesForProductAction,
  updateBatchAction,
} from "@/app/actions/batches";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import type { Product, ProductBatch, Supplier } from "@/types/database";
import { invFormLabel, invToolbarBtnOutline } from "@/components/inventory/inventoryUi";

function dateInputValue(d: string | null): string {
  if (!d) return "";
  const x = d.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : "";
}

export function InventoryBatchModal({
  product,
  suppliers,
  open,
  onClose,
}: {
  product: Product | null;
  suppliers: Supplier[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [loading, setLoading] = useState(false);

  const pid = product?.id;

  useBodyScrollLock(open && !!product);

  useEffect(() => {
    if (!open || !pid) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void getBatchesForProductAction(pid).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) {
        setLoadError(r.message);
        setBatches([]);
        return;
      }
      setBatches(r.batches as ProductBatch[]);
    });
    return () => {
      cancelled = true;
    };
  }, [open, pid]);

  function refreshBatches() {
    if (!pid) return;
    void getBatchesForProductAction(pid).then((r) => {
      if (r.ok) setBatches(r.batches as ProductBatch[]);
    });
    router.refresh();
  }

  if (!open || !product) return null;

  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-50 overflow-y-auto overscroll-y-contain"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-modal-title"
      onClick={onClose}
    >
      <div className="flex min-h-[100dvh] items-center justify-center p-3 tablet:p-6">
        <div
          className="app-modal-panel my-auto flex max-h-[min(92vh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[rgba(15,68,21,0.08)] px-6 py-5">
            <div className="min-w-0 space-y-1">
              <h2
                id="batch-modal-title"
                className="text-base font-semibold tracking-tight text-[var(--foreground)]"
              >
                Batches
              </h2>
              <p className="truncate text-sm text-[var(--foreground-muted)]">{product.name}</p>
              <p className="max-w-md pt-1 text-xs leading-relaxed text-[var(--foreground-muted)]">
                On-hand stock is the sum of remaining quantities across batches.
              </p>
            </div>
            <button type="button" onClick={onClose} className={`${invToolbarBtnOutline} !h-10`}>
              Close
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {msg ? (
              <p className="mb-5 rounded-lg border border-[rgba(15,68,21,0.1)] bg-[var(--color-cream)] px-3 py-2.5 text-sm leading-relaxed text-[var(--foreground)]">
                {msg}
              </p>
            ) : null}
            {loadError ? (
              <p className="text-sm text-red-800">{loadError}</p>
            ) : loading ? (
              <p className="text-sm text-[var(--foreground-muted)]">Loading batches…</p>
            ) : batches.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[rgba(15,68,21,0.14)] py-12 text-center text-sm leading-relaxed text-[var(--foreground-muted)]">
                No batches yet. Add one below—stock stays 0 until a batch exists.
              </p>
            ) : (
              <ul className="space-y-3">
                {batches.map((b) => (
                  <li
                    key={b.id}
                    className="rounded-xl border border-[rgba(15,68,21,0.08)] bg-[var(--color-surface-solid)] p-4 shadow-[var(--shadow-sm)]"
                  >
                    <form
                      className="grid gap-4 tablet:grid-cols-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        const remaining = Number(fd.get("remaining_quantity"));
                        const purchase =
                          String(fd.get("purchase_date") ?? "").trim() || null;
                        const expiration =
                          String(fd.get("expiration_date") ?? "").trim() || null;
                        start(async () => {
                          setMsg(null);
                          const r = await updateBatchAction(product.id, b.id, {
                            remaining_quantity: remaining,
                            purchase_date: purchase,
                            expiration_date: expiration,
                          });
                          setMsg(r.ok ? "Updated." : r.message);
                          if (r.ok) refreshBatches();
                        });
                      }}
                    >
                      <div className="tablet:col-span-2 text-xs text-[var(--foreground-muted)]">
                        Received {b.quantity}
                        {b.supplier_id
                          ? ` · ${suppliers.find((s) => s.id === b.supplier_id)?.name ?? "Supplier"}`
                          : ""}
                      </div>
                      <div>
                        <label className={invFormLabel}>Remaining</label>
                        <input
                          name="remaining_quantity"
                          type="number"
                          min="0"
                          required
                          defaultValue={b.remaining_quantity}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className={invFormLabel}>Purchase date</label>
                        <input
                          name="purchase_date"
                          type="date"
                          defaultValue={dateInputValue(b.purchase_date)}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className={invFormLabel}>Expiration</label>
                        <input
                          name="expiration_date"
                          type="date"
                          defaultValue={dateInputValue(b.expiration_date)}
                          className="input-field"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 tablet:col-span-2">
                        <button type="submit" disabled={pending} className="btn-primary !min-h-10 !text-sm">
                          Save
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          className="inline-flex h-10 items-center rounded-lg border border-red-200/80 bg-white px-4 text-sm font-medium text-red-800 transition-colors hover:bg-red-50"
                          onClick={() => {
                            if (!confirm("Delete this batch?")) return;
                            start(async () => {
                              setMsg(null);
                              const r = await deleteBatchAction(product.id, b.id);
                              setMsg(r.ok ? "Removed." : r.message);
                              if (r.ok) refreshBatches();
                            });
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-8 border-t border-[rgba(15,68,21,0.08)] pt-6">
              <h3 className="mb-4 text-[13px] font-semibold text-[var(--foreground)]">
                New batch
              </h3>
              <form
                className="grid gap-4 tablet:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const quantity = Number(fd.get("quantity"));
                  const supplierId = String(fd.get("supplier_id") ?? "").trim();
                  const purchase = String(fd.get("purchase_date") ?? "").trim() || null;
                  const expiration = String(fd.get("expiration_date") ?? "").trim() || null;
                  start(async () => {
                    setMsg(null);
                    const r = await createBatchAction(product.id, {
                      quantity,
                      supplier_id: supplierId || null,
                      purchase_date: purchase,
                      expiration_date: expiration,
                    });
                    setMsg(r.ok ? "Batch added." : r.message);
                    if (r.ok) {
                      e.currentTarget.reset();
                      refreshBatches();
                    }
                  });
                }}
              >
                <div>
                  <label className={invFormLabel}>Quantity</label>
                  <input
                    name="quantity"
                    type="number"
                    min="1"
                    required
                    className="input-field"
                    defaultValue={1}
                  />
                </div>
                <div>
                  <label className={invFormLabel}>Supplier</label>
                  <select name="supplier_id" className="input-field">
                    <option value="">Optional</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={invFormLabel}>Purchase date</label>
                  <input name="purchase_date" type="date" className="input-field" />
                </div>
                <div>
                  <label className={invFormLabel}>Expiration</label>
                  <input name="expiration_date" type="date" className="input-field" />
                </div>
                <div className="tablet:col-span-2">
                  <button type="submit" disabled={pending} className="btn-primary !min-h-10 !text-sm">
                    Add batch
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
