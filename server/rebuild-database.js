const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { Pool } = require("pg");
const XLSX = require("xlsx");
const { parse } = require("csv-parse/sync");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "数据");
const CACHE_PATH = path.join(__dirname, "translation-cache.json");
const REPORT_PATH = path.join(ROOT, "DATABASE_REBUILD_REPORT.md");
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

const TABLES = ["last_meals", "grave_recipes", "cemetery_stories", "last_words", "farewell_letters"];
const REPORT = {
  startedAt: new Date().toISOString(),
  connected: false,
  tablesCreated: [],
  counts: {},
  imageStats: { grave_recipes: 0, cemetery_stories: 0 },
  translation: {
    provider: "DeepSeek API",
    attempted: 0,
    cacheHits: 0,
    succeeded: 0,
    failed: [],
  },
  emptyFields: {},
  droppedFields: {
    all_tables: ["source_file", "source_sheet", "source_row"],
    grave_recipes: ["image_folder", "image paths"],
    cemetery_stories: ["image_folder", "image paths"],
    farewell_letters: ["person_name", "person_name_zh", "body_en", "location_en"],
  },
  imageRows: { grave_recipes: [], cemetery_stories: [] },
  sampleTranslations: {},
  farewellColumns: [],
  notes: [],
};

let translationCache = {};
let keepAliveClient = null;

function loadCache() {
  try {
    translationCache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch {
    translationCache = {};
  }
}

function saveCache() {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(translationCache, null, 2), "utf8");
}

function normalizeText(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize("NFKC")
    .replace(/[’']/g, "")
    .replace(/^cemetery\s+(recipes|stories)\s*[:_]\s*/i, "")
    .replace(/[_:：&]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fa5 ]/gi, "")
    .trim()
    .toLowerCase();
}

function value(row, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const text = normalizeText(row[key]);
      if (text) return text;
    }
  }
  return "";
}

function nullable(value) {
  const text = normalizeText(value);
  return text ? text : null;
}

function intOrNull(value) {
  const text = normalizeText(value);
  const match = text.match(/\d{4}/) || text.match(/^\d+$/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function readWorkbookRows(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  return workbook.SheetNames.map((sheetName) => ({
    sheetName,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: "",
      raw: false,
      blankrows: false,
    }),
  }));
}

function readCsvRows(filePath, encoding = "latin1") {
  const text = fs.readFileSync(filePath).toString(encoding).replace(/^\uFEFF/, "");
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    bom: true,
  });
}

function mimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function listImageFolders(category) {
  const categoryDir = path.join(DATA_DIR, "墓地摄影数据", "图片库", category);
  if (!fs.existsSync(categoryDir)) return [];
  return fs.readdirSync(categoryDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(categoryDir, entry.name));
}

function buildImageFolderMap(category) {
  const folders = listImageFolders(category);
  const map = new Map();
  for (const folder of folders) map.set(normalizeKey(path.basename(folder)), folder);
  return { folders, map };
}

function findFolder(folderMap, title) {
  const key = normalizeKey(title);
  if (folderMap.map.has(key)) return folderMap.map.get(key);
  for (const [folderKey, folder] of folderMap.map.entries()) {
    if (folderKey.includes(key) || key.includes(folderKey)) return folder;
  }
  return null;
}

function readImages(folder) {
  if (!folder || !fs.existsSync(folder)) return { buffers: [], names: [], mimeTypes: [] };
  const files = fs.readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp|gif)$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  return {
    buffers: files.map((entry) => fs.readFileSync(path.join(folder, entry.name))),
    names: files.map((entry) => entry.name),
    mimeTypes: files.map((entry) => mimeType(entry.name)),
  };
}

