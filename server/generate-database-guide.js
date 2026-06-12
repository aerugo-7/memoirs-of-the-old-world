const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { Pool } = require("pg");

const ROOT = path.resolve(__dirname, "..");
const GUIDE_PATH = path.join(ROOT, "DATABASE_GUIDE.txt");
const INSPECTION_PATH = path.join(ROOT, "DATABASE_INSPECTION_RESULT.txt");
const TABLES = ["last_meals", "grave_recipes", "cemetery_stories", "last_words", "farewell_letters"];

const TABLE_META = {
  last_meals: {
    zh: "最后一餐数据",
    purpose: "查询人物、最后一餐、罪名、地点、执行方式与中英文展示字段。",
    important: ["person_name", "food_zh", "food_en", "crime_zh", "execution_year"],
    hasImages: false,
  },
  grave_recipes: {
    zh: "墓碑食谱数据",
    purpose: "查询墓碑食谱案例、故事背景、食谱正文、厨房笔记和真实入库图片。",
    important: ["title_zh", "story_background_zh", "recipe_steps_zh", "images", "image_names"],
    hasImages: true,
  },
  cemetery_stories: {
    zh: "墓地故事数据",
    purpose: "查询墓地故事、地理背景、故事正文、观察感悟和真实入库图片。",
    important: ["title_zh", "story_body_zh", "images", "image_names"],
    hasImages: true,
  },
  last_words: {
    zh: "死刑犯遗言数据",
    purpose: "查询人物、英文遗言、中文翻译、县/地点、种族、年龄、执行编号和执行日期。",
    important: ["person_name", "body_zh", "body_en", "county_zh", "race_zh"],
    hasImages: false,
  },
  farewell_letters: {
    zh: "中文遗书数据",
    purpose: "查询中文遗书正文、地区、年龄、性别、职业、时间和方式。",
    important: ["body_zh", "location_zh", "age", "gender", "occupation"],
    hasImages: false,
  },
};

const TRANSLATION_PAIRS = {
  last_meals: [
    ["food_en", "food_zh"],
    ["location_en", "location_zh"],
    ["country_en", "country_zh"],
    ["region_en", "region_zh"],
    ["crime_en", "crime_zh"],
    ["execution_method_en", "execution_method_zh"],
  ],
  last_words: [
    ["body_en", "body_zh"],
    ["location_en", "location_zh"],
    ["county_en", "county_zh"],
    ["race_en", "race_zh"],
  ],
  grave_recipes: [
    ["title_en", "title_zh"],
    ["story_background_en", "story_background_zh"],
  ],
  cemetery_stories: [
    ["title_en", "title_zh"],
    ["story_body_en", "story_body_zh"],
  ],
};

function formatTable(rows, headers) {
  const data = [headers, ...rows.map((row) => headers.map((header) => String(row[header] ?? "")))];
  const widths = headers.map((_, index) => Math.min(70, Math.max(...data.map((row) => [...row[index]].length))));
  return data
    .map((row, rowIndex) => {
      const line = row.map((cell, index) => {
        const text = String(cell ?? "");
        const clipped = [...text].length > widths[index] ? `${[...text].slice(0, widths[index] - 1).join("")}…` : text;
        return clipped.padEnd(widths[index], " ");
      }).join(" | ");
      if (rowIndex === 0) return `${line}\n${widths.map((width) => "-".repeat(width)).join("-|-")}`;
      return line;
    })
    .join("\n");
}

function truncate(value, max = 300) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const compact = text.replace(/\s+/g, " ").trim();
  return [...compact].length > max ? `${[...compact].slice(0, max).join("")}...` : compact;
}

function sanitizeDatabaseUrl(raw) {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const user = url.username || "USER";
    url.password = "******";
    return url.toString();
  } catch {
    return raw.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:******@");
  }
}

