/**
 * Migration: Create Product-Regions Junction Table
 * 
 * Product ve Region arasındaki many-to-many ilişkiyi yönetir.
 * 
 * UP: product_regions tablosunu oluştur
 * DOWN: product_regions tablosunu sil
 */

module.exports = {
  name: "002_create_product_regions",
  
  async up({ queryInterface, Sequelize }) {
    // product_regions tablosunu oluştur
    await queryInterface.createTable("product_regions", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal("uuid_generate_v4()"),
      },
      product_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        // Foreign key to Medusa product
        // Note: Medusa'nın product ID format'ına göre ayarlanacak
      },
      region_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "regions",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    })

    // Index'ler oluştur
    await queryInterface.addIndex("product_regions", ["product_id"], {
      name: "idx_product_regions_product_id",
    })

    await queryInterface.addIndex("product_regions", ["region_id"], {
      name: "idx_product_regions_region_id",
    })

    // Unique constraint: bir ürün bir region'da sadece bir kez olabilir
    await queryInterface.addIndex("product_regions", ["product_id", "region_id"], {
      name: "idx_product_regions_unique",
      unique: true,
    })

    console.log("✅ Migration 002: product_regions tablosu oluşturuldu")
  },

  async down({ queryInterface }) {
    // Index'leri sil
    await queryInterface.removeIndex("product_regions", "idx_product_regions_unique")
    await queryInterface.removeIndex("product_regions", "idx_product_regions_region_id")
    await queryInterface.removeIndex("product_regions", "idx_product_regions_product_id")
    
    // Tabloyu sil
    await queryInterface.dropTable("product_regions")

    console.log("✅ Migration 002: product_regions tablosu silindi")
  },
}
