/**
 * Admin Hub Service Loader
 * 
 * Medusa v2 container'a AdminHubService'i register eder
 */

import { MedusaContainer } from "@medusajs/framework"
import AdminHubService from "../services/admin-hub-service"

export default async function adminHubServiceLoader(container: MedusaContainer) {
  const manager = container.resolve("manager")
  
  // Try to resolve ProductCollectionService (optional)
  let productCollectionService
  try {
    productCollectionService = container.resolve("productCollectionService")
  } catch (e) {
    // Service not available, continue without it
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