function dictionaryTranslate(text) {
  const exact = {
    White: "白人",
    Black: "黑人",
    Hispanic: "西班牙裔",
    Asian: "亚裔",
    Other: "其他",
    Male: "男性",
    Female: "女性",
    "Lethal injection": "注射死刑",
    "Lethal Injection": "注射死刑",
    Electrocution: "电椅",
    Hanging: "绞刑",
    Shooting: "枪决",
    "Firing squad": "行刑队枪决",
    "Gas chamber": "毒气室",
  };
  if (exact[text]) return exact[text];
  let output = text;
  const words = [
    [/fried chicken/gi, "炸鸡"],
    [/steak/gi, "牛排"],
    [/pizza/gi, "披萨"],
    [/ice cream/gi, "冰淇淋"],
    [/coffee/gi, "咖啡"],
    [/\bcoke\b|coca-cola/gi, "可乐"],
    [/hamburger|burger/gi, "汉堡"],
    [/eggs?/gi, "鸡蛋"],
    [/bacon/gi, "培根"],
    [/beans?/gi, "豆子"],
    [/cake/gi, "蛋糕"],
    [/\bpie\b/gi, "派"],
    [/milk/gi, "牛奶"],
    [/water/gi, "水"],
    [/\btea\b/gi, "茶"],
    [/potatoes?/gi, "土豆"],
    [/cookies?/gi, "饼干"],
    [/bread/gi, "面包"],
  ];
  for (const [pattern, replacement] of words) output = output.replace(pattern, replacement);
  return output === text ? "" : output;
}

async function translate(text, context = "general") {
  const source = normalizeText(text);
  if (!source) return "";
  const cacheKey = `${context}:${source}`;
  if (translationCache[cacheKey]) {
    REPORT.translation.cacheHits += 1;
    return translationCache[cacheKey];
  }

  const ruleBased = dictionaryTranslate(source);
  if (ruleBased && source.length <= 80) {
    translationCache[cacheKey] = ruleBased;
    REPORT.translation.succeeded += 1;
    return ruleBased;
  }

  REPORT.translation.attempted += 1;
  if (!process.env.DEEPSEEK_API_KEY) {
    REPORT.translation.failed.push({ context, text: source.slice(0, 160), error: "DEEPSEEK_API_KEY missing" });
    return ruleBased || "";
  }

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          {
            role: "system",
            content: "你是专业翻译。把用户给出的英文翻译成自然、准确、适合数字档案馆展示的简体中文。只输出译文，不要解释。",
          },
          { role: "user", content: source },
        ],
        stream: false,
      }),
    });
    if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}: ${await response.text()}`);
    const data = await response.json();
    const translated = normalizeText(data?.choices?.[0]?.message?.content);
    if (!translated) throw new Error("empty translation");
    translationCache[cacheKey] = translated;
    REPORT.translation.succeeded += 1;
    if (REPORT.translation.succeeded % 25 === 0) saveCache();
    return translated;
  } catch (error) {
    REPORT.translation.failed.push({ context, text: source.slice(0, 160), error: error.message });
    return ruleBased || "";
  }
}

function parseJsonArrayFromText(text) {
  const trimmed = normalizeText(text);
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map((item) => normalizeText(item));
  } catch {
    // Try to recover an array embedded in a markdown/code response.
  }
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    if (Array.isArray(parsed)) return parsed.map((item) => normalizeText(item));
  }
  throw new Error("response is not a JSON array");
}

async function translateMany(texts, context = "general") {
  const results = new Map();
  const pending = [];

  for (const text of texts) {
    const source = normalizeText(text);
    if (!source || results.has(source)) continue;
    const cacheKey = `${context}:${source}`;
    if (translationCache[cacheKey]) {
      REPORT.translation.cacheHits += 1;
      results.set(source, translationCache[cacheKey]);
      continue;
    }
    const ruleBased = dictionaryTranslate(source);
    if (ruleBased && source.length <= 80) {
      translationCache[cacheKey] = ruleBased;
      REPORT.translation.succeeded += 1;
      results.set(source, ruleBased);
      continue;
    }
    pending.push(source);
  }

  if (!pending.length) return results;
  if (!process.env.DEEPSEEK_API_KEY) {
    for (const source of pending) {
      REPORT.translation.failed.push({ context, text: source.slice(0, 160), error: "DEEPSEEK_API_KEY missing" });
      results.set(source, "");
    }
    return results;
  }

  const chunks = [];
  let chunk = [];
  let chars = 0;
  for (const source of pending) {
    const limit = source.length > 1000 ? 6 : 24;
    if (chunk.length >= limit || chars + source.length > 12000) {
      chunks.push(chunk);
      chunk = [];
      chars = 0;
    }
    chunk.push(source);
    chars += source.length;
  }
  if (chunk.length) chunks.push(chunk);

  for (const items of chunks) {
    REPORT.translation.attempted += 1;
    try {
      const response = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            {
              role: "system",
              content: "你是专业翻译。把 JSON 数组中的每个英文字符串翻译成自然、准确、适合数字档案馆展示的简体中文。必须只输出 JSON 字符串数组，顺序和长度必须与输入一致，不要解释。",
            },
            { role: "user", content: JSON.stringify(items) },
          ],
          stream: false,
        }),
      });
      if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}: ${await response.text()}`);
      const data = await response.json();
      const translated = parseJsonArrayFromText(data?.choices?.[0]?.message?.content || "");
      if (translated.length !== items.length) throw new Error(`translation count mismatch: ${translated.length}/${items.length}`);
      for (let i = 0; i < items.length; i += 1) {
        const source = items[i];
        const target = translated[i];
        const cacheKey = `${context}:${source}`;
        translationCache[cacheKey] = target;
        results.set(source, target);
        REPORT.translation.succeeded += 1;
      }
      saveCache();
      if (keepAliveClient) await keepAliveClient.query("SELECT 1").catch(() => {});
    } catch (error) {
      REPORT.translation.failed.push({ context, text: `${items.length} item batch`, error: error.message });
      for (const source of items) {
        const fallback = await translate(source, context);
        results.set(source, fallback);
      }
      if (keepAliveClient) await keepAliveClient.query("SELECT 1").catch(() => {});
    }
  }

  return results;
}