function parseConnection(raw) {
  const fallback = { host: "", port: "5432", database: "", username: "", password: "******" };
  try {
    const url = new URL(raw);
    return {
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.replace(/^\//, ""),
      username: decodeURIComponent(url.username),
      password: "******",
      sslMode: url.searchParams.get("sslmode") || "require",
    };
  } catch {
    return fallback;
  }
}

function hexHeader(buffer, length = 8) {
  if (!buffer) return "";
  return Buffer.from(buffer).subarray(0, length).toString("hex").toUpperCase().match(/.{1,2}/g)?.join(" ") || "";
}

function classifyImage(header, mime) {
  const normalized = header.replace(/\s+/g, "");
  if (mime === "image/png" && normalized.startsWith("89504E47")) return "真实图片";
  if ((mime === "image/jpeg" || mime === "image/jpg") && normalized.startsWith("FFD8")) return "真实图片";
  if (mime === "image/webp" && normalized.startsWith("52494646")) return "真实图片";
  if (mime === "image/gif" && normalized.startsWith("47494638")) return "真实图片";
  if (normalized.startsWith("89504E47") || normalized.startsWith("FFD8") || normalized.startsWith("52494646") || normalized.startsWith("47494638")) {
    return "真实图片";
  }
  return "可疑";
}

async function columnExists(client, table, column) {
  const result = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return result.rowCount > 0;
}

function sampleValue(value) {
  if (Buffer.isBuffer(value)) return `<Buffer ${value.length} bytes>`;
  if (Array.isArray(value)) {
    if (value.length && Buffer.isBuffer(value[0])) return `<${value.length} bytea images>`;
    return truncate(value.join(", "), 180);
  }
  if (value && typeof value === "object") return truncate(value, 180);
  return truncate(value, 220);
}

async function inspectDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing in .env");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    const connection = await client.query("SELECT current_database() AS database_name, current_schema() AS schema_name, now() AS current_time");
    const basic = connection.rows[0];

    const tablePresence = {};
    for (const table of TABLES) {
      const result = await client.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        ) AS exists`,
        [table],
      );
      tablePresence[table] = result.rows[0].exists;
    }

    const counts = {};
    const columns = {};
    const nullStats = {};
    const samples = {};

    for (const table of TABLES) {
      if (!tablePresence[table]) continue;
      counts[table] = Number((await client.query(`SELECT COUNT(*) AS count FROM ${table}`)).rows[0].count);
      columns[table] = (await client.query(
        `SELECT column_name, data_type, udt_name, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table],
      )).rows;

      nullStats[table] = [];
      for (const column of columns[table]) {
        const stat = await client.query(
          `SELECT
             COUNT(*)::int AS total_count,
             COUNT(${column.column_name})::int AS non_null_count,
             (COUNT(*) - COUNT(${column.column_name}))::int AS null_count
           FROM ${table}`,
        );
        const row = stat.rows[0];
        const total = Number(row.total_count);
        const nullCount = Number(row.null_count);
        nullStats[table].push({
          column_name: column.column_name,
          total_count: total,
          non_null_count: Number(row.non_null_count),
          null_count: nullCount,
          null_ratio: total ? `${((nullCount / total) * 100).toFixed(1)}%` : "0.0%",
          note: total && nullCount === total ? "建议删除 / 当前未使用" : "",
        });
      }

      const sampleRows = (await client.query(`SELECT * FROM ${table} ORDER BY id LIMIT 2`)).rows;
      samples[table] = sampleRows.map((row) => {
        const clean = {};
        for (const [key, val] of Object.entries(row)) {
          if (key === "images") {
            clean.image_count = Array.isArray(val) ? val.length : 0;
            clean.images_size_note = "bytea 原始内容未在说明书中输出";
          } else if (key === "raw_data") {
            clean.raw_data = truncate(val, 180);
          } else {
            clean[key] = sampleValue(val);
          }
        }
        return clean;
      });
    }

    const imageChecks = {};
    const imageSamples = [];
    for (const table of ["grave_recipes", "cemetery_stories"]) {
      if (!tablePresence[table]) continue;
      imageChecks[table] = (await client.query(
        `SELECT
           id,
           title_zh,
           cardinality(images) AS image_count,
           cardinality(image_names) AS image_name_count,
           cardinality(image_mime_types) AS mime_type_count,
           pg_column_size(images) AS images_size_bytes
         FROM ${table}
         ORDER BY id`,
      )).rows.map((row) => ({
        ...row,
        pass: Number(row.image_count) > 0
          && Number(row.images_size_bytes) > 0
          && Number(row.image_count) === Number(row.image_name_count)
          && Number(row.image_count) === Number(row.mime_type_count),
      }));

      const sample = await client.query(
        `SELECT id, title_zh, image_names[1] AS image_name, image_mime_types[1] AS mime_type, images[1] AS image_data
         FROM ${table}
         WHERE cardinality(images) > 0
         ORDER BY id
         LIMIT 1`,
      );
      if (sample.rowCount) {
        const row = sample.rows[0];
        const header = hexHeader(row.image_data);
        imageSamples.push({
          table,
          id: row.id,
          title_zh: row.title_zh,
          image_name: row.image_name,
          mime_type: row.mime_type,
          byte_size: Buffer.isBuffer(row.image_data) ? row.image_data.length : 0,
          magic_header: header,
          judgment: classifyImage(header, row.mime_type),
        });
      }
    }

    const translationChecks = {};
    for (const [table, pairs] of Object.entries(TRANSLATION_PAIRS)) {
      if (!tablePresence[table]) continue;
      translationChecks[table] = [];
      for (const [en, zh] of pairs) {
        const enExists = await columnExists(client, table, en);
        const zhExists = await columnExists(client, table, zh);
        let enNonNull = null;
        let zhNonNull = null;
        if (enExists) enNonNull = Number((await client.query(`SELECT COUNT(${en}) AS count FROM ${table}`)).rows[0].count);
        if (zhExists) zhNonNull = Number((await client.query(`SELECT COUNT(${zh}) AS count FROM ${table}`)).rows[0].count);
        translationChecks[table].push({
          en_field: en,
          zh_field: zh,
          en_exists: enExists ? "是" : "否",
          zh_exists: zhExists ? "是" : "否",
          en_non_null: enNonNull ?? "N/A",
          zh_non_null: zhNonNull ?? "N/A",
          need_translation: enExists && zhExists && enNonNull > zhNonNull ? "是" : "否",
          pass: enExists && zhExists && (enNonNull === 0 || zhNonNull >= enNonNull) ? "符合预期" : "需复查",
        });
      }
    }

    const forbiddenFarewellColumns = ["person_name", "person_name_zh", "body_en", "location_en"];
    const farewellColumns = columns.farewell_letters?.map((column) => column.column_name) || [];
    const forbiddenPresent = forbiddenFarewellColumns.filter((column) => farewellColumns.includes(column));

    return {
      basic,
      sanitizedUrl: sanitizeDatabaseUrl(process.env.DATABASE_URL),
      connectionParts: parseConnection(process.env.DATABASE_URL),
      tablePresence,
      counts,
      totalRecords: Object.values(counts).reduce((sum, count) => sum + count, 0),
      columns,
      nullStats,
      imageChecks,
      imageSamples,
      translationChecks,
      farewellColumns,
      forbiddenPresent,
      samples,
    };
  } finally {
    client.release();
    await pool.end();
  }
}

