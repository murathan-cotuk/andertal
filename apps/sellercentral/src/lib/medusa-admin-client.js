/**
 * Medusa Admin API Client for Sellercentral
 * 
 * Sellercentral'dan Medusa backend'e product eklemek için REST API client
 */

/** Belucha production backend — used when NEXT_PUBLIC_MEDUSA_BACKEND_URL is unset. Local: set .env to http://localhost:9000 */
const DEFAULT_PUBLIC_MEDUSA_URL = 'https://belucha-medusa-backend.onrender.com';

const getDefaultBaseUrl = () => {
  const env = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || '';
  const url = (typeof env === 'string' ? env : '').trim();
  if (url) return url.replace(/\/$/, '');
  return DEFAULT_PUBLIC_MEDUSA_URL.replace(/\/$/, '');
};

const MEDUSA_BACKEND_URL = getDefaultBaseUrl();

class MedusaAdminClient {
  constructor(baseURL = MEDUSA_BACKEND_URL) {
    this.baseURL = (baseURL || MEDUSA_BACKEND_URL).replace(/\/$/, '');
  }

  /**
   * Generic API request helper
   */
  async request(endpoint, options = {}) {
    const base = (typeof getDefaultBaseUrl === 'function' ? getDefaultBaseUrl() : null) || this.baseURL;
    const url = `${base}${endpoint}`;

    if (!url || url.startsWith('undefined')) {
      const err = new Error('Backend URL is not set. Set NEXT_PUBLIC_MEDUSA_BACKEND_URL (e.g. https://belucha-medusa-backend.onrender.com).');
      console.error('Medusa Admin API Error:', err.message);
      throw err;
    }

    // Attach seller auth token if available
    const token = typeof window !== 'undefined' ? localStorage.getItem('sellerToken') : null;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: response.statusText }));
        const msg = errorBody?.message || errorBody?.error || response.statusText;
        const err = new Error(typeof msg === 'string' ? msg : `HTTP ${response.status}`);
        err.statusCode = response.status;
        throw err;
      }

      return await response.json();
    } catch (error) {
      const isNetworkError = error?.message === 'Failed to fetch' || error?.name === 'TypeError' || error?.code === 'ECONNREFUSED';
      const method = (options?.method || 'GET').toUpperCase();
      const friendlyMessage = isNetworkError
        ? `Backend unreachable (${method} ${endpoint}). Set NEXT_PUBLIC_MEDUSA_BACKEND_URL to your backend URL (e.g. https://belucha-medusa-backend.onrender.com) and ensure the backend is running.`
        : (error?.message || 'Request failed');
      const out = new Error(friendlyMessage);
      out.statusCode = error?.statusCode;
      out.cause = error;
      if (error?.statusCode === 404 || error?.statusCode === 503 || isNetworkError) {
        console.warn(`Medusa Admin API (${endpoint}):`, error?.message || error?.statusCode);
      } else {
        const errMsg = error?.message ?? (typeof error === 'string' ? error : 'Request failed');
        console.warn(`Medusa Admin API (${endpoint}):`, errMsg);
      }
      throw out;
    }
  }

  /**
   * Products (returns { products, count }; on 404/5xx returns empty list so Dashboard/Inventory don't break)
   */
  async getProducts(params = {}) {
    const queryParams = new URLSearchParams(params).toString()
    try {
      return await this.request(`/admin/products${queryParams ? `?${queryParams}` : ''}`)
    } catch (err) {
      const code = err?.statusCode
      const msg = (err?.message || '').toLowerCase()
      if (code === 404 || code === 500 || code === 503 || msg.includes('404') || msg.includes('not found') || msg.includes('500') || msg.includes('503')) {
        return { products: [], count: 0 }
      }
      throw err
    }
  }

  async getProduct(id) {
    return this.request(`/admin/products/${id}`)
  }

  async createProduct(data) {
    return this.request('/admin/products', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  /**
   * Admin Hub Products (DB: admin_hub_products – collections/menus gibi veritabanına bağlı)
   * Backend erişilemezse boş liste döner, sayfa çökmez.
   */
  async getAdminHubProducts(params = {}) {
    // Non-superusers only see their own products
    const isSuperuser = typeof window !== 'undefined' && localStorage.getItem('sellerIsSuperuser') === 'true';
    const sellerId = typeof window !== 'undefined' ? localStorage.getItem('sellerId') : null;
    const filteredParams = { ...params };
    if (!isSuperuser && sellerId && !filteredParams.seller_id) {
      filteredParams.seller_id = sellerId;
    }
    const queryParams = new URLSearchParams(filteredParams).toString();
    try {
      const data = await this.request(`/admin-hub/products${queryParams ? `?${queryParams}` : ''}`);
      return { products: data?.products ?? [], count: data?.count ?? data?.products?.length ?? 0 };
    } catch (err) {
      const code = err?.statusCode;
      const msg = (err?.message || '').toLowerCase();
      if (code === 404 || code === 500 || code === 503 || msg.includes('unreachable') || msg.includes('fetch')) {
        return { products: [], count: 0 };
      }
      throw err;
    }
  }

  async createAdminHubProduct(data) {
    // Always tag the product with the current seller's ID
    const sellerId = typeof window !== 'undefined' ? localStorage.getItem('sellerId') : null;
    const body = sellerId ? { seller_id: sellerId, seller: sellerId, ...data } : data;
    const res = await this.request('/admin-hub/products', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res?.product ?? res;
  }

  /** GET /admin-hub/products/:id – id (UUID) veya handle ile tek ürün (kısa URL için handle kullan) */
  async getAdminHubProduct(idOrHandle) {
    const res = await this.request(`/admin-hub/products/${encodeURIComponent(idOrHandle)}`);
    return res?.product ?? res;
  }

  /** PUT /admin-hub/products/:id – ürün güncelle (id veya handle) */
  async updateAdminHubProduct(idOrHandle, data) {
    const res = await this.request(`/admin-hub/products/${encodeURIComponent(idOrHandle)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res?.product ?? res;
  }

  /** DELETE /admin-hub/products/:id */
  async deleteAdminHubProduct(idOrHandle) {
    return this.request(`/admin-hub/products/${encodeURIComponent(idOrHandle)}`, { method: 'DELETE' });
  }

  /** GET /admin-hub/metafield-definitions */
  async getMetafieldDefinitions() {
    return this.request('/admin-hub/metafield-definitions');
  }

  /** PUT /admin-hub/metafield-definitions/:key */
  async putMetafieldDefinition(key, data) {
    return this.request(`/admin-hub/metafield-definitions/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /** DELETE /admin-hub/metafield-definitions/:key */
  async deleteMetafieldDefinition(key) {
    return this.request(`/admin-hub/metafield-definitions/${encodeURIComponent(key)}`, { method: 'DELETE' });
  }

  /** GET /admin-hub/landing-page/:pageId */
  async getLandingPageContainers(pageId) {
    return this.request(`/admin-hub/landing-page/${encodeURIComponent(pageId)}`);
  }

  /** PUT /admin-hub/landing-page/:pageId */
  async saveLandingPageContainers(pageId, containers) {
    return this.request(`/admin-hub/landing-page/${encodeURIComponent(pageId)}`, {
      method: 'PUT',
      body: JSON.stringify({ containers }),
    });
  }

  /** GET /admin-hub/styles */
  async getStyles() {
    return this.request('/admin-hub/styles');
  }

  /** PUT /admin-hub/styles */
  async saveStyles(styles) {
    return this.request('/admin-hub/styles', {
      method: 'PUT',
      body: JSON.stringify({ styles }),
    });
  }

  /** GET /admin-hub/seller-settings */
  async getSellerSettings() {
    const sellerId = typeof window !== 'undefined' ? localStorage.getItem('sellerId') : null;
    const params = sellerId ? `?seller_id=${encodeURIComponent(sellerId)}` : '';
    const res = await this.request(`/admin-hub/seller-settings${params}`).catch(() => ({ store_name: '' }));
    return {
      store_name: res?.store_name ?? '',
      free_shipping_threshold_cents: res?.free_shipping_threshold_cents ?? null,
      free_shipping_thresholds: res?.free_shipping_thresholds ?? null,
    };
  }

  /** PATCH /admin-hub/seller-settings – save store name to DB */
  async updateSellerSettings(data) {
    const sellerId = typeof window !== 'undefined' ? localStorage.getItem('sellerId') : null;
    const body = sellerId ? { seller_id: sellerId, ...data } : data;
    const res = await this.request('/admin-hub/seller-settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return res;
  }

  async updateProduct(id, data) {
    return this.request(`/admin/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteProduct(id) {
    return this.request(`/admin/products/${id}`, {
      method: 'DELETE',
    })
  }

  /**
   * Admin Hub Categories (Platform owner managed)
   * Backend: GET /admin-hub/categories veya GET /admin-hub/v1/categories
   * Vercel'da NEXT_PUBLIC_MEDUSA_BACKEND_URL = https://belucha-medusa-backend.onrender.com olmalı.
   */
  async getAdminHubCategories(filters = {}) {
    const { all, ...rest } = filters
    const params = all ? rest : { active: 'true', ...rest }
    const queryParams = new URLSearchParams(params).toString()
    const paths = [
      `/admin-hub/categories?${queryParams}`,
      `/admin-hub/v1/categories?${queryParams}`,
    ]
    let lastErr = null
    for (const path of paths) {
      try {
        const data = await this.request(path)
        if (data.categories != null) return data
        if (Array.isArray(data.tree)) return { categories: data.tree, count: data.tree.length }
        return { categories: [], count: 0 }
      } catch (err) {
        lastErr = err
        if (!err.message || !err.message.includes('404')) throw err
      }
    }
    throw lastErr
  }

  /**
   * @deprecated Use getAdminHubCategories() instead
   * Medusa product-categories endpoint (read-only, deprecated)
   */
  async getCategories() {
    console.warn('⚠️  getCategories() is deprecated. Use getAdminHubCategories() instead.')
    return this.request('/admin/product-categories')
  }

  /**
   * Bulk import Admin Hub categories (POST /admin-hub/categories/import)
   * Body: { items: [ { key, label, parentKey, sortOrder } ] }
   */
  async importAdminHubCategories(items) {
    return this.request('/admin-hub/categories/import', {
      method: 'POST',
      body: JSON.stringify({ items }),
    })
  }

  /**
   * Create Admin Hub category (POST)
   */
  async createAdminHubCategory(data) {
    const opts = { method: 'POST', body: JSON.stringify(data) }
    try {
      return await this.request('/admin-hub/v1/categories', opts)
    } catch (err) {
      if (err?.message?.includes('404')) {
        return await this.request('/admin-hub/categories', opts)
      }
      throw err
    }
  }

  /**
   * Update Admin Hub category (PUT)
   */
  async updateAdminHubCategory(id, data) {
    return this.request(`/admin-hub/v1/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  /**
   * Delete Admin Hub category (DELETE)
   */
  async deleteAdminHubCategory(id) {
    return this.request(`/admin-hub/v1/categories/${id}`, {
      method: 'DELETE',
    })
  }

  /**
   * Get collections with collection pages (has_collection = true)
   */
  async getCollections() {
    const data = await this.request('/admin-hub/v1/categories?active=true')
    const collections = (data.categories || []).filter(cat => cat.has_collection === true)
    return { collections, count: collections.length }
  }

  /**
   * List collections. For Products > Collections page use adminHub: true (our endpoint, no 503).
   * For category form "Link to existing" use getMedusaCollections({ medusa_only: true }) with adminHub: false.
   */
  async getMedusaCollections(params = {}) {
    const q = params.medusa_only ? '?medusa_only=true' : ''
    const base = params.adminHub === true ? '/admin-hub/collections' : '/admin/collections'
    const data = await this.request(`${base}${q}`)
    return { collections: data.collections || [], count: data.count || 0 }
  }

  async getBrands() {
    const data = await this.request('/admin-hub/brands').catch(() => ({ brands: [] }))
    return { brands: data.brands || [] }
  }

  async createBrand(body) {
    const res = await this.request('/admin-hub/brands', { method: 'POST', body: JSON.stringify(body || {}) })
    return res.brand ?? res
  }

  async updateBrand(id, body) {
    const res = await this.request(`/admin-hub/brands/${id}`, { method: 'PATCH', body: JSON.stringify(body || {}) })
    return res.brand ?? res
  }

  async deleteBrand(id) {
    return this.request(`/admin-hub/brands/${id}`, { method: 'DELETE' })
  }

  /** Get single collection by id (standalone admin_hub_collections only) */
  async getCollection(id) {
    if (!id) return null
    try {
      const data = await this.request(`/admin-hub/collections/${id}`)
      return data.collection || null
    } catch {
      return null
    }
  }

  async createCollection(data) {
    const body = { title: data.title, handle: data.handle }
    if (data.standalone === true) body.standalone = true
    if (data.category_id) body.category_id = data.category_id
    const endpoint = '/admin-hub/collections'
    const res = await this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return res.collection
  }

  async updateCollection(id, data) {
    const body = {}
    if (data.title !== undefined) body.title = data.title
    if (data.handle !== undefined) body.handle = data.handle
    if (data.category_id !== undefined) body.category_id = data.category_id
    if (data.display_title !== undefined) body.display_title = data.display_title
    if (data.meta_title !== undefined) body.meta_title = data.meta_title
    if (data.meta_description !== undefined) body.meta_description = data.meta_description
    if (data.keywords !== undefined) body.keywords = data.keywords
    if (data.richtext !== undefined) body.richtext = data.richtext
    if (data.image_url !== undefined) body.image_url = data.image_url
    if (data.banner_image_url !== undefined) body.banner_image_url = data.banner_image_url
    if (data.recommended_product_ids !== undefined) body.recommended_product_ids = data.recommended_product_ids
    const res = await this.request(`/admin-hub/collections/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    return res.collection
  }

  async deleteCollection(id) {
    return this.request(`/admin-hub/collections/${id}`, { method: 'DELETE' })
  }

  /**
   * Menu locations (where menus can appear: main, subnav, footer columns). Used for Location dropdown.
   */
  async getMenuLocations() {
    const data = await this.request('/admin-hub/menu-locations')
    return { locations: data.locations || [] }
  }

  /**
   * Admin Hub Menus – on 503 or any error returns empty list so menu page always loads.
   */
  async getMenus() {
    try {
      const data = await this.request('/admin-hub/menus')
      return { menus: data.menus || [], count: data.count ?? (data.menus || []).length }
    } catch (_) {
      return { menus: [], count: 0 }
    }
  }

  async getMenu(id) {
    const data = await this.request(`/admin-hub/menus/${id}`)
    return data.menu
  }

  async createMenu(body) {
    const data = await this.request('/admin-hub/menus', { method: 'POST', body: JSON.stringify(body) })
    return data.menu
  }

  async updateMenu(id, body) {
    const data = await this.request(`/admin-hub/menus/${id}`, { method: 'PUT', body: JSON.stringify(body) })
    return data.menu
  }

  async deleteMenu(id) {
    return this.request(`/admin-hub/menus/${id}`, { method: 'DELETE' })
  }

  async getMenuItems(menuId) {
    try {
      const data = await this.request(`/admin-hub/menus/${menuId}/items`)
      return { items: data.items || [], count: data.count ?? (data.items || []).length }
    } catch (_) {
      return { items: [], count: 0 }
    }
  }

  async createMenuItem(menuId, body) {
    const data = await this.request(`/admin-hub/menus/${menuId}/items`, { method: 'POST', body: JSON.stringify(body) })
    return data.item
  }

  async updateMenuItem(menuId, itemId, body) {
    const data = await this.request(`/admin-hub/menus/${menuId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(body) })
    return data.item
  }

  async deleteMenuItem(menuId, itemId) {
    return this.request(`/admin-hub/menus/${menuId}/items/${itemId}`, { method: 'DELETE' })
  }

  /**
   * Admin Hub Banners
   */
  async getBanners(params = {}) {
    const queryParams = new URLSearchParams(params).toString()
    return this.request(`/admin-hub/v1/banners${queryParams ? `?${queryParams}` : ''}`)
  }

  async getBanner(id) {
    return this.request(`/admin-hub/v1/banners/${id}`)
  }

  async createBanner(data) {
    return this.request('/admin-hub/v1/banners', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateBanner(id, data) {
    return this.request(`/admin-hub/v1/banners/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteBanner(id) {
    return this.request(`/admin-hub/v1/banners/${id}`, {
      method: 'DELETE',
    })
  }

  /**
   * Admin Hub Media (v1)
   */
  async getMedia(params = {}) {
    const p = { limit: 500, ...params }
    const queryParams = new URLSearchParams(p).toString()
    return this.request(`/admin-hub/v1/media${queryParams ? `?${queryParams}` : ''}`)
  }

  async getMediaItem(id) {
    return this.request(`/admin-hub/v1/media/${id}`)
  }

  async uploadMedia(formData) {
    const base = this.baseURL || getDefaultBaseUrl()
    const url = `${base}/admin-hub/v1/media`
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {},
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }))
      throw new Error(err.message || `HTTP ${res.status}`)
    }
    return res.json()
  }

  async registerMediaUrl(data) {
    const base = (typeof getDefaultBaseUrl === 'function' ? getDefaultBaseUrl() : null) || this.baseURL
    const res = await fetch(`${base}/admin-hub/v1/media/add-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) { const e = await res.json().catch(() => ({ message: res.statusText })); throw new Error(e.message || `HTTP ${res.status}`) }
    return res.json()
  }

  async deleteMedia(id) {
    return this.request(`/admin-hub/v1/media/${id}`, { method: 'DELETE' })
  }

  async getMediaFolders() {
    const base = (typeof getDefaultBaseUrl === 'function' ? getDefaultBaseUrl() : null) || this.baseURL
    const res = await fetch(`${base}/admin-hub/v1/media/folders`)
    if (!res.ok) return { folders: [] }
    return res.json()
  }

  async createMediaFolder(name) {
    const base = (typeof getDefaultBaseUrl === 'function' ? getDefaultBaseUrl() : null) || this.baseURL
    const res = await fetch(`${base}/admin-hub/v1/media/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) { const e = await res.json().catch(() => ({ message: res.statusText })); throw new Error(e.message || `HTTP ${res.status}`) }
    return res.json()
  }

  async deleteMediaFolder(id) {
    return this.request(`/admin-hub/v1/media/folders/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async updateMedia(id, data) {
    return this.request(`/admin-hub/v1/media/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  async addMediaByUrl(data) {
    return this.request('/admin-hub/v1/media/add-url', { method: 'POST', body: JSON.stringify(data) })
  }

  /**
   * Admin Hub Pages (v1)
   */
  async getPages(params = {}) {
    const sp = new URLSearchParams();
    if (params.limit != null && params.limit !== '') sp.set('limit', String(params.limit));
    if (params.offset != null && params.offset !== '') sp.set('offset', String(params.offset));
    if (params.status) sp.set('status', String(params.status));
    if (params.page_type) sp.set('page_type', String(params.page_type));
    const qs = sp.toString();
    return this.request(`/admin-hub/v1/pages${qs ? `?${qs}` : ''}`)
  }

  async getPage(id) {
    return this.request(`/admin-hub/v1/pages/${id}`)
  }

  async createPage(data) {
    return this.request('/admin-hub/v1/pages', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updatePage(id, data) {
    return this.request(`/admin-hub/v1/pages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deletePage(id) {
    return this.request(`/admin-hub/v1/pages/${id}`, { method: 'DELETE' })
  }

  /**
   * Orders (admin)
   */
  async getOrders(params = {}) {
    // Non-superusers only see their own orders
    const isSuperuser = typeof window !== 'undefined' && localStorage.getItem('sellerIsSuperuser') === 'true';
    const sellerId = typeof window !== 'undefined' ? localStorage.getItem('sellerId') : null;
    const filteredParams = { ...params };
    if (!isSuperuser && sellerId && !filteredParams.seller_id) {
      filteredParams.seller_id = sellerId;
    }
    const queryParams = new URLSearchParams(filteredParams).toString()
    return this.request(`/admin-hub/v1/orders${queryParams ? `?${queryParams}` : ''}`)
  }

  async getOrder(id) {
    return this.request(`/admin-hub/v1/orders/${id}`)
  }

  async updateOrder(id, data) {
    return this.request(`/admin-hub/v1/orders/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  async deleteOrder(id) {
    return this.request(`/admin-hub/v1/orders/${id}`, { method: 'DELETE' })
  }

  async getCustomers(params = {}) {
    const queryParams = new URLSearchParams(params).toString()
    return this.request(`/admin-hub/v1/customers${queryParams ? `?${queryParams}` : ''}`)
  }

  async getCustomerById(id) {
    return this.request(`/admin-hub/v1/customers/${encodeURIComponent(id)}`)
  }

  async createCustomer(data) {
    return this.request('/admin-hub/v1/customers', { method: 'POST', body: JSON.stringify(data) })
  }

  async updateCustomer(id, data) {
    return this.request(`/admin-hub/v1/customers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  async deleteCustomer(id) {
    return this.request(`/admin-hub/v1/customers/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async createCustomerDiscount(customerId, data) {
    return this.request(`/admin-hub/v1/customers/${encodeURIComponent(customerId)}/discounts`, {
      method: 'POST', body: JSON.stringify(data)
    })
  }

  async deleteCustomerDiscount(customerId, discountId) {
    return this.request(`/admin-hub/v1/customers/${encodeURIComponent(customerId)}/discounts/${encodeURIComponent(discountId)}`, {
      method: 'DELETE'
    })
  }

  async addCustomerBonusLedgerEntry(customerId, data) {
    return this.request(`/admin-hub/v1/customers/${encodeURIComponent(customerId)}/bonus-ledger`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    })
  }

  async updateCustomerBonusLedgerEntry(customerId, entryId, data) {
    return this.request(
      `/admin-hub/v1/customers/${encodeURIComponent(customerId)}/bonus-ledger/${encodeURIComponent(entryId)}`,
      { method: 'PATCH', body: JSON.stringify(data || {}) },
    )
  }

  async deleteCustomerBonusLedgerEntry(customerId, entryId) {
    return this.request(
      `/admin-hub/v1/customers/${encodeURIComponent(customerId)}/bonus-ledger/${encodeURIComponent(entryId)}`,
      { method: 'DELETE' },
    )
  }

  async createOrder(data) {
    return this.request('/admin-hub/v1/orders', { method: 'POST', body: JSON.stringify(data) })
  }

  async getCarriers() {
    return this.request('/admin-hub/v1/shipping-carriers').catch(() => ({ carriers: [] }))
  }

  async createCarrier(data) {
    return this.request('/admin-hub/v1/shipping-carriers', { method: 'POST', body: JSON.stringify(data) })
  }

  async updateCarrier(id, data) {
    return this.request(`/admin-hub/v1/shipping-carriers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  async deleteCarrier(id) {
    return this.request(`/admin-hub/v1/shipping-carriers/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async getIntegrations() {
    return this.request('/admin-hub/v1/integrations').catch(() => ({ integrations: [] }))
  }

  async saveIntegration(data) {
    return this.request('/admin-hub/v1/integrations', { method: 'POST', body: JSON.stringify(data) })
  }

  async updateIntegration(id, data) {
    return this.request(`/admin-hub/v1/integrations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  async deleteIntegration(id) {
    return this.request(`/admin-hub/v1/integrations/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async getAbandonedCarts() {
    return this.request('/admin-hub/v1/abandoned-carts')
  }

  async getReturns(params = {}) {
    const isSuperuser = typeof window !== 'undefined' && localStorage.getItem('sellerIsSuperuser') === 'true';
    const sellerId = typeof window !== 'undefined' ? localStorage.getItem('sellerId') : null;
    const p = { ...params };
    if (!isSuperuser && sellerId && !p.seller_id) p.seller_id = sellerId;
    const qs = Object.keys(p).length ? '?' + new URLSearchParams(p).toString() : '';
    return this.request(`/admin-hub/v1/returns${qs}`)
  }

  async createReturn(data) {
    return this.request('/admin-hub/v1/returns', { method: 'POST', body: JSON.stringify(data) })
  }

  async updateReturn(id, data) {
    return this.request(`/admin-hub/v1/returns/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  async approveReturn(id) {
    return this.updateReturn(id, { status: 'genehmigt' })
  }

  async rejectReturn(id) {
    return this.updateReturn(id, { status: 'abgelehnt' })
  }

  async refundReturn(id, { refund_amount_cents, refund_note }) {
    return this.updateReturn(id, { refund_amount_cents, refund_note, refund_status: 'erstattet' })
  }

  async sendReturnLabel(id) {
    return this.request(`/admin-hub/v1/returns/${id}/send-label`, { method: 'POST' })
  }

  async getNotificationsUnread() {
    const isSuperuser = typeof window !== 'undefined' && localStorage.getItem('sellerIsSuperuser') === 'true';
    const sellerId = typeof window !== 'undefined' ? localStorage.getItem('sellerId') : null;
    const qs = (!isSuperuser && sellerId) ? `?seller_id=${encodeURIComponent(sellerId)}` : '';
    return this.request(`/admin-hub/v1/notifications/unread${qs}`)
  }
  async markNotificationsSeen() {
    return this.request('/admin-hub/v1/notifications/mark-seen', { method: 'POST' })
  }
  async getMessages(params = {}) {
    const isSuperuser = typeof window !== 'undefined' && localStorage.getItem('sellerIsSuperuser') === 'true';
    const sellerId = typeof window !== 'undefined' ? localStorage.getItem('sellerId') : null;
    const p = { ...params };
    if (!isSuperuser && sellerId && !p.seller_id) p.seller_id = sellerId;
    const qs = Object.keys(p).length ? '?' + new URLSearchParams(p).toString() : '';
    return this.request(`/admin-hub/v1/messages${qs}`)
  }
  async getSupportMessages(params = {}) {
    const isSuperuser = typeof window !== 'undefined' && localStorage.getItem('sellerIsSuperuser') === 'true';
    const sellerId = typeof window !== 'undefined' ? localStorage.getItem('sellerId') : null;
    const p = { ...params, channel: 'support' };
    if (!isSuperuser && sellerId && !p.seller_id) p.seller_id = sellerId;
    const qs = Object.keys(p).length ? '?' + new URLSearchParams(p).toString() : '';
    return this.request(`/admin-hub/v1/messages${qs}`)
  }
  async sendMessage(data) {
    return this.request('/admin-hub/v1/messages', { method: 'POST', body: JSON.stringify(data) })
  }
  async sendSupportMessage(data) {
    return this.request('/admin-hub/v1/messages', { method: 'POST', body: JSON.stringify({ ...data, channel: 'support' }) })
  }
  async markMessageRead(id) {
    return this.request(`/admin-hub/v1/messages/${id}/read`, { method: 'PATCH' })
  }
  async markSupportMessagesRead(seller_id, mark_as) {
    return this.request('/admin-hub/v1/messages/support/mark-read', { method: 'PATCH', body: JSON.stringify({ seller_id, mark_as }) })
  }
  async getSmtpSettings() {
    return this.request('/admin-hub/v1/smtp-settings')
  }
  async updateSmtpSettings(data) {
    return this.request('/admin-hub/v1/smtp-settings', { method: 'PATCH', body: JSON.stringify(data) })
  }
  async testSmtpSettings() {
    return this.request('/admin-hub/v1/smtp-settings/test', { method: 'POST' })
  }
  async getTransactions(params = {}) {
    const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''
    return this.request(`/admin-hub/v1/transactions${qs}`)
  }
  async getPayouts(params = {}) {
    const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''
    return this.request(`/admin-hub/v1/payouts${qs}`)
  }
  async getPayoutSummary(params = {}) {
    const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''
    return this.request(`/admin-hub/v1/payout-summary${qs}`)
  }
  async getAdminPayoutOverview(params = {}) {
    const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''
    return this.request(`/admin-hub/v1/payout-overview${qs}`)
  }
  async markPayoutPaid(data) {
    return this.request('/admin-hub/v1/payouts/mark-paid', { method: 'POST', body: JSON.stringify(data) })
  }
  async createPayout(data) {
    return this.request('/admin-hub/v1/payouts', { method: 'POST', body: JSON.stringify(data) })
  }
  async updatePayout(id, data) {
    return this.request(`/admin-hub/v1/payouts/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }
  async getSellerProfile() {
    return this.request('/admin-hub/v1/seller/profile')
  }
  async updateSellerIban(iban) {
    return this.request('/admin-hub/v1/seller/iban', { method: 'PATCH', body: JSON.stringify({ iban }) })
  }
  async inviteUser(data) {
    return this.request('/admin-hub/users/invite', { method: 'POST', body: JSON.stringify(data) })
  }
  async getSubusers() {
    return this.request('/admin-hub/v1/subusers')
  }
  async updateSubuser(userId, data) {
    return this.request(`/admin-hub/v1/subusers/${userId}`, { method: 'PATCH', body: JSON.stringify(data) })
  }
  async deleteSubuser(userId) {
    return this.request(`/admin-hub/v1/subusers/${userId}`, { method: 'DELETE' })
  }
  async deletePendingInvite(inviteId) {
    return this.request(`/admin-hub/v1/pending-invites/${inviteId}`, { method: 'DELETE' })
  }

  // ── Seller Auth ─────────────────────────────────────────────────────────────
  async loginSeller(email, password) {
    return this.request('/admin-hub/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async registerSeller(email, password, storeName, extra = {}) {
    return this.request('/admin-hub/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, store_name: storeName, ...extra }),
    });
  }

  async getSellerMe() {
    return this.request('/admin-hub/auth/me');
  }

  async getSellerUsers() {
    return this.request('/admin-hub/users');
  }

  async createSellerUser(data) {
    return this.request('/admin-hub/users', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateSellerUser(userId, data) {
    return this.request(`/admin-hub/users/${userId}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteSellerUser(userId) {
    return this.request(`/admin-hub/users/${userId}`, { method: 'DELETE' });
  }

  async setSellerUserSuperuser(userId, isSuperuser) {
    return this.request(`/admin-hub/users/${userId}/superuser`, {
      method: 'PATCH',
      body: JSON.stringify({ is_superuser: isSuperuser }),
    });
  }

  // ── Seller Management (superuser) ─────────────────────────────────────────
  async getSellers(params = {}) {
    const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''
    return this.request(`/admin-hub/v1/sellers${qs}`)
  }

  async getSellerById(id) {
    return this.request(`/admin-hub/v1/sellers/${id}`)
  }

  async updateSellerById(id, data) {
    return this.request(`/admin-hub/v1/sellers/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  async approveSellerById(id, status, rejectionReason) {
    return this.request(`/admin-hub/v1/sellers/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ status, rejection_reason: rejectionReason }),
    })
  }

  async updateSellerCompanyInfo(data) {
    return this.request('/admin-hub/v1/seller/company-info', { method: 'PATCH', body: JSON.stringify(data) })
  }
}

// Singleton instance
let medusaAdminClient = null

export function getMedusaAdminClient() {
  if (!medusaAdminClient) {
    medusaAdminClient = new MedusaAdminClient()
  }
  return medusaAdminClient
}

export default MedusaAdminClient
