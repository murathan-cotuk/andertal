import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, OneToMany, JoinColumn } from "typeorm"
import { AdminHubMenu } from "./admin-hub-menu"

@Entity("admin_hub_menu_items")
@Index("idx_admin_hub_menu_items_menu_id", ["menu_id"])
@Index("idx_admin_hub_menu_items_parent_id", ["parent_id"])
export class AdminHubMenuItem {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ type: "uuid" })
  menu_id: string

  @ManyToOne(() => AdminHubMenu, (menu) => menu.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "menu_id" })
  menu?: AdminHubMenu

  @Column({ type: "varchar", length: 255 })
  label: string

  @Column({ type: "varchar", length: 50, default: "url" })
  link_type: string

  @Column({ type: "text", nullable: true })
  link_value: string | null

  @Column({ type: "uuid", nullable: true })
  parent_id: string | null

  @ManyToOne(() => AdminHubMenuItem, (item) => item.children, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "parent_id" })
  parent?: AdminHubMenuItem | null

  @Column({ type: "integer", default: 0 })
  sort_order: number

  @CreateDateColumn()
  created_at: Date

  @UpdateDateColumn()
  updated_at: Date

  @OneToMany(() => AdminHubMenuItem, (item) => item.parent)
  children?: AdminHubMenuItem[]
}
