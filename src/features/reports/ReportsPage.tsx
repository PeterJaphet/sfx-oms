import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { useAuth } from "@/features/auth/auth-context";
import Dashboard from "./Dashboard";
import { loadPeriods, loadReport } from "./report-api";
import {
  definitions,
  findDefinition,
  periods,
  rangeSchema,
  type Range,
} from "./report-model";
import { ReportTable } from "./ReportTable";
function Detail({
  name,
  range,
  search,
  offset,
  onPage,
}: {
  name: string;
  range: Range;
  search: string;
  offset: number;
  onPage: (offset: number) => void;
}) {
  const def = findDefinition(name)!;
  const query = useQuery({
    queryKey: ["reports", "table", name, range, search, offset],
    queryFn: () => loadReport(name, range, offset, 100, search),
    refetchInterval: 30000,
    retry: false,
  });
  const message = query.error?.message;
  useEffect(() => {
    if (message) toast.error(message, { id: "m9-report-error" });
  }, [message]);
  if (query.isPending) return <p role="status">Loading report…</p>;
  if (query.error)
    return (
      <div role="alert" className="space-y-3">
        <p className="break-words text-brand-strong">{query.error.message}</p>
        <Button
          variant="secondary"
          onClick={() => {
            void query.refetch();
          }}
        >
          Retry report
        </Button>
      </div>
    );
  return (
    <div className="min-w-0 space-y-3">
      {name === "debts" ? (
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-bold">
            Totals · all outstanding debts now
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-brand-soft p-3 text-brand-deep">
              <p className="text-xs">We owe</p>
              <p className="break-words text-xl font-bold">
                ≈ {formatMoney(Number(query.data.summary.we_owe ?? 0), "TRY")}
              </p>
            </div>
            <div className="rounded-xl bg-ok-soft p-3 text-ok">
              <p className="text-xs">Debt owed to us</p>
              <p className="break-words text-xl font-bold">
                ≈{" "}
                {formatMoney(
                  Number(query.data.summary.debt_owed_to_us ?? 0),
                  "TRY",
                )}
              </p>
            </div>
          </div>
          {Number(query.data.summary.missing_owe_rates ?? 0) +
            Number(query.data.summary.missing_owed_rates ?? 0) >
          0 ? (
            <p role="alert" className="text-sm text-amber-ink">
              Some foreign debts have no default rate. The TRY estimates exclude
              them; their own-currency outstanding amounts remain in the table.
            </p>
          ) : null}
        </section>
      ) : name === "unpaid" ? (
        <div
          role="status"
          className="rounded-xl bg-amber-soft p-4 font-bold text-amber-ink"
        >
          Customer balances due now:{" "}
          {formatMoney(Number(query.data.summary.due_now ?? 0), "TRY")} · all
          unpaid orders
        </div>
      ) : null}
      {name === "sales" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Orders", "orders"],
            ["Gross sales", "gross_sales"],
            ["Discounts", "discounts"],
            ["Net revenue", "net_revenue"],
            ["Average order", "average_order"],
          ].map(([label, key]) => (
            <article
              key={key}
              className="min-w-0 rounded-xl border bg-card p-3"
            >
              <h2 className="text-xs text-muted">{label}</h2>
              <p className="break-words font-bold">
                {query.data.summary[key] == null
                  ? "—"
                  : key === "orders"
                    ? String(query.data.summary[key])
                    : formatMoney(Number(query.data.summary[key]), "TRY")}
              </p>
            </article>
          ))}
        </div>
      ) : name === "expenses" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Cost of goods", "cogs"],
            ["Operational", "operational"],
            ["Fixed", "fixed"],
            ["Total expenses", "total"],
          ].map(([label, key]) => (
            <article
              key={key}
              className="min-w-0 rounded-xl border bg-card p-3"
            >
              <h2 className="text-xs text-muted">{label}</h2>
              <p className="break-words font-bold">
                {formatMoney(Number(query.data.summary[key] ?? 0), "TRY")}
              </p>
            </article>
          ))}
        </div>
      ) : ["items", "item_categories", "extras"].includes(name) ? (
        <div
          role="status"
          className="rounded-xl bg-brand-soft p-4 text-brand-deep"
        >
          <p className="font-bold">
            {String(query.data.summary.filtered_quantity ?? 0)} sold in matching
            rows
          </p>
          {name === "extras" ? (
            <p className="text-sm">
              {String(query.data.summary.filtered_on_plate ?? 0)} on a plate ·{" "}
              {String(query.data.summary.filtered_standalone ?? 0)} on its own
            </p>
          ) : null}
        </div>
      ) : null}
      <ReportTable
        data={query.data}
        definition={def}
        range={range}
        search={search}
        disabled={query.isFetching}
      />
      {name === "items" ? (
        <p className="text-xs text-muted">
          Previous period: {query.data.previous_from} to{" "}
          {query.data.previous_to}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={offset === 0 || query.isFetching}
          onClick={() => onPage(Math.max(0, offset - 100))}
        >
          Previous page
        </Button>
        <span className="text-sm text-muted">
          Page {Math.floor(offset / 100) + 1}
        </span>
        <Button
          variant="secondary"
          disabled={
            query.isFetching ||
            offset + query.data.rows.length >= query.data.total
          }
          onClick={() => onPage(offset + 100)}
        >
          Next page
        </Button>
      </div>
    </div>
  );
}
export default function ReportsPage() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const reference = useQuery({
    queryKey: ["reports", "periods"],
    queryFn: loadPeriods,
    refetchInterval: 60000,
    retry: false,
  });
  const period = params.get("period") ?? "week";
  const name = params.get("view") ?? "dashboard";
  const view = findDefinition(name) ? name : "dashboard";
  const search = params.get("search") ?? "";
  const rawOffset = Number(params.get("offset"));
  const offset =
    Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [invalid, setInvalid] = useState("");
  const chosen =
    period === "custom"
      ? rangeSchema.safeParse({
          from: params.get("from"),
          to: params.get("to"),
        })
      : null;
  const selectedRange = chosen?.success
    ? chosen.data
    : period === "custom"
      ? undefined
      : (reference.data?.[period as "today" | "week" | "last_week" | "month"] ??
        reference.data?.week);
  const current = !!findDefinition(view)?.current;
  const range = current ? reference.data?.today : selectedRange;
  function change(values: Record<string, string | undefined>) {
    setParams((old) => {
      const next = new URLSearchParams(old);
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) next.delete(key);
        else next.set(key, value);
      }
      return next;
    });
  }
  function onReport(name: string) {
    change({ view: name, search: undefined, offset: undefined });
  }
  const message = reference.error?.message;
  useEffect(() => {
    if (message) toast.error(message, { id: "m9-period-error" });
  }, [message]);
  if (reference.isPending) return <p role="status">Loading business dates…</p>;
  if (reference.error)
    return (
      <div role="alert" className="space-y-3">
        <p className="break-words text-brand-strong">
          {reference.error.message}
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            void reference.refetch();
          }}
        >
          Retry report dates
        </Button>
      </div>
    );
  return (
    <section className="min-w-0 space-y-5">
      <header className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {current
              ? `Outstanding now · business day ${reference.data.business_date}`
              : range
                ? `${range.from} to ${range.to} · business dates`
                : "Choose a date range"}
          </p>
          <h1 className="text-[26px] font-extrabold sm:text-[34px]">
            {view === "dashboard"
              ? "Reports and dashboard"
              : findDefinition(view)!.title}
          </h1>
          {profile!.role === "admin" ? (
            <Button asChild variant="secondary" className="mt-3">
              <Link to="/costing">Costing & weekly forecast</Link>
            </Button>
          ) : null}
          {profile!.role === "operations" ? (
            <p className="text-sm text-muted">Read-only reports</p>
          ) : null}
        </div>
        {!current ? (
          <>
            <div className="flex flex-wrap gap-2" aria-label="Report period">
              {periods.map(([value, label]) => (
                <Button
                  key={value}
                  variant={period === value ? "default" : "secondary"}
                  size="secondary"
                  className="px-3 text-sm"
                  aria-pressed={period === value}
                  onClick={() => {
                    if (value === "custom") {
                      setFrom(range?.from ?? reference.data!.week.from);
                      setTo(range?.to ?? reference.data!.week.to);
                    }
                    change({ period: value, offset: undefined });
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <p
            role="status"
            className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink"
          >
            Outstanding now. These views show current balances rather than
            historical snapshots.
          </p>
        )}
        {!current && period === "custom" ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = rangeSchema.safeParse({ from, to });
              if (!parsed.success) {
                setInvalid("Choose a valid date range");
                return;
              }
              setInvalid("");
              change({ from, to, offset: undefined });
            }}
          >
            <label className="min-w-0 flex-1 space-y-1 text-sm font-semibold">
              <span>From business date</span>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </label>
            <label className="min-w-0 flex-1 space-y-1 text-sm font-semibold">
              <span>To business date</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </label>
            <Button type="submit">Apply dates</Button>
            {invalid ? (
              <p role="alert" className="w-full text-sm text-brand-strong">
                {invalid}
              </p>
            ) : null}
          </form>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="px-3 text-sm"
            onClick={() =>
              change({
                view: "items",
                period: "last_week",
                search: "BBQ Burger",
                offset: undefined,
              })
            }
          >
            BBQ Burger last week
          </Button>
          <Button
            variant="secondary"
            className="px-3 text-sm"
            onClick={() =>
              change({
                view: "extras",
                period: "month",
                search: "Swallow",
                offset: undefined,
              })
            }
          >
            Swallow this month
          </Button>
        </div>
      </header>
      <label
        className="block space-y-2 text-sm font-semibold"
        htmlFor="report-choice"
      >
        <span id="report-choice-label">Report</span>
        <select
          id="report-choice"
          aria-labelledby="report-choice-label"
          className="h-12 w-full rounded-lg border border-line-strong bg-card px-3 text-base"
          value={view}
          onChange={(e) => onReport(e.target.value)}
        >
          <option value="dashboard">Overview</option>
          {definitions.map((d) => (
            <option key={d.name} value={d.name}>
              {d.title}
            </option>
          ))}
        </select>
      </label>
      {view !== "dashboard" ? (
        <label
          className="block space-y-2 text-sm font-semibold"
          htmlFor="report-search"
        >
          <span>Search this report</span>
          <Input
            id="report-search"
            value={search}
            onChange={(e) =>
              change({ search: e.target.value, offset: undefined })
            }
            placeholder="e.g. BBQ Burger, supplier or staff"
          />
        </label>
      ) : null}
      {range ? (
        view === "dashboard" ? (
          <Dashboard range={range} onReport={onReport} />
        ) : (
          <Detail
            name={view}
            range={range}
            search={search}
            offset={offset}
            onPage={(offset) => change({ offset: String(offset) })}
          />
        )
      ) : (
        <p role="status" className="text-sm text-muted">
          Apply your custom dates to view the report.
        </p>
      )}
    </section>
  );
}
