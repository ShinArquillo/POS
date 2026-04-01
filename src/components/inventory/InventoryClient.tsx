"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Download } from "lucide-react";
import {
  addCategoryOptionAction,
  addProductAction,
  deactivateProductAction,
  deleteEmptyCategoryAction,
  deleteProductIfNeverSoldAction,
  reactivateProductAction,
  updateCategoryOptionAction,
  updateProductCatalogAction,
} from "@/app/actions/inventory";
import { formatMoney } from "@/lib/format";
import type { InventoryInsights } from "@/lib/inventoryInsights";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import type { Product, Supplier } from "@/types/database";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { SearchField } from "@/components/ui/SearchField";
import { InventoryBatchModal } from "@/components/inventory/InventoryBatchModal";
import {
  invFormLabel,
  invSegmentBtn,
  invSegmentBtnActive,
  invSegmentBtnIdle,
  invSegmentWrap,
  invToolbarBtnOutline,
} from "@/components/inventory/inventoryUi";

type StockFilter = "all" | "active" | "inactive" | "low" | "returns";
type ProductSort = "name" | "category" | "stock_low" | "stock_high";

type DangerAction =
  | { kind: "deactivate"; product: Product }
  | { kind: "reactivate"; product: Product }
  | { kind: "delete"; product: Product };

