"use client";

import { Minus, Plus, Printer, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { checkoutAction } from "@/app/actions/checkout";
import { SearchField } from "@/components/ui/SearchField";
import { formatMoney } from "@/lib/format";
import type { Product } from "@/types/database";

type LineSource = "regular" | "return";
type CartLine = { product: Product; qty: number; source: LineSource };
type DiscountPreset = "0" | "5" | "10" | "custom";
type ReceiptLine = {
  name: string;
  qty: number;
  source: LineSource;
  unitPrice: number;
  lineTotal: number;
};
type PrintedReceipt = {
  receiptNumber: string;
  createdAtIso: string;
  lines: ReceiptLine[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  cashReceived: number;
  changeDue: number;
};

function roundMoney(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function PosClient({ products }: { products: Product[] }) {
  const router = useRouter();
  const categories = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => {
      if (p.category) s.add(p.category);
    });
    return ["All", ...Array.from(s).sort()];
  }, [products]);

  const [cat, setCat] = useState("All");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Map<string, CartLine>>(new Map());
  const [msg, setMsg] = useState<string | null>(null);
  const [sellMode, setSellMode] = useState<LineSource>("regular");
  const [productPage, setProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(12);
  const [discountPreset, setDiscountPreset] = useState<DiscountPreset>("0");
  const [customDiscountInput, setCustomDiscountInput] = useState("");
  const [cashInput, setCashInput] = useState("");
  const [lastReceipt, setLastReceipt] = useState<PrintedReceipt | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (sellMode === "return" && (p.return_stock_quantity ?? 0) <= 0) return false;
      const catOk = cat === "All" || p.category === cat;
      const searchOk =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q);
      return catOk && searchOk;
    });
  }, [products, cat, search, sellMode]);

  useEffect(() => {
    setProductPage(1);
  }, [cat, search, productPageSize]);

  function addLine(p: Product, source: LineSource = sellMode) {
    if (source === "return" && (p.return_stock_quantity ?? 0) < 1) {
      setMsg("No return stock available for this item.");
      return;
    }
    if (p.stock_quantity < 1) {
      setMsg("Out of stock.");
      return;
    }
    setCart((prev) => {
      const next = new Map(prev);
      const key = `${p.id}:${source}`;
      const cur = next.get(key);
      const q = (cur?.qty ?? 0) + 1;
      const totalForProduct = Array.from(next.values())
        .filter((l) => l.product.id === p.id)
        .reduce((acc, l) => acc + l.qty, 0);
      if (totalForProduct + 1 > p.stock_quantity) {
        setMsg("Not enough stock for this item.");
        return prev;
      }
      if (source === "return" && q > (p.return_stock_quantity ?? 0)) {
        setMsg("Not enough return stock for this item.");
        return prev;
      }
      next.set(key, { product: p, qty: q, source });
      setMsg(null);
      return next;
    });
  }

  function setQty(key: string, qty: number) {
    setCart((prev) => {
      const next = new Map(prev);
      const line = next.get(key);
      if (!line) return prev;
      if (qty <= 0) {
        next.delete(key);
        setMsg(null);
        return next;
      }
      const totalOthers = Array.from(next.entries())
        .filter(([k, l]) => k !== key && l.product.id === line.product.id)
        .reduce((acc, [, l]) => acc + l.qty, 0);
      if (totalOthers + qty > line.product.stock_quantity) {
        setMsg("Not enough stock for this item.");
        return prev;
      }
      if (line.source === "return" && qty > (line.product.return_stock_quantity ?? 0)) {
        setMsg("Not enough return stock for this item.");
        return prev;
      }
      next.set(key, { ...line, qty });
      setMsg(null);
      return next;
    });
  }

  const lines = Array.from(cart.values());
  const totalItemsInCart = lines.reduce((sum, line) => sum + line.qty, 0);
  const subtotal = lines.reduce((a, l) => a + l.qty * Number(l.product.price), 0);
  const customDiscount = Number(customDiscountInput);
  const discountPercentRaw =
    discountPreset === "custom" ? (Number.isFinite(customDiscount) ? customDiscount : 0) : Number(discountPreset);
  const discountPercent = Math.max(0, Math.min(100, discountPercentRaw));
  const discountFactor = 1 - discountPercent / 100;
  const discountedPreviewLines = lines.map((line) => {
    const discountedUnit = roundMoney(Number(line.product.price) * discountFactor);
    const lineTotal = roundMoney(discountedUnit * line.qty);
    return {
      key: `${line.product.id}:${line.source}`,
      name: line.product.name,
      qty: line.qty,
      source: line.source,
      unitPrice: discountedUnit,
      lineTotal,
    };
  });
  const discountedSubtotal = roundMoney(discountedPreviewLines.reduce((sum, line) => sum + line.lineTotal, 0));
  const discountAmount = roundMoney(subtotal - discountedSubtotal);
  const cashReceivedRaw = Number(cashInput);
  const cashReceived = Number.isFinite(cashReceivedRaw) ? Math.max(0, cashReceivedRaw) : 0;
  const changeDue = roundMoney(cashReceived - discountedSubtotal);
  const canCharge = lines.length > 0 && cashReceived >= discountedSubtotal;
  const totalProductPages = Math.max(1, Math.ceil(filtered.length / productPageSize));
  const safeProductPage = Math.min(productPage, totalProductPages);
  const paginatedProducts = useMemo(() => {
    const start = (safeProductPage - 1) * productPageSize;
    return filtered.slice(start, start + productPageSize);
  }, [filtered, safeProductPage, productPageSize]);

  function printReceipt(receipt: PrintedReceipt) {
    const win = window.open("", "_blank", "width=420,height=760");
    if (!win) {
      setMsg("Pop-up blocked. Allow pop-ups to print receipt.");
      return;
    }
    const timeText = new Date(receipt.createdAtIso).toLocaleString();
    const rows = receipt.lines
      .map(
        (line) => `
          <tr>
            <td>
              ${escapeHtml(line.name)}${line.source === "return" ? " (Return)" : ""}
              <div style="color:#6b7280;font-size:11px;">${line.qty} × ${escapeHtml(formatMoney(line.unitPrice))}</div>
            </td>
            <td style="text-align:right;">${escapeHtml(formatMoney(line.unitPrice))}</td>
            <td style="text-align:right;">${escapeHtml(formatMoney(line.lineTotal))}</td>
          </tr>
        `
      )
      .join("");
    win.document.open();
    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt ${escapeHtml(receipt.receiptNumber)}</title>
          <style>
            @page { size: 80mm auto; margin: 6mm; }
            body {
              margin: 0;
              color: #111;
              background: #fff;
              font-family: "Courier New", Courier, monospace;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .receipt {
              width: 72mm;
              margin: 0 auto;
              padding: 2mm 0;
              font-size: 12px;
              line-height: 1.3;
            }
            .center { text-align: center; }
            .store-name { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: 0.04em; }
            .store-sub { margin: 2px 0 0; font-size: 11px; color: #4b5563; }
            .separator { border-top: 1px dashed #333; margin: 8px 0; }
            .meta { font-size: 11px; }
            .meta-row { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 12px; }
            th, td { padding: 5px 0; vertical-align: top; }
            th { text-align: left; font-size: 11px; border-bottom: 1px dashed #333; }
            .money { text-align: right; white-space: nowrap; }
            .totals { margin-top: 8px; font-size: 12px; }
            .totals div { display: flex; justify-content: space-between; margin: 3px 0; }
            .grand {
              font-size: 14px;
              font-weight: 700;
              border-top: 1px solid #111;
              border-bottom: 1px solid #111;
              padding: 6px 0;
              margin: 6px 0;
            }
            .footer { margin-top: 10px; text-align: center; font-size: 11px; color: #4b5563; }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="center">
              <p class="store-name">PHOEBE DRUGSTORE</p>
              <p class="store-sub">Official Sales Receipt</p>
            </div>
            <div class="separator"></div>
            <div class="meta">
              <div class="meta-row"><span>Receipt No:</span><span>${escapeHtml(receipt.receiptNumber)}</span></div>
              <div class="meta-row"><span>Date/Time:</span><span>${escapeHtml(timeText)}</span></div>
            </div>
            <div class="separator"></div>
            <table>
              <thead>
                <tr><th>Item</th><th class="money">Price</th><th class="money">Amount</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <div class="separator"></div>
            <div class="totals">
              <div><span>Subtotal</span><span>${escapeHtml(formatMoney(receipt.subtotal))}</span></div>
              <div><span>Discount (${receipt.discountPercent.toFixed(2)}%)</span><span>- ${escapeHtml(formatMoney(receipt.discountAmount))}</span></div>
              <div class="grand"><span>Total</span><span>${escapeHtml(formatMoney(receipt.total))}</span></div>
              <div><span>Cash Received</span><span>${escapeHtml(formatMoney(receipt.cashReceived))}</span></div>
              <div><span>Change</span><span>${escapeHtml(formatMoney(receipt.changeDue))}</span></div>
            </div>
            <div class="separator"></div>
            <div class="footer">
              Thank you for your purchase.<br/>
              Please keep this receipt for returns/exchange.
            </div>
          </div>
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `);
    win.document.close();
  }

  function checkout() {
    setMsg(null);
    if (lines.length === 0) return;
    if (cashReceived < discountedSubtotal) {
      setMsg("Insufficient cash received.");
      return;
    }
    startTransition(async () => {
      const saleLines = lines.map((l) => ({
        product_id: l.product.id,
        quantity: l.qty,
        price: roundMoney(Number(l.product.price) * discountFactor),
        source: l.source,
      }));
      const res = await checkoutAction(
        saleLines
      );
      if (!res.ok) setMsg(res.message);
      else {
        const receiptLines: ReceiptLine[] = lines.map((l, i) => {
          const unitPrice = saleLines[i].price;
          return {
            name: l.product.name,
            qty: l.qty,
            source: l.source,
            unitPrice,
            lineTotal: roundMoney(unitPrice * l.qty),
          };
        });
        const printedSubtotal = roundMoney(lines.reduce((a, l) => a + l.qty * Number(l.product.price), 0));
        const printedTotal = roundMoney(receiptLines.reduce((a, l) => a + l.lineTotal, 0));
        const printedDiscount = roundMoney(printedSubtotal - printedTotal);
        const nextReceipt: PrintedReceipt = {
          receiptNumber: res.receipt,
          createdAtIso: res.createdAtIso,
          lines: receiptLines,
          subtotal: printedSubtotal,
          discountPercent,
          discountAmount: printedDiscount,
          total: printedTotal,
          cashReceived: roundMoney(cashReceived),
          changeDue: roundMoney(cashReceived - printedTotal),
        };
        setLastReceipt(nextReceipt);
        setCart(new Map());
        setCashInput("");
        setMsg(`Sale complete — receipt ${res.receipt}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-4 tablet:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] tablet:items-start tablet:gap-4.5">
      <section className="min-w-0 rounded-[var(--radius-xl)] border border-[rgba(15,68,21,0.1)] bg-[var(--color-surface)] p-3 tablet:p-4">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-muted)]">
              Register
            </p>
            <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)] tablet:text-2xl">
              New sale
            </h2>
          </div>
          <p className="text-xs font-medium text-[var(--foreground-muted)]">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="mt-3 grid gap-2.5 tablet:grid-cols-[minmax(0,1fr)_auto] tablet:items-center">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search product or category..."
            className="w-full"
          />
          <div className="flex items-center gap-1.5 justify-self-start tablet:justify-self-end">
            <button
              type="button"
              onClick={() => setSellMode("regular")}
              className={`h-9 rounded-md px-2.5 text-xs font-semibold ${
                sellMode === "regular"
                  ? "bg-[var(--color-primary-bright)] text-[var(--color-cream-deep)]"
                  : "border border-[rgba(15,68,21,0.15)] bg-white text-[var(--foreground)]"
              }`}
            >
              Regular
            </button>
            <button
              type="button"
              onClick={() => setSellMode("return")}
              className={`h-9 rounded-md px-2.5 text-xs font-semibold ${
                sellMode === "return"
                  ? "bg-[var(--color-primary-bright)] text-[var(--color-cream-deep)]"
                  : "border border-[rgba(15,68,21,0.15)] bg-white text-[var(--foreground)]"
              }`}
            >
              Sell return item
            </button>
            <label className="text-[11px] font-medium text-[var(--foreground-muted)]" htmlFor="pos-page-size">
              Rows
            </label>
            <select
              id="pos-page-size"
              value={productPageSize}
              onChange={(e) => setProductPageSize(Number(e.target.value))}
              className="h-9 rounded-md border border-[rgba(15,68,21,0.15)] bg-white px-2 text-xs font-semibold text-[var(--foreground)]"
            >
              <option value={8}>8</option>
              <option value={12}>12</option>
              <option value={18}>18</option>
              <option value={24}>24</option>
            </select>
          </div>
        </div>

        <div className="scrollbar-thin mt-2.5 -mx-0.5 flex gap-1.5 overflow-x-auto px-0.5 pb-1">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition ${
                cat === c
                  ? "border-[var(--color-primary-bright)] bg-[var(--color-primary-bright)] text-[var(--color-cream-deep)]"
                  : "border-[rgba(15,68,21,0.14)] bg-white text-[var(--foreground)] hover:bg-[rgba(15,68,21,0.05)]"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-2.5 rounded-[var(--radius-lg)] border border-[rgba(15,68,21,0.09)] bg-[rgba(255,255,255,0.65)] p-2.5 tablet:p-3">
          <div className="grid max-h-[52dvh] grid-cols-2 gap-2.5 overflow-y-auto pr-1 tablet:max-h-[60dvh] tablet:grid-cols-3 tablet:gap-3">
            {paginatedProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addLine(p, sellMode)}
                className="group flex min-h-[126px] flex-col rounded-[var(--radius-lg)] border border-[rgba(15,68,21,0.1)] bg-white p-2.5 text-left transition hover:border-[rgba(15,68,21,0.2)] hover:shadow-[var(--shadow-sm)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 tablet:min-h-[134px] tablet:p-3"
                disabled={sellMode === "return" ? (p.return_stock_quantity ?? 0) < 1 : p.stock_quantity < 1}
              >
                <div className="mb-1.5 flex items-center justify-between gap-1.5 text-[10px]">
                  <span className="truncate text-[var(--foreground-muted)]">{p.category ?? "General"}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 font-semibold ${
                      p.stock_quantity < 1
                        ? "bg-red-100 text-red-700"
                        : "bg-[rgba(15,68,21,0.08)] text-[var(--color-primary-bright)]"
                    }`}
                  >
                    {p.stock_quantity < 1
                      ? "Out"
                      : sellMode === "return"
                        ? `${p.return_stock_quantity ?? 0} rtn`
                        : `${p.stock_quantity}`}
                  </span>
                </div>
                <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--foreground)] tablet:text-sm">
                  {p.name}
                </p>
                <p className="mt-auto pt-2.5 font-mono text-base font-bold tabular-nums text-[var(--foreground)]">
                  {formatMoney(Number(p.price))}
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--foreground-muted)]">Tap to add</p>
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="col-span-full rounded-[var(--radius-lg)] border border-dashed border-[rgba(15,68,21,0.2)] py-10 text-center text-sm text-[var(--foreground-muted)]">
                No products match this category or search.
              </p>
            ) : null}
          </div>

          {filtered.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(15,68,21,0.1)] pt-2.5">
              <p className="text-xs text-[var(--foreground-muted)]">
                Showing {(safeProductPage - 1) * productPageSize + 1}-
                {Math.min(safeProductPage * productPageSize, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                  disabled={safeProductPage <= 1}
                  className="h-8 rounded-md border border-[rgba(15,68,21,0.15)] bg-white px-2.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[rgba(15,68,21,0.05)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Prev
                </button>
                <span className="min-w-[2.8rem] text-center text-xs font-semibold text-[var(--foreground-muted)]">
                  {safeProductPage}/{totalProductPages}
                </span>
                <button
                  type="button"
                  onClick={() => setProductPage((p) => Math.min(totalProductPages, p + 1))}
                  disabled={safeProductPage >= totalProductPages}
                  className="h-8 rounded-md border border-[rgba(15,68,21,0.15)] bg-white px-2.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[rgba(15,68,21,0.05)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <aside className="flex min-h-[420px] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[rgba(15,68,21,0.1)] bg-[var(--color-surface)] p-3 tablet:sticky tablet:top-24 tablet:max-h-[calc(100dvh-11rem)] tablet:p-3.5">
        <div className="flex items-center justify-between gap-2 border-b border-[rgba(15,68,21,0.08)] pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-muted)]">
              Cart
            </p>
            <h3 className="text-base font-bold text-[var(--foreground)] tablet:text-lg">Current order</h3>
          </div>
          <div className="flex items-center gap-2">
            {lines.length > 0 ? (
              <button
                type="button"
                onClick={() => setCart(new Map())}
                className="h-8 rounded-lg border border-[rgba(15,68,21,0.15)] px-2.5 text-xs font-semibold text-[var(--foreground-muted)] transition hover:bg-[rgba(15,68,21,0.05)]"
              >
                Clear
              </button>
            ) : null}
            <span className="rounded-full bg-[rgba(15,68,21,0.09)] px-2.5 py-1 text-xs font-bold text-[var(--color-primary-bright)]">
              {totalItemsInCart}
            </span>
          </div>
        </div>

        {msg ? (
          <p className="mt-3 rounded-[var(--radius-xl)] border border-[rgba(15,68,21,0.1)] bg-[var(--color-cream-deep)] px-3 py-2.5 text-sm leading-snug text-[var(--foreground)]">
            {msg}
          </p>
        ) : null}

        <ul className="mt-3.5 flex min-h-[140px] flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1 tablet:min-h-[220px]">
          {lines.length === 0 ? (
            <li className="flex flex-1 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[rgba(15,68,21,0.15)] bg-[rgba(15,68,21,0.02)] px-4 py-10 text-center text-sm text-[var(--foreground-muted)]">
              <ShoppingBagIllustration />
              <span className="mt-2 max-w-[14rem] text-balance">
                Add products from the grid. Quantities respect live stock.
              </span>
            </li>
          ) : (
            lines.map(({ product: p, qty, source }) => (
              <li
                key={`${p.id}:${source}`}
                className="rounded-[var(--radius-lg)] border border-[rgba(15,68,21,0.1)] bg-[var(--color-surface-solid)] p-2.5"
              >
                <div className="flex justify-between gap-2">
                  <div>
                    <p className="line-clamp-2 text-sm font-semibold text-[var(--foreground)]">{p.name}</p>
                    <p className="text-[10px] text-[var(--foreground-muted)]">
                      {source === "return" ? "Return item sale" : "Regular sale"}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => setQty(`${p.id}:${source}`, 0)}
                    className="tap-target flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--foreground-muted)] transition hover:bg-[rgba(15,68,21,0.06)] hover:text-[var(--foreground)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-0.5 rounded-lg border border-[rgba(15,68,21,0.12)] bg-white p-1">
                    <button
                      type="button"
                      className="tap-target flex h-9 w-9 items-center justify-center rounded-md text-[var(--foreground)] transition hover:bg-[rgba(15,68,21,0.06)]"
                      onClick={() => setQty(`${p.id}:${source}`, qty - 1)}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="min-w-[2.25rem] text-center text-sm font-bold tabular-nums">{qty}</span>
                    <button
                      type="button"
                      className="tap-target flex h-9 w-9 items-center justify-center rounded-md text-[var(--foreground)] transition hover:bg-[rgba(15,68,21,0.06)]"
                      onClick={() => addLine(p, source)}
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="font-mono text-sm font-bold tabular-nums text-[var(--color-primary-bright)]">
                    {formatMoney(qty * Number(p.price))}
                  </p>
                </div>
              </li>
            ))
          )}
        </ul>

        <div className="mt-3.5 shrink-0 space-y-3 border-t border-[rgba(15,68,21,0.08)] pt-3.5">
          <div className="space-y-2 rounded-[var(--radius-lg)] border border-[rgba(15,68,21,0.1)] bg-white p-2.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
              Discount
            </label>
            <div className="flex flex-wrap gap-1.5">
              {([
                ["0", "None"],
                ["5", "5%"],
                ["10", "10%"],
                ["custom", "Custom"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDiscountPreset(value)}
                  className={`h-8 rounded-md px-2.5 text-xs font-semibold ${
                    discountPreset === value
                      ? "bg-[var(--color-primary-bright)] text-[var(--color-cream-deep)]"
                      : "border border-[rgba(15,68,21,0.15)] bg-white text-[var(--foreground)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {discountPreset === "custom" ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={customDiscountInput}
                  onChange={(e) => setCustomDiscountInput(e.target.value)}
                  placeholder="0.00"
                  className="input-field !h-8 !py-0 !text-xs"
                />
                <span className="text-xs text-[var(--foreground-muted)]">%</span>
              </div>
            ) : null}
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-[var(--foreground-muted)]">Subtotal</span>
            <span className="font-mono text-xl font-bold tabular-nums text-[var(--foreground)]">
              {formatMoney(subtotal)}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-[var(--foreground-muted)]">
              Discount ({discountPercent.toFixed(2)}%)
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums text-[var(--foreground)]">
              - {formatMoney(discountAmount)}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-[var(--foreground-muted)]">Total</span>
            <span className="font-mono text-xl font-bold tabular-nums text-[var(--foreground)]">
              {formatMoney(discountedSubtotal)}
            </span>
          </div>
          <div className="space-y-2 rounded-[var(--radius-lg)] border border-[rgba(15,68,21,0.1)] bg-white p-2.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
              Cash received
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step="0.01"
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
                placeholder="0.00"
                className="input-field !h-9 !py-0 !text-sm"
              />
              <button
                type="button"
                onClick={() => setCashInput(discountedSubtotal.toFixed(2))}
                className="h-9 rounded-md border border-[rgba(15,68,21,0.15)] bg-white px-2.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[rgba(15,68,21,0.05)]"
              >
                Exact
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[100, 200, 500, 1000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setCashInput(String(amt))}
                  className="h-8 rounded-md border border-[rgba(15,68,21,0.15)] bg-white px-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[rgba(15,68,21,0.05)]"
                >
                  {formatMoney(amt)}
                </button>
              ))}
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-[var(--foreground-muted)]">Change</span>
              <span
                className={`font-mono font-semibold tabular-nums ${
                  changeDue < 0 ? "text-red-700" : "text-[var(--foreground)]"
                }`}
              >
                {formatMoney(changeDue)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={checkout}
            disabled={pending || !canCharge}
            className="flex w-full min-h-[50px] items-center justify-center rounded-lg bg-[var(--color-primary-bright)] text-sm font-semibold tracking-wide text-[var(--color-cream-deep)] transition hover:brightness-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {pending ? "Processing…" : "Charge customer"}
          </button>
          {lastReceipt ? (
            <button
              type="button"
              onClick={() => printReceipt(lastReceipt)}
              className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[rgba(15,68,21,0.16)] bg-white text-sm font-semibold text-[var(--foreground)] transition hover:bg-[rgba(15,68,21,0.05)]"
            >
              <Printer className="h-4 w-4" />
              Print last receipt
            </button>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function ShoppingBagIllustration() {
  return (
    <div
      className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(15,68,21,0.06)] text-[var(--color-primary-bright)]"
      aria-hidden
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M6 7h12l-1 12H7L6 7z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 7V6a3 3 0 016 0v1" strokeLinecap="round" />
      </svg>
    </div>
  );
}
