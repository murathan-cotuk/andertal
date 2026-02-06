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
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    }

    try {
      const response = await fetch(url, config)
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }))
        throw new Error(error.message || `HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`Medusa API Error (${endpoint}):`, error)
      }
      const isFetchFailure = error.name === 'TypeError' || (error.message && String(error.message).includes('Failed to fetch'))
      if (isFetchFailure) {
        throw new Error('Medusa backend is not reachable. Ensure it is running and NEXT_PUBLIC_MEDUSA_BACKEND_URL is correct.')
      }
      throw error
    }
  }

  /**
   * Products
   */
  async getProducts(params = {}) {
    const queryParams = new URLSearchParams(params).toString()
    return this.request(`/store/products${queryParams ? `?${queryParams}` : ''}`)
  }

  async getProduct(id) {
    return this.request(`/store/products/${id}`)
  }

  /**
   * Cart
   */
  async createCart() {
    return this.request('/store/carts', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  }

  async getCart(cartId) {
    return this.request(`/store/carts/${cartId}`)
  }

  async addToCart(cartId, variantId, quantity = 1) {
    return this.request(`/store/carts/${cartId}/line-items`, {
      method: 'POST',
      body: JSON.stringify({
        variant_id: variantId,
        quantity,
      }),
    })
  }

  async updateCart(cartId, data) {
    return this.request(`/store/carts/${cartId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  /**
   * Orders
   */
  async createOrder(cartId, email) {
    return this.request(`/store/carts/${cartId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }

  async getOrder(id) {
    return this.request(`/store/orders/${id}`)
  }

  /**
   * Regions (for shipping)
   */
  async getRegions() {
    return this.request('/store/regions')
  }

  /**
   * Categories (storefront public). Options: { tree: true, is_visible: true }
   */
  async getCategories(options = {}) {
    const params = new URLSearchParams()
    if (options.tree === true) params.set('tree', 'true')
    if (options.is_visible !== undefined) params.set('is_visible', String(options.is_visible))
    const qs = params.toString()
    return this.request(`/store/categories${qs ? `?${qs}` : ''}`).catch(() => ({ categories: [], tree: [] }))
  }

  /**
   * Single category by slug (for collection page)
   */
  async getCategoryBySlug(slug) {
    if (!slug) return null
    const data = await this.request(`/store/categories?slug=${encodeURIComponent(slug)}`)
    return data.category || (data.categories && data.categories[0]) || null
  }

  /**
   * Customers
   */
  async registerCustomer(email, password, firstName, lastName) {
    return this.request('/store/customers', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
      }),
    })
  }

  async loginCustomer(email, password) {
    return this.request('/store/auth/token', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
      }),
    })
  }

  async getCustomer(token) {
    return this.request('/store/customers/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
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
