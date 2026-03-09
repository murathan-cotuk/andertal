// Fallback so next-intl plugin finds a file when cwd is monorepo root (turbo).
// At runtime, each app resolves ./i18n/request.js from its own root (apps/shop, apps/sellercentral).
module.exports = require("../apps/shop/i18n/request.js");