async function recreateTables(client) {
  await client.query(`
    DROP TABLE IF EXISTS last_meals;
    DROP TABLE IF EXISTS grave_recipes;
    DROP TABLE IF EXISTS cemetery_stories;
    DROP TABLE IF EXISTS last_words;
    DROP TABLE IF EXISTS farewell_letters;

    CREATE TABLE last_meals (
      id SERIAL PRIMARY KEY,
      person_name TEXT,
      person_name_zh TEXT,
      food_en TEXT,
      food_zh TEXT,
      location_en TEXT,
      location_zh TEXT,
      country_en TEXT,
      country_zh TEXT,
      region_en TEXT,
      region_zh TEXT,
      crime_en TEXT,
      crime_zh TEXT,
      execution_year INTEGER,
      execution_date TEXT,
      execution_method_en TEXT,
      execution_method_zh TEXT,
      raw_data JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE grave_recipes (
      id SERIAL PRIMARY KEY,
      title_en TEXT,
      title_zh TEXT,
      story_background_en TEXT,
      story_background_zh TEXT,
      recipe_name_en TEXT,
      recipe_name_zh TEXT,
      recipe_steps_en TEXT,
      recipe_steps_zh TEXT,
      kitchen_notes_en TEXT,
      kitchen_notes_zh TEXT,
      images BYTEA[],
      image_names TEXT[],
      image_mime_types TEXT[],
      raw_data JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE cemetery_stories (
      id SERIAL PRIMARY KEY,
      title_en TEXT,
      title_zh TEXT,
      geographic_background_en TEXT,
      geographic_background_zh TEXT,
      story_body_en TEXT,
      story_body_zh TEXT,
      reflection_en TEXT,
      reflection_zh TEXT,
      images BYTEA[],
      image_names TEXT[],
      image_mime_types TEXT[],
      raw_data JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE last_words (
      id SERIAL PRIMARY KEY,
      person_name TEXT,
      body_en TEXT,
      body_zh TEXT,
      location_en TEXT,
      location_zh TEXT,
      county_en TEXT,
      county_zh TEXT,
      race_en TEXT,
      race_zh TEXT,
      age INTEGER,
      execution_number TEXT,
      tdcj_number TEXT,
      execution_date TEXT,
      raw_data JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE farewell_letters (
      id SERIAL PRIMARY KEY,
      body_zh TEXT,
      location_zh TEXT,
      age TEXT,
      gender TEXT,
      occupation TEXT,
      event_time TEXT,
      method TEXT,
      raw_data JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  REPORT.tablesCreated = TABLES.slice();
}

async function insertSimple(client, table, data) {
  const columns = Object.keys(data);
  const values = columns.map((column) => (column === "raw_data" ? JSON.stringify(data[column] ?? null) : data[column]));
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  await client.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`, values);
}

