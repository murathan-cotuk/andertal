import { MigrationInterface, QueryRunner, TableColumn } from "typeorm"

export class AddCategoryFields1696500000004 implements MigrationInterface {
  name = "AddCategoryFields1696500000004"

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add is_visible column
    await queryRunner.addColumn(
      "admin_hub_categories",
      new TableColumn({
        name: "is_visible",
        type: "boolean",
        default: true,
      })
    )

    // Add has_collection column
    await queryRunner.addColumn(
      "admin_hub_categories",
      new TableColumn({
        name: "has_collection",
        type: "boolean",
        default: false,
      })
    )

    console.log("✅ Migration 1696500000004: is_visible ve has_collection kolonları eklendi")
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("admin_hub_categories", "has_collection")
    await queryRunner.dropColumn("admin_hub_categories", "is_visible")
    console.log("✅ Migration 1696500000004: is_visible ve has_collection kolonları silindi")
  }
}
