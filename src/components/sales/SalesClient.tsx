"use client";

import { BarChart3, Clock3, Eye, Printer, Receipt, Users } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchField } from "@/components/ui/SearchField";

type SaleItemEmbed = {
  quantity: number;
  price: string | number;
  products: { name: string } | null;
};

export type SaleRow = {
  id: string;
  receipt_number: string;
  created_by: string | null;
  created_at: string;
  profiles: { full_name: string | null; email: string } | null;
  return_audit_events?: { event_type: "processed" | "deleted"; note: string | null; created_at: string }[] | null;
  sale_items: SaleItemEmbed[] | null;
};

function getSaleTotal(sale: SaleRow) {
  return (sale.sale_items ?? []).reduce((acc, item) => acc + Number(item.price) * item.quantity, 0);
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function SalesClient({
  sales,
  generatedAtText,
}: {
  sales: SaleRow[];
  generatedAtText: string;
}) {
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<"7d" | "30d" | "all">("7d");
  const [staffFilter, setStaffFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [receiptModalSale, setReceiptModalSale] = useState<SaleRow | null>(null);

  const salesInRange = useMemo(() => {
    if (range === "all") return sales;
    const now = Date.now();
    const days = range === "7d" ? 7 : 30;
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return sales.filter((s) => new Date(s.created_at).getTime() >= cutoff);
  }, [sales, range]);

  const staffOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const sale of salesInRange) {
      if (!sale.created_by) continue;
      map.set(sale.created_by, sale.profiles?.full_name?.trim() || "Unknown staff");
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [salesInRange]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toTs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;
    const min = minAmount.trim() === "" ? null : Number(minAmount);
    const max = maxAmount.trim() === "" ? null : Number(maxAmount);

    const list = salesInRange.filter((sale) => {
      const total = getSaleTotal(sale);
      const createdAt = new Date(sale.created_at).getTime();
      const lineMatch = (sale.sale_items ?? []).some((it) =>
        (it.products?.name ?? "").toLowerCase().includes(q)
      );
      const staffName = sale.profiles?.full_name?.toLowerCase() ?? "";
      const staffEmail = sale.profiles?.email?.toLowerCase() ?? "";
      const returnNoteMatch = (sale.return_audit_events ?? []).some((e) =>
        (e.note ?? "").toLowerCase().includes(q)
      );

      const searchOk =
        !q ||
        sale.receipt_number.toLowerCase().includes(q) ||
        new Date(sale.created_at).toLocaleString().toLowerCase().includes(q) ||
        staffName.includes(q) ||
        staffEmail.includes(q) ||
        returnNoteMatch ||
        lineMatch;

      const staffOk = staffFilter === "all" || sale.created_by === staffFilter;
      const minOk = min == null || Number.isNaN(min) || total >= min;
      const maxOk = max == null || Number.isNaN(max) || total <= max;
      const fromOk = fromTs == null || createdAt >= fromTs;
      const toOk = toTs == null || createdAt <= toTs;

      return searchOk && staffOk && minOk && maxOk && fromOk && toOk;
    });

    list.sort((a, b) => {
      if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "highest") return getSaleTotal(b) - getSaleTotal(a);
      return getSaleTotal(a) - getSaleTotal(b);
    });

    return list;
  }, [salesInRange, search, staffFilter, sortBy, fromDate, toDate, minAmount, maxAmount]);

  const metrics = useMemo(() => {
    const receipts = salesInRange.length;
    let revenue = 0;
    let units = 0;
    const staffMap = new Map<
      string,
      { name: string; email: string; receipts: number; units: number; revenue: number }
    >();
    const hourBuckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      receipts: 0,
      revenue: 0,
    }));

    for (const sale of salesInRange) {
      const saleTotal = getSaleTotal(sale);
      const saleUnits = (sale.sale_items ?? []).reduce((acc, item) => acc + item.quantity, 0);

      revenue += saleTotal;
      units += saleUnits;

      const staffKey = sale.created_by ?? "unassigned";
      const staffName = sale.profiles?.full_name?.trim() || "Unknown staff";
      const staffEmail = sale.profiles?.email ?? "-";
      const staff = staffMap.get(staffKey) ?? {
        name: staffName,
        email: staffEmail,
        receipts: 0,
        units: 0,
        revenue: 0,
      };
      staff.receipts += 1;
      staff.units += saleUnits;
      staff.revenue += saleTotal;
      staffMap.set(staffKey, staff);

      const saleHour = new Date(sale.created_at).getHours();
      const hour = hourBuckets[saleHour];
      hour.receipts += 1;
      hour.revenue += saleTotal;
    }

    const staff = Array.from(staffMap.values())
      .map((s) => ({ ...s, avgTicket: s.receipts > 0 ? s.revenue / s.receipts : 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    const peakHour = hourBuckets.reduce((best, current) =>
      current.receipts > best.receipts ? current : best
    );
    const maxHourReceipts = Math.max(1, ...hourBuckets.map((h) => h.receipts));

    return {
      receipts,
      revenue,
      units,
      avgTicket: receipts > 0 ? revenue / receipts : 0,
      staff,
      hours: hourBuckets,
      peakHour,
      maxHourReceipts,
    };
  }, [salesInRange]);

  function hourLabel(hour: number) {
    return `${hour.toString().padStart(2, "0")}:00`;
  }

  const reportPeriodLabel = useMemo(() => {
    if (fromDate || toDate) return `${fromDate || "Start"} to ${toDate || "Now"}`;
    if (range === "7d") return "Last 7 days";
    if (range === "30d") return "Last 30 days";
    return "All time";
  }, [fromDate, toDate, range]);

  function clearReceiptFilters() {
    setSearch("");
    setStaffFilter("all");
    setSortBy("newest");
    setFromDate("");
    setToDate("");
    setMinAmount("");
    setMaxAmount("");
  }

  function printSaleReceipt(sale: SaleRow) {
    const win = window.open("", "_blank", "width=420,height=760");
    if (!win) return;
    const timeText = new Date(sale.created_at).toLocaleString();
    const rows = (sale.sale_items ?? [])
      .map((item) => {
        const lineTotal = Number(item.price) * item.quantity;
        return `
          <tr>
            <td>${escapeHtml(item.products?.name ?? "Item")}
              <div style="color:#6b7280;font-size:11px;">${item.quantity} × ${escapeHtml(formatMoney(Number(item.price)))}</div>
            </td>
            <td class="money">${escapeHtml(formatMoney(Number(item.price)))}</td>
            <td class="money">${escapeHtml(formatMoney(lineTotal))}</td>
          </tr>
        `;
      })
      .join("");
    const total = getSaleTotal(sale);

    win.document.open();
    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt ${escapeHtml(sale.receipt_number)}</title>
          <style>
            @page { size: 80mm auto; margin: 6mm; }
            body { margin: 0; color: #111; background: #fff; font-family: "Courier New", Courier, monospace; }
            .receipt { width: 72mm; margin: 0 auto; padding: 2mm 0; font-size: 12px; line-height: 1.3; }
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
            .grand { font-size: 14px; font-weight: 700; border-top: 1px solid #111; border-bottom: 1px solid #111; padding: 6px 0; margin: 6px 0; }
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
              <div class="meta-row"><span>Receipt No:</span><span>${escapeHtml(sale.receipt_number)}</span></div>
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
              <div class="grand"><span>Total</span><span>${escapeHtml(formatMoney(total))}</span></div>
            </div>
            <div class="separator"></div>
            <div class="footer">Thank you for your purchase.</div>
          </div>
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `);
    win.document.close();
  }

  return (
    <div className="space-y-7 tablet:space-y-9">
      <PageHeader
        eyebrow="Sales"
        title="Sales Analytics"
        description="Track revenue, staff performance, and peak customer hours. Search and print reports anytime."
      />

      <section className="print:hidden space-y-3 rounded-[var(--radius-2xl)] border border-[rgba(15,68,21,0.1)] bg-[var(--color-surface)] p-4 tablet:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground-muted)]">
              Filters
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRange("7d")}
                className={`h-9 rounded-full px-3.5 text-xs font-semibold transition ${
                  range === "7d"
                    ? "bg-[var(--color-primary-bright)] text-[var(--color-cream-deep)]"
                    : "border border-[rgba(15,68,21,0.14)] bg-white text-[var(--foreground)]"
                }`}
              >
                Last 7 days
              </button>
              <button
                type="button"
                onClick={() => setRange("30d")}
                className={`h-9 rounded-full px-3.5 text-xs font-semibold transition ${
                  range === "30d"
                    ? "bg-[var(--color-primary-bright)] text-[var(--color-cream-deep)]"
                    : "border border-[rgba(15,68,21,0.14)] bg-white text-[var(--foreground)]"
                }`}
              >
                Last 30 days
              </button>
              <button
                type="button"
                onClick={() => setRange("all")}
                className={`h-9 rounded-full px-3.5 text-xs font-semibold transition ${
                  range === "all"
                    ? "bg-[var(--color-primary-bright)] text-[var(--color-cream-deep)]"
                    : "border border-[rgba(15,68,21,0.14)] bg-white text-[var(--foreground)]"
                }`}
              >
                All time
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearReceiptFilters}
              className="h-9 rounded-lg border border-[rgba(15,68,21,0.15)] bg-white px-3 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[rgba(15,68,21,0.05)]"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[rgba(15,68,21,0.16)] bg-white px-3 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[rgba(15,68,21,0.05)]"
            >
              <Printer className="h-4 w-4" />
              Print report
            </button>
          </div>
        </div>

        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search receipt, staff, date, or product..."
          className="w-full"
        />

        <div className="grid gap-2 tablet:grid-cols-2 desktop:grid-cols-3">
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-[var(--foreground-muted)]">Staff</span>
            <select
              value={staffFilter}
              onChange={(e) => setStaffFilter(e.target.value)}
              className="h-10 w-full rounded-lg border border-[rgba(15,68,21,0.15)] bg-white px-3 text-sm text-[var(--foreground)]"
            >
              <option value="all">All staff</option>
              {staffOptions.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-[var(--foreground-muted)]">Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "newest" | "oldest" | "highest" | "lowest")}
              className="h-10 w-full rounded-lg border border-[rgba(15,68,21,0.15)] bg-white px-3 text-sm text-[var(--foreground)]"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="highest">Highest total</option>
              <option value="lowest">Lowest total</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2 tablet:col-span-2 desktop:col-span-1">
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-[var(--foreground-muted)]">From</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-[rgba(15,68,21,0.15)] bg-white px-3 text-sm text-[var(--foreground)]"
                aria-label="From date"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-[var(--foreground-muted)]">To</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-[rgba(15,68,21,0.15)] bg-white px-3 text-sm text-[var(--foreground)]"
                aria-label="To date"
              />
            </label>
          </div>
        </div>

        <div className="grid gap-2 tablet:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-[var(--foreground-muted)]">Min amount</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="0.00"
              className="h-10 w-full rounded-lg border border-[rgba(15,68,21,0.15)] bg-white px-3 text-sm text-[var(--foreground)]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-[var(--foreground-muted)]">Max amount</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder="0.00"
              className="h-10 w-full rounded-lg border border-[rgba(15,68,21,0.15)] bg-white px-3 text-sm text-[var(--foreground)]"
            />
          </label>
        </div>
      </section>

      <section className="hidden print:block">
        <div className="mb-5 border-b border-black pb-3 text-black">
          <p className="text-xs tracking-[0.2em]">PHOEBE DRUGSTORE</p>
          <h1 className="mt-1 text-2xl font-bold">Sales Report</h1>
          <p className="mt-1 text-xs">
            Period: {reportPeriodLabel} | Generated: {generatedAtText}
          </p>
        </div>
        <div className="mb-4 grid grid-cols-4 gap-3 text-xs text-black">
          <div>
            <p className="text-[11px] uppercase tracking-wide">Total sales</p>
            <p className="mt-1 text-base font-bold">{metrics.receipts}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide">Revenue</p>
            <p className="mt-1 text-base font-bold">{formatMoney(metrics.revenue)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide">Items sold</p>
            <p className="mt-1 text-base font-bold">{metrics.units}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide">Avg ticket</p>
            <p className="mt-1 text-base font-bold">{formatMoney(metrics.avgTicket)}</p>
          </div>
        </div>
        <table className="w-full border-collapse text-xs text-black">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-2 pr-2 font-semibold">Receipt</th>
              <th className="py-2 pr-2 font-semibold">Date</th>
              <th className="py-2 pr-2 font-semibold">Staff</th>
              <th className="py-2 pr-2 text-right font-semibold">Items</th>
              <th className="py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((sale) => {
              const items = sale.sale_items ?? [];
              const units = items.reduce((acc, it) => acc + it.quantity, 0);
              return (
                <tr key={sale.id} className="border-b border-[rgba(0,0,0,0.15)] align-top">
                  <td className="py-2 pr-2">{sale.receipt_number}</td>
                  <td className="py-2 pr-2">{new Date(sale.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-2">{sale.profiles?.full_name?.trim() || "Unknown staff"}</td>
                  <td className="py-2 pr-2 text-right">{units}</td>
                  <td className="py-2 text-right font-semibold">{formatMoney(getSaleTotal(sale))}</td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-[11px] text-black">
                  No sales data in selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="print:hidden grid gap-3 tablet:grid-cols-2 desktop:grid-cols-4">
        <MetricCard label="Total sales" value={metrics.receipts.toString()} icon={<Receipt className="h-4 w-4" />} />
        <MetricCard label="Revenue" value={formatMoney(metrics.revenue)} icon={<BarChart3 className="h-4 w-4" />} />
        <MetricCard label="Items sold" value={metrics.units.toString()} icon={<Users className="h-4 w-4" />} />
        <MetricCard label="Avg ticket" value={formatMoney(metrics.avgTicket)} icon={<Clock3 className="h-4 w-4" />} />
      </section>

      <section className="print:hidden grid gap-4 tablet:grid-cols-2">
        <div className="rounded-[var(--radius-2xl)] border border-[rgba(15,68,21,0.1)] bg-[var(--color-surface)] p-4 tablet:p-5">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-[var(--foreground)]">Sales per staff</h3>
            <p className="text-xs text-[var(--foreground-muted)]">Track tickets, units, and revenue by cashier.</p>
          </div>
          <ul className="space-y-2.5">
            {metrics.staff.map((staff, idx) => (
              <li
                key={`${staff.email}-${idx}`}
                className="rounded-xl border border-[rgba(15,68,21,0.1)] bg-white px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">{staff.name}</p>
                    <p className="text-[11px] text-[var(--foreground-muted)]">{staff.email}</p>
                  </div>
                  <p className="font-mono text-sm font-bold text-[var(--color-primary-bright)]">
                    {formatMoney(staff.revenue)}
                  </p>
                </div>
                <p className="mt-1 text-[11px] text-[var(--foreground-muted)]">
                  {staff.receipts} receipts • {staff.units} items • Avg ticket {formatMoney(staff.avgTicket)}
                </p>
              </li>
            ))}
            {metrics.staff.length === 0 ? (
              <li className="rounded-xl border border-dashed border-[rgba(15,68,21,0.2)] p-4 text-center text-sm text-[var(--foreground-muted)]">
                No staff sales in this period.
              </li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-[var(--radius-2xl)] border border-[rgba(15,68,21,0.1)] bg-[var(--color-surface)] p-4 tablet:p-5">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-[var(--foreground)]">Busiest customer hours</h3>
            <p className="text-xs text-[var(--foreground-muted)]">
              Peak hour: {hourLabel(metrics.peakHour.hour)} ({metrics.peakHour.receipts} sales)
            </p>
          </div>
          <ul className="space-y-1.5">
            {metrics.hours.map((h) => (
              <li key={h.hour} className="grid grid-cols-[3.2rem_minmax(0,1fr)_4rem] items-center gap-2">
                <span className="text-[11px] font-medium text-[var(--foreground-muted)]">{hourLabel(h.hour)}</span>
                <div className="h-2 rounded-full bg-[rgba(15,68,21,0.09)]">
                  <div
                    className="h-2 rounded-full bg-[var(--color-primary-bright)]"
                    style={{ width: `${(h.receipts / metrics.maxHourReceipts) * 100}%` }}
                  />
                </div>
                <span className="text-right text-[11px] font-semibold text-[var(--foreground)]">{h.receipts}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="print:hidden">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[var(--foreground)]">Sales history</h3>
          <p className="text-xs text-[var(--foreground-muted)]">{filtered.length} shown</p>
        </div>

        <ul className="space-y-3">
          {filtered.map((s) => {
            const items = s.sale_items ?? [];
            const total = getSaleTotal(s);
            return (
              <li
                key={s.id}
                className="rounded-[var(--radius-2xl)] border border-white/80 bg-[var(--color-surface)] p-4 shadow-[var(--shadow-md)] backdrop-blur-xl tablet:p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-bold tracking-wide text-[var(--color-primary-bright)]">
                      {s.receipt_number}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {(s.return_audit_events ?? []).some((e) => e.event_type === "processed") ? (
                        <span className="rounded-md bg-[rgba(15,68,21,0.1)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary-bright)]">
                          Return processed
                        </span>
                      ) : null}
                      {(s.return_audit_events ?? []).some((e) => e.event_type === "deleted") ? (
                        <span className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
                          Return process deleted
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                      {new Date(s.created_at).toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--foreground-muted)]">
                      Staff: {s.profiles?.full_name?.trim() || "Unknown staff"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="font-mono text-xl font-bold tabular-nums text-[var(--foreground)]">
                      {formatMoney(total)}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setReceiptModalSale(s)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[rgba(15,68,21,0.15)] bg-white px-2.5 text-[11px] font-semibold text-[var(--foreground)] transition hover:bg-[rgba(15,68,21,0.05)]"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View receipt
                      </button>
                      <button
                        type="button"
                        onClick={() => printSaleReceipt(s)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[rgba(15,68,21,0.15)] bg-white px-2.5 text-[11px] font-semibold text-[var(--foreground)] transition hover:bg-[rgba(15,68,21,0.05)]"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Print receipt
                      </button>
                    </div>
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5 border-t border-[rgba(15,68,21,0.08)] pt-4 text-sm text-[var(--foreground-muted)]">
                  {items.map((it, idx) => (
                    <li key={idx} className="flex justify-between gap-2">
                      <span>
                        {it.products?.name ?? "Item"} × {it.quantity}
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatMoney(Number(it.price) * it.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
          {salesInRange.length === 0 ? (
            <li className="rounded-[var(--radius-2xl)] border border-dashed border-[rgba(15,68,21,0.2)] bg-[rgba(15,68,21,0.02)] p-12 text-center text-sm text-[var(--foreground-muted)]">
              No sales found in this date range.
            </li>
          ) : filtered.length === 0 ? (
            <li className="rounded-[var(--radius-2xl)] border border-dashed border-[rgba(15,68,21,0.2)] p-10 text-center text-sm text-[var(--foreground-muted)]">
              No sales match your filters.
            </li>
          ) : null}
        </ul>
      </section>

      {receiptModalSale ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-[rgba(5,16,9,0.88)] p-4 backdrop-blur-[2px] tablet:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-modal-title"
          onClick={() => setReceiptModalSale(null)}
        >
          <div className="flex min-h-[100dvh] items-center justify-center">
            <div
              className="w-full max-w-md overflow-hidden rounded-2xl border border-[rgba(15,68,21,0.1)] bg-[var(--color-surface-solid)] shadow-[0_24px_64px_rgba(0,0,0,0.25)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-[rgba(15,68,21,0.08)] px-5 py-4">
                <h4 id="receipt-modal-title" className="text-base font-semibold text-[var(--foreground)]">
                  Receipt preview
                </h4>
                <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                  {receiptModalSale.receipt_number} · {new Date(receiptModalSale.created_at).toLocaleString()}
                </p>
              </div>

              <div className="px-5 py-4">
                <div className="rounded-lg border border-[rgba(15,68,21,0.12)] bg-white p-4 font-mono text-xs text-[var(--foreground)]">
                  <p className="text-center text-sm font-bold tracking-wide">PHOEBE DRUGSTORE</p>
                  <p className="mt-0.5 text-center text-[11px] text-[var(--foreground-muted)]">
                    Official Sales Receipt
                  </p>
                  <div className="my-2 border-t border-dashed border-[rgba(15,68,21,0.3)]" />
                  <p>Receipt No: {receiptModalSale.receipt_number}</p>
                  <p>Date/Time: {new Date(receiptModalSale.created_at).toLocaleString()}</p>
                  <div className="my-2 border-t border-dashed border-[rgba(15,68,21,0.3)]" />
                  <ul className="space-y-1">
                    {(receiptModalSale.sale_items ?? []).map((it, idx) => (
                      <li key={idx} className="space-y-0.5">
                        <div className="flex justify-between gap-2">
                          <span className="truncate">{it.products?.name ?? "Item"}</span>
                          <span className="shrink-0">{formatMoney(Number(it.price) * it.quantity)}</span>
                        </div>
                        <p className="text-[11px] text-[var(--foreground-muted)]">
                          {it.quantity} × {formatMoney(Number(it.price))}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <div className="my-2 border-t border-dashed border-[rgba(15,68,21,0.3)]" />
                  <div className="flex justify-between text-sm font-bold">
                    <span>Total</span>
                    <span>{formatMoney(getSaleTotal(receiptModalSale))}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[rgba(15,68,21,0.08)] px-5 py-4">
                <button
                  type="button"
                  onClick={() => setReceiptModalSale(null)}
                  className="h-10 rounded-lg border border-[rgba(15,68,21,0.15)] bg-white px-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[rgba(15,68,21,0.05)]"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => printSaleReceipt(receiptModalSale)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[rgba(15,68,21,0.15)] bg-white px-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[rgba(15,68,21,0.05)]"
                >
                  <Printer className="h-4 w-4" />
                  Print receipt
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[rgba(15,68,21,0.1)] bg-[var(--color-surface)] p-4">
      <div className="mb-1.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(15,68,21,0.08)] text-[var(--color-primary-bright)]">
        {icon}
      </div>
      <p className="text-[11px] font-medium text-[var(--foreground-muted)]">{label}</p>
      <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--foreground)]">{value}</p>
    </div>
  );
}

