const { buildConfig } = require("payload/config");
const { postgresAdapter } = require("@payloadcms/db-postgres");
const { webpackBundler } = require("@payloadcms/bundler-webpack");
const { slateEditor } = require("@payloadcms/richtext-slate");
const path = require("path");

const Products = require("./collections/Products");
const Categories = require("./collections/Categories");
const Brands = require("./collections/Brands");
const Sellers = require("./collections/Sellers");
const Customers = require("./collections/Customers");
const Orders = require("./collections/Orders");
const Media = require("./collections/Media");

module.exports = buildConfig({
  admin: {
    user: Sellers.Sellers,
    bundler: webpackBundler(),
  },
  editor: slateEditor({}),
  collections: [
    Products.Products,
    Categories.Categories,
    Brands.Brands,
    Sellers.Sellers,
    Customers.Customers,
    Orders.Orders,
    Media.Media,
  ],
  graphQL: {
    schemaOutputFile: path.resolve(__dirname, "generated-schema.graphql"),
  },
  plugins: [],
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || "",
    },
  }),
  serverURL: process.env.PAYLOAD_PUBLIC_SERVER_URL || "http://localhost:3001",
});

