import { DailyOrderTotals } from "@/features/reports/DailyOrderTotals";
import { CustomerFields } from "@/features/costing/CustomerFields";
import { ProfitStrip } from "@/features/costing/ProfitStrip";
import { ProfitSummary } from "@/features/costing/ProfitSummary";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { extraText } from "./extra-model";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-context";
import { useMenu } from "@/features/menu/menu-api";
import { activeMenu, type Product } from "@/features/menu/menu-model";
import { usePhotoUrls, photoId } from "@/features/menu/menu-photos";
import { useOrder } from "./order-context";
import { useOrderReference } from "./order-api";
import { useOrderQuote } from "./order-hooks";
import {
  addDraftItem,
  channels,
  detailsSchema,
  orderTypes,
  type DraftItem,
} from "./order-model";
import { DetailsForm, ItemForm } from "./OrderForms";
import { OrderNotices } from "./OrderNotices";

type Selection = { product: Product; item?: DraftItem };
const date = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Europe/Nicosia",
});
export default function NewOrderPage() {
  const { profile } = useAuth();
  const order = useOrder(),
    menu = useMenu(),
    reference = useOrderReference(),
    quote = useOrderQuote();
  const [category, setCategory] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [details, setDetails] = useState(false);
  const [cart, setCart] = useState(false);
  const active = menu.data ? activeMenu(menu.data) : null;
  const products =
    active?.products.filter(
      (p) =>
        active.variants.some((v) => v.product_id === p.id) &&
        (!p.addon_id || active.extras.some((a) => a.id === p.addon_id)),
    ) ?? [];
  const photos = usePhotoUrls(products.map((p) => p.photo_path));
  const locked = !!order.attempt || order.saving;
  const count = order.draft.items.reduce((sum, item) => sum + item.quantity, 0);
  function choose(product: Product) {
    const variants = active!.variants.filter(
      (v) => v.product_id === product.id,
    );
    const extras = active!.links.some((l) => l.product_id === product.id);
    if (
      variants.length > 1 ||
      extras ||
      active!.categories.find((c) => c.id === product.category_id)?.name ===
        "Rice & Soup"
    )
      setSelection({ product });
    else
      order.update((d) => ({
        ...d,
        items: addDraftItem(d.items, {
          id: photoId(),
          product_id: product.id,
          variant_id: variants[0].id,
          quantity: 1,
          addon_ids: [],
          extras: [],
          note: "",
        }),
      }));
  }
  return (
    <section className="space-y-3 pb-44">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {reference.data
            ? `${date.format(new Date(reference.data.businessDate + "T12:00:00Z"))} · `
            : ""}
          {profile?.full_name}
        </p>
        <h1 className="mt-1 text-[26px] font-extrabold sm:text-[34px]">
          New order
        </h1>
      </div>
      <DailyOrderTotals />
      <OrderNotices />
      <div className="rounded-xl border bg-card p-3 space-y-2">
        <label htmlFor="order-date" className="block text-sm font-semibold">
          Order date
        </label>
        <Input
          id="order-date"
          type="date"
          disabled={locked || profile?.role !== "admin"}
          max={reference.data?.businessDate}
          value={order.draft.order_date || reference.data?.businessDate || ""}
          onChange={(e) =>
            order.update((d) => ({ ...d, order_date: e.target.value }))
          }
        />
        <p className="text-xs text-muted">
          Business date · 06:00–05:59. Admin can enter earlier orders. Earlier
          orders use today’s menu prices and recipe costs; review before saving.
        </p>
      </div>
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        role="group"
        aria-label="Order channel"
      >
        {channels.map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={locked}
            aria-pressed={order.draft.channel === value}
            onClick={() => order.update((d) => ({ ...d, channel: value }))}
            className={cn(
              "min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold disabled:opacity-50",
              order.draft.channel === value
                ? "border-ink bg-ink text-card"
                : "border-line-strong bg-card",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">
          {orderTypes.find(([v]) => v === order.draft.details.order_type)?.[1]}
          {order.draft.details.customer_name
            ? ` · ${order.draft.details.customer_name}`
            : ""}
        </p>
        <Button
          variant="secondary"
          size="secondary"
          className="text-sm"
          disabled={locked}
          onClick={() => setDetails(true)}
        >
          Order details
        </Button>
      </div>
      <CustomerFields disabled={locked} />
      {quote.data?.costing ? (
        <ProfitSummary
          profit={quote.data.costing}
          updating={quote.isFetching}
        />
      ) : null}
      <label className="sr-only" htmlFor="order-search">
        Search menu
      </label>
      <Input
        id="order-search"
        type="search"
        placeholder="Search menu"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {menu.isPending ? (
        <p role="status">Loading menu…</p>
      ) : menu.error ? (
        <div role="alert">
          <p className="mb-3 text-brand-strong">{menu.error.message}</p>
          <Button
            variant="secondary"
            onClick={() => {
              void menu.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            role="group"
            aria-label="Menu categories"
          >
            {[{ id: null, name: "All" }, ...active!.categories].map((c) => (
              <button
                key={c.id ?? "all"}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
                className={cn(
                  "min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold",
                  category === c.id
                    ? "border-brand bg-brand text-card"
                    : "border-line-strong bg-card",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
            {products
              .filter(
                (p) =>
                  (category === null || p.category_id === category) &&
                  p.name
                    .toLocaleLowerCase()
                    .includes(search.trim().toLocaleLowerCase()),
              )
              .map((product) => {
                const variants = active!.variants.filter(
                  (v) => v.product_id === product.id,
                );
                const quantity = order.draft.items
                  .filter((it) => it.product_id === product.id)
                  .reduce((sum, it) => sum + it.quantity, 0);
                const extras = active!.links.some(
                  (l) => l.product_id === product.id,
                );
                return (
                  <button
                    type="button"
                    key={product.id}
                    disabled={locked}
                    aria-label={`Add ${product.name}`}
                    onClick={() => choose(product)}
                    className={cn(
                      "flex min-h-[118px] flex-col gap-2 rounded-xl border bg-card p-3 text-left disabled:opacity-50",
                      quantity ? "border-2 border-brand" : "",
                    )}
                  >
                    {product.photo_path && photos.data?.[product.photo_path] ? (
                      <img
                        alt=""
                        loading="lazy"
                        src={photos.data[product.photo_path]}
                        className="h-20 w-full rounded-lg object-cover"
                      />
                    ) : null}
                    <span className="flex w-full items-start justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {
                          active!.categories.find(
                            (c) => c.id === product.category_id,
                          )?.name
                        }
                        {extras ? " · + extras" : ""}
                      </span>
                      {quantity ? (
                        <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-brand px-1 text-xs font-bold text-card">
                          {quantity}
                        </span>
                      ) : null}
                    </span>
                    <span className="break-words text-base font-semibold leading-tight">
                      {product.name}
                    </span>
                    <span className="mt-auto text-sm font-bold">
                      {formatMoney(variants[0].price, "TRY")}
                      {variants.length > 1 ? (
                        <span className="block text-xs font-normal text-muted">
                          Choose variant
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
          </div>
          {products.filter(
            (p) =>
              (category === null || p.category_id === category) &&
              p.name
                .toLocaleLowerCase()
                .includes(search.trim().toLocaleLowerCase()),
          ).length === 0 ? (
            <p className="rounded-xl border bg-card p-4 text-muted">
              No active items found.
            </p>
          ) : null}
        </>
      )}
      {reference.error ? (
        <p role="alert" className="text-sm text-brand-strong">
          {reference.error.message}
        </p>
      ) : null}
      {quote.error ? (
        <div role="alert" className="space-y-2 text-sm text-brand-strong">
          <p>{quote.error.message}</p>
          <Button
            variant="secondary"
            size="secondary"
            onClick={() => setCart(true)}
          >
            Review items
          </Button>
        </div>
      ) : null}
      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 border-t bg-card sm:bottom-0 sm:pb-[env(safe-area-inset-bottom)]">
        {quote.data?.costing ? (
          <ProfitStrip
            profit={quote.data.costing}
            updating={quote.isFetching}
          />
        ) : null}
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:px-6">
          <button
            className="min-h-12 min-w-0 flex-1 text-left"
            type="button"
            aria-label="Review cart"
            onClick={() => setCart(true)}
          >
            <span className="block text-xs text-muted">
              {count} items{quote.isFetching ? " · updating…" : ""}
            </span>
            <span className="text-xl font-bold">
              {count === 0
                ? formatMoney(0, "TRY")
                : quote.data
                  ? formatMoney(quote.data.total, "TRY")
                  : "—"}
            </span>
          </button>
          <Button
            variant="secondary"
            size="secondary"
            className="px-3 text-sm"
            disabled={locked || count === 0}
            onClick={order.clear}
          >
            Clear
          </Button>
          <Button asChild size="secondary" className="px-4 text-sm">
            <Link
              to="/order/pay"
              aria-disabled={count === 0}
              onClick={(e) => {
                if (
                  count === 0 ||
                  !detailsSchema.safeParse(order.draft.details).success
                )
                  e.preventDefault();
              }}
            >
              Review order
            </Link>
          </Button>
        </div>
      </div>
      <Sheet
        open={details}
        onOpenChange={setDetails}
        title="Order details"
        description="Choose delivery or pickup and add customer details."
      >
        <DetailsForm onSaved={() => setDetails(false)} />
      </Sheet>
      <Sheet
        open={!!selection}
        onOpenChange={(open) => {
          if (!open) setSelection(null);
        }}
        title={selection?.product.name ?? "Item"}
        description="Choose a variant, extras and quantity."
      >
        {selection && active ? (
          <ItemForm
            key={selection.item?.id ?? selection.product.id}
            product={selection.product}
            item={selection.item}
            variants={active.variants.filter(
              (v) => v.product_id === selection.product.id,
            )}
            extras={active.extras.filter((a) =>
              active.links.some(
                (l) =>
                  l.product_id === selection.product.id && l.addon_id === a.id,
              ),
            )}
            onSaved={(item) => {
              order.update((d) => ({
                ...d,
                items: selection.item
                  ? d.items.map((it) => (it.id === item.id ? item : it))
                  : addDraftItem(d.items, item),
              }));
              setSelection(null);
            }}
          />
        ) : null}
      </Sheet>
      <Sheet
        open={cart}
        onOpenChange={setCart}
        title="Order items"
        description="Change a quantity, choose extras or remove an unsaved item."
      >
        <div className="space-y-3">
          {order.draft.items.length === 0 ? (
            <p>Your cart is empty.</p>
          ) : (
            order.draft.items.map((item, index) => {
              const product = products.find((p) => p.id === item.product_id);
              const priced = quote.data?.items[index];
              return (
                <div
                  key={item.id}
                  className="space-y-2 rounded-xl border bg-card p-3"
                >
                  <p className="break-words font-semibold">
                    {item.quantity} ×{" "}
                    {product?.name ??
                      priced?.product_name ??
                      "Unavailable item"}
                  </p>
                  <p className="text-sm text-muted">
                    {priced?.variant_name}
                    {priced?.addons.length
                      ? ` · ${extraText(priced.addons, priced.quantity)}`
                      : ""}
                  </p>
                  {item.note ? (
                    <p className="text-sm text-muted">{item.note}</p>
                  ) : null}
                  {priced ? (
                    <p className="font-bold">
                      {formatMoney(priced.line_total, "TRY")}
                    </p>
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="secondary"
                      className="text-sm"
                      disabled={locked || !product}
                      onClick={() => {
                        if (product) {
                          setCart(false);
                          setSelection({ product, item });
                        }
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      size="secondary"
                      className="text-sm"
                      disabled={locked}
                      onClick={() =>
                        order.update((d) => ({
                          ...d,
                          items: d.items.filter((it) => it.id !== item.id),
                        }))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Sheet>
    </section>
  );
}
