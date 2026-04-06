import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm"

export class CreateAdminHubBrands1696500000006 implements MigrationInterface {
  name = "CreateAdminHubBrands1696500000006"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)

    await queryRunner.createTable(
      new Table({
        name: "admin_hub_brands",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, default: "uuid_generate_v4()" },
          { name: "name", type: "varchar", length: "255" },
          { name: "handle", type: "varchar", length: "255", isUnique: true },
          { name: "logo_image", type: "text", isNullable: true },
          { name: "banner_image", type: "text", isNullable: true },
          { name: "address", type: "text", isNullable: true },
          { name: "metadata", type: "jsonb", isNullable: true },
          { name: "created_at", type: "timestamp", default: "now()" },
          { name: "updated_at", type: "timestamp", default: "now()" },
        ],
      }),
      true
    )

    await queryRunner.createIndex(
      "admin_hub_brands",
      new TableIndex({
        name: "idx_admin_hub_brands_handle",
        columnNames: ["handle"],
        isUnique: true,
      })
    )

    console.log("✅ Migration 1696500000006: admin_hub_brands tablosu oluşturuldu")
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("admin_hub_brands", "idx_admin_hub_brands_handle")
    await queryRunner.dropTable("admin_hub_brands")
    console.log("✅ Migration 1696500000006: admin_hub_brands tablosu silindi")
  }
}
