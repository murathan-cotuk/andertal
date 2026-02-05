/**
 * Custom Region Entity (TypeORM)
 * 
 * Medusa'nın core Region'ından farklıdır.
 * Bizim domain'imiz için market görünürlüğü için kullanılır.
 */

import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, OneToMany } from "typeorm"
import { ProductRegion } from "./product-region"

@Entity("regions")
@Index("idx_regions_code", ["code"], { unique: true })
export class Region {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ type: "varchar", length: 255 })
  name: string

  @Column({ type: "varchar", length: 10, unique: true })
  code: string

  @Column({ type: "varchar", length: 3 })
  currency_code: string

  @OneToMany(() => ProductRegion, (productRegion) => productRegion.region)
  product_regions: ProductRegion[]

  @CreateDateColumn()
  created_at: Date

  @UpdateDateColumn()
  updated_at: Date
}
