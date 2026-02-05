/**
 * Migration: Create Regions Table (TypeORM)
 * 
 * Custom Region entity için tablo oluşturur.
 * TypeORM migration format'ında.
 */

import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm"

export class CreateRegions1696500000000 implements MigrationInterface {
  name = "CreateRegions1696500000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    // UUID extension'ı aktif et (PostgreSQL için)
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')

    // regions tablosunu oluştur
    await queryRunner.createTable(
      new Table({
        name: "regions",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            default: "uuid_generate_v4()",
          },
          {
            name: "name",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "code",
            type: "varchar",
            length: "10",
            isNullable: false,
            isUnique: true,
          },
          {
            name: "currency_code",
            type: "varchar",
            length: "3",
            isNullable: false,
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
          {
            name: "updated_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
        ],
      }),
      true
    )

    // Index oluştur
    await queryRunner.createIndex(
      "regions",
      new TableIndex({
        name: "idx_regions_code",
        columnNames: ["code"],
        isUnique: true,
      })
    )

    console.log("✅ Migration: regions tablosu oluşturuldu")
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Index'i sil
    await queryRunner.dropIndex("regions", "idx_regions_code")

    // Tabloyu sil
    await queryRunner.dropTable("regions")

    console.log("✅ Migration: regions tablosu silindi")
  }
}
