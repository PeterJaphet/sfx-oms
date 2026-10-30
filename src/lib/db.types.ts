export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      costing_imports: {
        Row: {
          applied_at: string;
          applied_by: string;
          import_key: string;
          result: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          applied_at?: string;
          applied_by: string;
          import_key: string;
          result: NonNullable<Json>;
        };
        Update: {
          applied_at?: string;
          applied_by?: string;
          import_key?: string;
          result?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "costing_imports_applied_by_fkey";
            columns: ["applied_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_items: {
        Row: {
          default_unit: string;
          id: string;
          is_active: boolean;
          item_group: string;
          name: string;
          revision: number;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          default_unit?: string;
          id?: string;
          is_active?: boolean;
          item_group: string;
          name: string;
          revision?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          default_unit?: string;
          id?: string;
          is_active?: boolean;
          item_group?: string;
          name?: string;
          revision?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_items_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      historical_sales_records: {
        Row: {
          id: string;
          months: NonNullable<Json>;
          notes: string;
          payment_mix: NonNullable<Json>;
          source_name: string;
          source_year: number | null;
          title: string;
        };
        ComputedFields: never;
        Insert: {
          id: string;
          months: NonNullable<Json>;
          notes: string;
          payment_mix: NonNullable<Json>;
          source_name: string;
          source_year?: number | null;
          title: string;
        };
        Update: {
          id?: string;
          months?: NonNullable<Json>;
          notes?: string;
          payment_mix?: NonNullable<Json>;
          source_name?: string;
          source_year?: number | null;
          title?: string;
        };
        Relationships: [];
      };
      cost_plan: {
        Row: {
          id: boolean;
          inputs: NonNullable<Json>;
          revision: number;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          id?: boolean;
          inputs: NonNullable<Json>;
          revision?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: boolean;
          inputs?: NonNullable<Json>;
          revision?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cost_plan_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cost_recipes: {
        Row: {
          addon_id: string | null;
          id: string;
          inputs: NonNullable<Json>;
          name: string;
          revision: number;
          updated_at: string;
          updated_by: string | null;
          variant_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          addon_id?: string | null;
          id?: string;
          inputs: NonNullable<Json>;
          name: string;
          revision?: number;
          updated_at?: string;
          updated_by?: string | null;
          variant_id?: string | null;
        };
        Update: {
          addon_id?: string | null;
          id?: string;
          inputs?: NonNullable<Json>;
          name?: string;
          revision?: number;
          updated_at?: string;
          updated_by?: string | null;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cost_recipes_addon_id_fkey";
            columns: ["addon_id"];
            isOneToOne: true;
            referencedRelation: "addons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cost_recipes_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cost_recipes_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: true;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      costing_history: {
        Row: {
          changed_at: string;
          changed_by: string;
          entity: string;
          entity_id: string;
          id: number;
          snapshot: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          changed_at?: string;
          changed_by: string;
          entity: string;
          entity_id: string;
          id?: never;
          snapshot: NonNullable<Json>;
        };
        Update: {
          changed_at?: string;
          changed_by?: string;
          entity?: string;
          entity_id?: string;
          id?: never;
          snapshot?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "costing_history_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      order_cost_snapshots: {
        Row: {
          created_at: string;
          created_by: string;
          estimate: NonNullable<Json>;
          order_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by: string;
          estimate: NonNullable<Json>;
          order_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          estimate?: NonNullable<Json>;
          order_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_cost_snapshots_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_cost_snapshots_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_cost_snapshots_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "v_order_payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_cost_snapshots_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "v_report_deliveries";
            referencedColumns: ["id"];
          },
        ];
      };

      account_openings: {
        Row: {
          account_id: number;
          amount: number;
          business_date: string;
          created_at: string;
          created_by: string;
          ledger_entry_id: number | null;
          rate_to_try: number | null;
          reason: string;
        };
        Insert: {
          account_id: number;
          amount: number;
          business_date?: string;
          created_at?: string;
          created_by: string;
          ledger_entry_id?: number | null;
          rate_to_try?: number | null;
          reason: string;
        };
        Update: {
          account_id?: number;
          amount?: number;
          business_date?: string;
          created_at?: string;
          created_by?: string;
          ledger_entry_id?: number | null;
          rate_to_try?: number | null;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: "account_openings_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: true;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_openings_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: true;
            referencedRelation: "v_account_balances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_openings_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_openings_ledger_entry_id_fkey";
            columns: ["ledger_entry_id"];
            isOneToOne: true;
            referencedRelation: "ledger_entries";
            referencedColumns: ["id"];
          },
        ];
      };
      account_transfers: {
        Row: {
          created_at: string;
          created_by: string;
          from_account: number;
          id: string;
          note: string | null;
          to_account: number;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          from_account: number;
          id?: string;
          note?: string | null;
          to_account: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          from_account?: number;
          id?: string;
          note?: string | null;
          to_account?: number;
        };
        Relationships: [
          {
            foreignKeyName: "account_transfers_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_transfers_from_account_fkey";
            columns: ["from_account"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_transfers_from_account_fkey";
            columns: ["from_account"];
            isOneToOne: false;
            referencedRelation: "v_account_balances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_transfers_to_account_fkey";
            columns: ["to_account"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_transfers_to_account_fkey";
            columns: ["to_account"];
            isOneToOne: false;
            referencedRelation: "v_account_balances";
            referencedColumns: ["id"];
          },
        ];
      };
      accounts: {
        Row: {
          currency: string;
          id: number;
          is_active: boolean;
          is_cash: boolean;
          name: string;
          sort_order: number;
        };
        Insert: {
          currency: string;
          id?: never;
          is_active?: boolean;
          is_cash?: boolean;
          name: string;
          sort_order?: number;
        };
        Update: {
          currency?: string;
          id?: never;
          is_active?: boolean;
          is_cash?: boolean;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      activity_log: {
        Row: {
          action: string;
          actor_id: string | null;
          at: string;
          details: Json | null;
          entity: string;
          entity_id: string | null;
          id: number;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          at?: string;
          details?: Json | null;
          entity: string;
          entity_id?: string | null;
          id?: never;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          at?: string;
          details?: Json | null;
          entity?: string;
          entity_id?: string | null;
          id?: never;
        };
        Relationships: [];
      };
      addons: {
        Row: {
          id: string;
          is_active: boolean;
          name: string;
          price: number;
        };
        Insert: {
          id?: string;
          is_active?: boolean;
          name: string;
          price: number;
        };
        Update: {
          id?: string;
          is_active?: boolean;
          name?: string;
          price?: number;
        };
        Relationships: [];
      };
      day_closes: {
        Row: {
          account_id: number;
          business_date: string;
          closed_at: string;
          closed_by: string;
          counted_amount: number;
          details: Json | null;
          difference: number | null;
          expected_amount: number;
          id: number;
          note: string | null;
          open_advances: number;
          superseded: boolean;
          unpaid_orders: number;
        };
        Insert: {
          account_id: number;
          business_date: string;
          closed_at?: string;
          closed_by: string;
          counted_amount: number;
          details?: Json | null;
          difference?: number | null;
          expected_amount: number;
          id?: never;
          note?: string | null;
          open_advances: number;
          superseded?: boolean;
          unpaid_orders: number;
        };
        Update: {
          account_id?: number;
          business_date?: string;
          closed_at?: string;
          closed_by?: string;
          counted_amount?: number;
          details?: Json | null;
          difference?: number | null;
          expected_amount?: number;
          id?: never;
          note?: string | null;
          open_advances?: number;
          superseded?: boolean;
          unpaid_orders?: number;
        };
        Relationships: [
          {
            foreignKeyName: "day_closes_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "day_closes_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "v_account_balances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "day_closes_closed_by_fkey";
            columns: ["closed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      debt_settlements: {
        Row: {
          covers: number;
          debt_id: string;
          id: number;
          ledger_entry_id: number;
        };
        Insert: {
          covers: number;
          debt_id: string;
          id?: never;
          ledger_entry_id: number;
        };
        Update: {
          covers?: number;
          debt_id?: string;
          id?: never;
          ledger_entry_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "debt_settlements_debt_id_fkey";
            columns: ["debt_id"];
            isOneToOne: false;
            referencedRelation: "debts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "debt_settlements_debt_id_fkey";
            columns: ["debt_id"];
            isOneToOne: false;
            referencedRelation: "v_debts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "debt_settlements_ledger_entry_id_fkey";
            columns: ["ledger_entry_id"];
            isOneToOne: true;
            referencedRelation: "ledger_entries";
            referencedColumns: ["id"];
          },
        ];
      };
      debts: {
        Row: {
          amount: number;
          business_date: string;
          cancel_reason: string | null;
          counterparty: string;
          created_at: string;
          created_by: string;
          currency: string;
          description: string;
          direction: Database["public"]["Enums"]["debt_direction"];
          due_date: string | null;
          id: string;
          is_cancelled: boolean;
          is_opening: boolean;
          source: string;
        };
        Insert: {
          amount: number;
          business_date?: string;
          cancel_reason?: string | null;
          counterparty: string;
          created_at?: string;
          created_by: string;
          currency: string;
          description: string;
          direction: Database["public"]["Enums"]["debt_direction"];
          due_date?: string | null;
          id?: string;
          is_cancelled?: boolean;
          is_opening?: boolean;
          source?: string;
        };
        Update: {
          amount?: number;
          business_date?: string;
          cancel_reason?: string | null;
          counterparty?: string;
          created_at?: string;
          created_by?: string;
          currency?: string;
          description?: string;
          direction?: Database["public"]["Enums"]["debt_direction"];
          due_date?: string | null;
          id?: string;
          is_cancelled?: boolean;
          is_opening?: boolean;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "debts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_categories: {
        Row: {
          id: number;
          is_active: boolean;
          kind: Database["public"]["Enums"]["expense_kind"];
          name: string;
          sort_order: number;
        };
        Insert: {
          id?: never;
          is_active?: boolean;
          kind: Database["public"]["Enums"]["expense_kind"];
          name: string;
          sort_order?: number;
        };
        Update: {
          id?: never;
          is_active?: boolean;
          kind?: Database["public"]["Enums"]["expense_kind"];
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      fx_rates: {
        Row: {
          created_at: string;
          currency: string;
          effective_date: string;
          id: number;
          rate_to_try: number;
          set_by: string | null;
        };
        Insert: {
          created_at?: string;
          currency: string;
          effective_date?: string;
          id?: never;
          rate_to_try: number;
          set_by?: string | null;
        };
        Update: {
          created_at?: string;
          currency?: string;
          effective_date?: string;
          id?: never;
          rate_to_try?: number;
          set_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fx_rates_set_by_fkey";
            columns: ["set_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ledger_entries: {
        Row: {
          account_id: number;
          amount: number;
          amount_try: number;
          business_date: string;
          created_at: string;
          created_by: string;
          debt_id: string | null;
          entry_type: Database["public"]["Enums"]["entry_type"];
          id: number;
          note: string | null;
          order_id: string | null;
          purchase_id: string | null;
          rate_to_try: number;
          reverses_id: number | null;
          transfer_id: string | null;
          withdrawal_id: string | null;
        };
        Insert: {
          account_id: number;
          amount: number;
          amount_try: number;
          business_date?: string;
          created_at?: string;
          created_by: string;
          debt_id?: string | null;
          entry_type: Database["public"]["Enums"]["entry_type"];
          id?: never;
          note?: string | null;
          order_id?: string | null;
          purchase_id?: string | null;
          rate_to_try: number;
          reverses_id?: number | null;
          transfer_id?: string | null;
          withdrawal_id?: string | null;
        };
        Update: {
          account_id?: number;
          amount?: number;
          amount_try?: number;
          business_date?: string;
          created_at?: string;
          created_by?: string;
          debt_id?: string | null;
          entry_type?: Database["public"]["Enums"]["entry_type"];
          id?: never;
          note?: string | null;
          order_id?: string | null;
          purchase_id?: string | null;
          rate_to_try?: number;
          reverses_id?: number | null;
          transfer_id?: string | null;
          withdrawal_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "v_account_balances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_debt_id_fkey";
            columns: ["debt_id"];
            isOneToOne: false;
            referencedRelation: "debts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_debt_id_fkey";
            columns: ["debt_id"];
            isOneToOne: false;
            referencedRelation: "v_debts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "v_order_payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "v_report_deliveries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_purchase_id_fkey";
            columns: ["purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_reverses_id_fkey";
            columns: ["reverses_id"];
            isOneToOne: false;
            referencedRelation: "ledger_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_transfer_id_fkey";
            columns: ["transfer_id"];
            isOneToOne: false;
            referencedRelation: "account_transfers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_withdrawal_id_fkey";
            columns: ["withdrawal_id"];
            isOneToOne: false;
            referencedRelation: "v_advances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_withdrawal_id_fkey";
            columns: ["withdrawal_id"];
            isOneToOne: false;
            referencedRelation: "withdrawals";
            referencedColumns: ["id"];
          },
        ];
      };
      money_requests: {
        Row: {
          action: string;
          actor_id: string;
          created_at: string;
          request_hash: string;
          request_id: string;
          result: Json;
        };
        Insert: {
          action: string;
          actor_id: string;
          created_at?: string;
          request_hash: string;
          request_id: string;
          result: Json;
        };
        Update: {
          action?: string;
          actor_id?: string;
          created_at?: string;
          request_hash?: string;
          request_id?: string;
          result?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "money_requests_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          addons: Json;
          category_name: string;
          charged_total: number | null;
          extras_priced_separately: boolean;
          extras_total: number;
          id: string;
          line_total: number | null;
          note: string | null;
          order_id: string;
          product_id: string;
          product_name: string;
          quantity: number;
          catalogue_unit_price: number | null;
          price_override_reason: string | null;
          unit_price: number;
          variant_id: string;
          variant_name: string;
        };
        Insert: {
          addons?: Json;
          category_name: string;
          charged_total?: number | null;
          extras_priced_separately?: boolean;
          extras_total?: number;
          id?: string;
          line_total?: number | null;
          note?: string | null;
          order_id: string;
          product_id: string;
          product_name: string;
          quantity: number;
          catalogue_unit_price?: number | null;
          price_override_reason?: string | null;
          unit_price: number;
          variant_id: string;
          variant_name: string;
        };
        Update: {
          addons?: Json;
          category_name?: string;
          charged_total?: number | null;
          extras_priced_separately?: boolean;
          extras_total?: number;
          id?: string;
          line_total?: number | null;
          note?: string | null;
          order_id?: string;
          product_id?: string;
          product_name?: string;
          quantity?: number;
          catalogue_unit_price?: number | null;
          price_override_reason?: string | null;
          unit_price?: number;
          variant_id?: string;
          variant_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "v_order_payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "v_report_deliveries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      order_payment_requests: {
        Row: {
          actor_id: string;
          created_at: string;
          ledger_entry_id: number;
          request_hash: string;
          request_id: string;
        };
        Insert: {
          actor_id: string;
          created_at?: string;
          ledger_entry_id: number;
          request_hash: string;
          request_id: string;
        };
        Update: {
          actor_id?: string;
          created_at?: string;
          ledger_entry_id?: number;
          request_hash?: string;
          request_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_payment_requests_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_payment_requests_ledger_entry_id_fkey";
            columns: ["ledger_entry_id"];
            isOneToOne: false;
            referencedRelation: "ledger_entries";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          business_date: string;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          channel: Database["public"]["Enums"]["order_channel"];
          client_request_hash: string | null;
          client_request_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          customer_name: string | null;
          customer_phone: string | null;
          daily_number: number;
          delivery_address: string | null;
          discount_amount: number;
          discount_reason: string | null;
          id: string;
          note: string | null;
          order_type: Database["public"]["Enums"]["order_type"];
          picked_up_at: string | null;
          picked_up_by: string | null;
          preparing_at: string | null;
          ready_at: string | null;
          status: Database["public"]["Enums"]["order_status"];
          settlement: Json | null;
          subtotal: number;
          total: number;
        };
        Insert: {
          business_date?: string;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          channel: Database["public"]["Enums"]["order_channel"];
          client_request_hash?: string | null;
          client_request_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by: string;
          customer_name?: string | null;
          customer_phone?: string | null;
          daily_number: number;
          delivery_address?: string | null;
          discount_amount?: number;
          discount_reason?: string | null;
          id?: string;
          note?: string | null;
          order_type?: Database["public"]["Enums"]["order_type"];
          picked_up_at?: string | null;
          picked_up_by?: string | null;
          preparing_at?: string | null;
          ready_at?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          settlement?: Json | null;
          subtotal?: number;
          total?: number;
        };
        Update: {
          business_date?: string;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          channel?: Database["public"]["Enums"]["order_channel"];
          client_request_hash?: string | null;
          client_request_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          customer_name?: string | null;
          customer_phone?: string | null;
          daily_number?: number;
          delivery_address?: string | null;
          discount_amount?: number;
          discount_reason?: string | null;
          id?: string;
          note?: string | null;
          order_type?: Database["public"]["Enums"]["order_type"];
          picked_up_at?: string | null;
          picked_up_by?: string | null;
          preparing_at?: string | null;
          ready_at?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          settlement?: Json | null;
          subtotal?: number;
          total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "orders_cancelled_by_fkey";
            columns: ["cancelled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_picked_up_by_fkey";
            columns: ["picked_up_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      price_history: {
        Row: {
          addon_id: string | null;
          changed_at: string;
          changed_by: string | null;
          id: number;
          new_price: number;
          old_price: number | null;
          variant_id: string | null;
        };
        Insert: {
          addon_id?: string | null;
          changed_at?: string;
          changed_by?: string | null;
          id?: never;
          new_price: number;
          old_price?: number | null;
          variant_id?: string | null;
        };
        Update: {
          addon_id?: string | null;
          changed_at?: string;
          changed_by?: string | null;
          id?: never;
          new_price?: number;
          old_price?: number | null;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "price_history_addon_id_fkey";
            columns: ["addon_id"];
            isOneToOne: false;
            referencedRelation: "addons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_history_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_history_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      product_addons: {
        Row: {
          addon_id: string;
          is_active: boolean;
          product_id: string;
        };
        Insert: {
          addon_id: string;
          is_active?: boolean;
          product_id: string;
        };
        Update: {
          addon_id?: string;
          is_active?: boolean;
          product_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_addons_addon_id_fkey";
            columns: ["addon_id"];
            isOneToOne: false;
            referencedRelation: "addons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_addons_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_categories: {
        Row: {
          id: number;
          is_active: boolean;
          name: string;
          sort_order: number;
        };
        Insert: {
          id?: never;
          is_active?: boolean;
          name: string;
          sort_order?: number;
        };
        Update: {
          id?: never;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      product_variants: {
        Row: {
          id: string;
          is_active: boolean;
          name: string;
          price: number;
          product_id: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          is_active?: boolean;
          name?: string;
          price: number;
          product_id: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          is_active?: boolean;
          name?: string;
          price?: number;
          product_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          addon_id: string | null;
          category_id: number;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          photo_path: string | null;
        };
        Insert: {
          addon_id?: string | null;
          category_id: number;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          photo_path?: string | null;
        };
        Update: {
          addon_id?: string | null;
          category_id?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          photo_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_addon_id_fkey";
            columns: ["addon_id"];
            isOneToOne: true;
            referencedRelation: "addons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "product_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          is_active: boolean;
          phone: string | null;
          role: Database["public"]["Enums"]["user_role"];
        };
        Insert: {
          created_at?: string;
          full_name: string;
          id: string;
          is_active?: boolean;
          phone?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          phone?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
        };
        Relationships: [];
      };
      purchase_items: {
        Row: {
          amount: number;
          description: string;
          id: number;
          inventory_group_snapshot: string | null;
          inventory_item_id: string | null;
          purchase_id: string;
          quantity: number | null;
          unit: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          description: string;
          id?: never;
          inventory_group_snapshot?: string | null;
          inventory_item_id?: string | null;
          purchase_id: string;
          quantity?: number | null;
          unit?: string | null;
        };
        Update: {
          amount?: number;
          description?: string;
          id?: never;
          inventory_group_snapshot?: string | null;
          inventory_item_id?: string | null;
          purchase_id?: string;
          quantity?: number | null;
          unit?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_items_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey";
            columns: ["purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["id"];
          },
        ];
      };
      purchases: {
        Row: {
          account_id: number | null;
          advance_id: string | null;
          amount: number;
          amount_try: number;
          business_date: string;
          category_id: number;
          debt_id: string | null;
          id: string;
          is_reversed: boolean;
          logged_at: string;
          logged_by: string;
          note: string | null;
          rate_to_try: number;
          receipt_path: string | null;
          supplier: string;
        };
        Insert: {
          account_id?: number | null;
          advance_id?: string | null;
          amount: number;
          amount_try: number;
          business_date?: string;
          category_id: number;
          debt_id?: string | null;
          id?: string;
          is_reversed?: boolean;
          logged_at?: string;
          logged_by: string;
          note?: string | null;
          rate_to_try: number;
          receipt_path?: string | null;
          supplier: string;
        };
        Update: {
          account_id?: number | null;
          advance_id?: string | null;
          amount?: number;
          amount_try?: number;
          business_date?: string;
          category_id?: number;
          debt_id?: string | null;
          id?: string;
          is_reversed?: boolean;
          logged_at?: string;
          logged_by?: string;
          note?: string | null;
          rate_to_try?: number;
          receipt_path?: string | null;
          supplier?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchases_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "v_account_balances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_advance_id_fkey";
            columns: ["advance_id"];
            isOneToOne: false;
            referencedRelation: "v_advances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_advance_id_fkey";
            columns: ["advance_id"];
            isOneToOne: false;
            referencedRelation: "withdrawals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "expense_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_debt_id_fkey";
            columns: ["debt_id"];
            isOneToOne: false;
            referencedRelation: "debts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_debt_id_fkey";
            columns: ["debt_id"];
            isOneToOne: false;
            referencedRelation: "v_debts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_logged_by_fkey";
            columns: ["logged_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      settings: {
        Row: {
          advance_max_age_days: number;
          id: boolean;
          updated_at: string;
          withdrawal_approval_limit_try: number | null;
        };
        Insert: {
          advance_max_age_days?: number;
          id?: boolean;
          updated_at?: string;
          withdrawal_approval_limit_try?: number | null;
        };
        Update: {
          advance_max_age_days?: number;
          id?: boolean;
          updated_at?: string;
          withdrawal_approval_limit_try?: number | null;
        };
        Relationships: [];
      };
      withdrawals: {
        Row: {
          account_id: number;
          amount: number;
          amount_try: number;
          business_date: string;
          category_id: number | null;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          id: string;
          kind: Database["public"]["Enums"]["withdrawal_kind"];
          purpose: string;
          rate_to_try: number;
          receipt_path: string | null;
          recipient_id: string | null;
          requested_at: string;
          requested_by: string;
          status: Database["public"]["Enums"]["withdrawal_status"];
        };
        Insert: {
          account_id: number;
          amount: number;
          amount_try: number;
          business_date?: string;
          category_id?: number | null;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["withdrawal_kind"];
          purpose: string;
          rate_to_try: number;
          receipt_path?: string | null;
          recipient_id?: string | null;
          requested_at?: string;
          requested_by: string;
          status: Database["public"]["Enums"]["withdrawal_status"];
        };
        Update: {
          account_id?: number;
          amount?: number;
          amount_try?: number;
          business_date?: string;
          category_id?: number | null;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["withdrawal_kind"];
          purpose?: string;
          rate_to_try?: number;
          receipt_path?: string | null;
          recipient_id?: string | null;
          requested_at?: string;
          requested_by?: string;
          status?: Database["public"]["Enums"]["withdrawal_status"];
        };
        Relationships: [
          {
            foreignKeyName: "withdrawals_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "withdrawals_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "v_account_balances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "withdrawals_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "expense_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "withdrawals_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "withdrawals_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "withdrawals_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      v_purchase_item_expenses: {
        Row: {
          amount: number | null;
          amount_try: number | null;
          business_date: string | null;
          description: string | null;
          id: number | null;
          inventory_group_snapshot: string | null;
          inventory_item_id: string | null;
          logged_by: string | null;
          purchase_id: string | null;
          quantity: number | null;
          supplier: string | null;
          unit: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "purchase_items_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey";
            columns: ["purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_logged_by_fkey";
            columns: ["logged_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      v_account_balances: {
        Row: {
          balance: number | null;
          balance_try_estimate: number | null;
          currency: string | null;
          id: number | null;
          is_cash: boolean | null;
          name: string | null;
          sort_order: number | null;
        };
        Relationships: [];
      };
      v_advances: {
        Row: {
          account_id: number | null;
          age_days: number | null;
          amount: number | null;
          business_date: string | null;
          change_returned: number | null;
          id: string | null;
          purpose: string | null;
          rate_to_try: number | null;
          recipient_id: string | null;
          recipient_name: string | null;
          reimbursed: number | null;
          remaining: number | null;
          spent: number | null;
          state: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "withdrawals_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "withdrawals_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "v_account_balances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "withdrawals_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      v_debts: {
        Row: {
          amount: number | null;
          business_date: string | null;
          counterparty: string | null;
          created_at: string | null;
          currency: string | null;
          description: string | null;
          direction: Database["public"]["Enums"]["debt_direction"] | null;
          due_date: string | null;
          id: string | null;
          is_opening: boolean | null;
          is_overdue: boolean | null;
          outstanding: number | null;
          outstanding_try_estimate: number | null;
          settled: number | null;
          source: string | null;
          state: string | null;
        };
        Relationships: [];
      };
      v_expenses: {
        Row: {
          amount_try: number | null;
          business_date: string | null;
          category: string | null;
          description: string | null;
          id: string | null;
          kind: Database["public"]["Enums"]["expense_kind"] | null;
          source: string | null;
          staff_id: string | null;
        };
        Relationships: [];
      };
      v_extras_sold_daily: {
        Row: {
          business_date: string | null;
          extra_name: string | null;
          on_plate: number | null;
          quantity: number | null;
          revenue: number | null;
          standalone: number | null;
        };
        Relationships: [];
      };
      v_items_sold_daily: {
        Row: {
          business_date: string | null;
          category_name: string | null;
          product_id: string | null;
          product_name: string | null;
          quantity: number | null;
          revenue: number | null;
          variant_name: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      v_order_payments: {
        Row: {
          balance_due: number | null;
          business_date: string | null;
          daily_number: number | null;
          id: string | null;
          paid_try: number | null;
          paid_via: string | null;
          status: Database["public"]["Enums"]["order_status"] | null;
          total: number | null;
        };
        Relationships: [];
      };
      v_payments_daily: {
        Row: {
          account: string | null;
          amount: number | null;
          amount_try: number | null;
          business_date: string | null;
          channel: Database["public"]["Enums"]["order_channel"] | null;
          currency: string | null;
        };
        Relationships: [];
      };
      v_pnl_daily: {
        Row: {
          business_date: string | null;
          cost_of_goods: number | null;
          fixed_overheads: number | null;
          net_revenue: number | null;
          operational_expenses: number | null;
        };
        Relationships: [];
      };
      v_pnl_weekly: {
        Row: {
          cost_of_goods: number | null;
          fixed_overheads: number | null;
          gross_profit: number | null;
          net_profit: number | null;
          net_revenue: number | null;
          operational_expenses: number | null;
          week_start: string | null;
        };
        Relationships: [];
      };
      v_report_account_days: {
        Row: {
          account_id: number | null;
          business_date: string | null;
          money_in: number | null;
          money_out: number | null;
          movement: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "v_account_balances";
            referencedColumns: ["id"];
          },
        ];
      };
      v_report_deliveries: {
        Row: {
          business_date: string | null;
          completed_at: string | null;
          daily_number: number | null;
          delivery_minutes: number | null;
          id: string | null;
          picked_up_at: string | null;
          picked_up_by: string | null;
          ready_at: string | null;
          staff: string | null;
          status: Database["public"]["Enums"]["order_status"] | null;
          waiting_minutes: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_picked_up_by_fkey";
            columns: ["picked_up_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      v_report_order_dimensions: {
        Row: {
          business_date: string | null;
          channel: Database["public"]["Enums"]["order_channel"] | null;
          discounts: number | null;
          gross_sales: number | null;
          hour: number | null;
          net_revenue: number | null;
          order_type: Database["public"]["Enums"]["order_type"] | null;
          orders: number | null;
          weekday: number | null;
        };
        Relationships: [];
      };
      v_sales_daily: {
        Row: {
          business_date: string | null;
          cancelled_orders: number | null;
          discounts: number | null;
          gross_sales: number | null;
          net_sales: number | null;
          orders: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      october_costing_update: {
        Args: { p_apply?: boolean; p_new_price?: number; p_token?: string };
        Returns: Json;
      };
      list_inventory_items: { Args: Record<PropertyKey, never>; Returns: Json };
      review_financial_calculations: {
        Args: { p_from: string; p_to: string };
        Returns: Json;
      };
      inventory_expense_report: {
        Args: { p_from: string; p_to: string };
        Returns: Json;
      };
      save_inventory_item: { Args: { p: Json }; Returns: Json };
      quote_foreign_order_amount: {
        Args: { p_order: Json; p_account: number };
        Returns: Json;
      };

      quote_marked_up_rate: {
        Args: { p_currency: string; p_source_rate: number; p_direction: string };
        Returns: Json;
      };

      order_profit_report: {
        Args: { p_from: string; p_to: string };
        Returns: Json;
      };
      extra_sales_audit: {
        Args: { p_from: string; p_name?: string; p_to: string };
        Returns: Json;
      };
      prepare_sfx_try_account: { Args: { p_apply?: boolean }; Returns: Json };
      get_workspace_dashboard: {
        Args: { p_from: string; p_to: string };
        Returns: Json;
      };
      create_trading_order: {
        Args: { p_order: Json };
        Returns: {
          business_date: string;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          channel: Database["public"]["Enums"]["order_channel"];
          client_request_hash: string | null;
          client_request_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          customer_name: string | null;
          customer_phone: string | null;
          daily_number: number;
          delivery_address: string | null;
          discount_amount: number;
          discount_reason: string | null;
          id: string;
          note: string | null;
          order_type: Database["public"]["Enums"]["order_type"];
          picked_up_at: string | null;
          picked_up_by: string | null;
          preparing_at: string | null;
          ready_at: string | null;
          settlement: Json | null;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
        };
        SetofOptions: {
          from: "*";
          to: "orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      deliver_trading_order: {
        Args: { p_order: string };
        Returns: {
          business_date: string;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          channel: Database["public"]["Enums"]["order_channel"];
          client_request_hash: string | null;
          client_request_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          customer_name: string | null;
          customer_phone: string | null;
          daily_number: number;
          delivery_address: string | null;
          discount_amount: number;
          discount_reason: string | null;
          id: string;
          note: string | null;
          order_type: Database["public"]["Enums"]["order_type"];
          picked_up_at: string | null;
          picked_up_by: string | null;
          preparing_at: string | null;
          ready_at: string | null;
          settlement: Json | null;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
        };
        SetofOptions: {
          from: "*";
          to: "orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      daily_order_profit: { Args: Record<PropertyKey, never>; Returns: Json };
      apply_cost_price: {
        Args: { p_price: number; p_recipe: string; p_revision: number };
        Returns: undefined;
      };
      costing_lines: { Args: { p: Json }; Returns: number };
      costing_number: {
        Args: {
          p: Json;
          p_max?: number;
          p_min?: number;
          p_name: string;
          p_scale?: number;
        };
        Returns: number;
      };
      costing_order_math: { Args: { q: Json }; Returns: Json };
      costing_plan_math: { Args: { p: Json }; Returns: Json };
      costing_recipe_math: { Args: { p: Json }; Returns: Json };
      create_costed_order: {
        Args: { p_order: Json };
        Returns: {
          business_date: string;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          channel: Database["public"]["Enums"]["order_channel"];
          client_request_hash: string | null;
          client_request_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          customer_name: string | null;
          customer_phone: string | null;
          daily_number: number;
          delivery_address: string | null;
          discount_amount: number;
          discount_reason: string | null;
          id: string;
          note: string | null;
          order_type: Database["public"]["Enums"]["order_type"];
          picked_up_at: string | null;
          picked_up_by: string | null;
          preparing_at: string | null;
          ready_at: string | null;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
        };
        SetofOptions: {
          from: "*";
          to: "orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      get_costing: { Args: { p_from?: string; p_to?: string }; Returns: Json };
      get_order_cost: { Args: { p_order: string }; Returns: Json };
      load_costing_workbook: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      preview_cost_plan: { Args: { p: Json }; Returns: Json };
      preview_cost_recipe: { Args: { p: Json }; Returns: Json };
      quote_costed_order: { Args: { p_order: Json }; Returns: Json };
      save_cost_plan: {
        Args: { p: Json; p_revision: number };
        Returns: undefined;
      };
      save_cost_recipe: { Args: { p: Json }; Returns: string };

      account_balance: { Args: { p_account: number }; Returns: number };
      add_order_payment:
        | {
            Args: {
              p_account: number;
              p_amount?: number;
              p_amount_try: number;
              p_order: string;
            };
            Returns: number;
          }
        | {
            Args: {
              p_account: number;
              p_amount: number;
              p_amount_try: number;
              p_order: string;
              p_request_id: string;
            };
            Returns: number;
          };
      adjust_balance: {
        Args: {
          p_account: number;
          p_amount: number;
          p_opening?: boolean;
          p_rate?: number;
          p_reason: string;
        };
        Returns: number;
      };
      app_role: {
        Args: never;
        Returns: Database["public"]["Enums"]["user_role"];
      };
      audit_staff_pin_reset: {
        Args: { p_actor: string; p_session: string; p_target: string };
        Returns: undefined;
      };
      business_date: { Args: { ts?: string }; Returns: string };
      cancel_debt: {
        Args: { p_debt: string; p_reason: string };
        Returns: undefined;
      };
      cancel_order: {
        Args: { p_order: string; p_reason: string };
        Returns: {
          business_date: string;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          channel: Database["public"]["Enums"]["order_channel"];
          client_request_hash: string | null;
          client_request_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          customer_name: string | null;
          customer_phone: string | null;
          daily_number: number;
          delivery_address: string | null;
          discount_amount: number;
          discount_reason: string | null;
          id: string;
          note: string | null;
          order_type: Database["public"]["Enums"]["order_type"];
          picked_up_at: string | null;
          picked_up_by: string | null;
          preparing_at: string | null;
          ready_at: string | null;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
        };
        SetofOptions: {
          from: "*";
          to: "orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      close_day: {
        Args: {
          p_account?: number;
          p_counted: number;
          p_date?: string;
          p_note?: string;
        };
        Returns: {
          account_id: number;
          business_date: string;
          closed_at: string;
          closed_by: string;
          counted_amount: number;
          details: Json | null;
          difference: number | null;
          expected_amount: number;
          id: number;
          note: string | null;
          open_advances: number;
          superseded: boolean;
          unpaid_orders: number;
        };
        SetofOptions: {
          from: "*";
          to: "day_closes";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_order: {
        Args: { p_order: Json };
        Returns: {
          business_date: string;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          channel: Database["public"]["Enums"]["order_channel"];
          client_request_hash: string | null;
          client_request_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          customer_name: string | null;
          customer_phone: string | null;
          daily_number: number;
          delivery_address: string | null;
          discount_amount: number;
          discount_reason: string | null;
          id: string;
          note: string | null;
          order_type: Database["public"]["Enums"]["order_type"];
          picked_up_at: string | null;
          picked_up_by: string | null;
          preparing_at: string | null;
          ready_at: string | null;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
        };
        SetofOptions: {
          from: "*";
          to: "orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_withdrawal: {
        Args: {
          p_account: number;
          p_amount: number;
          p_category?: number;
          p_kind: Database["public"]["Enums"]["withdrawal_kind"];
          p_purpose: string;
          p_rate?: number;
          p_receipt_path?: string;
          p_recipient?: string;
        };
        Returns: {
          account_id: number;
          amount: number;
          amount_try: number;
          business_date: string;
          category_id: number | null;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          id: string;
          kind: Database["public"]["Enums"]["withdrawal_kind"];
          purpose: string;
          rate_to_try: number;
          receipt_path: string | null;
          recipient_id: string | null;
          requested_at: string;
          requested_by: string;
          status: Database["public"]["Enums"]["withdrawal_status"];
        };
        SetofOptions: {
          from: "*";
          to: "withdrawals";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      debt_summary: { Args: never; Returns: Json };
      decide_withdrawal: {
        Args: { p_approve: boolean; p_note?: string; p_withdrawal: string };
        Returns: {
          account_id: number;
          amount: number;
          amount_try: number;
          business_date: string;
          category_id: number | null;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          id: string;
          kind: Database["public"]["Enums"]["withdrawal_kind"];
          purpose: string;
          rate_to_try: number;
          receipt_path: string | null;
          recipient_id: string | null;
          requested_at: string;
          requested_by: string;
          status: Database["public"]["Enums"]["withdrawal_status"];
        };
        SetofOptions: {
          from: "*";
          to: "withdrawals";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      expected_cash: {
        Args: { p_account: number; p_date: string };
        Returns: number;
      };
      financial_day_state: { Args: never; Returns: Json };
      get_close_context: {
        Args: { p_account?: number; p_date?: string };
        Returns: Json;
      };
      get_dashboard: { Args: { p_from: string; p_to: string }; Returns: Json };
      get_report: {
        Args: {
          p_from: string;
          p_limit?: number;
          p_offset?: number;
          p_report: string;
          p_search?: string;
          p_to: string;
        };
        Returns: Json;
      };
      get_session_profile: {
        Args: never;
        Returns: {
          expires_at: string;
          full_name: string;
          id: string;
          phone: string;
          role: Database["public"]["Enums"]["user_role"];
        }[];
      };
      get_setup_accounts: { Args: never; Returns: Json };
      import_menu_products: { Args: { p_rows: Json }; Returns: number };
      list_day_closes: { Args: { p_offset?: number }; Returns: Json };
      list_debts: {
        Args: {
          p_direction?: string;
          p_id?: string;
          p_offset?: number;
          p_search?: string;
          p_state?: string;
        };
        Returns: Json;
      };
      list_delivery_orders: { Args: never; Returns: Json };
      list_logistics_advances: {
        Args: { p_offset?: number; p_state?: string };
        Returns: Json;
      };
      list_logistics_purchases: {
        Args: { p_id?: string; p_offset?: number };
        Returns: Json;
      };
      list_unpaid_customers: { Args: { p_offset?: number }; Returns: Json };
      log_activity: {
        Args: {
          p_action: string;
          p_details?: Json;
          p_entity: string;
          p_id: string;
        };
        Returns: undefined;
      };
      log_purchase: {
        Args: { p: Json };
        Returns: {
          account_id: number | null;
          advance_id: string | null;
          amount: number;
          amount_try: number;
          business_date: string;
          category_id: number;
          debt_id: string | null;
          id: string;
          is_reversed: boolean;
          logged_at: string;
          logged_by: string;
          note: string | null;
          rate_to_try: number;
          receipt_path: string | null;
          supplier: string;
        };
        SetofOptions: {
          from: "*";
          to: "purchases";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      m1_session_active: { Args: never; Returns: boolean };
      m5_amount: {
        Args: { p_amount: number; p_positive?: boolean };
        Returns: undefined;
      };
      m5_rate: { Args: { p_rate: number }; Returns: undefined };
      m6_purchase_preview: { Args: { p: Json }; Returns: Json };
      m8_lock_current_day: { Args: never; Returns: undefined };
      order_extras_amount: { Args: { p_extras: Json }; Returns: number };
      post_entry: {
        Args: {
          p_account: number;
          p_amount: number;
          p_amount_try?: number;
          p_debt?: string;
          p_note?: string;
          p_order?: string;
          p_purchase?: string;
          p_rate: number;
          p_reverses?: number;
          p_transfer?: string;
          p_type: Database["public"]["Enums"]["entry_type"];
          p_withdrawal?: string;
        };
        Returns: number;
      };
      quote_close: { Args: { p: Json }; Returns: Json };
      quote_debt_settlement: { Args: { p: Json }; Returns: Json };
      quote_opening: { Args: { p: Json }; Returns: Json };
      quote_order: { Args: { p_order: Json }; Returns: Json };
      quote_purchase: { Args: { p: Json }; Returns: Json };
      quote_record_debt: { Args: { p: Json }; Returns: Json };
      quote_return_change: { Args: { p: Json }; Returns: Json };
      quote_withdrawal: { Args: { p: Json }; Returns: Json };
      record_debt: {
        Args: {
          p_account?: number;
          p_amount: number;
          p_counterparty: string;
          p_currency?: string;
          p_description: string;
          p_direction: Database["public"]["Enums"]["debt_direction"];
          p_due_date?: string;
          p_opening?: boolean;
          p_rate?: number;
        };
        Returns: {
          amount: number;
          business_date: string;
          cancel_reason: string | null;
          counterparty: string;
          created_at: string;
          created_by: string;
          currency: string;
          description: string;
          direction: Database["public"]["Enums"]["debt_direction"];
          due_date: string | null;
          id: string;
          is_cancelled: boolean;
          is_opening: boolean;
          source: string;
        };
        SetofOptions: {
          from: "*";
          to: "debts";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_login: {
        Args: never;
        Returns: {
          expires_at: string;
          full_name: string;
          id: string;
          phone: string;
          role: Database["public"]["Enums"]["user_role"];
        }[];
      };
      report_items_sold: {
        Args: { p_from: string; p_to: string };
        Returns: {
          category_name: string;
          product_name: string;
          quantity: number;
          revenue: number;
          variant_name: string;
        }[];
      };
      report_periods: { Args: never; Returns: Json };
      report_pnl: {
        Args: { p_from: string; p_to: string };
        Returns: {
          cost_of_goods: number;
          fixed_overheads: number;
          gross_margin: number;
          gross_profit: number;
          net_margin: number;
          net_profit: number;
          net_revenue: number;
          operational_expenses: number;
        }[];
      };
      require_role: {
        Args: { allowed: Database["public"]["Enums"]["user_role"][] };
        Returns: string;
      };
      resolve_rate: {
        Args: { p_account: number; p_rate: number };
        Returns: number;
      };
      return_change: {
        Args: { p_account: number; p_advance: string; p_amount: number };
        Returns: number;
      };
      reverse_entry: {
        Args: { p_entry: number; p_reason: string };
        Returns: number;
      };
      reverse_purchase: {
        Args: { p_purchase: string; p_reason: string };
        Returns: undefined;
      };
      run_close: { Args: { p: Json; p_request_id: string }; Returns: Json };
      run_debt_action: {
        Args: { p: Json; p_action: string; p_request_id: string };
        Returns: Json;
      };
      run_logistics_action: {
        Args: { p: Json; p_action: string; p_request_id: string };
        Returns: Json;
      };
      run_money_action: {
        Args: { p: Json; p_action: string; p_request_id: string };
        Returns: Json;
      };
      save_menu_extra: { Args: { p_extra: Json }; Returns: string };
      save_menu_product: { Args: { p_product: Json }; Returns: string };
      set_approval_limit: {
        Args: { p_limit: number };
        Returns: {
          advance_max_age_days: number;
          id: boolean;
          updated_at: string;
          withdrawal_approval_limit_try: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "settings";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_fx_rate: {
        Args: { p_currency: string; p_rate: number };
        Returns: undefined;
      };
      set_order_status: {
        Args: {
          p_order: string;
          p_status: Database["public"]["Enums"]["order_status"];
        };
        Returns: {
          business_date: string;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          channel: Database["public"]["Enums"]["order_channel"];
          client_request_hash: string | null;
          client_request_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          customer_name: string | null;
          customer_phone: string | null;
          daily_number: number;
          delivery_address: string | null;
          discount_amount: number;
          discount_reason: string | null;
          id: string;
          note: string | null;
          order_type: Database["public"]["Enums"]["order_type"];
          picked_up_at: string | null;
          picked_up_by: string | null;
          preparing_at: string | null;
          ready_at: string | null;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
        };
        SetofOptions: {
          from: "*";
          to: "orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      settle_advance_overspend: {
        Args: { p_account: number; p_advance: string };
        Returns: number;
      };
      settle_debt: {
        Args: {
          p_account: number;
          p_amount: number;
          p_covers?: number;
          p_debt: string;
          p_note?: string;
        };
        Returns: number;
      };
      transfer_between_accounts: {
        Args: {
          p_amount_from: number;
          p_amount_to?: number;
          p_from: number;
          p_note?: string;
          p_to: number;
        };
        Returns: string;
      };
    };
    Enums: {
      debt_direction: "we_owe" | "owed_to_us";
      entry_type:
        | "order_payment"
        | "refund"
        | "advance"
        | "advance_topup"
        | "direct_expense"
        | "purchase_direct"
        | "change_returned"
        | "transfer_out"
        | "transfer_in"
        | "opening_balance"
        | "adjustment"
        | "reversal"
        | "debt_out"
        | "debt_in";
      expense_kind: "cogs" | "operational" | "fixed";
      order_channel:
        | "walk_in"
        | "whatsapp"
        | "instagram"
        | "phone"
        | "delivery_app"
        | "event";
      order_status:
        | "new"
        | "preparing"
        | "ready"
        | "picked_up"
        | "completed"
        | "cancelled";
      order_type: "pickup" | "delivery" | "dine_in";
      user_role: "operations" | "logistics" | "admin";
      withdrawal_kind: "advance" | "direct_expense";
      withdrawal_status:
        | "pending_approval"
        | "approved"
        | "rejected"
        | "reversed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      debt_direction: ["we_owe", "owed_to_us"],
      entry_type: [
        "order_payment",
        "refund",
        "advance",
        "advance_topup",
        "direct_expense",
        "purchase_direct",
        "change_returned",
        "transfer_out",
        "transfer_in",
        "opening_balance",
        "adjustment",
        "reversal",
        "debt_out",
        "debt_in",
      ],
      expense_kind: ["cogs", "operational", "fixed"],
      order_channel: [
        "walk_in",
        "whatsapp",
        "instagram",
        "phone",
        "delivery_app",
        "event",
      ],
      order_status: [
        "new",
        "preparing",
        "ready",
        "picked_up",
        "completed",
        "cancelled",
      ],
      order_type: ["pickup", "delivery", "dine_in"],
      user_role: ["operations", "logistics", "admin"],
      withdrawal_kind: ["advance", "direct_expense"],
      withdrawal_status: [
        "pending_approval",
        "approved",
        "rejected",
        "reversed",
      ],
    },
  },
} as const;
