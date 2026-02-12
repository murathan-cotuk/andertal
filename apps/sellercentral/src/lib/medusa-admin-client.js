/**
 * Medusa Admin API Client for Sellercentral
 * 
 * Sellercentral'dan Medusa backend'e product eklemek için REST API client
 */

const MEDUSA_BACKEND_URL = 
  typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000')
    : (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'https://belucha-medusa-backend.onrender.com')

class MedusaAdminClient {
  constructor(baseURL = MEDUSA_BACKEND_URL) {
    this.baseURL = baseURL
  }
 
  /**
   * Generic API request helper
   */
  async request(endpoint, options = {}) {
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
      console.error(`Medusa Admin API Error (${endpoint}):`, error)
      throw error
    }
  }

  /**
   * Products
   */
  async getProducts(params = {}) {
    const queryParams = new URLSearchParams(params).toString()
    return this.request(`/admin/products${queryParams ? `?${queryParams}` : ''}`)
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
   * Admin Hub Categories (Platform owner managed - SINGLE SOURCE OF TRUTH)
   * Backend: GET /admin-hub/v1/categories veya GET /admin-hub/categories
   */
  async getAdminHubCategories(filters = {}) {
    const queryParams = new URLSearchParams({
      active: 'true',
      ...filters,
    }).toString()
    const pathV1 = `/admin-hub/v1/categories?${queryParams}`
    const pathLegacy = `/admin-hub/categories?${queryParams}`
    try {
      return await this.request(pathV1)
    } catch (err) {
      if (err.message && err.message.includes('404') && pathV1 !== pathLegacy) {
        return await this.request(pathLegacy)
      }
      throw err
    }
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
   * Create Admin Hub category (POST)
   */
  async createAdminHubCategory(data) {
    return this.request('/admin-hub/v1/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    })
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
   * Medusa Collections (native)
   */
  async getMedusaCollections() {
    return this.request('/admin/collections')
  }

  /**
   * Orders (admin)
   */
  async getOrders(params = {}) {
    const queryParams = new URLSearchParams(params).toString()
    return this.request(`/admin/orders${queryParams ? `?${queryParams}` : ''}`)
  }

  async getOrder(id) {
    return this.request(`/admin/orders/${id}`)
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
