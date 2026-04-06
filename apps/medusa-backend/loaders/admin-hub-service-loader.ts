/**
 * Admin Hub Service Loader
 *
 * Medusa v2 container'a AdminHubService'i register eder.
 * Medusa v2 container'da TypeORM "manager" olmayabileceği için kendi TypeORM DataSource
 * kullanıyoruz (Render ve tüm ortamlarda güvenilir çalışır).
 */

import { DataSource } from "typeorm"
import { MedusaContainer } from "@medusajs/framework"
import AdminHubService from "../services/admin-hub-service"
import { AdminHubCategory } from "../models/admin-hub-category"
import { AdminHubBanner } from "../models/admin-hub-banner"
import { AdminHubBrand } from "../models/admin-hub-brand"

const DATABASE_URL = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/medusa"
const isPostgres = DATABASE_URL.startsWith("postgres")
const isRender = DATABASE_URL.includes("render.com")

let adminHubDataSource: DataSource | null = null

function createAdminHubDataSource(): DataSource {
  const config: any = {
    type: isPostgres ? "postgres" : "sqlite",
    entities: [AdminHubCategory, AdminHubBanner, AdminHubBrand],
    synchronize: false,
    logging: false,
  }
  if (isPostgres) {
    config.url = DATABASE_URL
    if (isRender) {
      config.extra = { ssl: { rejectUnauthorized: false } }
    }
  } else {
    config.database = DATABASE_URL.replace(/^file:/, "") || "medusa.db"
  }
  return new DataSource(config)
}

export default async function adminHubServiceLoader(container: MedusaContainer) {
  let manager: import("typeorm").EntityManager

  try {
    const medusaManager = container.resolve("manager")
    if (medusaManager && typeof medusaManager.getRepository === "function") {
      manager = medusaManager as import("typeorm").EntityManager
    } else {
      throw new Error("Medusa manager not TypeORM")
    }
  } catch (_) {
    // Medusa v2'de "manager" yok veya TypeORM değil; kendi DataSource'umuzu kullan
    adminHubDataSource = createAdminHubDataSource()
    await adminHubDataSource.initialize()
    manager = adminHubDataSource.manager
    console.log("✅ Admin Hub: Kendi TypeORM DataSource kullanılıyor (Medusa manager yok)")
  }

  let productCollectionService: any
  try {
    productCollectionService = container.resolve("productCollectionService")
  } catch (e) {
    console.warn("⚠️  ProductCollectionService not available, collection sync will be disabled")
  }

  container.register({
    adminHubService: {
      resolve: () => {
        return new AdminHubService({
          manager,
          productCollectionService,
        })
      },
    },
  })

  console.log("✅ AdminHubService container'a register edildi")
}
