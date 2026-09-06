import * as configApi from '@/services/configService';
import * as warehousesApi from '@/services/warehousesService';
import * as plansApi from '@/services/subscriptionPlansService';
import * as upsellApi from '@/services/upsellService';

/**
 * Governance configuration, warehouses, subscription plans and upsell rules —
 * API-REFERENCE §5, §7, §8, §9.
 *
 * A SALES_REP CAN READ NONE OF §5. Knowing the exact trip points makes it trivial to
 * price a quotation to sit one basis point under one, which is the behaviour these rules
 * exist to prevent. `loadDiscountConfig` therefore no-ops for a rep rather than firing a
 * request that will 403 on every boot.
 *
 * CEILINGS SAVE AS A WHOLE MAP, NOT ONE AT A TIME. The risk engine reads the three tiers
 * together, and a UI that saved bronze alone could leave bronze above gold between two
 * requests. `setTierCeiling` and `setCategoryCeiling` keep their single-value signatures
 * for the inline steppers but merge into the full map before sending.
 *
 * NO CLIENT-SIDE AUDIT WRITES — the server records every config change with its before
 * and after values (§17.7).
 */
export function createConfigSlice(set, get) {
  return {
    configLoading: false,
    configError: null,
    /** Gaps and overlaps the server reports. Warnings, never rejections. */
    chainWarnings: [],

    /* --------------------------------------------------------------- loads */

    /**
     * Discount ceilings + approval chain in one read. Returns `{ok:false, skipped:true}`
     * for a sales_rep, whose role cannot see governance config at all.
     */
    async loadDiscountConfig() {
      if (!get().hasRole('admin', 'sales_manager', 'finance')) {
        return { ok: false, skipped: true };
      }

      set({ configLoading: true, configError: null });
      try {
        const data = await configApi.fetchDiscountConfig();
        set({
          tierCeilings: data.tierCeilings ?? {},
          categoryCeilings: data.categoryCeilings ?? {},
          approvalChain: data.approvalChain ?? [],
          chainWarnings: data.warnings ?? [],
        });
        return { ok: true, data };
      } catch (error) {
        set({ configError: error.message });
        return { ok: false, error: error.message };
      } finally {
        set({ configLoading: false });
      }
    },

    async loadWarehouses() {
      try {
        const warehouses = await warehousesApi.listWarehouses();
        set({ warehouses });
        return { ok: true, warehouses };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },

    async loadSubscriptionPlans() {
      try {
        const subscriptionPlans = await plansApi.listSubscriptionPlans();
        set({ subscriptionPlans });
        return { ok: true, subscriptionPlans };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },

    async loadUpsellRules() {
      try {
        const upsellRules = await upsellApi.listUpsellRules();
        set({ upsellRules });
        return { ok: true, upsellRules };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },

    async loadDashboardConfig() {
      if (!get().hasRole('admin', 'sales_manager', 'finance')) {
        return { ok: false, skipped: true };
      }
      try {
        const dashboardConfig = await configApi.fetchDashboardConfig();
        set({ dashboardConfig });
        return { ok: true, dashboardConfig };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },

    /* ------------------------------------------------- discount ceilings */

    /** Merges into the full three-tier map before saving — see the note above. */
    async setTierCeiling(tier, pct) {
      const next = { ...get().tierCeilings, [tier]: Number(pct) || 0 };
      return get().saveTierCeilings(next);
    },

    async saveTierCeilings(map) {
      try {
        const data = await configApi.saveTierCeilings(map);
        applyDiscountConfig(set, data, map, get);
        get().invalidateRisk();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code };
      }
    },

    /** Merges into the full four-category map before saving. */
    async setCategoryCeiling(category, pct) {
      const next = { ...get().categoryCeilings, [category]: Number(pct) || 0 };
      return get().saveCategoryCeilings(next);
    },

    async saveCategoryCeilings(map) {
      try {
        const data = await configApi.saveCategoryCeilings(map);
        applyDiscountConfig(set, data, null, get, map);
        get().invalidateRisk();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code };
      }
    },

    /* --------------------------------------------------- approval chain */

    /** Create or replace. A rule is replaced wholesale so a band cannot be half-edited. */
    async upsertApprovalRule(payload) {
      try {
        const data = payload.id
          ? await configApi.updateApprovalRule(payload.id, stripId(payload))
          : await configApi.createApprovalRule(payload);

        applyChain(set, data);
        get().invalidateRisk();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code };
      }
    },

    /**
     * Deleting the LAST rule is refused with 409 CHAIN_NOT_CONFIGURED — an empty chain
     * leaves every quotation unroutable. Surface `error` rather than swallowing it.
     */
    async deleteApprovalRule(id) {
      try {
        const data = await configApi.deleteApprovalRule(id);
        applyChain(set, data);
        get().invalidateRisk();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code };
      }
    },

    /** `ids` must list EVERY rule; a partial list is rejected with 400. */
    async reorderApprovalRules(ids) {
      try {
        const data = await configApi.reorderApprovalChain(ids);
        applyChain(set, data);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code };
      }
    },

    /**
     * The server's chain warnings.
     *
     * Previously computed locally. The server already reports gaps and overlaps on every
     * chain read and write, and duplicating that logic here would let the two disagree —
     * so this now just reads what the server said.
     */
    validateApprovalChain() {
      return get().chainWarnings ?? [];
    },

    /* ------------------------------------------------------- warehouses */

    async upsertWarehouse(payload) {
      try {
        const saved = payload.id
          ? await warehousesApi.updateWarehouse(payload.id, stripId(payload))
          : await warehousesApi.createWarehouse(payload);

        set((state) => ({
          warehouses: payload.id
            ? state.warehouses.map((w) => (w.id === saved.id ? saved : w))
            : [...state.warehouses, saved],
        }));
        return { ok: true, warehouse: saved };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code };
      }
    },

    /** One product. The server takes a partial map, so absent keys are left alone. */
    async setWarehouseStock(warehouseId, productId, qty) {
      return get().setWarehouseStockBulk(warehouseId, {
        [productId]: Math.max(0, Number(qty) || 0),
      });
    },

    /**
     * Bulk save from the "Manage stock" dialog.
     *
     * `affectedQuotationIds` in the response lists open backorders this stock increase
     * could now fill — that is what the consolidation prompt fires on, so it is handed
     * to the fulfillment slice rather than discarded.
     */
    async setWarehouseStockBulk(warehouseId, stockMap) {
      try {
        const result = await warehousesApi.setStock(warehouseId, stockMap);
        if (result?.warehouse) {
          set((state) => ({
            warehouses: state.warehouses.map((w) =>
              w.id === warehouseId ? result.warehouse : w,
            ),
          }));
        }
        get().afterStockChange?.(result?.affectedQuotationIds ?? []);
        return { ok: true, affectedQuotationIds: result?.affectedQuotationIds ?? [] };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code };
      }
    },

    /**
     * Applies `replenishQty` to every product at or below `replenishThreshold`.
     *
     * An ops convenience that makes the backorder-consolidation path reproducible on
     * demand rather than only when real stock happens to arrive.
     */
    async simulateRestock(warehouseId) {
      try {
        const result = await warehousesApi.restock(warehouseId);
        // The response reports counts, not the warehouse, so re-read to pick up stock.
        await get().loadWarehouses();
        get().afterStockChange?.(result?.affectedQuotationIds ?? []);
        return {
          ok: true,
          restocked: result?.restocked ?? 0,
          warehouseName: result?.warehouseName,
          affectedQuotationIds: result?.affectedQuotationIds ?? [],
        };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code };
      }
    },

    /* ------------------------------------------------ subscription plans */

    async upsertSubscriptionPlan(payload) {
      try {
        const saved = payload.id
          ? await plansApi.updateSubscriptionPlan(payload.id, stripId(payload))
          : await plansApi.createSubscriptionPlan(payload);

        set((state) => ({
          subscriptionPlans: payload.id
            ? state.subscriptionPlans.map((p) => (p.id === saved.id ? saved : p))
            : [...state.subscriptionPlans, saved],
        }));
        return { ok: true, plan: saved };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code };
      }
    },

    /* ----------------------------------------------------- upsell rules */

    async upsertUpsellRule(payload) {
      try {
        const saved = payload.id
          ? await upsellApi.updateUpsellRule(payload.id, stripId(payload))
          : await upsellApi.createUpsellRule(payload);

        // PUT returns the rule; POST may return the rule or the whole set.
        if (Array.isArray(saved)) {
          set({ upsellRules: saved });
        } else {
          set((state) => ({
            upsellRules: payload.id
              ? state.upsellRules.map((r) => (r.id === saved.id ? saved : r))
              : [...state.upsellRules, saved],
          }));
        }
        return { ok: true, rule: saved };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code };
      }
    },

    /** A real delete — a pairing is configuration, not history. Returns the remainder. */
    async deleteUpsellRule(id) {
      try {
        const remaining = await upsellApi.deleteUpsellRule(id);
        if (Array.isArray(remaining)) {
          set({ upsellRules: remaining });
        } else {
          set((state) => ({ upsellRules: state.upsellRules.filter((r) => r.id !== id) }));
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code };
      }
    },

    /* -------------------------------------------------- dashboard config */

    /**
     * All three thresholds are required by the server, so a partial patch is merged
     * over the current values before sending.
     */
    async setDashboardConfig(patch) {
      const next = { ...get().dashboardConfig, ...patch };
      try {
        const dashboardConfig = await configApi.saveDashboardConfig(next);
        set({ dashboardConfig: dashboardConfig ?? next });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code };
      }
    },
  };
}

/* ------------------------------------------------------------------ helpers */

/** `id` is in the path on a PUT; sending it in the body would trip the strict schema. */
function stripId(payload) {
  const body = { ...payload };
  delete body.id;
  return body;
}

/**
 * Both ceiling endpoints return the full §5.1 payload. Fall back to the map we sent if a
 * deployment answers with something narrower, so the UI still reflects the save.
 */
function applyDiscountConfig(set, data, tierMap, get, categoryMap) {
  set({
    tierCeilings: data?.tierCeilings ?? tierMap ?? get().tierCeilings,
    categoryCeilings: data?.categoryCeilings ?? categoryMap ?? get().categoryCeilings,
    approvalChain: data?.approvalChain ?? get().approvalChain,
    chainWarnings: data?.warnings ?? [],
  });
}

/** Chain endpoints return `{ approvalChain, warnings }`, or sometimes a bare array. */
function applyChain(set, data) {
  if (Array.isArray(data)) {
    set({ approvalChain: data, chainWarnings: [] });
    return;
  }
  set({
    approvalChain: data?.approvalChain ?? [],
    chainWarnings: data?.warnings ?? [],
  });
}
