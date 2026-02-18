import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, OneToMany } from "typeorm"
import { AdminHubMenuItem } from "./admin-hub-menu-item"

@Entity("admin_hub_menus")
@Index("idx_admin_hub_menus_slug", ["slug"], { unique: true })
@Index("idx_admin_hub_menus_location", ["location"])
export class AdminHubMenu {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ type: "varchar", length: 100 })
  name: string

  @Column({ type: "varchar", length: 100, unique: true })
  slug: string

  @Column({ type: "varchar", length: 50, default: "main" })
  location: string

  @CreateDateColumn()
  created_at: Date

  @UpdateDateColumn()
  updated_at: Date

  @OneToMany(() => AdminHubMenuItem, (item) => item.menu)
  items?: AdminHubMenuItem[]
}
