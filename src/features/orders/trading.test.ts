import { describe, expect, it } from "vitest";
import {
  emptyDraft,
  orderTypes,
  savePayload,
  workspaceSchema,
} from "./order-model";
import { nextAction, statusGroup } from "./board-model";
describe("M16 simplified trading", () => {
  it("offers Delivery first and Pickup only", () => {
    expect(orderTypes.map(([value]) => value)).toEqual(["delivery", "pickup"]);
    expect(emptyDraft().details.order_type).toBe("delivery");
  });
  it("submits the selected date/account but leaves totals to the database", () => {
    const d = emptyDraft();
    d.details.delivery_address = "Famagusta";
    d.order_date = "2026-10-02";
    d.settlement_account = 7;
    d.settlement_amount = "12000";
    const p = savePayload(d, "prices", true, "costs");
    expect(p).toMatchObject({
      workflow: "simple",
      order_date: "2026-10-02",
      settlement_account: 7,
      settlement_amount: "12000",
      payments: [],
    });
    expect(p).not.toHaveProperty("total");
    expect(p).not.toHaveProperty("gross_profit");
  });
  it("restores legacy pending requests without changing their payload", () => {
    const draft = emptyDraft();
    const oldDraft: Record<string, unknown> = { ...draft };
    delete oldDraft.order_date;
    delete oldDraft.settlement_account;
    delete oldDraft.settlement_amount;
    const attempt = {
      payload: {
        client_request_id: draft.request_id,
        items: [],
        payments: [],
        quote_token: "old",
      },
      unpaid: true,
    };
    const restored = workspaceSchema.parse({
      draft: oldDraft,
      attempt,
      savedId: null,
    });
    expect(restored.attempt).toEqual(attempt);
    expect(restored.draft.settlement_account).toBeNull();
  });
  it("new orders advance straight to delivered and confirm payment", () => {
    for (const role of ["operations", "admin", "logistics"] as const) {
      expect(
        nextAction(
          { status: "new", order_type: "delivery", settlement: {} },
          role,
        ),
      ).toEqual({
        status: "completed",
        label: "Mark delivered · confirm payment",
      });
    }
    expect(
      nextAction(
        { status: "new", order_type: "pickup", settlement: {} },
        "logistics",
      ),
    ).toBeNull();
    expect(
      nextAction(
        { status: "completed", order_type: "delivery", settlement: {} },
        "operations",
      ),
    ).toBeNull();
  });
  it("groups older active states as accepted without rewriting history", () => {
    for (const status of ["new", "preparing", "ready", "picked_up"] as const)
      expect(statusGroup(status)).toBe("accepted");
    expect(statusGroup("cancelled")).toBe("cancelled");
    expect(statusGroup("completed")).toBe("completed");
  });
});
