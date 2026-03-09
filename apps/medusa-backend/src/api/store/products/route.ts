/**
 * GET /store/products is handled by the custom Express handler in server.js
 * (storeProductsFromAdminHubGET), which queries admin_hub_products directly.
 *
 * This file intentionally does not export a GET handler so that Medusa's
 * expressLoader does not override the server.js route.
 */
export {}
