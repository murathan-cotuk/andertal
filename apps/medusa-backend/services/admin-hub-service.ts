/**
 * Admin Hub Service
 *
 * Kategoriler, bannerlar ve admin-only verileri yönetir.
 * Medusa core'dan bağımsız, platform sahibi için özel.
 */

import { EntityManager, Repository } from "typeorm"
import { AdminHubCategory } from "../models/admin-hub-category"
import { AdminHubBanner } from "../models/admin-hub-banner"

type InjectedDependencies = {
  manager: EntityManager
  productCollectionService?: any // Medusa ProductCollectionService (optional)
}

export default class AdminHubService {
  protected readonly manager_: EntityManager
  protected readonly categoryRepository_: Repository<AdminHubCategory>
  protected readonly bannerRepository_: Repository<AdminHubBanner>
  protected readonly productCollectionService_?: any

  constructor(container: InjectedDependencies) {
    this.manager_ = container.manager
    this.categoryRepository_ = this.manager_.getRepository(AdminHubCategory)
    this.bannerRepository_ = this.manager_.getRepository(AdminHubBanner)
    this.productCollectionService_ = container.productCollectionService
  }

  // ============================================
  // CATEGORY METHODS
  // ============================================

  async createCategory(data: {
    name: string
    slug: string
    description?: string
    parent_id?: string | null
    active?: boolean
    is_visible?: boolean
    has_collection?: boolean
    sort_order?: number
    metadata?: Record<string, any>
  }): Promise<AdminHubCategory> {
    const category = this.categoryRepository_.create({
      name: data.name,
      slug: data.slug,
      description: data.description || null,
      parent_id: data.parent_id || null,
      active: data.active !== undefined ? data.active : true,
      is_visible: data.is_visible !== undefined ? data.is_visible : true,
      has_collection: data.has_collection !== undefined ? data.has_collection : false,
      sort_order: data.sort_order || 0,
      metadata: data.metadata || null,
    })

    const savedCategory = await this.categoryRepository_.save(category)

    // If has_collection is true, sync with Medusa collection
    if (savedCategory.has_collection) {
      await this.syncCollectionForCategory(savedCategory)
    }

    return savedCategory
  }

  async listCategories(filters?: {
    active?: boolean
    parent_id?: string | null
  }): Promise<AdminHubCategory[]> {
    const query = this.categoryRepository_.createQueryBuilder("category")

    if (filters?.active !== undefined) {
      query.andWhere("category.active = :active", { active: filters.active })
    }

    if (filters?.parent_id !== undefined) {
      if (filters.parent_id === null) {
        query.andWhere("category.parent_id IS NULL")
      } else {
        query.andWhere("category.parent_id = :parent_id", { parent_id: filters.parent_id })
      }
    }

    query.orderBy("category.sort_order", "ASC")
    query.addOrderBy("category.name", "ASC")

    return await query.getMany()
  }

  async getCategoryById(id: string): Promise<AdminHubCategory | null> {
    return await this.categoryRepository_.findOne({
      where: { id },
      relations: ["parent", "children"],
    })
  }

  async getCategoryBySlug(slug: string): Promise<AdminHubCategory | null> {
    return await this.categoryRepository_.findOne({
      where: { slug },
      relations: ["parent", "children"],
    })
  }

  async updateCategory(
    id: string,
    data: Partial<{
      name: string
      slug: string
      description: string
      parent_id: string | null
      active: boolean
      is_visible: boolean
      has_collection: boolean
      sort_order: number
      metadata: Record<string, any>
    }>
  ): Promise<AdminHubCategory> {
    const category = await this.categoryRepository_.findOne({ where: { id } })
    if (!category) {
      throw new Error(`Category with id ${id} not found`)
    }

    const oldHasCollection = category.has_collection
    Object.assign(category, data)
    const savedCategory = await this.categoryRepository_.save(category)

    // Sync collection if has_collection changed
    if (savedCategory.has_collection !== oldHasCollection) {
      if (savedCategory.has_collection) {
        await this.syncCollectionForCategory(savedCategory)
      } else {
        // Optionally remove collection (or just leave it)
        // await this.removeCollectionForCategory(savedCategory)
      }
    } else if (savedCategory.has_collection && (data.slug || data.name)) {
      // If slug or name changed, update collection
      await this.syncCollectionForCategory(savedCategory)
    }

    return savedCategory
  }