function writeInspection(result) {
  const lines = [];
  lines.push("DATABASE INSPECTION RESULT");
  lines.push("==========================");
  lines.push("");
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push(`Connection: success`);
  lines.push(`Database: ${result.basic.database_name}`);
  lines.push(`Schema: ${result.basic.schema_name}`);
  lines.push(`Database time: ${result.basic.current_time.toISOString?.() || result.basic.current_time}`);
  lines.push("");

  lines.push("1. Table Presence");
  lines.push("-----------------");
  for (const table of TABLES) lines.push(`- ${table}: ${result.tablePresence[table] ? "exists" : "MISSING"}`);
  lines.push("");

  lines.push("2. Record Counts");
  lines.push("----------------");
  for (const table of TABLES) lines.push(`- ${table}: ${result.counts[table] ?? "N/A"}`);
  lines.push("");

  lines.push("3. Column Lists");
  lines.push("---------------");
  for (const table of TABLES) {
    lines.push("");
    lines.push(`[${table}]`);
    if (!result.columns[table]) {
      lines.push("MISSING TABLE");
      continue;
    }
    lines.push(formatTable(result.columns[table].map((column) => ({
      column_name: column.column_name,
      data_type: column.data_type,
      udt_name: column.udt_name,
      is_nullable: column.is_nullable,
      column_default: column.column_default || "",
    })), ["column_name", "data_type", "udt_name", "is_nullable", "column_default"]));
  }
  lines.push("");

  lines.push("4. Null Statistics");
  lines.push("------------------");
  for (const table of TABLES) {
    lines.push("");
    lines.push(`[${table}]`);
    if (!result.nullStats[table]) {
      lines.push("MISSING TABLE");
      continue;
    }
    lines.push(formatTable(result.nullStats[table], ["column_name", "total_count", "non_null_count", "null_count", "null_ratio", "note"]));
  }
  lines.push("");

  lines.push("5. Image BYTEA Verification");
  lines.push("---------------------------");
  for (const table of ["grave_recipes", "cemetery_stories"]) {
    lines.push("");
    lines.push(`[${table}]`);
    lines.push(formatTable((result.imageChecks[table] || []).map((row) => ({
      id: row.id,
      title_zh: truncate(row.title_zh, 40),
      image_count: row.image_count,
      image_name_count: row.image_name_count,
      mime_type_count: row.mime_type_count,
      images_size_bytes: row.images_size_bytes,
      pass: row.pass ? "PASS" : "FAIL",
    })), ["id", "title_zh", "image_count", "image_name_count", "mime_type_count", "images_size_bytes", "pass"]));
  }
  lines.push("");
  lines.push("Image Magic Header Samples:");
  lines.push(formatTable(result.imageSamples, ["table", "id", "image_name", "mime_type", "byte_size", "magic_header", "judgment"]));
  lines.push("");

  lines.push("6. Translation Field Verification");
  lines.push("---------------------------------");
  for (const [table, checks] of Object.entries(result.translationChecks)) {
    lines.push("");
    lines.push(`[${table}]`);
    lines.push(formatTable(checks, ["en_field", "zh_field", "en_exists", "zh_exists", "en_non_null", "zh_non_null", "need_translation", "pass"]));
  }
  lines.push("");
  lines.push("[farewell_letters]");
  lines.push(`Columns: ${result.farewellColumns.join(", ")}`);
  lines.push(`Forbidden columns present: ${result.forbiddenPresent.length ? result.forbiddenPresent.join(", ") : "none"}`);
  lines.push("");

  lines.push("7. Sample Records");
  lines.push("-----------------");
  for (const table of TABLES) {
    lines.push("");
    lines.push(`[${table}]`);
    for (const [index, sample] of (result.samples[table] || []).entries()) {
      lines.push(`Sample ${index + 1}:`);
      for (const [key, val] of Object.entries(sample)) lines.push(`  ${key}: ${val}`);
    }
  }
  lines.push("");

  fs.writeFileSync(INSPECTION_PATH, `${lines.join("\n")}\n`, "utf8");
}

