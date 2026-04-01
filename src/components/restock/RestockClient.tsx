"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  createOrdersFromDraftLinesAction,
  createSupplierAction,
  deletePendingOrderAction,
  receiveOrderAction,
  updateOrderLineQtyAction,
} from "@/app/actions/orders";
import type { OrderRow, Product, Supplier } from "@/types/database";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { SearchField } from "@/components/ui/SearchField";

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  quantity: number;
  products: { id: string; name: string } | null;
};

const label = "mb-1.5 block text-xs font-bold uppercase tracking-wide text-[var(--foreground-muted)]";

type RestockTab = "create" | "pending" | "received";

function shortOrderId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

export function RestockClient({
  suppliers,
  orders,
  orderItems,
  products,
  lowStock,
}: {
  suppliers: Supplier[];
  orders: (OrderRow & { supplierName?: string | null })[];
  orderItems: OrderItemRow[];
  products: Product[];
  lowStock: { id: string; name: string; category: string; stock: number; min: number }[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<RestockTab>("create");
  const [showSupplier, setShowSupplier] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [confirmDeleteOrderId, setConfirmDeleteOrderId] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [createSearch, setCreateSearch] = useState("");
  const [detailsOrderId, setDetailsOrderId] = useState<string | null>(null);
  const [orderItemPage, setOrderItemPage] = useState<Record<string, number>>({});
  const [lineStatus, setLineStatus] = useState<
    Record<string, "idle" | "saving" | "saved" | "error">
  >({});
  const [suggestions, setSuggestions] = useState<
    { productId: string; supplierId: string | null; qty: number; selected: boolean }[]
  >(() =>
    (products ?? []).map((p) => {
      const rec = (lowStock ?? []).find((x) => x.id === p.id);
      const recommended = rec ? Math.max(1, (rec.min - rec.stock) || 1) : 0;
      return {
        productId: p.id,
        supplierId: suppliers[0]?.id ?? null,
        qty: recommended,
        selected: recommended > 0,
      };
    })
  );

  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  const ordersShown = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    let list = orders.filter((o) => {
      if (tab === "pending" && o.status !== "pending") return false;
      if (tab === "received" && o.status !== "received") return false;
      if (!q) return true;
      const when = new Date(o.created_at).toLocaleString().toLowerCase();
      const supplier = (o.supplierName ?? "").toLowerCase();
      return (
        o.id.toLowerCase().includes(q) ||
        when.includes(q) ||
        o.status.includes(q) ||
        supplier.includes(q)
      );
    });
    return list;
  }, [orders, orderSearch, tab]);

  const itemsByOrder = useMemo(() => {
    const m = new Map<string, OrderItemRow[]>();
    orderItems.forEach((r) => {
      const a = m.get(r.order_id) ?? [];
      a.push(r);
      m.set(r.order_id, a);
    });
    return m;
  }, [orderItems]);

  const itemsForOrder = useMemo(() => {
    return (orderId: string) => itemsByOrder.get(orderId) ?? [];
  }, [itemsByOrder]);

  const detailsOrder = useMemo(
    () => orders.find((o) => o.id === detailsOrderId) ?? null,
    [orders, detailsOrderId]
  );
  const detailsItems = useMemo(
    () => (detailsOrderId ? itemsForOrder(detailsOrderId) : []),
    [detailsOrderId, itemsForOrder]
  );

  const recommendationById = useMemo(() => {
    const m = new Map<string, { stock: number; min: number }>();
    (lowStock ?? []).forEach((p) => m.set(p.id, { stock: p.stock, min: p.min }));
    return m;
  }, [lowStock]);

  const pendingProductToOrders = useMemo(() => {
    const pendingIds = new Set(orders.filter((o) => o.status === "pending").map((o) => o.id));
    const m = new Map<string, Set<string>>();
    orderItems.forEach((it) => {
      if (!it.product_id) return;
      if (!pendingIds.has(it.order_id)) return;
      const set = m.get(it.product_id) ?? new Set<string>();
      set.add(it.order_id);
      m.set(it.product_id, set);
    });
    return m;
  }, [orders, orderItems]);

  const productsShown = useMemo(() => {
    const q = createSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, createSearch]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-1 pb-10 tablet:space-y-8 tablet:px-0">
      <PageHeader
        eyebrow="Receiving"
        title="Purchase orders"
        description="Create POs, add lines, then receive to push stock into inventory."
      />

      {msg ? (
        <p className="rounded-xl border border-[rgba(15,68,21,0.1)] bg-[var(--color-surface-solid)] px-4 py-3 text-sm text-[var(--foreground)] shadow-[var(--shadow-xs)]">
          {msg}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border border-[rgba(15,68,21,0.08)] bg-[var(--color-surface-solid)] px-4 py-3 shadow-[var(--shadow-sm)] tablet:flex-row tablet:items-center tablet:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["create", "Create order"],
              ["pending", "Pending"],
              ["received", "Received"],
            ] as const
          ).map(([k, lab]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded-full px-3 py-2 text-xs font-semibold ${
                tab === k
                  ? "bg-[var(--color-primary-bright)] text-[var(--color-cream-deep)]"
                  : "bg-[var(--color-surface-solid)] ring-1 ring-[rgba(15,68,21,0.1)]"
              }`}
            >
              {lab}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="btn-primary !min-h-9 !w-9 !px-0"
            onClick={() => setTab("create")}
            title="Create order"
            aria-label="Create order"
          >
            +
          </button>
          <button
            type="button"
            className="btn-secondary !min-h-9"
            onClick={() => setShowSupplier(true)}
          >
            Add supplier
          </button>
        </div>
      </div>

      {showSupplier ? (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowSupplier(false)}
        >
          <div className="flex min-h-[100dvh] items-center justify-center p-3 tablet:p-6">
            <div
              className="app-modal-panel my-auto w-full max-w-xl overflow-hidden rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-[rgba(15,68,21,0.08)] px-5 py-4">
                <h2 className="text-base font-semibold tracking-tight text-[var(--foreground)]">
                  New supplier
                </h2>
              </div>
              <form
                className="space-y-4 px-5 py-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  start(async () => {
                    setMsg(null);
                    const r = await createSupplierAction(fd);
                    setMsg(r.ok ? "Supplier added." : r.message);
                    if (r.ok) {
                      setShowSupplier(false);
                      router.refresh();
                    }
                  });
                }}
              >
                <div>
                  <label className={label}>Name</label>
                  <input name="name" required className="input-field" />
                </div>
                <div>
                  <label className={label}>Contact</label>
                  <input name="contact_info" className="input-field" placeholder="Phone / email" />
                </div>
                <div className="flex gap-2 border-t border-[rgba(15,68,21,0.08)] pt-4">
                  <button type="button" className="btn-secondary !min-h-10 flex-1" onClick={() => setShowSupplier(false)}>
                    Cancel
                  </button>
                  <button type="submit" disabled={pending} className="btn-primary !min-h-10 flex-1 disabled:opacity-50">
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "create" ? (
        <Panel title="Create order">
          <div className="mb-4 flex flex-col gap-3 tablet:flex-row tablet:items-end tablet:justify-between">
            <SearchField
              value={createSearch}
              onChange={setCreateSearch}
              placeholder="Search products by name or category…"
              className="w-full tablet:max-w-md"
            />
            <button
              type="button"
              disabled={pending || suppliers.length === 0}
              className="btn-primary !min-h-10 disabled:opacity-50"
              onClick={() => {
                const lines = suggestions.filter((s) => s.selected && s.qty > 0);
                const fd = new FormData();
                fd.set("lines", JSON.stringify(lines));
                start(async () => {
                  setMsg(null);
                  const r = await createOrdersFromDraftLinesAction(fd);
                  setMsg(
                    r.ok && "orderIds" in r
                      ? `Orders created: ${(r.orderIds as string[]).map(shortOrderId).join(", ")}`
                      : r.ok
                        ? "Orders created."
                        : r.message
                  );
                  if (r.ok && "orderIds" in r) {
                    setTab("pending");
                    const first = (r.orderIds as string[])[0];
                    if (first) setDetailsOrderId(first);
                    router.refresh();
                  }
                });
              }}
            >
              Create purchase orders
            </button>
          </div>

          <p className="mb-3 text-xs text-[var(--foreground-muted)]">
            Tick items to include in the order. Low-stock rows are highlighted with a recommended quantity. Products already on a pending PO show a shortcut to Pending.
          </p>

          <div className="overflow-hidden rounded-xl border border-[rgba(15,68,21,0.08)] bg-[var(--color-surface-solid)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[rgba(15,68,21,0.04)] text-xs uppercase tracking-wide text-[var(--foreground-muted)]">
                <tr>
                  <th className="px-4 py-3">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Min</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3 text-right">Order qty</th>
                  <th className="px-4 py-3 text-right">Pending</th>
                </tr>
              </thead>
              <tbody>
                {productsShown.map((p) => {
                  const rec = recommendationById.get(p.id) ?? null;
                  const idx = suggestions.findIndex((s) => s.productId === p.id);
                  const s =
                    idx >= 0
                      ? suggestions[idx]
                      : { productId: p.id, supplierId: suppliers[0]?.id ?? null, qty: 0, selected: false };
                  const pendingOrders = pendingProductToOrders.get(p.id);
                  const isRecommended = rec != null;
                  return (
                    <tr
                      key={p.id}
                      className={`border-t border-[rgba(15,68,21,0.06)] ${
                        isRecommended ? "bg-[rgba(220,38,38,0.04)]" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={s.selected}
                          onChange={(e) => {
                            const selected = e.target.checked;
                            setSuggestions((cur) => {
                              const next = [...cur];
                              if (idx >= 0) next[idx] = { ...next[idx], selected };
                              else next.push({ productId: p.id, supplierId: s.supplierId, qty: s.qty, selected });
                              return next;
                            });
                          }}
                          className="h-4 w-4 rounded border-[rgba(15,68,21,0.25)] text-[var(--color-primary-bright)] focus:ring-[var(--ring-focus)]"
                          aria-label={`Select ${p.name}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                        {p.name}
                      </td>
                      <td className="px-4 py-3 text-[var(--foreground-muted)]">
                        {p.category ?? "Uncategorized"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {p.stock_quantity}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {p.min_stock_level ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={s.supplierId ?? ""}
                          onChange={(e) => {
                            const supplierId = e.target.value || null;
                            setSuggestions((cur) => {
                              const next = [...cur];
                              if (idx >= 0) next[idx] = { ...next[idx], supplierId };
                              else next.push({ productId: p.id, supplierId, qty: s.qty, selected: s.selected });
                              return next;
                            });
                          }}
                          className="input-field !h-9 !py-0"
                        >
                          <option value="">No supplier</option>
                          {suppliers.map((sp) => (
                            <option key={sp.id} value={sp.id}>
                              {sp.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min={0}
                          value={s.qty}
                          onChange={(e) => {
                            const qty = Math.max(0, Number(e.target.value) || 0);
                            setSuggestions((cur) => {
                              const next = [...cur];
                              if (idx >= 0) next[idx] = { ...next[idx], qty };
                              else next.push({ productId: p.id, supplierId: s.supplierId, qty, selected: s.selected });
                              return next;
                            });
                          }}
                          className="input-field !h-9 !w-24 !py-0 text-right"
                        />
                        {isRecommended ? (
                          <div className="mt-1 text-[10px] text-[var(--foreground-muted)]">
                            Rec:{" "}
                            <span className="font-mono">
                              {Math.max(1, ((rec?.min ?? 0) - (rec?.stock ?? 0)) || 1)}
                            </span>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {pendingOrders && pendingOrders.size > 0 ? (
                          <button
                            type="button"
                            className="btn-secondary !min-h-9"
                            onClick={() => {
                              setTab("pending");
                              const first = [...pendingOrders][0];
                              if (first) setDetailsOrderId(first);
                            }}
                          >
                            View
                          </button>
                        ) : (
                          <span className="text-xs text-[var(--foreground-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {confirmDeleteOrderId ? (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setConfirmDeleteOrderId(null);
            setDeleteConfirm("");
          }}
        >
          <div className="flex min-h-[100dvh] items-center justify-center p-3 tablet:p-6">
            <div
              className="app-modal-panel my-auto w-full max-w-md overflow-hidden rounded-2xl border-red-300/70"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-[rgba(15,68,21,0.08)] px-6 py-5">
                <h2 className="text-base font-semibold tracking-tight text-[var(--foreground)]">
                  Delete pending order?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  This deletes the PO and its lines. Type{" "}
                  <span className="font-mono font-semibold text-[var(--foreground)]">DELETE</span>{" "}
                  to confirm.
                </p>
              </div>
              <div className="space-y-3 px-6 py-5">
                <input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="Type DELETE"
                  className="input-field !h-10"
                  autoFocus
                />
                <div className="flex gap-2 border-t border-[rgba(15,68,21,0.08)] pt-4">
                  <button
                    type="button"
                    className="btn-secondary !min-h-11 flex-1"
                    disabled={pending}
                    onClick={() => {
                      setConfirmDeleteOrderId(null);
                      setDeleteConfirm("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary !min-h-11 flex-1 !bg-red-600 !text-white hover:!bg-red-700 disabled:opacity-50"
                    disabled={
                      pending ||
                      !confirmDeleteOrderId ||
                      deleteConfirm.trim().toUpperCase() !== "DELETE"
                    }
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("order_id", confirmDeleteOrderId ?? "");
                      start(async () => {
                        setMsg(null);
                        const r = await deletePendingOrderAction(fd);
                        setMsg(r.ok ? "Order deleted." : r.message);
                        if (r.ok) {
                          setConfirmDeleteOrderId(null);
                          setDeleteConfirm("");
                          router.refresh();
                        }
                      });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "pending" || tab === "received" ? (
      <Panel title={tab === "pending" ? "Pending orders" : "Received orders"}>
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-[rgba(15,68,21,0.08)] bg-[var(--color-surface-solid)] p-3 tablet:flex-row tablet:items-center tablet:justify-between">
          <SearchField
            value={orderSearch}
            onChange={setOrderSearch}
            placeholder="Search by supplier, status, date…"
            className="w-full tablet:max-w-sm"
          />
          <span className="text-xs font-medium tabular-nums text-[var(--foreground-muted)]">
            {ordersShown.length} order{ordersShown.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="overflow-hidden rounded-xl border border-[rgba(15,68,21,0.08)] bg-[var(--color-surface-solid)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[rgba(15,68,21,0.04)] text-xs uppercase tracking-wide text-[var(--foreground-muted)]">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ordersShown.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-[var(--foreground-muted)]">
                    No orders match your filters.
                  </td>
                </tr>
              ) : (
                ordersShown.map((o) => {
                  const items = itemsForOrder(o.id);
                  return (
                    <Fragment key={o.id}>
                      <tr key={o.id} className="border-t border-[rgba(15,68,21,0.06)]">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="text-left text-sm font-semibold text-[var(--foreground)] hover:underline"
                            onClick={() => setDetailsOrderId(o.id)}
                          >
                            {new Date(o.created_at).toLocaleString()}
                          </button>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--foreground-muted)]">
                            <span className="font-mono">PO-{shortOrderId(o.id)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">{o.supplierName ?? "No supplier"}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">{items.length}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              className="btn-secondary !h-8 !min-h-0 !rounded-md !px-2.5 !py-0 !text-[11px] !font-semibold"
                              onClick={() => setDetailsOrderId(o.id)}
                            >
                              Details
                            </button>
                            <a
                              href={`/restock/print/${o.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-secondary inline-flex items-center !h-8 !min-h-0 !rounded-md !px-2.5 !py-0 !text-[11px] !font-semibold"
                            >
                              Print
                            </a>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      ) : null}

      {detailsOrder ? (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-details-title"
          onClick={() => setDetailsOrderId(null)}
        >
          <div className="flex min-h-[100dvh] items-center justify-center p-3 tablet:p-6">
            <div
              className="app-modal-panel my-auto w-full max-w-5xl overflow-hidden rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgba(15,68,21,0.08)] px-5 py-4">
                <div>
                  <h2
                    id="order-details-title"
                    className="text-base font-semibold tracking-tight text-[var(--foreground)]"
                  >
                    Order details
                  </h2>
                  <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                    PO-{shortOrderId(detailsOrder.id)} · {detailsOrder.supplierName ?? "No supplier"} ·{" "}
                    <span className="capitalize">{detailsOrder.status}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-secondary !h-9 !min-h-0 !rounded-lg !px-3.5 !py-0 !text-xs !font-semibold"
                    onClick={() => {
                      const w = window.open(`/restock/print/${detailsOrder.id}`, "_blank");
                      if (!w) return;
                      const triggerPrint = () => w.print();
                      w.addEventListener("load", triggerPrint, { once: true });
                    }}
                  >
                    Print
                  </button>
                  <a
                    href={`/api/restock/order-pdf?orderId=${detailsOrder.id}`}
                    className="btn-secondary inline-flex items-center !h-9 !min-h-0 !rounded-lg !px-3.5 !py-0 !text-xs !font-semibold"
                  >
                    PDF
                  </a>
                  {detailsOrder.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        className="btn-secondary !h-9 !min-h-0 !rounded-lg !px-3.5 !py-0 !text-xs !font-semibold"
                        disabled={pending}
                        onClick={() => {
                          start(async () => {
                            setMsg(null);
                            const r = await receiveOrderAction(detailsOrder.id);
                            setMsg(r.ok ? "Order received — stock updated." : r.message);
                            if (r.ok) router.refresh();
                          });
                        }}
                      >
                        Mark received
                      </button>
                      <button
                        type="button"
                        className="btn-secondary !h-9 !min-h-0 !rounded-lg !px-3.5 !py-0 !text-xs !font-semibold !text-red-800 ring-red-200 hover:!bg-red-50"
                        onClick={() => {
                          setConfirmDeleteOrderId(detailsOrder.id);
                          setDeleteConfirm("");
                        }}
                      >
                        Delete
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="btn-secondary !h-9 !min-h-0 !rounded-lg !px-3.5 !py-0 !text-xs !font-semibold"
                    onClick={() => setDetailsOrderId(null)}
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="px-5 py-4">
                <div className="overflow-hidden rounded-xl border border-[rgba(15,68,21,0.08)]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[rgba(15,68,21,0.04)] text-xs uppercase tracking-wide text-[var(--foreground-muted)]">
                      <tr>
                        <th className="px-4 py-3">Item</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailsItems.length === 0 ? (
                        <tr>
                          <td
                            colSpan={2}
                            className="px-4 py-10 text-center text-sm text-[var(--foreground-muted)]"
                          >
                            No items.
                          </td>
                        </tr>
                      ) : (
                        (() => {
                          const pageSize = 10;
                          const page = orderItemPage[detailsOrder.id] ?? 1;
                          const totalPages = Math.max(
                            1,
                            Math.ceil(detailsItems.length / pageSize)
                          );
                          const safePage = Math.min(page, totalPages);
                          const startIdx = (safePage - 1) * pageSize;
                          const slice = detailsItems.slice(startIdx, startIdx + pageSize);
                          return slice.map((it) => (
                            <tr key={it.id} className="border-t border-[rgba(15,68,21,0.06)]">
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">
                                    {it.products?.name ?? "Product"}
                                  </span>
                                  {detailsOrder.status === "pending" ? (
                                    <span className="text-[10px] text-[var(--foreground-muted)]">
                                      {lineStatus[it.id] === "saving"
                                        ? "Saving…"
                                        : lineStatus[it.id] === "saved"
                                          ? "Saved"
                                          : lineStatus[it.id] === "error"
                                            ? "Error"
                                            : ""}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {detailsOrder.status === "pending" ? (
                                  <input
                                    type="number"
                                    min={0}
                                    defaultValue={it.quantity}
                                    className="input-field !h-9 !w-28 !py-0 text-right"
                                    onBlur={(e) => {
                                      const qty = Math.max(
                                        0,
                                        Number(e.currentTarget.value) || 0
                                      );
                                      const fd = new FormData();
                                      fd.set("line_id", it.id);
                                      fd.set("quantity", String(qty));
                                      setLineStatus((cur) => ({ ...cur, [it.id]: "saving" }));
                                      start(async () => {
                                        const r = await updateOrderLineQtyAction(fd);
                                        if (!r.ok) {
                                          setLineStatus((cur) => ({ ...cur, [it.id]: "error" }));
                                          setMsg(r.message);
                                          return;
                                        }
                                        setLineStatus((cur) => ({ ...cur, [it.id]: "saved" }));
                                        router.refresh();
                                        setTimeout(() => {
                                          setLineStatus((cur) => {
                                            if (cur[it.id] !== "saved") return cur;
                                            const next = { ...cur };
                                            next[it.id] = "idle";
                                            return next;
                                          });
                                        }, 1200);
                                      });
                                    }}
                                  />
                                ) : (
                                  <span className="font-mono tabular-nums">{it.quantity}</span>
                                )}
                              </td>
                            </tr>
                          ));
                        })()
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--foreground-muted)]">
                  {(() => {
                    const pageSize = 10;
                    const total = detailsItems.length;
                    const totalPages = Math.max(1, Math.ceil(total / pageSize));
                    const page = orderItemPage[detailsOrder.id] ?? 1;
                    const safePage = Math.min(Math.max(1, page), totalPages);
                    const startIdx = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
                    const endIdx = Math.min(total, safePage * pageSize);
                    const canPrev = safePage > 1;
                    const canNext = safePage < totalPages;

                    return (
                      <>
                        <span className="tabular-nums">
                          {total === 0
                            ? "No items"
                            : `Showing ${startIdx}–${endIdx} of ${total} · Page ${safePage}/${totalPages}`}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="btn-secondary !h-9 !min-h-0 !rounded-lg !px-3.5 !py-0 !text-xs !font-semibold disabled:opacity-50"
                            disabled={!canPrev}
                            onClick={() =>
                              setOrderItemPage((cur) => ({
                                ...cur,
                                [detailsOrder.id]: Math.max(1, (cur[detailsOrder.id] ?? 1) - 1),
                              }))
                            }
                          >
                            Prev
                          </button>
                          <button
                            type="button"
                            className="btn-secondary !h-9 !min-h-0 !rounded-lg !px-3.5 !py-0 !text-xs !font-semibold disabled:opacity-50"
                            disabled={!canNext}
                            onClick={() =>
                              setOrderItemPage((cur) => ({
                                ...cur,
                                [detailsOrder.id]: Math.min(
                                  totalPages,
                                  (cur[detailsOrder.id] ?? 1) + 1
                                ),
                              }))
                            }
                          >
                            Next
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {detailsOrder.status === "pending" ? (
                  <p className="mt-2 text-xs text-[var(--foreground-muted)]">
                    Tip: set Qty to 0 to remove a line. Changes save when you leave the field.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
