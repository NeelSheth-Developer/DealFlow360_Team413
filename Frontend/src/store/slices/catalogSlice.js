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

    upsertCustomer(payload) {
      const isNew = !payload.id;
      const customer = {
        id: payload.id ?? nextId('c'),
        name: payload.name,
        tier: payload.tier ?? 'bronze',
        contactName: payload.contactName ?? '',
        email: payload.email ?? '',
        currency: payload.currency ?? 'INR',
        industry: payload.industry ?? '',
      };

      set((state) => ({
        customers: isNew
          ? [...state.customers, customer]
          : state.customers.map((c) => (c.id === customer.id ? customer : c)),
      }));

      get().logAudit({
        entityType: 'customer',
        entityId: customer.id,
        action: `${isNew ? 'Customer created' : 'Customer updated'}: ${customer.name} (${customer.tier})`,
      });

      return customer;
    },

    upsertUser(payload) {
      const isNew = !payload.id;
      const user = {
        id: payload.id ?? nextId('u'),
        name: payload.name,
        email: payload.email,
        role: payload.role,
        team: payload.team ?? 'Unassigned',
        avatarColor: payload.avatarColor ?? 'from-brand-500 to-accent-indigo',
      };

      set((state) => ({
        users: isNew
          ? [...state.users, user]
          : state.users.map((u) => (u.id === user.id ? user : u)),
      }));

      get().logAudit({
        entityType: 'user',
        entityId: user.id,
        action: `${isNew ? 'User created' : 'User updated'}: ${user.name}`,
        meta: { role: user.role },
      });

      return user;
    },
  };
}
