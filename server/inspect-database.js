const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { Pool } = require("pg");

const TABLES = ["last_meals", "grave_recipes", "cemetery_stories", "last_words", "farewell_letters"];

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    for (const table of TABLES) {
      console.log(`\n=== ${table} ===`);
      const columns = await client.query(`
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table]);
      console.table(columns.rows);

      const samples = await client.query(`SELECT * FROM ${table} ORDER BY id LIMIT 3`);
      console.log("first 3 rows:");
      console.dir(samples.rows, { depth: 2, maxArrayLength: 5 });

      const nullStats = [];
      for (const column of columns.rows) {
        if (column.column_name === "id") continue;
        const result = await client.query(`SELECT COUNT(*)::int AS non_null_count FROM ${table} WHERE ${column.column_name} IS NOT NULL`);
        nullStats.push({ column: column.column_name, non_null_count: result.rows[0].non_null_count });
      }
      console.table(nullStats);

      const imageColumn = columns.rows.find((column) => column.column_name === "images");
      if (imageColumn) {
        const imageStats = await client.query(`SELECT COUNT(*)::int AS rows_with_images, COALESCE(SUM(cardinality(images)), 0)::int AS image_count FROM ${table} WHERE cardinality(images) > 0`);
        console.log("bytea image stats:", imageStats.rows[0], "udt:", imageColumn.udt_name);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
