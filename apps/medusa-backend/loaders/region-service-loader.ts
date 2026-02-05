/**
 * Region Service Loader
 * 
 * Medusa v2 container'a RegionService'i register eder
 * EntityManager'ı inject eder
 */

import { MedusaContainer } from "@medusajs/framework"
import RegionService from "../services/region-service"

export default async function regionServiceLoader(container: MedusaContainer) {
  // EntityManager'ı container'dan al
  const manager = container.resolve("manager")

  // RegionService'i container'a register et
  container.register({
    regionService: {
      resolve: () => {
        return new RegionService({
          manager,
        })
      },
    },
  })

  console.log("✅ RegionService container'a register edildi")
}
