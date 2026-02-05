import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm"

export class CreateAdminHubBanners1696500000003 implements MigrationInterface {
  name = "CreateAdminHubBanners1696500000003"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)

    await queryRunner.createTable(
      new Table({
        name: "admin_hub_banners",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, default: "uuid_generate_v4()" },
          { name: "title", type: "varchar", length: "255" },
          { name: "image_url", type: "text" },
          { name: "link", type: "text", isNullable: true },
          { name: "position", type: "varchar", length: "50", default: "'home'" },
          { name: "active", type: "boolean", default: true },
          { name: "sort_order", type: "integer", default: 0 },
          { name: "start_date", type: "timestamp", isNullable: true },
          { name: "end_date", type: "timestamp", isNullable: true },
          { name: "metadata", type: "jsonb", isNullable: true },
          { name: "created_at", type: "timestamp", default: "now()" },
          { name: "updated_at", type: "timestamp", default: "now()" },
        ],
      }),
      true
    )

    await queryRunner.createIndex(
      "admin_hub_banners",
      new TableIndex({
        name: "idx_admin_hub_banners_active",
        columnNames: ["active"],
      })
    )

    console.log("✅ Migration 1696500000003: admin_hub_banners tablosu oluşturuldu")
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("admin_hub_banners", "idx_admin_hub_banners_active")
    await queryRunner.dropTable("admin_hub_banners")
    console.log("✅ Migration 1696500000003: admin_hub_banners tablosu silindi")
  }
}
