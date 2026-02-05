import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm"

export class CreateAdminHubCategories1696500000002 implements MigrationInterface {
  name = "CreateAdminHubCategories1696500000002"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)

    await queryRunner.createTable(
      new Table({
        name: "admin_hub_categories",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, default: "uuid_generate_v4()" },
          { name: "name", type: "varchar", length: "255" },
          { name: "slug", type: "varchar", length: "255", isUnique: true },
          { name: "description", type: "text", isNullable: true },
          { name: "parent_id", type: "uuid", isNullable: true },
          { name: "active", type: "boolean", default: true },
          { name: "sort_order", type: "integer", default: 0 },
          { name: "metadata", type: "jsonb", isNullable: true },
          { name: "created_at", type: "timestamp", default: "now()" },
          { name: "updated_at", type: "timestamp", default: "now()" },
        ],
      }),
      true
    )

    await queryRunner.createForeignKey(
      "admin_hub_categories",
      {
        columnNames: ["parent_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "admin_hub_categories",
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      }
    )

    await queryRunner.createIndex(
      "admin_hub_categories",
      new TableIndex({
        name: "idx_admin_hub_categories_slug",
        columnNames: ["slug"],
        isUnique: true,
      })
    )

    await queryRunner.createIndex(
      "admin_hub_categories",
      new TableIndex({
        name: "idx_admin_hub_categories_parent_id",
        columnNames: ["parent_id"],
      })
    )

    console.log("✅ Migration 1696500000002: admin_hub_categories tablosu oluşturuldu")
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("admin_hub_categories", "idx_admin_hub_categories_parent_id")
    await queryRunner.dropIndex("admin_hub_categories", "idx_admin_hub_categories_slug")
    await queryRunner.dropForeignKey("admin_hub_categories", "FK_admin_hub_categories_parent_id")
    await queryRunner.dropTable("admin_hub_categories")
    console.log("✅ Migration 1696500000002: admin_hub_categories tablosu silindi")
  }
}
