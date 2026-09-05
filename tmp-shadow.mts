import "dotenv/config";
import mariadb from "mariadb";

/** Throwaway: creates the empty scratch schema `prisma migrate dev` needs. */
const url = new URL(process.env.DATABASE_URL ?? "");
const conn = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
});

await conn.query("CREATE DATABASE IF NOT EXISTS `wablast_shadow`");

const rows: Array<{ n: number }> = await conn.query(
  "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'wablast_shadow'",
);
console.log("wablast_shadow tables:", Number(rows[0]?.n ?? 0));

await conn.end();