async function insertWithImages(client, table, data, images) {
  const columns = Object.keys(data);
  const values = columns.map((column) => (column === "raw_data" ? JSON.stringify(data[column] ?? null) : data[column]));
  const imageStart = values.length + 1;
  const imagePlaceholders = images.buffers.map((_, i) => `$${imageStart + i}::bytea`).join(", ");
  const namesIndex = imageStart + images.buffers.length;
  const mimeIndex = namesIndex + 1;
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const imageSql = images.buffers.length ? `ARRAY[${imagePlaceholders}]::bytea[]` : "ARRAY[]::bytea[]";

  await client.query(
    `INSERT INTO ${table} (${columns.join(", ")}, images, image_names, image_mime_types)
     VALUES (${placeholders}, ${imageSql}, $${namesIndex}::text[], $${mimeIndex}::text[])`,
    [...values, ...images.buffers, images.names, images.mimeTypes],
  );
}

async function importLastMeals(client) {
  const baseDir = path.join(DATA_DIR, "List of last meals");
  const files = ["Asia.xlsx", "Canada.xlsx", "Europe.xlsx", "United States.xlsx"];
  const records = [];
  for (const file of files) {
    const filePath = path.join(baseDir, file);
    for (const { sheetName, rows } of readWorkbookRows(filePath)) {
      for (const row of rows) {
        const personName = value(row, ["Name"]);
        const foodEn = value(row, ["Requested meal", "Requested Meal"]);
        if (!personName && !foodEn) continue;
        const countryEn = value(row, ["Country", "Country/Territory"]) || (file === "United States.xlsx" ? "United States" : path.basename(file, ".xlsx"));
        const regionEn = value(row, ["State", "Province"]) || (file === "United States.xlsx" ? sheetName : "");
        const locationEn = [regionEn, countryEn].filter(Boolean).join(", ");
        const crimeEn = value(row, ["Crime"]);
        const methodEn = value(row, ["Method of execution", "Method of Execution"]);
        records.push({ filePath, sheetName, row, personName, foodEn, countryEn, regionEn, locationEn, crimeEn, methodEn });
      }
    }
  }

  const foodZh = await translateMany(records.map((record) => record.foodEn), "last_meals.food");
  const locationZh = await translateMany(records.map((record) => record.locationEn), "last_meals.location");
  const countryZh = await translateMany(records.map((record) => record.countryEn), "last_meals.country");
  const regionZh = await translateMany(records.map((record) => record.regionEn), "last_meals.region");
  const crimeZh = await translateMany(records.map((record) => record.crimeEn), "last_meals.crime");
  const methodZh = await translateMany(records.map((record) => record.methodEn), "last_meals.execution_method");

  let count = 0;
  for (const record of records) {
        await insertSimple(client, "last_meals", {
          person_name: nullable(record.personName),
          person_name_zh: nullable(record.personName),
          food_en: nullable(record.foodEn),
          food_zh: nullable(foodZh.get(record.foodEn)),
          location_en: nullable(record.locationEn),
          location_zh: nullable(locationZh.get(record.locationEn)),
          country_en: nullable(record.countryEn),
          country_zh: nullable(countryZh.get(record.countryEn)),
          region_en: nullable(record.regionEn),
          region_zh: nullable(regionZh.get(record.regionEn)),
          crime_en: nullable(record.crimeEn),
          crime_zh: nullable(crimeZh.get(record.crimeEn)),
          execution_year: intOrNull(value(record.row, ["Year", "Date of Execution"])),
          execution_date: nullable(value(record.row, ["Date of Execution"])),
          execution_method_en: nullable(record.methodEn),
          execution_method_zh: nullable(methodZh.get(record.methodEn)),
          raw_data: { source_file: rel(record.filePath), source_sheet: record.sheetName, row: record.row },
        });
        count += 1;
  }
  REPORT.counts.last_meals_inserted = count;
}

function originalMap(workbookPath, sheetName) {
  const sheet = readWorkbookRows(workbookPath).find((item) => item.sheetName === sheetName);
  const map = new Map();
  if (!sheet) return map;
  for (const row of sheet.rows) {
    const title = value(row, ["标题"]);
    if (title) map.set(normalizeKey(title), { title_en: title, body_en: value(row, ["正文"]) });
  }
  return map;
}

