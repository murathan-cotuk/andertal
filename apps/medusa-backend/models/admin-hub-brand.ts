/**
 * Admin Hub Brand Entity
 *
 * Marka (brand) yönetimi için entity.
 */

import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from "typeorm"

@Entity("admin_hub_brands")
@Index("idx_admin_hub_brands_handle", ["handle"], { unique: true })
export class AdminHubBrand {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ type: "varchar", length: 255 })
  name: string

  @Column({ type: "varchar", length: 255, unique: true })
  handle: string

  @Column({ type: "text", nullable: true })
  logo_image: string | null

  @Column({ type: "text", nullable: true })
  banner_image: string | null

  @Column({ type: "text", nullable: true })
  address: string | null

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any> | null

  @CreateDateColumn()
  created_at: Date

  @UpdateDateColumn()
  updated_at: Date
}
