import { EntityManager, Repository } from "typeorm"
import { AdminHubMenu } from "../models/admin-hub-menu"
import { AdminHubMenuItem } from "../models/admin-hub-menu-item"

export default class MenuService {
  protected readonly menuRepository_: Repository<AdminHubMenu>
  protected readonly menuItemRepository_: Repository<AdminHubMenuItem>

  constructor(manager: EntityManager) {
    this.menuRepository_ = manager.getRepository(AdminHubMenu)
    this.menuItemRepository_ = manager.getRepository(AdminHubMenuItem)
  }

  async createMenu(data: { name: string; slug: string; location?: string }): Promise<AdminHubMenu> {
    const menu = this.menuRepository_.create({
      name: data.name,
      slug: data.slug,
      location: data.location || "main",
    })
    return await this.menuRepository_.save(menu)
  }

  async listMenus(): Promise<AdminHubMenu[]> {
    return await this.menuRepository_.find({
      order: { name: "ASC" },
    })
  }

  async getMenuById(id: string): Promise<AdminHubMenu | null> {
    return await this.menuRepository_.findOne({
      where: { id },
      relations: ["items"],
    })
  }

  async updateMenu(id: string, data: Partial<{ name: string; slug: string; location: string }>): Promise<AdminHubMenu> {
    const menu = await this.menuRepository_.findOne({ where: { id } })
    if (!menu) throw new Error(`Menu ${id} not found`)
    Object.assign(menu, data)
    return await this.menuRepository_.save(menu)
  }

  async deleteMenu(id: string): Promise<void> {
    const menu = await this.menuRepository_.findOne({ where: { id } })
    if (!menu) throw new Error(`Menu ${id} not found`)
    await this.menuRepository_.remove(menu)
  }

  async createMenuItem(data: {
    menu_id: string
    label: string
    link_type?: string
    link_value?: string | null
    parent_id?: string | null
    sort_order?: number
  }): Promise<AdminHubMenuItem> {
    const item = this.menuItemRepository_.create({
      menu_id: data.menu_id,
      label: data.label,
      link_type: data.link_type || "url",
      link_value: data.link_value ?? null,
      parent_id: data.parent_id ?? null,
      sort_order: data.sort_order ?? 0,
    })
    return await this.menuItemRepository_.save(item)
  }

  async listMenuItems(menuId: string): Promise<AdminHubMenuItem[]> {
    return await this.menuItemRepository_.find({
      where: { menu_id: menuId },
      order: { sort_order: "ASC", label: "ASC" },
      relations: ["children"],
    })
  }

  async updateMenuItem(
    id: string,
    data: Partial<{ label: string; link_type: string; link_value: string | null; parent_id: string | null; sort_order: number }>
  ): Promise<AdminHubMenuItem> {
    const item = await this.menuItemRepository_.findOne({ where: { id } })
    if (!item) throw new Error(`Menu item ${id} not found`)
    if (data.label !== undefined) item.label = data.label
    if (data.link_type !== undefined) item.link_type = data.link_type
    if (data.link_value !== undefined) item.link_value = data.link_value
    if (data.parent_id !== undefined) item.parent_id = data.parent_id
    if (data.sort_order !== undefined) item.sort_order = data.sort_order
    return await this.menuItemRepository_.save(item)
  }

  async deleteMenuItem(id: string): Promise<void> {
    const item = await this.menuItemRepository_.findOne({ where: { id } })
    if (!item) throw new Error(`Menu item ${id} not found`)
    await this.menuItemRepository_.remove(item)
  }
}