async function importGraveRecipes(client) {
  const structuredPath = path.join(DATA_DIR, "墓地摄影数据", "墓地摄影文字档案_已翻译结构化.xlsx");
  const originalPath = path.join(DATA_DIR, "墓地摄影数据", "墓地摄影文字档案.xlsx");
  const originals = originalMap(originalPath, "墓地食谱");
  const folderMap = buildImageFolderMap("墓地食谱");
  const sheet = readWorkbookRows(structuredPath).find((item) => item.sheetName.includes("食谱"));
  let count = 0;
  if (!sheet) return;
  for (const row of sheet.rows) {
    const rawTitle = value(row, ["原始标题", "标题"]);
    if (!rawTitle) continue;
    const original = originals.get(normalizeKey(rawTitle)) || {};
    const folder = findFolder(folderMap, rawTitle);
    const images = readImages(folder);
    REPORT.imageStats.grave_recipes += images.buffers.length;
    REPORT.imageRows.grave_recipes.push({ title: value(row, ["翻译标题"]) || rawTitle, image_count: images.buffers.length });
    const titleEn = original.title_en || value(row, ["标题", "原始标题"]);
    const storyEn = original.body_en || "";
    const recipeNameZh = value(row, ["食谱名称"]);
    const recipeStepsZh = value(row, ["制作配方与步骤"]);
    const kitchenNotesZh = value(row, ["厨房笔记"]);
    await insertWithImages(client, "grave_recipes", {
      title_en: nullable(titleEn),
      title_zh: nullable(value(row, ["翻译标题"]) || await translate(titleEn, "grave_recipes.title")),
      story_background_en: nullable(storyEn),
      story_background_zh: nullable(value(row, ["故事背景"]) || await translate(storyEn, "grave_recipes.story")),
      recipe_name_en: null,
      recipe_name_zh: nullable(recipeNameZh),
      recipe_steps_en: null,
      recipe_steps_zh: nullable(recipeStepsZh),
      kitchen_notes_en: null,
      kitchen_notes_zh: nullable(kitchenNotesZh),
      raw_data: { source_file: rel(structuredPath), original_file: rel(originalPath), row, english_original: original },
    }, images);
    count += 1;
  }
  REPORT.counts.grave_recipes_inserted = count;
}

async function importCemeteryStories(client) {
  const structuredPath = path.join(DATA_DIR, "墓地摄影数据", "墓地摄影文字档案_已翻译结构化.xlsx");
  const originalPath = path.join(DATA_DIR, "墓地摄影数据", "墓地摄影文字档案.xlsx");
  const originals = originalMap(originalPath, "墓地故事");
  const folderMap = buildImageFolderMap("墓地故事");
  const sheet = readWorkbookRows(structuredPath).find((item) => item.sheetName.includes("故事"));
  let count = 0;
  if (!sheet) return;
  for (const row of sheet.rows) {
    const rawTitle = value(row, ["原始标题", "标题"]);
    if (!rawTitle) continue;
    const original = originals.get(normalizeKey(rawTitle)) || {};
    const folder = findFolder(folderMap, rawTitle);
    const images = readImages(folder);
    REPORT.imageStats.cemetery_stories += images.buffers.length;
    REPORT.imageRows.cemetery_stories.push({ title: value(row, ["翻译标题"]) || rawTitle, image_count: images.buffers.length });
    const titleEn = original.title_en || value(row, ["标题", "原始标题"]);
    const bodyEn = original.body_en || "";
    await insertWithImages(client, "cemetery_stories", {
      title_en: nullable(titleEn),
      title_zh: nullable(value(row, ["翻译标题"]) || await translate(titleEn, "cemetery_stories.title")),
      geographic_background_en: null,
      geographic_background_zh: nullable(value(row, ["地理背景"])),
      story_body_en: nullable(bodyEn),
      story_body_zh: nullable(value(row, ["故事正文"]) || await translate(bodyEn, "cemetery_stories.body")),
      reflection_en: null,
      reflection_zh: nullable(value(row, ["观察感悟"])),
      raw_data: { source_file: rel(structuredPath), original_file: rel(originalPath), row, english_original: original },
    }, images);
    count += 1;
  }
  REPORT.counts.cemetery_stories_inserted = count;
}

