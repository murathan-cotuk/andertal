/**
 * Medusa Backend API Client
 * 
 * Medusa e-commerce backend'e bağlanmak için client
 * REST API kullanarak products, cart, orders yönetimi
 */

// Get Medusa backend URL from environment variable
// In production, this should be set to your deployed Medusa backend URL (e.g., Railway, Render)
const MEDUSA_BACKEND_URL = 
  typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000')
    : (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000')

class MedusaClient {
  constructor(baseURL = MEDUSA_BACKEND_URL) {
    this.baseURL = baseURL
  }
 
  /**
   * Generic API request helper
   */
  async request(endpoint, options = {}) {
    // Check if backend URL is available
    if (!this.baseURL || this.baseURL === 'http://localhost:9000') {
      // In production, if backend URL is not set, return empty response
      if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
        console.warn('Medusa backend URL not configured. Please set NEXT_PUBLIC_MEDUSA_BACKEND_URL environment variable.')
        throw new Error('Medusa backend not configured')
      }
    }

    const url = `${this.baseURL}${endpoint}`
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
    const queryParams = new URLSearchParams(params).toString()
    const res = await this.request(`/store/products${queryParams ? `?${queryParams}` : ''}`)
    if (res?.__error) return { products: [], count: 0 }
    return res
  }

  async getProduct(id) {
    const res = await this.request(`/store/products/${id}`)
    if (res?.__error) return { product: null }
    return res
  }

  /**
   * Cart
   */
  async createCart() {
    const res = await this.request('/store/carts', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if (res?.__error) return { cart: null }
    return res
  }

  async getCart(cartId) {
    if (!cartId) return { cart: null }
    const res = await this.request(`/store/carts/${cartId}`)
    if (res?.__error) return { cart: null }
    return res
  }

  async addToCart(cartId, variantId, quantity = 1) {
    const res = await this.request(`/store/carts/${cartId}/line-items`, {
      method: 'POST',
      body: JSON.stringify({
        variant_id: variantId,
        quantity,
      }),
    })
    if (res?.__error) return { cart: null }
    return res
  }

  async updateLineItem(cartId, lineId, quantity) {
    const res = await this.request(`/store/carts/${cartId}/line-items/${lineId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    })
    if (res?.__error) return { cart: null }
    return res
  }

  async removeLineItem(cartId, lineId) {
    const res = await this.request(`/store/carts/${cartId}/line-items/${lineId}`, {
      method: 'DELETE',
    })
    if (res?.__error) return { cart: null }
    return res
  }

  async clearCart(cartId) {
    const res = await this.request(`/store/carts/${cartId}/line-items`, {
      method: 'DELETE',
    })
    if (res?.__error) return { cart: null }
    return res
  }

  /** Bonus einlösen: 25 Punkte = 1 € Rabatt (nur mit Kunden-Token). */
  async patchStoreCart(cartId, body, authToken) {
    const headers = {}
    if (authToken) headers.Authorization = `Bearer ${authToken}`
    const res = await this.request(`/store/carts/${cartId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body || {}),
    })
    if (res?.__error) return { cart: null, ...res }
    return res
  }

  async updateCart(cartId, data) {
    const res = await this.request(`/store/carts/${cartId}`, {
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
    const res = await this.request(`/store/carts/${cartId}/complete`, {
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
      const response = await fetch(`${this.baseURL}/health`)
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
