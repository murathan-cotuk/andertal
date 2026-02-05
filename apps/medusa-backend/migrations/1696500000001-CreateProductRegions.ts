/**
 * Migration: Create Product-Regions Junction Table (TypeORM)
 * 
 * Product ve Region arasındaki many-to-many ilişkiyi yönetir.
 * TypeORM migration format'ında.
 */

import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from "typeorm"

export class CreateProductRegions1696500000001 implements MigrationInterface {
  name = "CreateProductRegions1696500000001"

  public async up(queryRunner: QueryRunner): Promise<void> {
    // product_regions tablosunu oluştur
    await queryRunner.createTable(
      new Table({
        name: "product_regions",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            default: "uuid_generate_v4()",
          },
          {
            name: "product_id",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "region_id",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
        ],
      }),
      true
    )

    // Foreign key constraint
    await queryRunner.createForeignKey(
      "product_regions",
      new TableForeignKey({
        columnNames: ["region_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "regions",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      })
    )

    // Index'ler oluştur
    await queryRunner.createIndex(
      "product_regions",
      new TableIndex({
        name: "idx_product_regions_product_id",
        columnNames: ["product_id"],
      })
    )

    await queryRunner.createIndex(
      "product_regions",
      new TableIndex({
        name: "idx_product_regions_region_id",
        columnNames: ["region_id"],
      })
    )

    // Unique constraint: bir ürün bir region'da sadece bir kez olabilir
    await queryRunner.createIndex(
      "product_regions",
      new TableIndex({
        name: "idx_product_regions_unique",
        columnNames: ["product_id", "region_id"],
        isUnique: true,
      })
    )

    console.log("✅ Migration: product_regions tablosu oluşturuldu")
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Foreign key'i sil
    const table = await queryRunner.getTable("product_regions")
    const foreignKey = table?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf("region_id") !== -1
    )
    if (foreignKey) {
      await queryRunner.dropForeignKey("product_regions", foreignKey)
    }

    // Index'leri sil
    await queryRunner.dropIndex("product_regions", "idx_product_regions_unique")
    await queryRunner.dropIndex("product_regions", "idx_product_regions_region_id")
    await queryRunner.dropIndex("product_regions", "idx_product_regions_product_id")

    // Tabloyu sil
    await queryRunner.dropTable("product_regions")

    console.log("✅ Migration: product_regions tablosu silindi")
  }
}
