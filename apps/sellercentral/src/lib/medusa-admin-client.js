/**
 * Medusa Admin API Client for Sellercentral
 * 
 * Sellercentral'dan Medusa backend'e product eklemek için REST API client
 */

const MEDUSA_BACKEND_URL = 
  typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000')
    : (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000')

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
   * Product Categories (Medusa Core - deprecated, use Admin Hub)
   */
  async getCategories() {
    return this.request('/admin/product-categories')
  }

  async createCategory(data) {
    return this.request('/admin/product-categories', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  /**
   * Admin Hub Categories (Platform owner managed)
   */
  async getAdminHubCategories() {
    return this.request('/admin-hub/categories?active=true')
  }

  /**
   * Get collections with collection pages (has_collection = true)
   */
  async getCollections() {
    const data = await this.request('/admin-hub/categories?active=true')
    // Filter only categories that have collection pages
    const collections = (data.categories || []).filter(cat => cat.has_collection === true)
    return { collections, count: collections.length }
  }

  /**
   * Medusa Collections (native)
   */
  async getMedusaCollections() {
    return this.request('/admin/collections')
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
