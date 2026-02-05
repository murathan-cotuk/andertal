/**
 * Admin Hub Category Entity
 * 
 * Medusa core'dan bağımsız, platform sahibi tarafından yönetilen kategoriler
 * Bu kategoriler Shop ve SellerCentral'da kullanılır
 */

import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from "typeorm"

@Entity("admin_hub_categories")
@Index("idx_admin_hub_categories_slug", ["slug"], { unique: true })
@Index("idx_admin_hub_categories_parent_id", ["parent_id"])
export class AdminHubCategory {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ type: "varchar", length: 255 })
  name: string

  @Column({ type: "varchar", length: 255, unique: true })
  slug: string

  @Column({ type: "text", nullable: true })
  description: string | null

  @Column({ type: "uuid", nullable: true })
  parent_id: string | null

  @ManyToOne(() => AdminHubCategory, (category) => category.children, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "parent_id" })
  parent: AdminHubCategory | null

  @Column({ type: "boolean", default: true })
  active: boolean

  @Column({ type: "boolean", default: true, name: "is_visible" })
  is_visible: boolean

  @Column({ type: "boolean", default: false, name: "has_collection" })
  has_collection: boolean

  @Column({ type: "integer", default: 0 })
  sort_order: number

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any> | null

  @CreateDateColumn()
  created_at: Date

  @UpdateDateColumn()
  updated_at: Date

  // Self-referencing relation for children
  children?: AdminHubCategory[]
}