function clampPct(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function pressureTone(pct: number) {
  if (pct >= 75) return "bg-red-600";
  if (pct >= 35) return "bg-amber-500";
  if (pct > 0) return "bg-[var(--color-primary-bright)]";
  return "bg-[rgba(15,68,21,0.12)]";
}

export function InventoryClient({
  products,
  suppliers,
  insights,
  deletableProductIds,
  categoryOptions,
  categoryRows,
}: {
  products: Product[];
  suppliers: Supplier[];
  insights: InventoryInsights;
  deletableProductIds: string[];
  categoryOptions: string[];
  categoryRows: { name: string; productCount: number; canDelete: boolean }[];
}) {
  const router = useRouter();
  const [batchProduct, setBatchProduct] = useState<Product | null>(null);
  const [catalogProduct, setCatalogProduct] = useState<Product | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [danger, setDanger] = useState<DangerAction | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [productsPage, setProductsPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [sort, setSort] = useState<ProductSort>("name");
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  useBodyScrollLock(catalogProduct != null);
  useBodyScrollLock(danger != null);
  useBodyScrollLock(categoryManagerOpen);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const row of categoryRows) {
      next[row.name.toLowerCase()] = row.name;
    }
    setRenameDrafts(next);
  }, [categoryRows]);

  const deletableSet = useMemo(
    () => new Set(deletableProductIds),
    [deletableProductIds]
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (stockFilter === "active" && !p.is_active) return false;
      if (stockFilter === "inactive" && p.is_active) return false;
      if (stockFilter === "low") {
        const min = p.min_stock_level ?? 0;
        if (!(p.stock_quantity <= min)) return false;
      }
      if (stockFilter === "returns" && !((p.return_stock_quantity ?? 0) > 0)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, search, stockFilter]);

  useEffect(() => {
    setProductsPage(1);
  }, [search, stockFilter, sort, pageSize]);

  const sortedProducts = useMemo(() => {
    const arr = [...filteredProducts];
    arr.sort((a, b) => {
      if (sort === "name") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
      if (sort === "category") {
        return (a.category ?? "Uncategorized").localeCompare(
          b.category ?? "Uncategorized",
          undefined,
          { sensitivity: "base" }
        );
      }
      if (sort === "stock_low") return a.stock_quantity - b.stock_quantity;
      return b.stock_quantity - a.stock_quantity;
    });
    return arr;
  }, [filteredProducts, sort]);

  const totalProducts = sortedProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize));
  const safePage = Math.min(productsPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(totalProducts, startIdx + pageSize);
  const pagedProducts = sortedProducts.slice(startIdx, endIdx);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-1 pb-10 tablet:space-y-10 tablet:px-0">
      <PageHeader
        eyebrow="Catalog"
        title="Inventory"
        description="Stock is tracked in batches or via receiving. Export a multi-sheet workbook with formulas from Export Excel."
      />

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 tablet:flex-row tablet:items-end tablet:justify-between tablet:gap-8">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search by name or category"
            className="w-full tablet:max-w-[320px] tablet:flex-none"
          />
          <div className="flex flex-col gap-3 tablet:max-w-xl tablet:flex-1 tablet:items-end">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={exporting}
                onClick={() => {
                  setMsg(null);
                  setExporting(true);
                  void fetch("/api/inventory/export")
                    .then(async (res) => {
                      if (!res.ok) {
                        const t = await res.text();
                        setMsg(t || `Export failed (${res.status})`);
                        return;
                      }
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `inventory-${new Date().toISOString().slice(0, 10)}.xlsx`;
                      a.click();
                      URL.revokeObjectURL(url);
                    })
                    .catch(() => setMsg("Export failed. Check your connection."))
                    .finally(() => setExporting(false));
                }}
                className={`${invToolbarBtnOutline} inline-flex items-center gap-1.5 disabled:opacity-50`}
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                {exporting ? "Exporting…" : "Export Excel"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddProductOpen((o) => !o);
                  setMsg(null);
                }}
                className={
                  addProductOpen
                    ? `${invToolbarBtnOutline} ring-2 ring-[var(--color-primary-bright)] ring-offset-2 ring-offset-[var(--color-cream)]`
                    : "btn-primary inline-flex !h-9 !min-h-0 items-center justify-center !rounded-lg !px-4 !py-0 !text-xs !font-semibold"
                }
              >
                {addProductOpen ? "Close form" : "Add product"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCategoryManagerOpen(true);
                  setMsg(null);
                }}
                className={invToolbarBtnOutline}
              >
                Manage categories
              </button>
            </div>
            <div className={invSegmentWrap}>
              {(
                [
                  ["all", "All"],
                  ["active", "On POS"],
                  ["inactive", "Hidden"],
                  ["low", "Low stock"],
                  ["returns", "Returns"],
                ] as const
              ).map(([key, lab]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStockFilter(key)}
                  className={`${invSegmentBtn} ${
                    stockFilter === key ? invSegmentBtnActive : invSegmentBtnIdle
                  }`}
                >
                  {lab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {msg ? (
          <p className="rounded-lg border border-[rgba(15,68,21,0.1)] bg-[var(--color-surface-solid)] px-4 py-3 text-sm leading-relaxed text-[var(--foreground)] shadow-[var(--shadow-sm)]">
            {msg}
          </p>
        ) : null}

        <section className="grid gap-4 tablet:grid-cols-2">
          <details className="group rounded-xl border border-[rgba(15,68,21,0.08)] bg-[var(--color-surface-solid)] p-5 shadow-[var(--shadow-sm)]">
            <summary className="cursor-pointer list-none select-none">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-[13px] font-semibold text-[var(--foreground)]">
                    Stock pressure by category
                  </h3>
                  <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                    {insights.lowStockByCategory.length} category
                    {insights.lowStockByCategory.length === 1 ? "" : "ies"} with low stock
                  </p>
                </div>
                <span className="text-xs font-medium text-[var(--foreground-muted)] group-open:hidden">
                  View
                </span>
                <span className="text-xs font-medium text-[var(--foreground-muted)] hidden group-open:inline">
                  Hide
                </span>
              </div>
            </summary>

            <div className="mt-3">
              <div className="rounded-lg border border-[rgba(15,68,21,0.06)] bg-[rgba(15,68,21,0.04)] px-3 py-2 text-[11px] leading-relaxed text-[var(--foreground-muted)]">
                <span className="font-semibold text-[var(--foreground)]">Rule:</span> low stock when{" "}
                <span className="font-medium text-[var(--foreground)]">
                  on-hand ≤ min stock alert
                </span>{" "}
                (catalog). If min alert is not set, it’s treated as{" "}
                <span className="font-medium text-[var(--foreground)]">0</span>.
              </div>

              <div className="mt-3 max-h-72 overflow-auto pr-1">
                {insights.lowStockByCategory.length === 0 ? (
                  <p className="text-sm text-[var(--foreground-muted)]">
                    No SKUs match that rule right now.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {insights.lowStockByCategory.map((row) => {
                      const pct = clampPct(row.pct);
                      const tone = pressureTone(pct);
                      return (
                        <li
                          key={row.category}
                          className="rounded-xl border border-[rgba(15,68,21,0.07)] bg-[rgba(255,255,255,0.55)] p-4 shadow-[var(--shadow-xs)]"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-[var(--foreground)]">
                                  {row.category}
                                </span>
                                <span className="rounded-full bg-[rgba(15,68,21,0.06)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--foreground)]">
                                  {row.lowStockSkus}/{row.totalSkus} low
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] tabular-nums text-[var(--foreground-muted)]">
                                Pressure:{" "}
                                <span className="font-semibold text-[var(--foreground)]">
                                  {pct}%
                                </span>
                              </p>
                            </div>

                            <div className="w-full max-w-[220px] flex-1">
                              <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(15,68,21,0.08)]">
                                <div
                                  className={`h-full ${tone}`}
                                  style={{ width: `${pct}%` }}
                                  aria-hidden
                                />
                              </div>
                              <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--foreground-muted)]">
                                <span>0%</span>
                                <span>100%</span>
                              </div>
                            </div>
                          </div>

                          <ul className="mt-3 space-y-2">
                            {row.lines.slice(0, 3).map((line) => {
                              const cap = Math.max(1, line.minAlert);
                              const ratio = clampPct((line.stock / cap) * 100);
                              const lineTone =
                                line.stock <= line.minAlert
                                  ? "bg-red-600"
                                  : "bg-[var(--color-primary-bright)]";
                              return (
                                <li
                                  key={line.productId}
                                  className="rounded-lg border border-[rgba(15,68,21,0.06)] bg-[var(--color-surface-solid)] px-3 py-2"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-semibold text-[var(--foreground)]">
                                        {line.name}
                                      </p>
                                      <p className="mt-0.5 text-[11px] font-mono tabular-nums text-[var(--foreground-muted)]">
                                        stock {line.stock} / min {line.minAlert}
                                        {line.usedDefaultMin ? (
                                          <span className="ml-1 font-sans text-[10px]">
                                            (min defaulted to 0)
                                          </span>
                                        ) : null}
                                      </p>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-800">
                                      Low
                                    </span>
                                  </div>

                                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[rgba(15,68,21,0.08)]">
                                    <div
                                      className={`h-full ${lineTone}`}
                                      style={{ width: `${ratio}%` }}
                                      aria-hidden
                                    />
                                  </div>
                                </li>
                              );
                            })}
                          </ul>

                          {row.lines.length > 3 ? (
                            <p className="mt-2 text-[11px] text-[var(--foreground-muted)]">
                              +{row.lines.length - 3} more low SKU
                              {row.lines.length - 3 === 1 ? "" : "s"}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </details>

          <details className="group rounded-xl border border-[rgba(15,68,21,0.08)] bg-[var(--color-surface-solid)] p-5 shadow-[var(--shadow-sm)]">
            <summary className="cursor-pointer list-none select-none">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-[13px] font-semibold text-[var(--foreground)]">
                    Batch expiry
                  </h3>
                  <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                    {insights.expiredBatches.length} expired ·{" "}
                    {insights.expiringSoonBatches.length} expiring soon
                  </p>
                </div>
                <span className="text-xs font-medium text-[var(--foreground-muted)] group-open:hidden">
                  View
                </span>
                <span className="text-xs font-medium text-[var(--foreground-muted)] hidden group-open:inline">
                  Hide
                </span>
              </div>
            </summary>

            <div className="mt-3 max-h-72 overflow-auto pr-1">
              <p className="text-xs text-[var(--foreground-muted)]">
                Lots with remaining quantity and an expiration date.
              </p>
              {insights.expiredBatches.length > 0 ? (
                <div className="mt-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-red-800">
                    Expired (worst first)
                  </p>
                  <ul className="mt-2 space-y-2">
                    {insights.expiredBatches.slice(0, 16).map((b) => (
                      <li key={b.batchId} className="text-xs">
                        <span className="font-medium text-[var(--foreground)]">{b.productName}</span>
                        <span className="text-[var(--foreground-muted)]">
                          {" "}
                          · {b.expirationDate} · {b.remaining} left ·{" "}
                          <span className="text-red-800">{b.daysPast}d overdue</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-4 text-sm text-[var(--foreground-muted)]">No expired lots.</p>
              )}
              {insights.expiringSoonBatches.length > 0 ? (
                <div className="mt-4 border-t border-[rgba(15,68,21,0.06)] pt-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
                    Next 30 days
                  </p>
                  <ul className="mt-2 space-y-2">
                    {insights.expiringSoonBatches.slice(0, 16).map((b) => (
                      <li key={b.batchId} className="text-xs">
                        <span className="font-medium text-[var(--foreground)]">{b.productName}</span>
                        <span className="text-[var(--foreground-muted)]">
                          {" "}
                          · {b.expirationDate} · {b.remaining} left ·{" "}
                          <span className="font-medium text-[var(--color-primary-bright)]">
                            {b.daysLeft}d
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : insights.expiredBatches.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--foreground-muted)]">
                  Nothing expiring in the next 30 days.
                </p>
              ) : null}
            </div>
          </details>
        </section>

        {addProductOpen ? (
          <Panel
            title="New product"
            className="border-[rgba(15,68,21,0.09)] shadow-[var(--shadow-sm)] [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:tracking-tight"
          >
            <p className="mb-6 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
              Starts at zero stock. Set quantities under{" "}
              <span className="font-medium text-[var(--foreground)]">Batches</span> or through
              receiving.
            </p>
            <form
              className="grid gap-5 tablet:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                start(async () => {
                  setMsg(null);
                  const r = await addProductAction(fd);
                  setMsg(
                    r.ok ? "Product added. Open Batches on the card to set stock." : r.message
                  );
                  if (r.ok) {
                    e.currentTarget.reset();
                    setAddProductOpen(false);
                    router.refresh();
                  }
                });
              }}
            >
              <div className="tablet:col-span-2">
                <label className={invFormLabel}>Name</label>
                <input name="name" required className="input-field" />
              </div>
              <div>
                <label className={invFormLabel}>Category</label>
                <select
                  name="category"
                  className="input-field"
                  defaultValue=""
                >
                  <option value="">
                    No category
                  </option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={invFormLabel}>Price (PHP)</label>
                <input
                  name="price"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  className="input-field"
                />
              </div>
              <div>
                <label className={invFormLabel}>Min stock alert</label>
                <input
                  name="min_stock_level"
                  type="number"
                  min="0"
                  defaultValue={5}
                  className="input-field"
                />
              </div>
              <div className="flex items-end tablet:col-span-2">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--foreground)]">
                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked
                    className="h-4 w-4 rounded border-[rgba(15,68,21,0.25)] text-[var(--color-primary-bright)] focus:ring-[var(--ring-focus)]"
                  />
                  Visible on POS
                </label>
              </div>
              <div className="tablet:col-span-2">
                <button type="submit" disabled={pending} className="btn-primary !min-h-11">
                  {pending ? "Saving…" : "Create product"}
                </button>
              </div>
            </form>
          </Panel>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
              Products
            </h2>
            <span className="tabular-nums text-xs font-medium text-[var(--foreground-muted)]">
              {totalProducts}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(15,68,21,0.06)] bg-[var(--color-surface-solid)] px-4 py-3 text-xs text-[var(--foreground-muted)] shadow-[var(--shadow-xs)]">
            <span className="tabular-nums">
              Showing{" "}
              <span className="font-semibold text-[var(--foreground)]">
                {totalProducts === 0 ? 0 : startIdx + 1}–{endIdx}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-[var(--foreground)]">{totalProducts}</span>
            </span>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <label className="inline-flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
                  Sort
                </span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as ProductSort)}
                  className="input-field !h-9 !py-0 !text-xs"
                >
                  <option value="name">Name (A–Z)</option>
                  <option value="category">Category</option>
                  <option value="stock_low">Stock (low → high)</option>
                  <option value="stock_high">Stock (high → low)</option>
                </select>
              </label>

              <label className="inline-flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
                  Per page
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="input-field !h-9 !py-0 !text-xs"
                >
                  <option value={12}>12</option>
                  <option value={24}>24</option>
                  <option value={48}>48</option>
                </select>
              </label>

              <button
                type="button"
                className={`${invToolbarBtnOutline} disabled:opacity-50`}
                disabled={safePage <= 1}
                onClick={() => setProductsPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <span className="tabular-nums text-[11px]">
                Page{" "}
                <span className="font-semibold text-[var(--foreground)]">{safePage}</span> /{" "}
                <span className="font-semibold text-[var(--foreground)]">{totalPages}</span>
              </span>
              <button
                type="button"
                className={`${invToolbarBtnOutline} disabled:opacity-50`}
                disabled={safePage >= totalPages}
                onClick={() => setProductsPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>

          <div className="grid gap-3 tablet:grid-cols-2 tablet:gap-4">
            {pagedProducts.map((p) => {
              const low =
                p.min_stock_level != null &&
                p.stock_quantity <= (p.min_stock_level ?? 0);
              const returnedQty = p.return_stock_quantity ?? 0;
              return (
                <article
                  key={p.id}
                  className="flex flex-col rounded-xl border border-[rgba(15,68,21,0.08)] bg-[var(--color-surface-solid)] p-5 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="font-medium leading-snug text-[var(--foreground)]">
                        {p.name}
                      </h3>
                      <p className="text-xs text-[var(--foreground-muted)]">
                        {p.category ?? "Uncategorized"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setBatchProduct(p);
                          setMsg(null);
                        }}
                        className={invToolbarBtnOutline}
                      >
                        Batches
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCatalogProduct(p);
                          setMsg(null);
                        }}
                        className={invToolbarBtnOutline}
                      >
                        Catalog
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(15,68,21,0.06)] pt-4 text-xs text-[var(--foreground-muted)]">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-sm font-medium tabular-nums text-[var(--foreground)]">
                        {formatMoney(Number(p.price))}
                      </span>
                      <span className="text-[var(--foreground-muted)]/40" aria-hidden>
                        ·
                      </span>
                      <span className={low ? "font-medium text-red-800" : ""}>
                        Stock {p.stock_quantity}
                      </span>
                      {returnedQty > 0 ? (
                        <>
                          <span className="text-[var(--foreground-muted)]/40" aria-hidden>
                            ·
                          </span>
                          <span className="rounded-md bg-[rgba(15,68,21,0.08)] px-2 py-0.5 text-[11px] font-medium text-[var(--foreground)]">
                            Returns +{returnedQty}
                          </span>
                        </>
                      ) : null}
                      {!p.is_active ? (
                        <>
                          <span className="text-[var(--foreground-muted)]/40" aria-hidden>
                            ·
                          </span>
                          <span className="rounded-md bg-[rgba(15,68,21,0.06)] px-2 py-0.5 text-[11px] font-medium text-[var(--foreground-muted)]">
                            Hidden from POS
                          </span>
                        </>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {p.is_active ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setDanger({ kind: "deactivate", product: p })}
                          className={`${invToolbarBtnOutline} disabled:opacity-50`}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setDanger({ kind: "reactivate", product: p })}
                          className={`${invToolbarBtnOutline} disabled:opacity-50`}
                        >
                          Reactivate
                        </button>
                      )}

                      {!p.is_active && stockFilter === "inactive" ? (
                        <button
                          type="button"
                          disabled={pending || !deletableSet.has(p.id)}
                          onClick={() => {
                            if (!deletableSet.has(p.id)) return;
                            setDeleteConfirm("");
                            setDanger({ kind: "delete", product: p });
                          }}
                          className={`${invToolbarBtnOutline} disabled:opacity-50`}
                          title={
                            deletableSet.has(p.id)
                              ? "Delete product (no sales records)"
                              : "Cannot delete: product has sales records"
                          }
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {totalProducts === 0 ? (
            <p className="rounded-xl border border-dashed border-[rgba(15,68,21,0.14)] py-14 text-center text-sm text-[var(--foreground-muted)]">
              No products match your search or filters.
            </p>
          ) : null}
        </section>
      </div>

      <InventoryBatchModal
        product={batchProduct}
        suppliers={suppliers}
        open={batchProduct != null}
        onClose={() => setBatchProduct(null)}
      />

      {danger ? (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 overflow-y-auto overscroll-y-contain"
          role="dialog"
          aria-modal="true"
          aria-labelledby="danger-modal-title"
          onClick={() => setDanger(null)}
        >
          <div className="flex min-h-[100dvh] items-center justify-center p-3 tablet:p-6">
            <div
              className="app-modal-panel my-auto w-full max-w-md overflow-hidden rounded-2xl border-red-300/70"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-[rgba(15,68,21,0.08)] px-6 py-5">
                <h2
                  id="danger-modal-title"
                  className="text-base font-semibold tracking-tight text-[var(--foreground)]"
                >
                  Are you sure?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  {danger.kind === "deactivate" ? (
                    <>
                      This will deactivate{" "}
                      <span className="font-semibold text-[var(--foreground)]">
                        {danger.product.name}
                      </span>{" "}
                      and hide it from POS. Stock and history remain.
                    </>
                  ) : danger.kind === "reactivate" ? (
                    <>
                      This will reactivate{" "}
                      <span className="font-semibold text-[var(--foreground)]">
                        {danger.product.name}
                      </span>{" "}
                      and show it on POS again.
                    </>
                  ) : (
                    <>
                      This will permanently delete{" "}
                      <span className="font-semibold text-[var(--foreground)]">
                        {danger.product.name}
                      </span>
                      . Deletion is only allowed if there are no sales records.
                    </>
                  )}
                </p>
              </div>

              <div className="space-y-3 px-6 py-5">
                {danger.kind === "delete" && !deletableSet.has(danger.product.id) ? (
                  <p className="rounded-lg border border-[rgba(220,38,38,0.2)] bg-red-50 px-3 py-2 text-xs text-red-800">
                    This product can’t be deleted because it has sales records.
                  </p>
                ) : null}

                {danger.kind === "delete" && deletableSet.has(danger.product.id) ? (
                  <div className="space-y-2 rounded-lg border border-[rgba(220,38,38,0.18)] bg-[rgba(220,38,38,0.06)] p-3">
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Type{" "}
                      <span className="font-mono font-semibold text-[var(--foreground)]">
                        DELETE
                      </span>{" "}
                      to confirm.
                    </p>
                    <input
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder="Type DELETE"
                      className="input-field !h-9 !text-sm"
                      autoFocus
                    />
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 border-t border-[rgba(15,68,21,0.08)] pt-4">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setDanger(null);
                      setDeleteConfirm("");
                    }}
                    className="btn-secondary !min-h-11 flex-1 sm:flex-none disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={
                      pending ||
                      (danger.kind === "delete" &&
                        (!deletableSet.has(danger.product.id) ||
                          deleteConfirm.trim().toUpperCase() !== "DELETE"))
                    }
                    onClick={() => {
                      const p = danger.product;
                      const kind = danger.kind;
                      const fd = new FormData();
                      fd.set("id", p.id);
                      start(async () => {
                        setMsg(null);
                        const r =
                          kind === "deactivate"
                            ? await deactivateProductAction(fd)
                            : kind === "reactivate"
                              ? await reactivateProductAction(fd)
                              : await deleteProductIfNeverSoldAction(fd);
                        setMsg(
                          r.ok
                            ? kind === "deactivate"
                              ? "Product deactivated."
                              : kind === "reactivate"
                                ? "Product reactivated."
                              : "Product deleted."
                            : r.message
                        );
                        if (r.ok) {
                          setDanger(null);
                          setDeleteConfirm("");
                          router.refresh();
                        }
                      });
                    }}
                    className="btn-primary !min-h-11 flex-1 !bg-red-600 !text-white hover:!bg-red-700 disabled:opacity-50 sm:flex-none"
                  >
                    {danger.kind === "deactivate"
                      ? "Deactivate"
                      : danger.kind === "reactivate"
                        ? "Reactivate"
                        : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {catalogProduct ? (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 overflow-y-auto overscroll-y-contain"
          role="dialog"
          aria-modal="true"
          aria-labelledby="catalog-modal-title"
          onClick={() => setCatalogProduct(null)}
        >
          <div className="flex min-h-[100dvh] items-center justify-center p-3 tablet:p-6">
            <div
              className="app-modal-panel my-auto w-full max-w-md overflow-hidden rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-[rgba(15,68,21,0.08)] px-6 py-5">
                <h2
                  id="catalog-modal-title"
                  className="text-base font-semibold tracking-tight text-[var(--foreground)]"
                >
                  Catalog
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--foreground-muted)]">
                  Name, category, price, and POS visibility. Quantities are edited under Batches.
                </p>
              </div>
              <form
                key={catalogProduct.id}
                className="space-y-4 px-6 py-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  start(async () => {
                    setMsg(null);
                    const r = await updateProductCatalogAction(fd);
                    setMsg(r.ok ? "Catalog saved." : r.message);
                    if (r.ok) {
                      setCatalogProduct(null);
                      router.refresh();
                    }
                  });
                }}
              >
                <input type="hidden" name="id" value={catalogProduct.id} />
                <div>
                  <label className={invFormLabel}>Name</label>
                  <input
                    name="name"
                    required
                    defaultValue={catalogProduct.name}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className={invFormLabel}>Category</label>
                  <input
                    name="category"
                    list="inventory-category-list"
                    defaultValue={catalogProduct.category ?? ""}
                    className="input-field"
                    placeholder="e.g. OTC"
                  />
                </div>
                <div>
                  <label className={invFormLabel}>Price (PHP)</label>
                  <input
                    name="price"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    defaultValue={String(catalogProduct.price)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className={invFormLabel}>Min stock alert</label>
                  <input
                    name="min_stock_level"
                    type="number"
                    min="0"
                    defaultValue={catalogProduct.min_stock_level ?? 5}
                    className="input-field"
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2.5 pt-1 text-sm text-[var(--foreground)]">
                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked={catalogProduct.is_active}
                    className="h-4 w-4 rounded border-[rgba(15,68,21,0.25)] text-[var(--color-primary-bright)] focus:ring-[var(--ring-focus)]"
                  />
                  Visible on POS
                </label>
                <div className="flex flex-wrap items-center gap-2 border-t border-[rgba(15,68,21,0.08)] pt-5">
                  <button
                    type="submit"
                    disabled={pending}
                    className="btn-primary !min-h-11 flex-1 sm:flex-none"
                  >
                    {pending ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogProduct(null)}
                    className="btn-secondary !min-h-11 flex-1 sm:flex-none"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {categoryManagerOpen ? (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 overflow-y-auto overscroll-y-contain"
          role="dialog"
          aria-modal="true"
          aria-labelledby="category-manager-title"
          onClick={() => setCategoryManagerOpen(false)}
        >
          <div className="flex min-h-[100dvh] items-center justify-center p-3 tablet:p-6">
            <div
              className="app-modal-panel my-auto w-full max-w-md overflow-hidden rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-[rgba(15,68,21,0.08)] px-6 py-5">
                <h2
                  id="category-manager-title"
                  className="text-base font-semibold tracking-tight text-[var(--foreground)]"
                >
                  Manage categories
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--foreground-muted)]">
                  Add a category option, or delete one that has no products.
                </p>
              </div>
              <div className="space-y-4 px-6 py-5">
                <div>
                  <label className={invFormLabel}>Add category</label>
                  <div className="flex gap-2">
                    <input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="e.g. OTC"
                      className="input-field"
                    />
                    <button
                      type="button"
                      disabled={pending || !newCategoryName.trim()}
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("category", newCategoryName);
                        start(async () => {
                          setMsg(null);
                          const r = await addCategoryOptionAction(fd);
                          setMsg(r.message ?? (r.ok ? "Category added." : "Unable to add category."));
                          if (r.ok) {
                            setNewCategoryName("");
                            router.refresh();
                          }
                        });
                      }}
                      className={`${invToolbarBtnOutline} !h-11 whitespace-nowrap disabled:opacity-50`}
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-[rgba(15,68,21,0.1)]">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-[rgba(15,68,21,0.04)] text-[var(--foreground-muted)]">
                      <tr>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide">
                          Category
                        </th>
                        <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide">
                          Products
                        </th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-3 py-5 text-center text-xs text-[var(--foreground-muted)]"
                          >
                            No categories yet.
                          </td>
                        </tr>
                      ) : (
                        categoryRows.map((row) => {
                          const key = row.name.toLowerCase();
                          const draft = (renameDrafts[key] ?? row.name).trim();
                          const unchanged = draft.toLowerCase() === row.name.toLowerCase();
                          return (
                            <tr key={row.name} className="border-t border-[rgba(15,68,21,0.08)]">
                              <td className="px-3 py-2">
                                <input
                                  value={renameDrafts[key] ?? row.name}
                                  onChange={(e) =>
                                    setRenameDrafts((prev) => ({
                                      ...prev,
                                      [key]: e.target.value,
                                    }))
                                  }
                                  className="input-field !h-9 !py-0 !text-sm"
                                />
                              </td>
                              <td className="px-3 py-2 text-center text-xs font-medium tabular-nums text-[var(--foreground)]">
                                {row.productCount}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={pending || !draft || unchanged}
                                    onClick={() => {
                                      const fd = new FormData();
                                      fd.set("oldCategory", row.name);
                                      fd.set("newCategory", draft);
                                      start(async () => {
                                        setMsg(null);
                                        const r = await updateCategoryOptionAction(fd);
                                        setMsg(
                                          r.message ??
                                            (r.ok ? "Category updated." : "Unable to update category.")
                                        );
                                        if (r.ok) router.refresh();
                                      });
                                    }}
                                    className={`${invToolbarBtnOutline} !h-9 !px-3 !text-xs disabled:opacity-50`}
                                  >
                                    Update
                                  </button>
                                  <button
                                    type="button"
                                    disabled={pending || !row.canDelete}
                                    onClick={() => {
                                      const fd = new FormData();
                                      fd.set("category", row.name);
                                      start(async () => {
                                        setMsg(null);
                                        const r = await deleteEmptyCategoryAction(fd);
                                        setMsg(
                                          r.message ??
                                            (r.ok ? "Category deleted." : "Unable to delete category.")
                                        );
                                        if (r.ok) router.refresh();
                                      });
                                    }}
                                    className={`${invToolbarBtnOutline} !h-9 !px-3 !text-xs disabled:opacity-50`}
                                    title={
                                      row.canDelete
                                        ? "Delete category"
                                        : "Cannot delete: category has products"
                                    }
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                  <p className="border-t border-[rgba(15,68,21,0.08)] px-3 py-2 text-xs text-[var(--foreground-muted)]">
                    Delete works only when product count is zero.
                  </p>
                </div>

                <div className="flex justify-end border-t border-[rgba(15,68,21,0.08)] pt-4">
                  <button
                    type="button"
                    onClick={() => setCategoryManagerOpen(false)}
                    className="btn-secondary !min-h-11"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <datalist id="inventory-category-list">
        {categoryOptions.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
    </div>
  );
}
