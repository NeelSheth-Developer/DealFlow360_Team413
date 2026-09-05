import { nextId } from '@/lib/utils';
import { categoryLabel, roleLabel, tierLabel } from '@/lib/format';

/**
 * Discount governance, warehouses, subscription plans and upsell rules
 * (spec A3–A6). Every change is audited because these settings decide who has
 * to approve what.
 */
export function createConfigSlice(set, get) {
  return {
    // ------------------------------------------------ discount ceilings (A3)
    setTierCeiling(tier, pct) {
      const from = get().tierCeilings[tier];
      set((state) => ({ tierCeilings: { ...state.tierCeilings, [tier]: Number(pct) || 0 } }));
      get().logAudit({
        entityType: 'config',
        entityId: `tier_ceiling:${tier}`,
        action: `${tierLabel(tier)} tier ceiling set to ${pct}%`,
        meta: { from, to: Number(pct) },
      });
      get().recomputeAlerts();
    },

    setCategoryCeiling(category, pct) {
      const from = get().categoryCeilings[category];
      set((state) => ({
        categoryCeilings: { ...state.categoryCeilings, [category]: Number(pct) || 0 },
      }));
      get().logAudit({
        entityType: 'config',
        entityId: `category_ceiling:${category}`,
        action: `${categoryLabel(category)} category ceiling set to ${pct}%`,
        meta: { from, to: Number(pct) },
      });
      get().recomputeAlerts();
    },

    upsertApprovalRule(payload) {
      const isNew = !payload.id;
      const rule = {
        id: payload.id ?? nextId('ar'),
        minScore: Number(payload.minScore) || 0,
        maxScore: payload.maxScore === null || payload.maxScore === '' ? null : Number(payload.maxScore),
        approvers: payload.approvers ?? [],
        singleLineTrip:
          payload.singleLineTrip === null || payload.singleLineTrip === ''
            ? null
            : Number(payload.singleLineTrip),
        note: payload.note ?? '',
      };

      set((state) => ({
        approvalChain: isNew
          ? [...state.approvalChain, rule]
          : state.approvalChain.map((r) => (r.id === rule.id ? rule : r)),
      }));

      get().logAudit({
        entityType: 'config',
        entityId: `approval_rule:${rule.id}`,
        action: `Approval rule ${isNew ? 'added' : 'updated'} — score ${rule.minScore}–${rule.maxScore ?? '∞'} requires ${
          rule.approvers.length ? rule.approvers.map(roleLabel).join(' then ') : 'no approval'
        }`,
        meta: rule,
      });
    },

    deleteApprovalRule(id) {
      set((state) => ({ approvalChain: state.approvalChain.filter((r) => r.id !== id) }));
      get().logAudit({
        entityType: 'config',
        entityId: `approval_rule:${id}`,
        action: 'Approval rule removed',
      });
    },

    reorderApprovalRules(ids) {
      set((state) => ({
        approvalChain: ids
          .map((id) => state.approvalChain.find((r) => r.id === id))
          .filter(Boolean),
      }));
    },

    /** Flags gaps or overlaps in the configured score ranges. */
    validateApprovalChain() {
      const rules = [...get().approvalChain].sort((a, b) => a.minScore - b.minScore);
      const issues = [];
      for (let i = 0; i < rules.length - 1; i += 1) {
        const current = rules[i];
        const next = rules[i + 1];
        if (current.maxScore === null) {
          issues.push(`"${current.id}" is unbounded but another rule starts after it.`);
          continue;
        }
        if (current.maxScore > next.minScore) {
          issues.push(
            `Rules overlap between ${current.maxScore} and ${next.minScore} — the stricter rule will win.`,
          );
        } else if (current.maxScore < next.minScore) {
          issues.push(`Gap in coverage between ${current.maxScore} and ${next.minScore}.`);
        }
      }
      if (!rules.some((r) => r.maxScore === null)) {
        issues.push('No unbounded rule — very high scores would fall through with no approver.');
      }
      return issues;
    },

    // ----------------------------------------------------- warehouses (A4)
    upsertWarehouse(payload) {
      const isNew = !payload.id;
      const warehouse = {
        id: payload.id ?? nextId('w'),
        name: payload.name,
        location: payload.location ?? '',
        stock: payload.stock ?? {},
        shippingCostWeight: Number(payload.shippingCostWeight) || 1,
        baseShipCost: Number(payload.baseShipCost) || 400,
        replenishThreshold: Number(payload.replenishThreshold) || 0,
        replenishQty: Number(payload.replenishQty) || 0,
        replenishLeadDays: Number(payload.replenishLeadDays) || 7,
      };

      set((state) => ({
        warehouses: isNew
          ? [...state.warehouses, warehouse]
          : state.warehouses.map((w) => (w.id === warehouse.id ? warehouse : w)),
      }));

      get().logAudit({
        entityType: 'warehouse',
        entityId: warehouse.id,
        action: `${isNew ? 'Warehouse created' : 'Warehouse updated'}: ${warehouse.name}`,
        meta: { shippingCostWeight: warehouse.shippingCostWeight },
      });

      get().refreshFulfillmentPlans();
      return warehouse;
    },

    setWarehouseStock(warehouseId, productId, qty) {
      set((state) => ({
        warehouses: state.warehouses.map((w) =>
          w.id === warehouseId
            ? { ...w, stock: { ...w.stock, [productId]: Math.max(0, Number(qty) || 0) } }
            : w,
        ),
      }));
      get().afterStockChange();
    },

    /** Bulk stock save from the "Manage stock" dialog. */
    setWarehouseStockBulk(warehouseId, stockMap) {
      const warehouse = get().warehouses.find((w) => w.id === warehouseId);
      set((state) => ({
        warehouses: state.warehouses.map((w) =>
          w.id === warehouseId ? { ...w, stock: { ...w.stock, ...stockMap } } : w,
        ),
      }));
      get().logAudit({
        entityType: 'warehouse',
        entityId: warehouseId,
        action: `Stock levels updated at ${warehouse?.name ?? warehouseId}`,
        meta: { changed: Object.keys(stockMap).length },
      });
      get().afterStockChange();
    },

    /**
     * Adds the configured replenishment quantity to every low line. This is the
     * deterministic trigger for the backorder-consolidation prompt — real
     * inventory events can't be waited on during a demo.
     */
    simulateRestock(warehouseId) {
      const warehouse = get().warehouses.find((w) => w.id === warehouseId);
      if (!warehouse) return { restocked: 0 };

      let restocked = 0;
      const nextStock = { ...warehouse.stock };
      for (const [productId, qty] of Object.entries(nextStock)) {
        if (qty <= warehouse.replenishThreshold) {
          nextStock[productId] = qty + warehouse.replenishQty;
          restocked += 1;
        }
      }

      set((state) => ({
        warehouses: state.warehouses.map((w) =>
          w.id === warehouseId ? { ...w, stock: nextStock } : w,
        ),
      }));

      get().logAudit({
        entityType: 'warehouse',
        entityId: warehouseId,
        action: `Restock simulated at ${warehouse.name} — ${restocked} product(s) replenished`,
        meta: { restocked, qtyEach: warehouse.replenishQty },
      });

      get().afterStockChange();
      return { restocked, warehouseName: warehouse.name };
    },

    // ---------------------------------------------- subscription plans (A5)
    upsertSubscriptionPlan(payload) {
      const isNew = !payload.id;
      const plan = {
        id: payload.id ?? nextId('sp'),
        name: payload.name,
        cadence: payload.cadence ?? 'monthly',
        productIds: payload.productIds ?? [],
        prorationRule: payload.prorationRule ?? 'daily_prorate',
        cancellationRule: payload.cancellationRule ?? 'refund_unused',
        minCommitmentMonths: Number(payload.minCommitmentMonths) || 0,
        trialDays: Number(payload.trialDays) || 0,
        billingDayOfCycle: Number(payload.billingDayOfCycle) || 1,
        active: payload.active ?? true,
      };

      set((state) => ({
        subscriptionPlans: isNew
          ? [...state.subscriptionPlans, plan]
          : state.subscriptionPlans.map((p) => (p.id === plan.id ? plan : p)),
      }));

      get().logAudit({
        entityType: 'subscription_plan',
        entityId: plan.id,
        action: `${isNew ? 'Plan created' : 'Plan updated'}: ${plan.name} (${plan.cadence}, ${plan.prorationRule})`,
        meta: { cancellationRule: plan.cancellationRule },
      });

      return plan;
    },

    // ------------------------------------------------- upsell rules (A6)
    upsertUpsellRule(payload) {
      const isNew = !payload.id;
      const rule = {
        id: payload.id ?? nextId('ur'),
        triggerProductId: payload.triggerProductId,
        suggestedProductId: payload.suggestedProductId,
        coPurchaseScore: Number(payload.coPurchaseScore) || 0,
        promoted: Boolean(payload.promoted),
        minMarginPct: Number(payload.minMarginPct) || 0,
        active: payload.active ?? true,
      };

      set((state) => ({
        upsellRules: isNew
          ? [...state.upsellRules, rule]
          : state.upsellRules.map((r) => (r.id === rule.id ? rule : r)),
      }));

      const products = get().products;
      const triggerName = products.find((p) => p.id === rule.triggerProductId)?.name ?? '?';
      const suggestedName = products.find((p) => p.id === rule.suggestedProductId)?.name ?? '?';

      get().logAudit({
        entityType: 'upsell_rule',
        entityId: rule.id,
        action: `${isNew ? 'Upsell rule added' : 'Upsell rule updated'}: ${triggerName} → ${suggestedName}${rule.promoted ? ' (promoted)' : ''}`,
        meta: { coPurchaseScore: rule.coPurchaseScore, minMarginPct: rule.minMarginPct },
      });

      return rule;
    },

    deleteUpsellRule(id) {
      set((state) => ({ upsellRules: state.upsellRules.filter((r) => r.id !== id) }));
      get().logAudit({
        entityType: 'upsell_rule',
        entityId: id,
        action: 'Upsell rule removed',
      });
    },

    // ----------------------------------------------- dashboard config (B9)
    setDashboardConfig(patch) {
      set((state) => ({ dashboardConfig: { ...state.dashboardConfig, ...patch } }));
      get().logAudit({
        entityType: 'config',
        entityId: 'dashboard',
        action: `Deal health thresholds updated`,
        meta: patch,
      });
      get().recomputeAlerts();
    },
  };
}