  /**
   * Build category tree from flat list
   */
  async getCategoryTree(filters?: { is_visible?: boolean }): Promise<AdminHubCategory[]> {
    const allCategories = await this.listCategories({ active: true })
    
    // Filter by is_visible if specified
    let filtered = allCategories
    if (filters?.is_visible !== undefined) {
      filtered = allCategories.filter(cat => cat.is_visible === filters.is_visible)
    }

    // Build tree structure
    const categoryMap = new Map<string, AdminHubCategory>()
    const rootCategories: AdminHubCategory[] = []

    // First pass: create map
    filtered.forEach(cat => {
      categoryMap.set(cat.id, { ...cat, children: [] })
    })

    // Second pass: build tree
    filtered.forEach(cat => {
      const categoryNode = categoryMap.get(cat.id)!
      if (cat.parent_id && categoryMap.has(cat.parent_id)) {
        const parent = categoryMap.get(cat.parent_id)!
        if (!parent.children) {
          parent.children = []
        }
        parent.children.push(categoryNode)
      } else {
        rootCategories.push(categoryNode)
      }
    })

    // Sort by sort_order
    const sortCategories = (cats: AdminHubCategory[]): AdminHubCategory[] => {
      return cats
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(cat => ({
          ...cat,
          children: cat.children ? sortCategories(cat.children) : [],
        }))
    }

    return sortCategories(rootCategories)
  }

  /**
   * Sync Medusa collection for category
   * Creates or updates Medusa collection with handle = category.slug
   */
  private async syncCollectionForCategory(category: AdminHubCategory): Promise<void> {
    if (!this.productCollectionService_) {
      console.warn("⚠️  ProductCollectionService not available, skipping collection sync")
      return
    }

    try {
      // Check if collection exists
      const existingCollections = await this.productCollectionService_.list({
        handle: category.slug,
      })

      if (existingCollections && existingCollections.length > 0) {
        // Update existing collection
        const collection = existingCollections[0]
        await this.productCollectionService_.update(collection.id, {
          title: category.name,
          handle: category.slug,
        })
        console.log(`✅ Collection updated for category: ${category.name}`)
      } else {
        // Create new collection
        await this.productCollectionService_.create({
          title: category.name,
          handle: category.slug,
        })
        console.log(`✅ Collection created for category: ${category.name}`)
      }
    } catch (error) {
      console.error(`❌ Failed to sync collection for category ${category.name}:`, error.message)
      // Don't throw - collection sync is optional
    }
  }

  async deleteCategory(id: string): Promise<void> {
    const category = await this.categoryRepository_.findOne({
      where: { id },
      relations: ["children"],
    })

    if (!category) {
      throw new Error(`Category with id ${id} not found`)
    }

    // Check if category has children
    if (category.children && category.children.length > 0) {
      throw new Error("Cannot delete category with children. Delete or move children first.")
    }

    await this.categoryRepository_.remove(category)
  }

  // ============================================
  // BANNER METHODS
  // ============================================

  async createBanner(data: {
    title: string
    image_url: string
    link?: string | null
    position?: string
    active?: boolean
    sort_order?: number
    start_date?: Date | null
    end_date?: Date | null
    metadata?: Record<string, any>
  }): Promise<AdminHubBanner> {
    const banner = this.bannerRepository_.create({
      title: data.title,
      image_url: data.image_url,
      link: data.link || null,
      position: data.position || "home",
      active: data.active !== undefined ? data.active : true,
      sort_order: data.sort_order || 0,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      metadata: data.metadata || null,
    })

    return await this.bannerRepository_.save(banner)
  }

  async listBanners(filters?: {
    active?: boolean
    position?: string
  }): Promise<AdminHubBanner[]> {
    const query = this.bannerRepository_.createQueryBuilder("banner")

    if (filters?.active !== undefined) {
      query.andWhere("banner.active = :active", { active: filters.active })
    }

    if (filters?.position) {
      query.andWhere("banner.position = :position", { position: filters.position })
    }

    // Filter by date range if applicable
    const now = new Date()
    query.andWhere(
      "(banner.start_date IS NULL OR banner.start_date <= :now)",
      { now }
    )
    query.andWhere(
      "(banner.end_date IS NULL OR banner.end_date >= :now)",
      { now }
    )

    query.orderBy("banner.sort_order", "ASC")
    query.addOrderBy("banner.created_at", "DESC")

    return await query.getMany()
  }

  async getBannerById(id: string): Promise<AdminHubBanner | null> {
    return await this.bannerRepository_.findOne({ where: { id } })
  }

  async updateBanner(
    id: string,
    data: Partial<{
      title: string
      image_url: string
      link: string | null
      position: string
      active: boolean
      sort_order: number
      start_date: Date | null
      end_date: Date | null
      metadata: Record<string, any>
    }>
  ): Promise<AdminHubBanner> {
    const banner = await this.bannerRepository_.findOne({ where: { id } })
    if (!banner) {
      throw new Error(`Banner with id ${id} not found`)
    }

    Object.assign(banner, data)
    return await this.bannerRepository_.save(banner)
  }

  async deleteBanner(id: string): Promise<void> {
    const banner = await this.bannerRepository_.findOne({ where: { id } })
    if (!banner) {
      throw new Error(`Banner with id ${id} not found`)
    }

    await this.bannerRepository_.remove(banner)
  }
}
