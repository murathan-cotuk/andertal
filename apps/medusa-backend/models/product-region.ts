/**
 * Product-Region Junction Entity (TypeORM)
 * 
 * Product ve Region arasındaki many-to-many ilişkiyi yönetir.
 * 
 * Bu tablo şunu cevaplar: "Bu ürün hangi marketlerde satılıyor?"
 */

import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index, Unique } from "typeorm"
import { Region } from "./region"

@Entity("product_regions")
@Index("idx_product_regions_product_id", ["product_id"])
@Index("idx_product_regions_region_id", ["region_id"])
@Unique("idx_product_regions_unique", ["product_id", "region_id"])
export class ProductRegion {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ type: "varchar", length: 255 })
  product_id: string

  @Column({ type: "uuid" })
  region_id: string

  @ManyToOne(() => Region, (region) => region.product_regions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "region_id" })
  region: Region

  @CreateDateColumn()
  created_at: Date
}
