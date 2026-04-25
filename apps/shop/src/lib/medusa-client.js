/**
 * Medusa Backend API Client
 * 
 * Medusa e-commerce backend'e bağlanmak için client
 * REST API kullanarak products, cart, orders yönetimi
 */

export function resolveMedusaBaseUrl() {
  const envUrl = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").trim();
  const forceEnvInDev = String(process.env.NEXT_PUBLIC_MEDUSA_USE_ENV_IN_DEV || "").trim() === "true";
  if (typeof window !== "undefined") {
    const host = String(window.location?.hostname || "").trim().toLowerCase();
    const isLocalHost = host === "localhost" || host === "127.0.0.1";
    // In local browser development, default to local backend for login/signup consistency.
    // Set NEXT_PUBLIC_MEDUSA_USE_ENV_IN_DEV=true if you explicitly want to use env URL.
    if (isLocalHost && !forceEnvInDev) {
      return "http://localhost:9000";
    }
  }
  if (envUrl) return envUrl.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const host = String(window.location?.hostname || "").trim();
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      return `http://${host}:9000`;
    }
  }
  return "http://localhost:9000";
}

class MedusaClient {
  constructor(baseURL = null) {
    this.baseURL = (baseURL || "").replace(/\/$/, "")
  }

  async requestShopApi(endpoint, options = {}) {
    const url = endpoint;
    const { headers: optHeaders, ...restOptions } = options;
    const config = {
      ...restOptions,
      headers: {
        "Content-Type": "application/json",
        ...optHeaders,
      },
    };
    try {
      const response = await fetch(url, config);
      if (!response.ok) {
        let message = response.statusText || `HTTP ${response.status}`;
        try {
          const text = await response.text();
          if (text && text.trim().startsWith("{")) {
            const body = JSON.parse(text);
            message = body.message || body.error || body.msg || message;
          }
        } catch (_) {}
        if (process.env.NODE_ENV === "development") {
          console.warn(`[MedusaClient] ${response.status} ${endpoint}:`, message);
        }
        return { __error: true, status: response.status, message };
      }
      return await response.json();
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[MedusaClient] ${endpoint}:`, error?.message || error);
      }
      return { __error: true, status: 0, message: error?.message || "Network error" };
    }
  }

  inferMarketCountry() {
    if (typeof window === 'undefined') return 'DE'
    try {
      const parts = String(window.location?.pathname || '').split('/').filter(Boolean)
      const first = (parts[0] || '').toUpperCase()
      return /^[A-Z]{2}$/.test(first) ? first : 'DE'
    } catch (_) {
      return 'DE'
    }
  }
 
  /**
   * Generic API request helper
   */
  async request(endpoint, options = {}) {
    const base = this.baseURL || resolveMedusaBaseUrl();
    const url = `${base}${endpoint}`
    const { headers: optHeaders, ...restOptions } = options
    const config = {
      ...restOptions,
      headers: {
        'Content-Type': 'application/json',
        ...optHeaders,
      },
    }

    try {
      const response = await fetch(url, config)

      if (!response.ok) {
        let message = response.statusText || `HTTP ${response.status}`
        try {
          const text = await response.text()
          if (text && text.trim().startsWith('{')) {
            const body = JSON.parse(text)
            message = body.message || body.error || body.msg || message
          }
        } catch (_) {
          // ignore parse errors, use statusText
        }
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[MedusaClient] ${response.status} ${endpoint}:`, message)
        }
        return { __error: true, status: response.status, message }
      }

      return await response.json()
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[MedusaClient] ${endpoint}:`, error?.message || error)
      }
      return { __error: true, status: 0, message: error?.message || 'Network error' }
    }
  }

  /**
   * Products
   */
  async getProducts(params = {}) {
    const withCountry = { ...params }
    if (!withCountry.country) withCountry.country = this.inferMarketCountry()
    const queryParams = new URLSearchParams(withCountry).toString()
    const res = await this.request(`/store/products${queryParams ? `?${queryParams}` : ''}`)
    if (res?.__error) return { products: [], count: 0 }
    return res
  }

  async getProduct(id) {
    const key = String(id ?? '').trim()
    if (!key) return { product: null }
    const q = new URLSearchParams({ country: this.inferMarketCountry() }).toString()
    const res = await this.request(`/store/products/${encodeURIComponent(key)}?${q}`)
    if (res?.__error) return { product: null }
    return res
  }

  /**
   * Cart
   */
  async createCart() {
    const res = await this.requestShopApi('/api/store-carts', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if (res?.__error) return { cart: null }
    return res
  }

  async getCart(cartId) {
    if (!cartId) return { cart: null }
    const res = await this.requestShopApi(`/api/store-carts/${encodeURIComponent(cartId)}?expand=items.variant.product`)
    if (res?.__error) return { cart: null }
    return res
  }

  async addToCart(cartId, variantId, quantity = 1, sellerId = null) {
    const body = { variant_id: variantId, quantity }
    if (sellerId) body.seller_id = sellerId
    const res = await this.requestShopApi(`/api/store-carts/${encodeURIComponent(cartId)}/line-items`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (res?.__error) return { cart: null }
    return this.getCart(cartId)
  }

  async updateLineItem(cartId, lineId, quantity) {
    const res = await this.requestShopApi(`/api/store-carts/${encodeURIComponent(cartId)}/line-items/${encodeURIComponent(lineId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    })
    if (res?.__error) return { cart: null }
    return this.getCart(cartId)
  }

  async removeLineItem(cartId, lineId) {
    const res = await this.requestShopApi(`/api/store-carts/${encodeURIComponent(cartId)}/line-items/${encodeURIComponent(lineId)}`, {
      method: 'DELETE',
    })
    if (res?.__error) return { cart: null }
    return this.getCart(cartId)
  }

  async clearCart(cartId) {
    const res = await this.requestShopApi(`/api/store-carts/${encodeURIComponent(cartId)}/line-items`, {
      method: 'DELETE',
    })
    if (res?.__error) return { cart: null }
    return this.getCart(cartId)
  }

  /** Bonus einlösen: 25 Punkte = 1 € Rabatt (nur mit Kunden-Token). */
  async patchStoreCart(cartId, body, authToken) {
    const headers = {}
    if (authToken) headers.Authorization = `Bearer ${authToken}`
    const res = await this.requestShopApi(`/api/store-carts/${encodeURIComponent(cartId)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body || {}),
    })
    if (res?.__error) return { cart: null, ...res }
    return res
  }

  async updateCart(cartId, data) {
    const res = await this.requestShopApi(`/api/store-carts/${encodeURIComponent(cartId)}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (res?.__error) return { cart: null }
    return res
  }

  /**
   * Orders
   */
  async createOrder(cartId, email) {
    const res = await this.requestShopApi(`/api/store-carts/${encodeURIComponent(cartId)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
    if (res?.__error) return { order: null }
    return res
  }

  async getOrder(id) {
    const res = await this.request(`/store/orders/${id}`)
    if (res?.__error) return null
    return res
  }

  /**
   * Regions (for shipping)
   */
  async getRegions() {
    const res = await this.request('/store/regions')
    if (res?.__error) return { regions: [] }
    return res
  }

  /**
   * Store menu locations (where menus appear: main, subnav, footer). Used to resolve which menu shows in subnav (html_id=subnav).
   */
  async getMenuLocations() {
    const res = await this.request('/store/menu-locations')
    if (res?.__error) return { locations: [] }
    return { locations: res.locations || [] }
  }

  /**
   * Store menüler (Navbar). GET /store/menus. Options: { location: 'main' }
   */
  async getMenus(options = {}) {
    const params = new URLSearchParams()
    if (options.location) params.set('location', options.location)
    const qs = params.toString()
    const res = await this.request(`/store/menus${qs ? `?${qs}` : ''}`)
    if (res?.__error) return { menus: [], count: 0 }
    return res
  }

  async getCollections() {
    const res = await this.request('/store/collections')
    if (res?.__error) return { collections: [] }
    return res
  }

  /**
   * Single collection by handle (for collection page). 404 if not found.
   */
  async getCollectionByHandle(handle) {
    if (!handle) return { collection: null }
    const res = await this.request(`/store/collections?handle=${encodeURIComponent(handle)}`)
    if (res?.__error) return { collection: null }
    return res
  }

  /**
   * Categories (storefront public). Options: { tree: true, is_visible: true }
   */
  async getCategories(options = {}) {
    const params = new URLSearchParams()
    if (options.tree === true) params.set('tree', 'true')
    if (options.is_visible !== undefined) params.set('is_visible', String(options.is_visible))
    const qs = params.toString()
    const res = await this.request(`/store/categories${qs ? `?${qs}` : ''}`)
    if (res?.__error) return { categories: [], tree: [] }
    return res
  }

  /**
   * Single category by slug (for collection page)
   */
  async getCategoryBySlug(slug) {
    if (!slug) return null
    const data = await this.request(`/store/categories?slug=${encodeURIComponent(slug)}`)
    if (data?.__error) return null
    return data.category || (data.categories && data.categories[0]) || null
  }

  /**
   * Customers
   */
  async registerCustomer(email, password, firstName, lastName, extra = {}) {
    const res = await this.request('/store/customers', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        ...extra,
      }),
    })
    if (res?.__error) throw new Error(res.message || 'Registrierung fehlgeschlagen')
    return res
  }

  async loginCustomer(email, password) {
    const res = await this.request('/store/auth/token', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
      }),
    })
    if (res?.__error) return { token: null }
    return res
  }

  async getCustomer(token) {
    const res = await this.request('/store/customers/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    if (res?.__error) return null
    return res
  }

  async updateCustomerMe(token, data) {
    const res = await this.request('/store/customers/me', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    })
    if (res?.__error) throw new Error(res.message || 'Update failed')
    return res
  }

  async getWishlist(token) {
    const res = await this.request('/store/wishlist', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res?.__error) return { items: [] }
    return res
  }

  async addWishlistProduct(token, productId) {
    return this.request('/store/wishlist', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ product_id: productId }),
    })
  }

  async removeWishlistProduct(token, productId) {
    return this.request(`/store/wishlist/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  }

  async getCustomerAddresses(token) {
    const res = await this.request('/store/customers/me/addresses', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res?.__error) return { addresses: [] }
    return res
  }

  async createCustomerAddress(token, data) {
    const d = data || {}
    const line1 = (d.address_line1 ?? d.line1 ?? d.street ?? d.address1 ?? '')
    const payload = {
      label: d.label != null ? d.label : null,
      address_line1: typeof line1 === 'string' ? line1.trim() : String(line1 || '').trim(),
      address_line2: d.address_line2 != null ? String(d.address_line2).trim() || null : null,
      zip_code: d.zip_code != null ? String(d.zip_code).trim() || null : null,
      city: d.city != null ? String(d.city).trim() || null : null,
      country: (d.country != null ? String(d.country).trim() : null) || 'DE',
      is_default_shipping: d.is_default_shipping === true,
      is_default_billing: d.is_default_billing === true,
    }
    const res = await this.request('/store/customers/me/addresses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    if (res?.__error) throw new Error(res.message || 'Adresse speichern fehlgeschlagen')
    return res
  }

  async updateCustomerAddress(token, addressId, data) {
    const res = await this.request(`/store/customers/me/addresses/${encodeURIComponent(addressId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    })
    if (res?.__error) throw new Error(res.message || 'Update failed')
    return res
  }

  async deleteCustomerAddress(token, addressId) {
    const res = await this.request(`/store/customers/me/addresses/${encodeURIComponent(addressId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res?.__error) throw new Error(res.message || 'Delete failed')
    return res
  }

  /**
   * Store pages (CMS, published only)
   */
  async getPages() {
    const res = await this.request('/store/pages')
    if (res?.__error) return { pages: [], count: 0 }
    return res
  }

  async getPageBySlug(slug) {
    if (!slug) return null
    const res = await this.request(`/store/pages/${encodeURIComponent(slug)}`)
    if (res?.__error) return null
    return res
  }

  /**
   * Health check
   */
  async health() {
    try {
      const base = this.baseURL || resolveMedusaBaseUrl();
      const response = await fetch(`${base}/health`)
      return response.ok
    } catch {
      return false
    }
  }
}

// Singleton instance
let medusaClient = null

export function getMedusaClient() {
  if (!medusaClient) {
    medusaClient = new MedusaClient()
  }
  return medusaClient
}

export default MedusaClient
