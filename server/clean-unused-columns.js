const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { Pool } = require("pg");

const ROOT = path.resolve(__dirname, "..");
const CLEANUP_REPORT_PATH = path.join(ROOT, "DATABASE_CLEANUP_REPORT.txt");
const GUIDE_PATH = path.join(ROOT, "DATABASE_GUIDE.txt");
const INSPECTION_PATH = path.join(ROOT, "DATABASE_INSPECTION_RESULT.txt");
const GUIDE_SCRIPT_PATH = path.join(__dirname, "generate-database-guide.js");

const TABLES = ["last_meals", "grave_recipes", "cemetery_stories", "last_words", "farewell_letters"];
const DROP_COLUMNS = {
  grave_recipes: ["recipe_name_en", "recipe_steps_en", "kitchen_notes_en"],
  cemetery_stories: ["geographic_background_en", "reflection_en"],
};

function quoteIdent(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function formatRows(rows, headers) {
  const matrix = [headers, ...rows.map((row) => headers.map((header) => String(row[header] ?? "")))];
  const widths = headers.map((_, index) => Math.min(70, Math.max(...matrix.map((row) => [...row[index]].length))));
  return matrix
    .map((row, rowIndex) => {
      const line = row
        .map((cell, index) => {
          const chars = [...String(cell ?? "")];
          const clipped = chars.length > widths[index] ? `${chars.slice(0, widths[index] - 1).join("")}...` : chars.join("");
          return clipped.padEnd(widths[index], " ");
        })
        .join(" | ");
      return rowIndex === 0 ? `${line}\n${widths.map((width) => "-".repeat(width)).join("-|-")}` : line;
    })
    .join("\n");
}

async function getBasic(client) {
  const result = await client.query(
    `SELECT current_database() AS database_name, current_schema() AS schema_name, now() AS current_time`,
  );
  return result.rows[0];
}

async function tableExists(client, table) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = $1
     ) AS exists`,
    [table],
  );
  return result.rows[0].exists;
}

async function columnExists(client, table, column) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = $1
         AND column_name = $2
     ) AS exists`,
    [table, column],
  );
  return result.rows[0].exists;
}

async function getColumns(client, table) {
  const result = await client.query(
    `SELECT column_name, data_type, udt_name, is_nullable, column_default, ordinal_position
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return result.rows;
}

async function getCounts(client) {
  const counts = {};
  for (const table of TABLES) {
    if (await tableExists(client, table)) {
      const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdent(table)}`);
      counts[table] = result.rows[0].count;
    } else {
      counts[table] = null;
    }
  }
  return counts;
}

async function inspectImageTable(client, table) {
  const columnTypes = await client.query(
    `SELECT column_name, data_type, udt_name
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = $1
       AND column_name IN ('images', 'image_names', 'image_mime_types')
     ORDER BY column_name`,
    [table],
  );

  const rows = await client.query(
    `SELECT
       id,
       cardinality(images) AS image_count,
       cardinality(image_names) AS image_name_count,
       cardinality(image_mime_types) AS mime_type_count,
       pg_column_size(images) AS images_size_bytes
     FROM ${quoteIdent(table)}
     ORDER BY id`,
  );

  const typePass = columnTypes.rows.some((row) => row.column_name === "images" && row.data_type === "ARRAY" && row.udt_name === "_bytea");
  const rowPass = rows.rows.every((row) => {
    const imageCount = Number(row.image_count);
    return imageCount > 0
      && Number(row.images_size_bytes) > 0
      && imageCount === Number(row.image_name_count)
      && imageCount === Number(row.mime_type_count);
  });

  return {
    table,
    typePass,
    rowPass,
    pass: typePass && rowPass,
    columnTypes: columnTypes.rows,
    rows: rows.rows,
  };
}

