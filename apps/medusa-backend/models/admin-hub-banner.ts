/**
 * Admin Hub Banner Entity
 * 
 * Platform sahibi tarafından yönetilen banner'lar
 * Shop ve SellerCentral'da gösterilir
 */

import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from "typeorm"

@Entity("admin_hub_banners")
@Index("idx_admin_hub_banners_active", ["active"])
export class AdminHubBanner {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ type: "varchar", length: 255 })
  title: string

  @Column({ type: "text" })
  image_url: string

  @Column({ type: "text", nullable: true })
  link: string | null

  @Column({ type: "varchar", length: 50, default: "home" })
  position: string // home, category, product, etc.

  @Column({ type: "boolean", default: true })
  active: boolean

  @Column({ type: "integer", default: 0 })
  sort_order: number

  @Column({ type: "timestamp", nullable: true })
  start_date: Date | null

  @Column({ type: "timestamp", nullable: true })
  end_date: Date | null

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any> | null

  @CreateDateColumn()
  created_at: Date

  @UpdateDateColumn()
  updated_at: Date
}
