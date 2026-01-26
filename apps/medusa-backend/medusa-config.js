module.exports = {
  projectConfig: {
    // SQLite database
    database_url: `file:./medusa.db`,
    database_type: "sqlite",
    store_cors: process.env.STORE_CORS || "http://localhost:8000",
    admin_cors: process.env.ADMIN_CORS || "http://localhost:7001",
    database_extra: {},
    redis_url: process.env.REDIS_URL || "redis://localhost:6379",
  },
  plugins: [],
}