function describeColumn(table, column) {
  const descriptions = {
    id: "主键 ID",
    created_at: "记录创建时间",
    raw_data: "原始数据追溯 JSONB，不建议直接展示",
    person_name: "人物英文/原始姓名",
    person_name_zh: "人物中文展示名；当前多为原名复制",
    food_en: "最后一餐英文原文",
    food_zh: "最后一餐中文翻译",
    location_en: "地点英文",
    location_zh: "地点中文",
    country_en: "国家/地区英文",
    country_zh: "国家/地区中文",
    region_en: "州/省/地区英文",
    region_zh: "州/省/地区中文",
    crime_en: "罪名英文",
    crime_zh: "罪名中文翻译",
    execution_year: "执行年份",
    execution_date: "执行日期文本",
    execution_method_en: "执行方式英文",
    execution_method_zh: "执行方式中文",
    title_en: "标题英文",
    title_zh: "标题中文",
    story_background_en: "故事背景英文原文",
    story_background_zh: "故事背景中文",
    recipe_name_zh: "食谱名称中文",
    recipe_steps_zh: "食谱步骤中文",
    kitchen_notes_zh: "厨房笔记中文",
    geographic_background_zh: "地理背景中文",
    story_body_en: "故事正文英文原文",
    story_body_zh: "故事正文中文",
    reflection_zh: "观察感悟中文",
    images: "真实图片二进制数组 BYTEA[]",
    image_names: "图片原始文件名数组",
    image_mime_types: "图片 MIME 类型数组",
    body_en: "正文英文原文",
    body_zh: "正文中文翻译或中文原文",
    county_en: "县名英文",
    county_zh: "县名中文",
    race_en: "种族英文",
    race_zh: "种族中文",
    age: "年龄",
    execution_number: "执行编号",
    tdcj_number: "TDCJ 编号",
    gender: "性别",
    occupation: "职业",
    event_time: "事件时间",
    method: "方式",
  };
  return descriptions[column] || `${table}.${column} 字段`;
}

