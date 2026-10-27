import { DeletePurchase } from "./DeletePurchase";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatMoney } from "@/lib/format";
import { formatRate } from "@/features/orders/order-model";
import { useReceipt } from "@/features/money/receipt-photos";
import { useAuth } from "@/features/auth/auth-context";
import { loadPurchases, loadPurchaseItems } from "./logistics-api";
import { fundingNames, type PurchaseRow } from "./purchase-model";
function Receipt({ path }: { path: string }) {
  const q = useReceipt(path);
  return q.error ? (
    <p role="alert" className="text-brand-strong">
      {q.error.message}
    </p>
  ) : q.isPending ? (
    <p role="status">Loading receipt…</p>
  ) : (
    <a href={q.data} target="_blank" rel="noopener noreferrer">
      <img
        className="w-full rounded-xl border"
        alt="Receipt photo"
        src={q.data}
      />
    </a>
  );
}
function Details({
  purchase: p,
  onClose,
}: {
  purchase: PurchaseRow;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const items = useQuery({
    queryKey: ["logistics", "purchase-items", p.id],
    queryFn: () => loadPurchaseItems(p.id),
  });
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={p.supplier}
      description={`${p.business_date} · ${p.category_name}`}
    >
      <div className="space-y-3">
        <p className="text-2xl font-bold">
          {formatMoney(p.amount, p.currency)}
        </p>
        <p className="text-sm">
          {fundingNames[p.funding]}
          {p.account_name ? ` · ${p.account_name}` : ""} · {p.staff_name}
        </p>
        <p className="text-sm text-muted">
          TRY value {formatMoney(p.amount_try, "TRY")} · recorded rate ₺
          {formatRate(p.rate_to_try)}
        </p>
        {p.is_reversed ? (
          <p className="rounded-xl bg-brand-soft p-3 text-brand-deep">
            Deleted (reversed). Original purchase and receipt are retained.
          </p>
        ) : null}
        {p.debt_id ? (
          <p className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">
            Supplier debt created · {formatMoney(p.amount, "TRY")}
            {p.due_date ? ` · due ${p.due_date}` : " · no due date"}
            <span className="mt-1 block break-all text-xs">
              Debt ID: {p.debt_id}
            </span>
          </p>
        ) : null}
        {items.error ? (
          <p role="alert" className="text-brand-strong">
            {items.error.message}
          </p>
        ) : items.isPending ? (
          <p role="status">Loading items…</p>
        ) : (
          items.data.map((i) => (
            <article key={i.id} className="space-y-1 rounded-xl border p-3">
              <p className="break-words font-semibold">{i.description}</p>
              <p className="text-sm text-muted">
                {i.quantity ?? "Quantity not recorded"} {i.unit} ·{" "}
                {formatMoney(i.amount, p.currency)}
              </p>
            </article>
          ))
        )}
        {p.note ? <p className="break-words text-sm">Note: {p.note}</p> : null}
        {profile?.role === "admin" && !p.is_reversed ? (
          <DeletePurchase purchase={p} onDeleted={onClose} />
        ) : null}
        {p.receipt_path ? (
          <Receipt path={p.receipt_path} />
        ) : (
          <p className="text-sm text-muted">No receipt photo attached.</p>
        )}
      </div>
    </Sheet>
  );
}
export default function PurchasesPage() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const id = params.get("purchase");
  const [showDeleted, setShowDeleted] = useState(false);
  const [selected, setSelected] = useState<PurchaseRow | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["logistics", "purchases"],
    initialPageParam: 0,
    refetchInterval: 15000,
    queryFn: ({ pageParam }) => loadPurchases(pageParam),
    getNextPageParam: (last, pages) =>
      last.length === 50 ? pages.length * 50 : undefined,
  });
  const single = useQuery({
    queryKey: ["logistics", "saved-purchase", id],
    enabled: !!id,
    queryFn: () => loadPurchases(0, id!),
  });
  const rows = query.data?.pages.flat() ?? [];
  const visibleRows = rows.filter((p) => showDeleted || !p.is_reversed);
  const current = id
    ? single.data?.[0]
    : selected
      ? (rows.find((p) => p.id === selected.id) ?? selected)
      : null;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold">
          {profile!.role === "admin" ? "Purchases" : "My purchases"}
        </h1>
        <Button asChild>
          <Link to="/purchases/new">Log supplies</Link>
        </Button>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={showDeleted}
          onChange={(e) => setShowDeleted(e.target.checked)}
        />
        Show deleted purchases
      </label>
      {id && single.error ? (
        <p role="alert" className="text-brand-strong">
          {single.error.message}
        </p>
      ) : id && single.data && !single.data.length ? (
        <p role="alert">Purchase is not available for your account.</p>
      ) : null}
      {query.error ? (
        <div role="alert">
          <p className="text-brand-strong">{query.error.message}</p>
          <Button
            variant="secondary"
            onClick={() => {
              void query.refetch();
            }}
          >
            Reload purchases
          </Button>
        </div>
      ) : query.isPending ? (
        <p role="status">Loading purchases…</p>
      ) : visibleRows.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {visibleRows.map((p) => (
            <button
              key={p.id}
              aria-label={`Open purchase ${p.supplier}`}
              className="space-y-2 rounded-xl border bg-card p-4 text-left"
              onClick={() => {
                setSelected(p);
                setParams({});
              }}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <strong className="break-words">{p.supplier}</strong>
                <strong>{formatMoney(p.amount, p.currency)}</strong>
              </div>
              <p className="text-sm text-muted">
                {p.category_name} · {p.business_date}
              </p>
              <p className="text-xs text-muted">
                {fundingNames[p.funding]} · {p.staff_name}
                {p.is_reversed ? " · Deleted (reversed)" : ""}
              </p>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border bg-card p-4 text-muted">
          No active purchases. Use Show deleted purchases to review removed
          records.
        </p>
      )}
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => {
            void query.fetchNextPage();
          }}
        >
          Load more purchases
        </Button>
      ) : null}
      {current ? (
        <Details
          purchase={current}
          onClose={() => {
            setSelected(null);
            setParams({});
          }}
        />
      ) : null}
    </section>
  );
}
