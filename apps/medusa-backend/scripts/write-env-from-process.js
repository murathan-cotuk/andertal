/**
 * Render/CI: process.env'deki DATABASE_URL vb. değişkenleri .env dosyasına yazar.
 * Medusa db:setup / db:migrate .env dosyasına baktığı için Build aşamasında gerekli.
 * .env zaten varsa veya DATABASE_URL yoksa hiçbir şey yapmaz.
 */
const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "..", ".env");

if (fs.existsSync(envPath)) {
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || typeof databaseUrl !== "string") {
  process.exit(0);
}

const lines = [
  `DATABASE_URL=${databaseUrl}`,
  "DATABASE_TYPE=postgres",
];
if (process.env.NODE_ENV) {
  lines.push(`NODE_ENV=${process.env.NODE_ENV}`);
}

fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf8");
