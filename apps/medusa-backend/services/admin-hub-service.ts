/**
 * Admin Hub Service
 *
 * Kategoriler, bannerlar ve admin-only verileri yönetir.
 * Medusa core'dan bağımsız, platform sahibi için özel.
 */

import { EntityManager, Repository } from "typeorm"
import { AdminHubCategory } from "../models/admin-hub-category"
import { AdminHubBanner } from "../models/admin-hub-banner"
import { AdminHubBrand } from "../models/admin-hub-brand"

type InjectedDependencies = {
  manager: EntityManager
  productCollectionService?: any // Medusa ProductCollectionService (optional)
}

export default class AdminHubService {
  protected readonly manager_: EntityManager
  protected readonly categoryRepository_: Repository<AdminHubCategory>
  protected readonly bannerRepository_: Repository<AdminHubBanner>
  protected readonly brandRepository_: Repository<AdminHubBrand>
  protected readonly productCollectionService_?: any

  constructor(container: InjectedDependencies) {
    this.manager_ = container.manager
    this.categoryRepository_ = this.manager_.getRepository(AdminHubCategory)
    this.bannerRepository_ = this.manager_.getRepository(AdminHubBanner)
    this.brandRepository_ = this.manager_.getRepository(AdminHubBrand)
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
    seo_title?: string | null
    seo_description?: string | null
    long_content?: string | null
    banner_image_url?: string | null
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
      seo_title: data.seo_title ?? null,
      seo_description: data.seo_description ?? null,
      long_content: data.long_content ?? null,
      banner_image_url: data.banner_image_url ?? null,
      metadata: data.metadata || null,
    })

    const savedCategory = await this.categoryRepository_.save(category)

    // If has_collection is true, sync with Medusa collection (best-effort; never fail the create)
    if (savedCategory.has_collection) {
      try {
        await this.syncCollectionForCategory(savedCategory)
      } catch (e) {
        console.warn("Collection sync skipped for new category:", (e as Error)?.message)
      }
    }

    return savedCategory
  }

  /** Generate URL-safe slug from hierarchical key (e.g. "Appliances|Dishwashers" -> "appliances-dishwashers"). Max 255 chars. */
  private slugFromKey_(key: string): string {
    const slug = key
      .toLowerCase()
      .trim()
      .replace(/\|/g, "-")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "category"
    return slug.slice(0, 255)
  }

  /**
   * Bulk import categories from a flat list with parent_key.
   * Each item: { key, label, parentKey, sortOrder }. Creates in order so parent exists before child.
   */
  async importCategories(
    items: Array<{ key: string; label: string; parentKey: string; sortOrder: number }>
  ): Promise<{ imported: number; categories: AdminHubCategory[] }> {
    const idByKey = new Map<string, string>()
    const categories: AdminHubCategory[] = []
    const slugCount = new Map<string, number>()

    const ensureUniqueSlug = (baseSlug: string): string => {
      const count = slugCount.get(baseSlug) ?? 0
      slugCount.set(baseSlug, count + 1)
      return count === 0 ? baseSlug : `${baseSlug}-${count}`
    }

    for (const item of items) {
      const baseSlug = this.slugFromKey_(item.key)
      const slug = ensureUniqueSlug(baseSlug)
      const parent_id = item.parentKey === "" ? null : idByKey.get(item.parentKey) ?? null

      const category = await this.createCategory({
        name: item.label,
        slug,
        parent_id,
        sort_order: item.sortOrder,
        active: true,
        is_visible: true,
        has_collection: false,
      })
      idByKey.set(item.key, category.id)
      categories.push(category)
    }

    return { imported: categories.length, categories }
  }

  async listCategories(filters?: {
    active?: boolean
    parent_id?: string | null
    is_visible?: boolean
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
    if (filters?.is_visible !== undefined) {
      query.andWhere("category.is_visible = :is_visible", { is_visible: filters.is_visible })
    }

    query.orderBy("category.sort_order", "ASC")
    query.addOrderBy("category.name", "ASC")

    return await query.getMany()
  }

  async getCategoryById(id: string): Promise<AdminHubCategory | null> {
    return await this.categoryRepository_.findOne({
      where: { id },
      relations: ["parent"],
    })
  }

  async getCategoryBySlug(slug: string): Promise<AdminHubCategory | null> {
    return await this.categoryRepository_.findOne({
      where: { slug },
      relations: ["parent"],
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
      seo_title: string | null
      seo_description: string | null
      long_content: string | null
      banner_image_url: string | null
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

    // If a parent category is deactivated, cascade deactivate all descendants.
    // Products remain linked, but deactivated categories must disappear from all selectors/menus.
    if (data.active === false) {
      await this.deactivateDescendants_(savedCategory.id)
    }

    // Sync collection if has_collection changed or slug/name changed (best-effort; never fail the update)
    try {
      if (savedCategory.has_collection !== oldHasCollection) {
        if (savedCategory.has_collection) {
          await this.syncCollectionForCategory(savedCategory)
        }
      } else if (savedCategory.has_collection && (data.slug || data.name)) {
        await this.syncCollectionForCategory(savedCategory)
      }
    } catch (e) {
      console.warn("Collection sync skipped on update:", (e as Error)?.message)
    }

    return savedCategory
  }

  private async deactivateDescendants_(parentId: string): Promise<void> {
    const queue = [parentId]
    const visited = new Set<string>()
    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)
      const children = await this.categoryRepository_.find({ where: { parent_id: current } })
      if (!children.length) continue
      for (const child of children) {
        if (child.active !== false) {
          child.active = false
          await this.categoryRepository_.save(child)
        }
        queue.push(child.id)
      }
    }
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
   * Sync Medusa collection for category.
   * - If metadata.collection_id is set: update that collection's title (manual link).
   * - Else: create or update by title "Parent > Child" (or "Name" for root), handle = parentSlug-childSlug or slug.
   */
  private async syncCollectionForCategory(category: AdminHubCategory): Promise<void> {
    if (!this.productCollectionService_) {
      console.warn("⚠️  ProductCollectionService not available, skipping collection sync")
      return
    }

    try {
      const collectionTitle = category.parent_id
        ? await this.getCollectionTitleForCategory(category)
        : category.name
      const handle = category.parent_id
        ? await this.getCollectionHandleForCategory(category)
        : category.slug

      const existingId = category.metadata?.collection_id as string | undefined
      if (existingId) {
        await this.productCollectionService_.update(existingId, {
          title: collectionTitle,
          handle,
        })
        console.log(`✅ Collection updated (linked) for category: ${category.name}`)
        return
      }

      const existingCollections = await this.productCollectionService_.list({ handle })
      if (existingCollections && existingCollections.length > 0) {
        const collection = existingCollections[0]
        await this.productCollectionService_.update(collection.id, {
          title: collectionTitle,
          handle,
        })
        if (!category.metadata) (category as any).metadata = {}
        ;(category as any).metadata.collection_id = collection.id
        await this.categoryRepository_.save(category)
        console.log(`✅ Collection updated for category: ${category.name}`)
      } else {
        const created = await this.productCollectionService_.create({
          title: collectionTitle,
          handle,
        })
        const createdId = Array.isArray(created) ? created[0]?.id : (created as any)?.id
        if (createdId) {
          if (!category.metadata) (category as any).metadata = {}
          ;(category as any).metadata.collection_id = createdId
          await this.categoryRepository_.save(category)
        }
        console.log(`✅ Collection created for category: ${category.name} (${collectionTitle})`)
      }
    } catch (error) {
      console.error(`❌ Failed to sync collection for category ${category.name}:`, (error as Error).message)
    }
  }

  private async getCollectionTitleForCategory(category: AdminHubCategory): Promise<string> {
    if (!category.parent_id) return category.name
    const parent = await this.categoryRepository_.findOne({ where: { id: category.parent_id } })
    return parent ? `${parent.name} > ${category.name}` : category.name
  }

  private async getCollectionHandleForCategory(category: AdminHubCategory): Promise<string> {
    if (!category.parent_id) return category.slug
    const parent = await this.categoryRepository_.findOne({ where: { id: category.parent_id } })
    const parentSlug = parent?.slug || "parent"
    return `${parentSlug}-${category.slug}`
  }

  async deleteCategory(id: string): Promise<void> {
    const category = await this.categoryRepository_.findOne({ where: { id } })

    if (!category) {
      throw new Error(`Category with id ${id} not found`)
    }

    // Children is not a TypeORM relation on entity; check by parent_id
    const childCount = await this.categoryRepository_.count({ where: { parent_id: id } })
    if (childCount > 0) {
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

  // ============================================
  // BRAND METHODS
  // ============================================

  async listBrands(): Promise<AdminHubBrand[]> {
    return await this.brandRepository_.find({
      order: { name: "ASC" },
    })
  }

  async getBrandById(id: string): Promise<AdminHubBrand | null> {
    return await this.brandRepository_.findOne({ where: { id } })
  }

  async createBrand(data: {
    name: string
    handle: string
    logo_image?: string | null
    banner_image?: string | null
    address?: string | null
    metadata?: Record<string, any>
  }): Promise<AdminHubBrand> {
    const brand = this.brandRepository_.create({
      name: data.name,
      handle: data.handle,
      logo_image: data.logo_image ?? null,
      banner_image: data.banner_image ?? null,
      address: data.address ?? null,
      metadata: data.metadata ?? null,
    })
    return await this.brandRepository_.save(brand)
  }

  async updateBrand(
    id: string,
    data: Partial<{
      name: string
      handle: string
      logo_image: string | null
      banner_image: string | null
      address: string | null
      metadata: Record<string, any>
    }>
  ): Promise<AdminHubBrand> {
    const brand = await this.brandRepository_.findOne({ where: { id } })
    if (!brand) {
      throw new Error(`Brand with id ${id} not found`)
    }
    Object.assign(brand, data)
    return await this.brandRepository_.save(brand)
  }

  async deleteBrand(id: string): Promise<void> {
    const brand = await this.brandRepository_.findOne({ where: { id } })
    if (!brand) {
      throw new Error(`Brand with id ${id} not found`)
    }
    await this.brandRepository_.remove(brand)
  }
}