function writeCleanupReport(data) {
  const lines = [];
  lines.push("DATABASE CLEANUP REPORT");
  lines.push("=======================");
  lines.push("");
  lines.push(`清理时间: ${data.finishedAt}`);
  lines.push(`数据库连接是否成功: ${data.connectionSuccess ? "是" : "否"}`);
  lines.push(`数据库: ${data.basic?.database_name || ""}`);
  lines.push(`Schema: ${data.basic?.schema_name || ""}`);
  lines.push(`数据库时间: ${data.basic?.current_time?.toISOString?.() || data.basic?.current_time || ""}`);
  lines.push("");

  lines.push("1. 表存在情况");
  lines.push("-------------");
  for (const table of TABLES) lines.push(`- ${table}: ${data.tablePresence[table] ? "存在" : "缺失"}`);
  lines.push("");

  lines.push("2. 删除字段列表");
  lines.push("---------------");
  if (data.dropped.length) {
    for (const item of data.dropped) lines.push(`- ${item.table}.${item.column}`);
  } else {
    lines.push("- 无，本次没有实际删除字段。");
  }
  lines.push("");

  lines.push("3. 字段不存在所以跳过");
  lines.push("---------------------");
  if (data.skipped.length) {
    for (const item of data.skipped) lines.push(`- ${item.table}.${item.column}`);
  } else {
    lines.push("- 无。");
  }
  lines.push("");

  lines.push("4. 清理前后的表结构变化");
  lines.push("-----------------------");
  for (const table of Object.keys(DROP_COLUMNS)) {
    lines.push("");
    lines.push(`[${table}] 删除前字段`);
    lines.push(formatRows(data.beforeColumns[table], ["ordinal_position", "column_name", "data_type", "udt_name", "is_nullable"]));
    lines.push("");
    lines.push(`[${table}] 删除后字段`);
    lines.push(formatRows(data.afterColumns[table], ["ordinal_position", "column_name", "data_type", "udt_name", "is_nullable"]));
  }
  lines.push("");

  lines.push("5. 清理后每张表记录数");
  lines.push("---------------------");
  for (const table of TABLES) lines.push(`- ${table}: ${data.counts[table] ?? "N/A"}`);
  lines.push("");

  lines.push("6. 图片字段是否仍然正常");
  lines.push("-----------------------");
  for (const check of data.imageChecks) {
    lines.push(`- ${check.table}: ${check.pass ? "正常" : "异常"}; images 类型 BYTEA[]: ${check.typePass ? "是" : "否"}; 行级图片数量/名称/MIME/大小检查: ${check.rowPass ? "通过" : "未通过"}`);
    lines.push(formatRows(check.rows, ["id", "image_count", "image_name_count", "mime_type_count", "images_size_bytes"]));
  }
  lines.push("");

  lines.push("7. 说明文件更新状态");
  lines.push("-------------------");
  lines.push(`- DATABASE_GUIDE.txt 是否已更新: ${data.guideUpdated ? "是" : "否"}`);
  lines.push(`- DATABASE_INSPECTION_RESULT.txt 是否已更新: ${data.inspectionUpdated ? "是" : "否"}`);
  lines.push("");

  fs.writeFileSync(CLEANUP_REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing in .env");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const data = {
    connectionSuccess: false,
    basic: null,
    tablePresence: {},
    beforeColumns: {},
    afterColumns: {},
    dropped: [],
    skipped: [],
    counts: {},
    imageChecks: [],
    guideUpdated: false,
    inspectionUpdated: false,
    finishedAt: new Date().toISOString(),
  };

  const client = await pool.connect();
  try {
    data.connectionSuccess = true;
    data.basic = await getBasic(client);

    for (const table of TABLES) {
      data.tablePresence[table] = await tableExists(client, table);
    }

    for (const table of Object.keys(DROP_COLUMNS)) {
      if (!data.tablePresence[table]) throw new Error(`Required table is missing: ${table}`);
      data.beforeColumns[table] = await getColumns(client, table);
    }

    await client.query("BEGIN");
    try {
      for (const [table, columns] of Object.entries(DROP_COLUMNS)) {
        for (const column of columns) {
          if (await columnExists(client, table, column)) {
            await client.query(`ALTER TABLE ${quoteIdent(table)} DROP COLUMN IF EXISTS ${quoteIdent(column)}`);
            data.dropped.push({ table, column });
          } else {
            data.skipped.push({ table, column });
          }
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    for (const table of Object.keys(DROP_COLUMNS)) {
      data.afterColumns[table] = await getColumns(client, table);
    }

    data.counts = await getCounts(client);
    data.imageChecks = [
      await inspectImageTable(client, "grave_recipes"),
      await inspectImageTable(client, "cemetery_stories"),
    ];
  } finally {
    client.release();
    await pool.end();
  }

  const guideResult = spawnSync(process.execPath, [GUIDE_SCRIPT_PATH], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (guideResult.status !== 0) {
    throw new Error(`Failed to regenerate database guide:\n${guideResult.stderr || guideResult.stdout}`);
  }

  data.guideUpdated = fs.existsSync(GUIDE_PATH);
  data.inspectionUpdated = fs.existsSync(INSPECTION_PATH);
  data.finishedAt = new Date().toISOString();
  writeCleanupReport(data);

  const imagePass = data.imageChecks.every((check) => check.pass);
  console.log("1. 数据库连接成功。");
  console.log("2. 删除字段列表:");
  if (data.dropped.length) {
    for (const item of data.dropped) console.log(`   - ${item.table}.${item.column}`);
  } else {
    console.log("   - 无，本次没有实际删除字段。");
  }
  if (data.skipped.length) {
    console.log("   字段不存在所以跳过:");
    for (const item of data.skipped) console.log(`   - ${item.table}.${item.column}`);
  }
  console.log("3. 五张表记录数:");
  for (const table of TABLES) console.log(`   - ${table}: ${data.counts[table] ?? "N/A"}`);
  console.log(`4. 图片字段验证结果: ${imagePass ? "通过" : "未通过"}`);
  console.log(`5. DATABASE_GUIDE.txt 已更新: ${data.guideUpdated ? "是" : "否"}`);
  console.log(`6. DATABASE_INSPECTION_RESULT.txt 已更新: ${data.inspectionUpdated ? "是" : "否"}`);
  console.log(`7. DATABASE_CLEANUP_REPORT.txt 已生成: ${CLEANUP_REPORT_PATH}`);
}

main().catch((error) => {
  console.error("Database cleanup failed:", error);
  process.exitCode = 1;
});