function writeGuide(result) {
  const lines = [];
  const conn = result.connectionParts;

  lines.push("DATABASE GUIDE");
  lines.push("==============");
  lines.push("");
  lines.push("1. 基本信息");
  lines.push("-----------");
  lines.push("- 数据库类型：PostgreSQL");
  lines.push("- 云服务：Neon");
  lines.push(`- 数据库名：${result.basic.database_name}`);
  lines.push(`- Schema：${result.basic.schema_name}`);
  lines.push(`- 表数量：${TABLES.length}`);
  lines.push(`- 总记录数：${result.totalRecords}`);
  lines.push(`- 生成时间：${new Date().toISOString()}`);
  lines.push("");

  lines.push("2. 连接方式");
  lines.push("-----------");
  lines.push("项目代码应使用 `.env` 中的 DATABASE_URL。不要在前端或文档中暴露真实密码。");
  lines.push("");
  lines.push("脱敏后的当前连接串：");
  lines.push(result.sanitizedUrl);
  lines.push("");
  lines.push(".env 示例：");
  lines.push("DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require");
  lines.push("");
  lines.push("Node.js 连接方式：");
  lines.push("npm install pg dotenv");
  lines.push("");
  lines.push("```js");
  lines.push('const { Pool } = require("pg");');
  lines.push('require("dotenv").config();');
  lines.push("");
  lines.push("const pool = new Pool({");
  lines.push("  connectionString: process.env.DATABASE_URL,");
  lines.push("  ssl: { rejectUnauthorized: false }");
  lines.push("});");
  lines.push("");
  lines.push("module.exports = pool;");
  lines.push("```");
  lines.push("");
  lines.push("DBeaver 连接参数：");
  lines.push(`- Host: ${conn.host}`);
  lines.push(`- Port: ${conn.port}`);
  lines.push(`- Database: ${conn.database}`);
  lines.push(`- Username: ${conn.username}`);
  lines.push("- Password: ******");
  lines.push(`- SSL Mode: ${conn.sslMode || "require"}`);
  lines.push("");

  lines.push("3. 数据表总览");
  lines.push("-------------");
  lines.push(formatTable(TABLES.map((table) => ({
    table,
    meaning: TABLE_META[table].zh,
    records: result.counts[table] ?? 0,
    has_images: TABLE_META[table].hasImages ? "是" : "否",
    purpose: TABLE_META[table].purpose,
  })), ["table", "meaning", "records", "has_images", "purpose"]));
  lines.push("");

  lines.push("4. 每张表详细说明");
  lines.push("------------------");
  for (const table of TABLES) {
    const meta = TABLE_META[table];
    lines.push("");
    lines.push(`4.x ${table}`);
    lines.push(`- 中文含义：${meta.zh}`);
    lines.push(`- 记录数：${result.counts[table] ?? 0}`);
    lines.push(`- 是否有图片：${meta.hasImages ? "是" : "否"}`);
    lines.push(`- 是否有中英文：${table === "farewell_letters" ? "否，仅中文字段" : "是，保留英文原文与中文翻译字段"}`);
    lines.push(`- 适合查询：${meta.purpose}`);
    lines.push(`- 重要字段：${meta.important.join(", ")}`);
    lines.push("");
    lines.push("字段列表：");
    lines.push(formatTable((result.columns[table] || []).map((column) => ({
      column_name: column.column_name,
      data_type: column.data_type === "ARRAY" && column.udt_name === "_bytea" ? "BYTEA[]" : column.data_type,
      nullable: column.is_nullable,
      default_value: column.column_default || "",
      description: describeColumn(table, column.column_name),
    })), ["column_name", "data_type", "nullable", "default_value", "description"]));
  }
  lines.push("");

  lines.push("5. 图片字段说明");
  lines.push("----------------");
  lines.push("图片真实存储在 PostgreSQL 中：");
  lines.push("- grave_recipes.images");
  lines.push("- cemetery_stories.images");
  lines.push("");
  lines.push("字段类型：BYTEA[]");
  lines.push("配套字段：image_names, image_mime_types");
  lines.push("");
  lines.push("说明：");
  lines.push("- 图片不是路径。");
  lines.push("- 图片不是 URL。");
  lines.push("- 图片真实存储在 PostgreSQL 的 BYTEA[] 字段中。");
  lines.push("- 前端或后端读取时需要转 base64，或通过图片 API 直接输出二进制。");
  lines.push("- 列表接口不要 SELECT images，只在详情或图片接口读取。");
  lines.push("");
  lines.push("图片 API 示例：");
  lines.push("```js");
  lines.push('app.get("/api/grave-recipes/:id/image/:index", async (req, res) => {');
  lines.push("  const { id, index } = req.params;");
  lines.push("  const result = await pool.query(");
  lines.push('    "SELECT images, image_mime_types FROM grave_recipes WHERE id = $1",');
  lines.push("    [id]");
  lines.push("  );");
  lines.push("");
  lines.push("  const row = result.rows[0];");
  lines.push('  if (!row) return res.status(404).send("Not found");');
  lines.push("");
  lines.push("  const imageIndex = Number(index);");
  lines.push("  const image = row.images[imageIndex];");
  lines.push('  const mime = row.image_mime_types[imageIndex] || "image/jpeg";');
  lines.push("");
  lines.push("  res.setHeader(\"Content-Type\", mime);");
  lines.push("  res.send(image);");
  lines.push("});");
  lines.push("```");
  lines.push("");
  lines.push("注意：PostgreSQL 数组在 Node.js 中一般会变成 Buffer 数组，具体取决于 pg 的解析结果；如果读取异常，需要单独处理 bytea[] 解析。");
  lines.push("");

  lines.push("6. 常用查询 SQL");
  lines.push("----------------");
  lines.push("```sql");
  lines.push("SELECT COUNT(*) FROM last_meals;");
  lines.push("SELECT * FROM last_meals ORDER BY RANDOM() LIMIT 1;");
  lines.push("");
  lines.push("SELECT * FROM last_words");
  lines.push("WHERE body_zh ILIKE '%关键词%'");
  lines.push("OR body_en ILIKE '%keyword%'");
  lines.push("LIMIT 20;");
  lines.push("");
  lines.push("SELECT id, title_zh, cardinality(images) AS image_count");
  lines.push("FROM grave_recipes");
  lines.push("WHERE cardinality(images) > 0;");
  lines.push("");
  lines.push("SELECT id, title_zh, cardinality(images) AS image_count");
  lines.push("FROM cemetery_stories");
  lines.push("WHERE cardinality(images) > 0;");
  lines.push("");
  lines.push("SELECT id, person_name, food_zh, food_en");
  lines.push("FROM last_meals");
  lines.push("LIMIT 20;");
  lines.push("```");
  lines.push("");

  lines.push("7. 推荐 API 调用方式");
  lines.push("--------------------");
  lines.push("- GET /api/db/last-meals");
  lines.push("- GET /api/db/last-meals/random");
  lines.push("- GET /api/db/last-meals/:id");
  lines.push("- GET /api/db/last-words");
  lines.push("- GET /api/db/last-words/random");
  lines.push("- GET /api/db/last-words/:id");
  lines.push("- GET /api/db/grave-recipes");
  lines.push("- GET /api/db/grave-recipes/:id");
  lines.push("- GET /api/db/grave-recipes/:id/image/:index");
  lines.push("- GET /api/db/cemetery-stories");
  lines.push("- GET /api/db/cemetery-stories/:id");
  lines.push("- GET /api/db/cemetery-stories/:id/image/:index");
  lines.push("- GET /api/db/farewell-letters");
  lines.push("- GET /api/db/farewell-letters/:id");
  lines.push("");

  lines.push("8. Node.js 查询示例");
  lines.push("-------------------");
  lines.push("```js");
  lines.push("// 查询最后一餐列表，不读取大字段");
  lines.push("const meals = await pool.query(`");
  lines.push("  SELECT id, person_name, food_zh, food_en, country_zh, execution_year");
  lines.push("  FROM last_meals");
  lines.push("  ORDER BY id");
  lines.push("  LIMIT 50");
  lines.push("`);");
  lines.push("");
  lines.push("// 查询随机遗言");
  lines.push("const lastWord = await pool.query(`");
  lines.push("  SELECT id, person_name, body_zh, body_en, county_zh, race_zh");
  lines.push("  FROM last_words");
  lines.push("  ORDER BY RANDOM()");
  lines.push("  LIMIT 1");
  lines.push("`);");
  lines.push("");
  lines.push("// 查询墓地食谱详情，但不直接输出图片二进制");
  lines.push("const recipe = await pool.query(`");
  lines.push("  SELECT id, title_zh, title_en, story_background_zh, recipe_steps_zh, image_names, image_mime_types, cardinality(images) AS image_count");
  lines.push("  FROM grave_recipes");
  lines.push("  WHERE id = $1");
  lines.push("`, [id]);");
  lines.push("");
  lines.push("// 输出图片接口");
  lines.push("const imageResult = await pool.query(`");
  lines.push("  SELECT images, image_mime_types");
  lines.push("  FROM grave_recipes");
  lines.push("  WHERE id = $1");
  lines.push("`, [id]);");
  lines.push("const image = imageResult.rows[0].images[index];");
  lines.push("const mime = imageResult.rows[0].image_mime_types[index] || 'image/jpeg';");
  lines.push("res.setHeader('Content-Type', mime);");
  lines.push("res.send(image);");
  lines.push("");
  lines.push("// 搜索遗言关键词");
  lines.push("const keyword = `%${q}%`;");
  lines.push("const search = await pool.query(`");
  lines.push("  SELECT id, person_name, body_zh, body_en");
  lines.push("  FROM last_words");
  lines.push("  WHERE body_zh ILIKE $1 OR body_en ILIKE $1");
  lines.push("  LIMIT 20");
  lines.push("`, [keyword]);");
  lines.push("```");
  lines.push("");

  lines.push("9. 数据质量检查结果");
  lines.push("--------------------");
  const allImagePass = ["grave_recipes", "cemetery_stories"].every((table) => (result.imageChecks[table] || []).every((row) => row.pass));
  lines.push(`- 图片是否是真实 bytea：${allImagePass ? "是，检查通过" : "存在可疑记录，详见 DATABASE_INSPECTION_RESULT.txt"}`);
  lines.push("- 有 100% 为空的字段：");
  for (const [table, stats] of Object.entries(result.nullStats)) {
    const empty = stats.filter((row) => row.note).map((row) => row.column_name);
    lines.push(`  - ${table}: ${empty.length ? empty.join(", ") : "无"}`);
  }
  lines.push("- 翻译字段完整性：详见 DATABASE_INSPECTION_RESULT.txt 的 Translation Field Verification。");
  lines.push(`- farewell_letters 是否不存在英文列和人名列：${result.forbiddenPresent.length ? `否，仍存在 ${result.forbiddenPresent.join(", ")}` : "是"}`);
  lines.push("- 需要人工复查：原始数据中确实没有英文结构化字段的列，例如部分食谱步骤英文、厨房笔记英文、故事观察感悟英文可能为空。");
  lines.push("");

  lines.push("10. 使用注意事项");
  lines.push("----------------");
  lines.push("- 不要直接在生产数据库 DROP 表。");
  lines.push("- 不要在前端暴露 DATABASE_URL。");
  lines.push("- 图片字段较大，查询列表时不要 SELECT images。");
  lines.push("- 列表接口应排除 images，只在详情或图片接口读取。");
  lines.push("- raw_data 仅用于追溯，不建议前端直接展示。");
  lines.push("- 如果修改数据库密码，需要同步 `.env` 和 DBeaver 连接配置。");
  lines.push("");

  fs.writeFileSync(GUIDE_PATH, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const result = await inspectDatabase();
  writeInspection(result);
  writeGuide(result);

  const allTablesExist = TABLES.every((table) => result.tablePresence[table]);
  const imagePass = ["grave_recipes", "cemetery_stories"].every((table) => (result.imageChecks[table] || []).every((row) => row.pass));

  console.log("1. 数据库连接成功");
  console.log(`2. 五张表全部存在: ${allTablesExist ? "是" : "否"}`);
  console.log("3. 每张表记录数:");
  for (const table of TABLES) console.log(`   - ${table}: ${result.counts[table] ?? "N/A"}`);
  console.log(`4. 图片 bytea 验证是否通过: ${imagePass ? "是" : "否"}`);
  console.log(`5. 文件生成路径:`);
  console.log(`   - ${GUIDE_PATH}`);
  console.log(`   - ${INSPECTION_PATH}`);
}

main().catch((error) => {
  console.error("Failed to generate database guide:", error);
  process.exitCode = 1;
});
