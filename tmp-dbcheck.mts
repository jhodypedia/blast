import "dotenv/config";
import mariadb from "mariadb";

/** Throwaway: verifies the unified content block columns landed in `wablast`. */
const url = new URL(process.env.DATABASE_URL ?? "");
const conn = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
});

const target = url.pathname.slice(1);

const tables: Array<{ n: number }> = await conn.query(
  "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
  [target],
);
console.log(`${target} tables:`, Number(tables[0]?.n ?? 0));

const cols: Array<{ TABLE_NAME: string; COLUMN_NAME: string; COLUMN_TYPE: string }> =
  await conn.query(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND (COLUMN_NAME IN ('image1Key','image1Mime','image2Key','image2Mime','buttons',
                             'snapshotImage1Key','snapshotImage1Mime','snapshotImage2Key',
                             'snapshotImage2Mime','snapshotButtons')
             OR COLUMN_NAME IN ('messageType','snapshotMessageType'))
      ORDER BY TABLE_NAME, COLUMN_NAME`,
    [target],
  );

for (const col of cols) {
  console.log(`${col.TABLE_NAME}.${col.COLUMN_NAME} :: ${col.COLUMN_TYPE}`);
}

const applied: Array<{ migration_name: string }> = await conn.query(
  "SELECT migration_name FROM `_prisma_migrations` ORDER BY started_at",
);
console.log("applied:", applied.map((row) => row.migration_name));

await conn.end();

