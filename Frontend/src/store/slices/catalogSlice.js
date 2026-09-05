import * as productsApi from '@/services/productsService';
import * as customersApi from '@/services/customersService';

/**
 * Products, price lists and the customer directory — API-REFERENCE §6 and §4.
 *
 * THE STORE IS A CACHE, NOT A SOURCE OF TRUTH. Every mutation goes to the server and
 * the response is written back, so `products` / `priceLists` / `customers` always hold
 * what the API last said rather than a local guess.
 *
 * NO CLIENT-SIDE AUDIT WRITES. The server audits product changes, price-list changes
 * and tier changes itself (§17.7 lists exactly what it records, with the actor taken
 * from the token). A `logAudit` call here would invent a second, parallel trail that
 * the real audit log does not contain.
 *
 * NO CLIENT-SIDE TIER PRICE GENERATION either. `POST /products` generates the bronze /
 * silver / gold rows server-side (list, −4%, −8%, rounded to the nearest 50) so a new
 * product is immediately quotable.
 */
export function createCatalogSlice(set, get) {
  return {
    productsLoading: false,
    customersLoading: false,
    catalogError: null,

    /* --------------------------------------------------------------- loads */

    /**
     * Load the catalogue. `pageSize` is deliberately large: the seed carries 200
     * products and the builder's picker filters client-side once they are in hand.
     */
    async loadProducts({ category, active, search, page = 1, pageSize = 200 } = {}) {
      set({ productsLoading: true, catalogError: null });
      try {
        const [{ items, meta }, priceLists] = await Promise.all([
          productsApi.listProducts({ category, active, search, page, pageSize }),
          productsApi.listPriceLists(),
        ]);
        set({ products: items, priceLists, productsMeta: meta });
        return { ok: true, items };
      } catch (error) {
        set({ catalogError: error.message });
        return { ok: false, error: error.message };
      } finally {
        set({ productsLoading: false });
      }
    },

    async loadCustomers({ q, tier, page = 1, pageSize = 100 } = {}) {
      set({ customersLoading: true });
      try {
        const { items, meta } = await customersApi.listCustomers({ q, tier, page, pageSize });
        set({ customers: items, customersMeta: meta });
        return { ok: true, items };
      } catch (error) {
        set({ catalogError: error.message });
        return { ok: false, error: error.message };
      } finally {
        set({ customersLoading: false });
      }
    },

    /* ------------------------------------------------------------ products */

    /**
     * Create or update. Admin only server-side — a non-admin gets 403 and the error is
     * returned rather than thrown, so the dialog can show it inline.
     */
    async upsertProduct(payload) {
      try {
        const saved = payload.id
          ? await productsApi.updateProduct(payload.id, payload)
          : await productsApi.createProduct(payload);

        set((state) => ({
          products: payload.id
            ? state.products.map((p) => (p.id === saved.id ? saved : p))
            : [...state.products, saved],
        }));

        // A create generates tier prices server-side, so refresh them or the builder
        // will price the new product at base until the next full load.
        if (!payload.id) {
          const priceLists = await productsApi.listPriceLists();
          set({ priceLists });
        }
        return { ok: true, product: saved };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code };
      }
    },

    /** Archive or restore. There is no delete — historical lines must keep resolving. */
    async setProductActive(id, active) {
      try {
        const saved = await productsApi.setProductActive(id, active);
        set((state) => ({
          products: state.products.map((p) => (p.id === id ? { ...p, ...saved } : p)),
        }));
        return { ok: true, product: saved };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },

    /** The copy starts ARCHIVED, so it will not appear in a rep's picker by accident. */
    async duplicateProduct(id) {
      try {
        const copy = await productsApi.duplicateProduct(id);
        set((state) => ({ products: [...state.products, copy] }));
        const priceLists = await productsApi.listPriceLists();
        set({ priceLists });
        return { ok: true, product: copy };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },

    /**
     * Upsert one tier/currency price. Returns every price for that product, so the
     * whole set for it is replaced rather than patched row by row.
     */
    async upsertPriceListEntry({ productId, tier, currency = 'INR', price }) {
      try {
        const rows = await productsApi.upsertPriceListEntry({ productId, tier, currency, price });
        const updated = Array.isArray(rows) ? rows : null;

        set((state) => ({
          priceLists: updated
            ? [...state.priceLists.filter((p) => p.productId !== productId), ...updated]
            : state.priceLists,
        }));
        return { ok: true, priceLists: updated };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },

    /* ----------------------------------------------------------- customers */

    /**
     * Cache a customer the app fetched on its own — the email lookup on the New
     * Quotation screen, for instance. Purely a local merge; it performs no write.
     */
    cacheCustomer(incoming) {
      if (!incoming?.id) return null;
      const existing = get().customers.find((c) => c.id === incoming.id);

      set((state) => ({
        customers: existing
          ? state.customers.map((c) => (c.id === incoming.id ? { ...c, ...incoming } : c))
          : [...state.customers, incoming],
      }));
      return existing ? { ...existing, ...incoming } : incoming;
    },

    async findCustomerByEmail(email) {
      try {
        const found = await customersApi.findCustomerByEmail(email);
        if (found) get().cacheCustomer(found);
        return { ok: true, customer: found };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },

    /**
     * The ONE mutation allowed on a customer record. Admin / sales_manager only.
     *
     * Existing quotations are NOT rewritten — each snapshots its tier at creation, so
     * an approval already given cannot be invalidated by a later tier change. Cached
     * risk scores are still dropped, because FUTURE scoring for this customer changes.
     */
    async setCustomerTier(customerId, tier) {
      try {
        const saved = await customersApi.setCustomerTier(customerId, tier);
        set((state) => ({
          customers: state.customers.map((c) => (c.id === customerId ? { ...c, ...saved } : c)),
        }));
        get().invalidateRisk();
        return { ok: true, customer: saved };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code };
      }
    },
  };
}
