/**
 * Region Service (Medusa v2 Native)
 *
 * Repository pattern kullanıyor, TypeORM manager ile çalışır.
 * Raw SQL yok.
 */

import { EntityManager, Repository } from "typeorm"
import { Region } from "../models/region"
import { ProductRegion } from "../models/product-region"

type InjectedDependencies = {
  manager: EntityManager
}

export default class RegionService {
  protected readonly manager_: EntityManager
  protected readonly regionRepository_: Repository<Region>
  protected readonly productRegionRepository_: Repository<ProductRegion>

  constructor(container: InjectedDependencies) {
    this.manager_ = container.manager
    this.regionRepository_ = this.manager_.getRepository(Region)
    this.productRegionRepository_ = this.manager_.getRepository(ProductRegion)
  }

  /**
   * Yeni region oluştur
   */
  async createRegion(data: { name: string; code: string; currency_code: string }): Promise<Region> {
    const { name, code, currency_code } = data

    if (!name || !code || !currency_code) {
      throw new Error("name, code ve currency_code zorunludur")
    }

    // Code unique kontrolü
    const existing = await this.getRegionByCode(code.toUpperCase())
    if (existing) {
      throw new Error(`Region with code ${code} already exists`)
    }

    // Region oluştur
    const region = this.regionRepository_.create({
      name,
      code: code.toUpperCase(),
      currency_code: currency_code.toUpperCase(),
    })

    return await this.regionRepository_.save(region)
  }

  /**
   * Tüm region'ları listele
   */
  async listRegions(): Promise<Region[]> {
    return await this.regionRepository_.find({
      order: { name: "ASC" },
    })
  }

  /**
   * Code'a göre region getir
   */
  async getRegionByCode(code: string): Promise<Region | null> {
    return await this.regionRepository_.findOne({
      where: { code: code.toUpperCase() },
    })
  }

  /**
   * ID'ye göre region getir
   */
  async getRegionById(id: string): Promise<Region | null> {
    return await this.regionRepository_.findOne({
      where: { id },
      relations: ["product_regions"],
    })
  }

  /**
   * Ürünü region'a bağla
   */
  async attachProductToRegion(productId: string, regionId: string): Promise<ProductRegion> {
    // Region var mı kontrol et
    const region = await this.getRegionById(regionId)
    if (!region) {
      throw new Error(`Region with id ${regionId} not found`)
    }

    // Zaten bağlı mı kontrol et
    const existing = await this.productRegionRepository_.findOne({
      where: {
        product_id: productId,
        region_id: regionId,
      },
    })

    if (existing) {
      return existing // Zaten bağlı
    }

    // Bağla
    const productRegion = this.productRegionRepository_.create({
      product_id: productId,
      region_id: regionId,
    })

    return await this.productRegionRepository_.save(productRegion)
  }

  /**
   * Ürünü region'dan ayır
   */
  async detachProductFromRegion(productId: string, regionId: string): Promise<void> {
    const productRegion = await this.productRegionRepository_.findOne({
      where: {
        product_id: productId,
        region_id: regionId,
      },
    })

    if (productRegion) {
      await this.productRegionRepository_.remove(productRegion)
    }
  }

  /**
   * Region'a göre ürün ID'lerini listele
   */
  async listProductsByRegion(regionCode: string): Promise<string[]> {
    const region = await this.getRegionByCode(regionCode.toUpperCase())
    if (!region) {
      return []
    }

    const productRegions = await this.productRegionRepository_.find({
      where: { region_id: region.id },
      select: ["product_id"],
    })

    return productRegions.map((pr) => pr.product_id)
  }

  /**
   * Ürünün hangi region'larda olduğunu listele
   */
  async listRegionsByProduct(productId: string): Promise<Region[]> {
    const productRegions = await this.productRegionRepository_.find({
      where: { product_id: productId },
      relations: ["region"],
    })

    return productRegions.map((pr) => pr.region)
  }
}
