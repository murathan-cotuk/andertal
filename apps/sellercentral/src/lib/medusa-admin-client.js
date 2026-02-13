/**
 * Medusa Admin API Client for Sellercentral
 * 
 * Sellercentral'dan Medusa backend'e product eklemek için REST API client
 */

const getDefaultBaseUrl = () => {
  const env = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || '';
  const url = (typeof env === 'string' ? env : '').trim();
  if (url) return url;
  return typeof window !== 'undefined'
    ? 'http://localhost:9000'
    : 'https://belucha-medusa-backend.onrender.com';
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
    const base = this.baseURL || getDefaultBaseUrl();
    const url = `${base}${endpoint}`;

    if (!url || url.startsWith('undefined')) {
      const err = new Error('Backend URL is not set. Set NEXT_PUBLIC_MEDUSA_BACKEND_URL (e.g. https://belucha-medusa-backend.onrender.com).');
      console.error('Medusa Admin API Error:', err.message);
      throw err;
    }

    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      const isNetworkError = error?.message === 'Failed to fetch' || error?.name === 'TypeError';
      const friendlyMessage = isNetworkError
        ? `Backend unreachable at ${base}. Check NEXT_PUBLIC_MEDUSA_BACKEND_URL and that the backend is running (e.g. Render).`
        : error?.message;
      console.error(`Medusa Admin API Error (${endpoint}):`, error);
      throw new Error(friendlyMessage);
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
   * Admin Hub Categories (Platform owner managed)
   * Backend: GET /admin-hub/categories veya GET /admin-hub/v1/categories
   * Vercel'da NEXT_PUBLIC_MEDUSA_BACKEND_URL = https://belucha-medusa-backend.onrender.com olmalı.
   */
  async getAdminHubCategories(filters = {}) {
    const queryParams = new URLSearchParams({
      active: 'true',
      ...filters,
    }).toString()
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
