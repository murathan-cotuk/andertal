/**
 * Migration: Create Regions Table
 * 
 * Custom Region entity için tablo oluşturur.
 * 
 * UP: regions tablosunu oluştur
 * DOWN: regions tablosunu sil
 */

module.exports = {
  name: "001_create_regions",
  
  async up({ queryInterface, Sequelize }) {
    // UUID extension'ı aktif et (PostgreSQL için)
    await queryInterface.sequelize.query(
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'
    )

    // regions tablosunu oluştur
    await queryInterface.createTable("regions", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal("uuid_generate_v4()"),
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      code: {
        type: Sequelize.STRING(10),
        allowNull: false,
        unique: true,
      },
      currency_code: {
        type: Sequelize.STRING(3),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    })

    // Index oluştur
    await queryInterface.addIndex("regions", ["code"], {
      name: "idx_regions_code",
      unique: true,
    })

    console.log("✅ Migration 001: regions tablosu oluşturuldu")
  },

  async down({ queryInterface }) {
    // Index'i sil
    await queryInterface.removeIndex("regions", "idx_regions_code")
    
    // Tabloyu sil
    await queryInterface.dropTable("regions")

    console.log("✅ Migration 001: regions tablosu silindi")
  },
}