async function importLastWords(client) {
  const files = [
    path.join(DATA_DIR, "德克萨斯州死刑执行信息和遗言", "offenders.csv"),
    path.join(DATA_DIR, "死囚的遗言", "Texas Last Statement - CSV.csv"),
  ];
  const seen = new Set();
  const records = [];
  for (const filePath of files) {
    for (const row of readCsvRows(filePath, "latin1")) {
      const first = value(row, ["FirstName", "First Name"]);
      const last = value(row, ["LastName", "Last Name"]);
      const personName = [first, last].filter(Boolean).join(" ");
      const bodyEn = value(row, ["LastStatement", "Last Statement"]);
      if (!personName && !bodyEn) continue;
      const executionNumber = value(row, ["Execution", "Execution #"]);
      const tdcj = value(row, ["TDCJNumber", "TDCJ Number"]);
      const dedupeKey = tdcj || executionNumber || normalizeKey(`${personName} ${bodyEn.slice(0, 80)}`);
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const county = value(row, ["CountyOfConviction", "County"]);
      const race = value(row, ["Race"]);
      records.push({ filePath, row, personName, bodyEn, executionNumber, tdcj, county, race });
    }
  }

  const bodyZh = await translateMany(records.map((record) => record.bodyEn), "last_words.body");
  const countyZh = await translateMany(records.map((record) => record.county), "last_words.county");
  const raceZh = await translateMany(records.map((record) => record.race), "last_words.race");

  let count = 0;
  for (const record of records) {
      await insertSimple(client, "last_words", {
        person_name: nullable(record.personName),
        body_en: nullable(record.bodyEn),
        body_zh: nullable(bodyZh.get(record.bodyEn)),
        location_en: nullable(record.county),
        location_zh: nullable(countyZh.get(record.county)),
        county_en: nullable(record.county),
        county_zh: nullable(countyZh.get(record.county)),
        race_en: nullable(record.race),
        race_zh: nullable(raceZh.get(record.race)),
        age: intOrNull(value(record.row, ["Age"])),
        execution_number: nullable(record.executionNumber),
        tdcj_number: nullable(record.tdcj),
        execution_date: nullable(value(record.row, ["Date"])),
        raw_data: { source_file: rel(record.filePath), row: record.row },
      });
      count += 1;
  }
  REPORT.counts.last_words_inserted = count;
}

function parseFarewellJson(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(text.replace(/,\s*([\]}])/g, "$1"));
  }
}

async function importFarewellLetters(client) {
  const filePath = path.join(DATA_DIR, "遗书", "ChineseSuicideNotes.json");
  const rows = parseFarewellJson(filePath);
  let count = 0;
  for (const row of rows) {
    const bodyZh = value(row, ["遗书", "正文"]);
    if (!bodyZh) continue;
    await insertSimple(client, "farewell_letters", {
      body_zh: nullable(bodyZh),
      location_zh: nullable(value(row, ["地区", "地点"])),
      age: nullable(value(row, ["年龄"])),
      gender: nullable(value(row, ["性别"])),
      occupation: nullable(value(row, ["职业"])),
      event_time: nullable(value(row, ["时间"])),
      method: nullable(value(row, ["方式"])),
      raw_data: { source_file: rel(filePath), row },
    });
    count += 1;
  }
  REPORT.counts.farewell_letters_inserted = count;
}

