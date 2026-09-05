import { nextId } from '@/lib/utils';
import { categoryLabel } from '@/lib/format';
import { tierFactors } from '@/data/seed/priceLists';

/** Products, variants and tier price lists (spec A2). */
export function createCatalogSlice(set, get) {
  return {
    upsertProduct(payload) {
      const isNew = !payload.id;
      const product = {
        id: payload.id ?? nextId('p'),
        name: payload.name,
        sku: payload.sku || `SKU-${String(payload.name ?? '').slice(0, 4).toUpperCase()}`,
        category: payload.category,
        basePrice: Number(payload.basePrice) || 0,
        costPrice: Number(payload.costPrice) || 0,
        unit: payload.unit || 'unit',
        taxPct: Number(payload.taxPct) || 0,
        description: payload.description ?? '',
        variants: payload.variants ?? [],
        active: payload.active ?? true,
      };

      set((state) => ({
        products: isNew
          ? [...state.products, product]
          : state.products.map((p) => (p.id === product.id ? product : p)),
      }));

      // A brand new product needs tier prices or the builder can't price it.
      if (isNew) {
        const entries = [];
        for (const [tier, factor] of Object.entries(tierFactors)) {
          for (const currency of ['INR', 'USD']) {
            entries.push({
              productId: product.id,
              tier,
              currency,
              price:
                currency === 'USD'
                  ? Math.round((product.basePrice * factor) / 83)
                  : Math.round((product.basePrice * factor) / 50) * 50,
            });
          }
        }
        set((state) => ({ priceLists: [...state.priceLists, ...entries] }));
      }

      get().logAudit({
        entityType: 'product',
        entityId: product.id,
        action: `${isNew ? 'Product created' : 'Product updated'}: ${product.name} (${categoryLabel(product.category)})`,
        meta: { basePrice: product.basePrice, costPrice: product.costPrice },
      });

      return product;
    },

    setProductActive(id, active) {
      const product = get().products.find((p) => p.id === id);
      set((state) => ({
        products: state.products.map((p) => (p.id === id ? { ...p, active } : p)),
      }));
      get().logAudit({
        entityType: 'product',
        entityId: id,
        action: `${active ? 'Product reactivated' : 'Product archived'}: ${product?.name ?? id}`,
      });
    },

    duplicateProduct(id) {
      const source = get().products.find((p) => p.id === id);
      if (!source) return null;
      const copy = get().upsertProduct({
        ...source,
        id: undefined,
        name: `${source.name} (copy)`,
        sku: `${source.sku}-C`,
      });
      return copy;
    },

    upsertPriceListEntry({ productId, tier, currency, price }) {
      set((state) => {
        const idx = state.priceLists.findIndex(
          (p) => p.productId === productId && p.tier === tier && p.currency === currency,
        );
        const entry = { productId, tier, currency, price: Number(price) || 0 };
        if (idx === -1) return { priceLists: [...state.priceLists, entry] };
        const copy = [...state.priceLists];
        copy[idx] = entry;
        return { priceLists: copy };
      });

      get().logAudit({
        entityType: 'price_list',
        entityId: `${productId}:${tier}:${currency}`,
        action: `Price list updated — ${tier} ${currency} set to ${price}`,
      });
    },

    /**
     * Promotes or demotes a customer's pricing tier.
     *
     * This is deliberately the ONLY mutation the app offers on a customer record.
     * Accounts are created solely by customer self-signup — no role, including
     * admin, can create or edit someone else's account. Tier is different: it is
     * a commercial setting that decides which price list applies and what
     * discount ceiling every line is measured against, so a Sales Manager or
     * Admin must own it.
     */
    setCustomerTier(customerId, tier) {
      if (!get().hasRole('admin', 'sales_manager')) {
        return { ok: false, error: 'Only an Admin or Sales Manager can change a customer tier.' };
      }

      const customer = get().customers.find((c) => c.id === customerId);
      if (!customer) return { ok: false, error: 'Customer not found.' };
      if (customer.tier === tier) return { ok: true, customer };

      const previous = customer.tier;
      set((state) => ({
        customers: state.customers.map((c) => (c.id === customerId ? { ...c, tier } : c)),
      }));

      get().logAudit({
        entityType: 'customer',
        entityId: customerId,
        action: `${customer.name} tier changed from ${previous} to ${tier}`,
        meta: { from: previous, to: tier },
      });

      // Existing quotations keep the tier they were written against, but any
      // future scoring for this customer changes, so drop cached scores.
      get().invalidateRisk();
      get().recomputeAlerts();

      return { ok: true, customer: { ...customer, tier } };
    },
  };
}