async function verify(client) {
  for (const table of TABLES) {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    REPORT.counts[table] = result.rows[0].count;
  }
  const columns = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'farewell_letters'
    ORDER BY ordinal_position
  `);
  REPORT.farewellColumns = columns.rows.map((row) => row.column_name);
  REPORT.sampleTranslations.last_meals = (await client.query("SELECT id, food_en, food_zh FROM last_meals ORDER BY id LIMIT 10")).rows;
  REPORT.sampleTranslations.last_words = (await client.query("SELECT id, body_en, body_zh FROM last_words ORDER BY id LIMIT 5")).rows;
  REPORT.emptyFields = {};
  for (const table of TABLES) {
    const cols = (await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1 AND column_name NOT IN ('id', 'created_at')
      ORDER BY ordinal_position
    `, [table])).rows.map((row) => row.column_name);
    REPORT.emptyFields[table] = [];
    for (const col of cols) {
      const count = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${col} IS NOT NULL`);
      if (count.rows[0].count === 0) REPORT.emptyFields[table].push(col);
    }
  }
}

function writeReport() {
  const lines = [];
  lines.push("# DATABASE REBUILD REPORT");
  lines.push("");
  lines.push(`重建时间：${new Date().toISOString()}`);
  lines.push(`数据库连接：${REPORT.connected ? "成功" : "失败"}`);
  lines.push("");
  lines.push("## 创建的表");
  lines.push("");
  for (const table of REPORT.tablesCreated) lines.push(`- ${table}`);
  lines.push("");
  lines.push("## 记录数");
  lines.push("");
  lines.push("| 表 | 记录数 |");
  lines.push("|---|---:|");
  for (const table of TABLES) lines.push(`| ${table} | ${REPORT.counts[table] ?? 0} |`);
  lines.push("");
  lines.push("## 图片入库");
  lines.push("");
  lines.push(`- grave_recipes 图片总数：${REPORT.imageStats.grave_recipes}`);
  lines.push(`- cemetery_stories 图片总数：${REPORT.imageStats.cemetery_stories}`);
  lines.push("- 图片已存入 `BYTEA[] images`，文件名存入 `image_names`，MIME 类型存入 `image_mime_types`，未保存路径字段。");
  lines.push("- 后续如果线上加载性能不足，建议改为对象存储 + CDN，数据库只保存对象 key。");
  lines.push("");
  lines.push("### 每条记录图片数");
  lines.push("");
  for (const [table, rows] of Object.entries(REPORT.imageRows)) {
    lines.push(`#### ${table}`);
    for (const row of rows) lines.push(`- ${row.title}: ${row.image_count}`);
  }
  lines.push("");
  lines.push("## 翻译完成情况");
  lines.push("");
  lines.push(`- 翻译服务：${REPORT.translation.provider}`);
  lines.push(`- API 请求尝试：${REPORT.translation.attempted}`);
  lines.push(`- 缓存命中：${REPORT.translation.cacheHits}`);
  lines.push(`- 翻译成功/规则补齐：${REPORT.translation.succeeded}`);
  lines.push(`- 翻译失败：${REPORT.translation.failed.length}`);
  if (REPORT.translation.failed.length) {
    for (const item of REPORT.translation.failed.slice(0, 30)) {
      lines.push(`  - ${item.context}: ${item.error} / ${item.text}`);
    }
  }
  lines.push("");
  lines.push("## 仍全为空的字段");
  lines.push("");
  for (const [table, fields] of Object.entries(REPORT.emptyFields)) {
    lines.push(`- ${table}: ${fields.length ? fields.join(", ") : "无"}`);
  }
  lines.push("");
  lines.push("## 删除/不再保留的字段");
  lines.push("");
  for (const [table, fields] of Object.entries(REPORT.droppedFields)) {
    lines.push(`- ${table}: ${fields.join(", ")}`);
  }
  lines.push("");
  lines.push("## farewell_letters 字段确认");
  lines.push("");
  lines.push(REPORT.farewellColumns.join(", "));
  lines.push("");
  lines.push("确认不包含：`person_name`, `person_name_zh`, `body_en`, `location_en`。");
  lines.push("");
  lines.push("## 验证 SQL 结果");
  lines.push("");
  lines.push("```sql");
  for (const table of TABLES) lines.push(`SELECT COUNT(*) FROM ${table}; -- ${REPORT.counts[table] ?? 0}`);
  lines.push("```");
  lines.push("");
  lines.push("## DBeaver 查看方式");
  lines.push("");
  lines.push("1. 使用 `.env` 中的 Neon PostgreSQL 连接串创建连接。");
  lines.push("2. 展开 `neondb` -> `Schemas` -> `public` -> `Tables`。");
  lines.push("3. 查看 `last_meals`、`grave_recipes`、`cemetery_stories`、`last_words`、`farewell_letters`。");
  lines.push("4. 右键表名选择 `View Data`，图片字段在 DBeaver 中会显示为 bytea 数组。");
  lines.push("");
  fs.writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  loadCache();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    keepAliveClient = client;
    REPORT.connected = true;
    await recreateTables(client);
    await importLastMeals(client);
    await importGraveRecipes(client);
    await importCemeteryStories(client);
    await importLastWords(client);
    await importFarewellLetters(client);
    await verify(client);
    saveCache();
    writeReport();
    for (const table of TABLES) console.log(`${table}: ${REPORT.counts[table]}`);
    console.log(`grave_recipes images: ${REPORT.imageStats.grave_recipes}`);
    console.log(`cemetery_stories images: ${REPORT.imageStats.cemetery_stories}`);
    console.log(`translations attempted: ${REPORT.translation.attempted}, failed: ${REPORT.translation.failed.length}`);
  } catch (error) {
    saveCache();
    writeReport();
    throw error;
  } finally {
    keepAliveClient = null;
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
