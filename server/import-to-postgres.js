const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { Pool } = require("pg");
const XLSX = require("xlsx");
const { parse } = require("csv-parse/sync");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "数据");

const TABLES = [
  "last_meals",
  "grave_recipes",
  "cemetery_stories",
  "last_words",
  "farewell_letters",
];

const JSONB_COLUMNS = new Set(["raw_json", "images"]);

const report = {
  connected: false,
  tablesCreated: [],
  inserted: Object.fromEntries(TABLES.map((table) => [table, 0])),
  skippedFiles: [],
  missingZhFields: {},
  matchedImageFolders: [],
  unmatchedImageFolders: [],
  jsonRepairNotes: [],
  sourceFiles: {},
  counts: {},
};

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[’']/g, "")
    .replace(/^cemetery\s+(recipes|stories)\s*[:_]\s*/i, "")
    .replace(/[_:：&]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fa5 ]/gi, "")
    .trim()
    .toLowerCase();
}

function value(row, candidates) {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined) {
      const text = String(row[key]).trim();
      if (text) return text;
    }
  }
  return "";
}

function nullable(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function intOrNull(value) {
  const text = String(value || "").trim();
  const match = text.match(/\d{4}/) || text.match(/^\d+$/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function readWorkbookRows(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false,
      blankrows: false,
    });
    return { sheetName, rows };
  });
}

function readCsvRows(filePath, encoding = "utf8") {
  const text = fs.readFileSync(filePath).toString(encoding).replace(/^\uFEFF/, "");
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    bom: true,
    trim: false,
  });
}

function listImageFolders(categoryDir) {
  if (!fs.existsSync(categoryDir)) return [];
  return fs.readdirSync(categoryDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(categoryDir, entry.name));
}

function listImages(folder) {
  if (!folder || !fs.existsSync(folder)) return [];
  return fs.readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp|gif)$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
    .map((entry) => rel(path.join(folder, entry.name)));
}

function buildImageFolderMap(categoryName) {
  const dir = path.join(DATA_DIR, "墓地摄影数据", "图片库", categoryName);
  const folders = listImageFolders(dir);
  const map = new Map();
  for (const folder of folders) {
    const base = path.basename(folder);
    map.set(normalizeKey(base), folder);
  }
  return { dir, folders, map };
}

function findFolderForTitle(folderMap, title) {
  const key = normalizeKey(title);
  if (folderMap.map.has(key)) return folderMap.map.get(key);
  for (const [folderKey, folder] of folderMap.map.entries()) {
    if (folderKey.includes(key) || key.includes(folderKey)) return folder;
  }
  return null;
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
      food TEXT,
      food_zh TEXT,
      food_en TEXT,
      location TEXT,
      location_zh TEXT,
      location_en TEXT,
      country TEXT,
      region TEXT,
      crime TEXT,
      execution_year INTEGER,
      execution_date TEXT,
      execution_method TEXT,
      source_file TEXT,
      source_sheet TEXT,
      source_row INTEGER,
      raw_json JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE grave_recipes (
      id SERIAL PRIMARY KEY,
      title TEXT,
      title_zh TEXT,
      title_en TEXT,
      story_background TEXT,
      story_background_zh TEXT,
      story_background_en TEXT,
      recipe_name TEXT,
      recipe_name_zh TEXT,
      recipe_name_en TEXT,
      recipe_steps TEXT,
      recipe_steps_zh TEXT,
      recipe_steps_en TEXT,
      kitchen_notes TEXT,
      kitchen_notes_zh TEXT,
      kitchen_notes_en TEXT,
      images JSONB,
      image_folder TEXT,
      source_file TEXT,
      source_sheet TEXT,
      source_row INTEGER,
      raw_json JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE cemetery_stories (
      id SERIAL PRIMARY KEY,
      title TEXT,
      title_zh TEXT,
      title_en TEXT,
      geographic_background TEXT,
      geographic_background_zh TEXT,
      geographic_background_en TEXT,
      story_body TEXT,
      story_body_zh TEXT,
      story_body_en TEXT,
      reflection TEXT,
      reflection_zh TEXT,
      reflection_en TEXT,
      images JSONB,
      image_folder TEXT,
      source_file TEXT,
      source_sheet TEXT,
      source_row INTEGER,
      raw_json JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE last_words (
      id SERIAL PRIMARY KEY,
      person_name TEXT,
      person_name_zh TEXT,
      body TEXT,
      body_zh TEXT,
      body_en TEXT,
      location TEXT,
      location_zh TEXT,
      location_en TEXT,
      county TEXT,
      race TEXT,
      age INTEGER,
      execution_number TEXT,
      tdcj_number TEXT,
      execution_date TEXT,
      source_file TEXT,
      source_row INTEGER,
      raw_json JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE farewell_letters (
      id SERIAL PRIMARY KEY,
      person_name TEXT,
      person_name_zh TEXT,
      body TEXT,
      body_zh TEXT,
      body_en TEXT,
      location TEXT,
      location_zh TEXT,
      location_en TEXT,
      age TEXT,
      gender TEXT,
      occupation TEXT,
      event_time TEXT,
      method TEXT,
      source_file TEXT,
      source_row INTEGER,
      raw_json JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  report.tablesCreated = TABLES.slice();
}

async function insert(client, table, data) {
  const columns = Object.keys(data);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const values = columns.map((column) => {
    if (JSONB_COLUMNS.has(column)) return JSON.stringify(data[column] ?? null);
    return data[column];
  });
  await client.query(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
    values,
  );
  report.inserted[table] += 1;
}

async function importLastMeals(client) {
  const baseDir = path.join(DATA_DIR, "List of last meals");
  const files = ["Asia.xlsx", "Canada.xlsx", "Europe.xlsx", "United States.xlsx"];
  report.sourceFiles.last_meals = files.map((file) => rel(path.join(baseDir, file)));

  for (const file of files) {
    const filePath = path.join(baseDir, file);
    if (!fs.existsSync(filePath)) {
      report.skippedFiles.push(`${rel(filePath)} (missing)`);
      continue;
    }

    for (const { sheetName, rows } of readWorkbookRows(filePath)) {
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const personName = value(row, ["Name"]);
        const foodEn = value(row, ["Requested meal", "Requested Meal", "Meal"]);
        if (!personName && !foodEn) continue;

        const country = value(row, ["Country", "Country/Territory"]);
        const region = value(row, ["State", "Province"]) || (path.basename(file, ".xlsx") === "United States" ? sheetName : "");
        const location = [region, country || path.basename(file, ".xlsx")].filter(Boolean).join(", ");
        const year = value(row, ["Year", "Date of Execution"]);

        await insert(client, "last_meals", {
          person_name: nullable(personName),
          person_name_zh: null,
          food: nullable(foodEn),
          food_zh: null,
          food_en: nullable(foodEn),
          location: nullable(location),
          location_zh: null,
          location_en: nullable(location),
          country: nullable(country || (["Asia", "Canada", "Europe"].includes(path.basename(file, ".xlsx")) ? path.basename(file, ".xlsx") : "")),
          region: nullable(region),
          crime: nullable(value(row, ["Crime"])),
          execution_year: intOrNull(year),
          execution_date: nullable(value(row, ["Date of Execution"])),
          execution_method: nullable(value(row, ["Method of execution", "Method of Execution"])),
          source_file: rel(filePath),
          source_sheet: sheetName,
          source_row: index + 2,
          raw_json: row,
        });
      }
    }
  }

  report.missingZhFields.last_meals = ["person_name_zh", "food_zh", "location_zh"];
}

function buildOriginalTextMap(workbookPath, sheetName) {
  const target = readWorkbookRows(workbookPath).find((sheet) => sheet.sheetName === sheetName);
  const map = new Map();
  if (!target) return map;
  for (const row of target.rows) {
    const title = value(row, ["标题", "Title"]);
    if (!title) continue;
    map.set(normalizeKey(title), {
      title_en: title,
      body_en: value(row, ["正文", "Body", "Text"]),
    });
  }
  return map;
}

async function importGraveRecipes(client) {
  const structuredPath = path.join(DATA_DIR, "墓地摄影数据", "墓地摄影文字档案_已翻译结构化.xlsx");
  const originalPath = path.join(DATA_DIR, "墓地摄影数据", "墓地摄影文字档案.xlsx");
  report.sourceFiles.grave_recipes = [rel(structuredPath), rel(originalPath)];

  const originalMap = buildOriginalTextMap(originalPath, "墓地食谱");
  const folderMap = buildImageFolderMap("墓地食谱");
  const matched = new Set();
  const sheets = readWorkbookRows(structuredPath);
  const target = sheets.find((sheet) => sheet.sheetName.includes("食谱"));
  if (!target) return;

  for (let index = 0; index < target.rows.length; index += 1) {
    const row = target.rows[index];
    const rawTitle = value(row, ["原始标题", "标题"]);
    const titleZh = value(row, ["翻译标题"]);
    const titleEn = value(row, ["标题", "原始标题"]);
    if (!rawTitle && !titleZh && !titleEn) continue;

    const original = originalMap.get(normalizeKey(rawTitle)) || originalMap.get(normalizeKey(titleEn)) || {};
    const folder = findFolderForTitle(folderMap, rawTitle || titleEn || titleZh);
    const images = listImages(folder);
    if (folder) {
      matched.add(folder);
      report.matchedImageFolders.push(`grave_recipes: ${rel(folder)} (${images.length} images)`);
    }

    const storyZh = value(row, ["故事背景"]);
    const recipeNameZh = value(row, ["食谱名称"]);
    const stepsZh = value(row, ["制作配方与步骤"]);
    const notesZh = value(row, ["厨房笔记"]);
    const title = titleZh || titleEn || original.title_en || rawTitle;

    await insert(client, "grave_recipes", {
      title: nullable(title),
      title_zh: nullable(titleZh),
      title_en: nullable(original.title_en || titleEn || rawTitle),
      story_background: nullable(storyZh || original.body_en),
      story_background_zh: nullable(storyZh),
      story_background_en: nullable(original.body_en),
      recipe_name: nullable(recipeNameZh),
      recipe_name_zh: nullable(recipeNameZh),
      recipe_name_en: null,
      recipe_steps: nullable(stepsZh),
      recipe_steps_zh: nullable(stepsZh),
      recipe_steps_en: null,
      kitchen_notes: nullable(notesZh),
      kitchen_notes_zh: nullable(notesZh),
      kitchen_notes_en: null,
      images,
      image_folder: folder ? rel(folder) : null,
      source_file: rel(structuredPath),
      source_sheet: target.sheetName,
      source_row: index + 2,
      raw_json: { ...row, english_original: original },
    });
  }

  for (const folder of folderMap.folders) {
    if (!matched.has(folder)) report.unmatchedImageFolders.push(`grave_recipes: ${rel(folder)}`);
  }
  report.missingZhFields.grave_recipes = ["recipe_name_en", "recipe_steps_en", "kitchen_notes_en"];
}

async function importCemeteryStories(client) {
  const structuredPath = path.join(DATA_DIR, "墓地摄影数据", "墓地摄影文字档案_已翻译结构化.xlsx");
  const originalPath = path.join(DATA_DIR, "墓地摄影数据", "墓地摄影文字档案.xlsx");
  report.sourceFiles.cemetery_stories = [rel(structuredPath), rel(originalPath)];

  const originalMap = buildOriginalTextMap(originalPath, "墓地故事");
  const folderMap = buildImageFolderMap("墓地故事");
  const matched = new Set();
  const sheets = readWorkbookRows(structuredPath);
  const target = sheets.find((sheet) => sheet.sheetName.includes("故事"));
  if (!target) return;

  for (let index = 0; index < target.rows.length; index += 1) {
    const row = target.rows[index];
    const rawTitle = value(row, ["原始标题", "标题"]);
    const titleZh = value(row, ["翻译标题"]);
    const titleEn = value(row, ["标题", "原始标题"]);
    if (!rawTitle && !titleZh && !titleEn) continue;

    const original = originalMap.get(normalizeKey(rawTitle)) || originalMap.get(normalizeKey(titleEn)) || {};
    const folder = findFolderForTitle(folderMap, rawTitle || titleEn || titleZh);
    const images = listImages(folder);
    if (folder) {
      matched.add(folder);
      report.matchedImageFolders.push(`cemetery_stories: ${rel(folder)} (${images.length} images)`);
    }

    const geoZh = value(row, ["地理背景"]);
    const bodyZh = value(row, ["故事正文"]);
    const reflectionZh = value(row, ["观察感悟"]);
    const title = titleZh || titleEn || original.title_en || rawTitle;

    await insert(client, "cemetery_stories", {
      title: nullable(title),
      title_zh: nullable(titleZh),
      title_en: nullable(original.title_en || titleEn || rawTitle),
      geographic_background: nullable(geoZh),
      geographic_background_zh: nullable(geoZh),
      geographic_background_en: null,
      story_body: nullable(bodyZh || original.body_en),
      story_body_zh: nullable(bodyZh),
      story_body_en: nullable(original.body_en),
      reflection: nullable(reflectionZh),
      reflection_zh: nullable(reflectionZh),
      reflection_en: null,
      images,
      image_folder: folder ? rel(folder) : null,
      source_file: rel(structuredPath),
      source_sheet: target.sheetName,
      source_row: index + 2,
      raw_json: { ...row, english_original: original },
    });
  }

  for (const folder of folderMap.folders) {
    if (!matched.has(folder)) report.unmatchedImageFolders.push(`cemetery_stories: ${rel(folder)}`);
  }
  report.missingZhFields.cemetery_stories = ["geographic_background_en", "reflection_en"];
}

async function importLastWords(client) {
  const files = [
    {
      filePath: path.join(DATA_DIR, "死囚的遗言", "Texas Last Statement - CSV.csv"),
      encoding: "latin1",
      source: "texas_last_statement",
    },
    {
      filePath: path.join(DATA_DIR, "德克萨斯州死刑执行信息和遗言", "offenders.csv"),
      encoding: "latin1",
      source: "offenders",
    },
  ];
  report.sourceFiles.last_words = files.map((item) => rel(item.filePath));
  const seen = new Set();

  for (const file of files) {
    if (!fs.existsSync(file.filePath)) {
      report.skippedFiles.push(`${rel(file.filePath)} (missing)`);
      continue;
    }
    const rows = readCsvRows(file.filePath, file.encoding);
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const firstName = value(row, ["FirstName", "First Name"]);
      const lastName = value(row, ["LastName", "Last Name"]);
      const personName = [firstName, lastName].filter(Boolean).join(" ");
      const bodyEn = value(row, ["LastStatement", "Last Statement"]);
      if (!personName && !bodyEn) continue;
      const executionNumber = value(row, ["Execution", "Execution #"]);
      const tdcj = value(row, ["TDCJNumber", "TDCJ Number"]);
      const key = tdcj || executionNumber || normalizeKey(`${personName} ${bodyEn.slice(0, 80)}`);
      if (seen.has(key)) continue;
      seen.add(key);

      const county = value(row, ["CountyOfConviction", "County"]);
      await insert(client, "last_words", {
        person_name: nullable(personName),
        person_name_zh: null,
        body: nullable(bodyEn),
        body_zh: null,
        body_en: nullable(bodyEn),
        location: nullable(county),
        location_zh: null,
        location_en: nullable(county),
        county: nullable(county),
        race: nullable(value(row, ["Race"])),
        age: intOrNull(value(row, ["Age"])),
        execution_number: nullable(executionNumber),
        tdcj_number: nullable(tdcj),
        execution_date: nullable(value(row, ["Date"])),
        source_file: rel(file.filePath),
        source_row: index + 2,
        raw_json: row,
      });
    }
  }

  report.missingZhFields.last_words = ["person_name_zh", "body_zh", "location_zh"];
}

function parseFarewellJson(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  try {
    return { rows: JSON.parse(text), note: "标准 JSON.parse 成功" };
  } catch (firstError) {
    const repaired = text.replace(/,\s*([\]}])/g, "$1");
    try {
      return {
        rows: JSON.parse(repaired),
        note: `标准 JSON.parse 失败，已修复尾逗号后成功：${firstError.message}`,
      };
    } catch (secondError) {
      const rows = [];
      let depth = 0;
      let start = -1;
      let inString = false;
      let escape = false;
      for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (inString) {
          if (escape) {
            escape = false;
          } else if (char === "\\") {
            escape = true;
          } else if (char === "\"") {
            inString = false;
          }
          continue;
        }
        if (char === "\"") inString = true;
        if (char === "{") {
          if (depth === 0) start = i;
          depth += 1;
        } else if (char === "}") {
          depth -= 1;
          if (depth === 0 && start >= 0) {
            const chunk = text.slice(start, i + 1);
            try {
              rows.push(JSON.parse(chunk));
            } catch {
              // Skip one malformed object and keep extracting the rest.
            }
            start = -1;
          }
        }
      }
      return {
        rows,
        note: `标准 JSON.parse 与尾逗号修复均失败，宽松提取 ${rows.length} 条；错误：${secondError.message}`,
      };
    }
  }
}

async function importFarewellLetters(client) {
  const filePath = path.join(DATA_DIR, "遗书", "ChineseSuicideNotes.json");
  report.sourceFiles.farewell_letters = [rel(filePath)];
  if (!fs.existsSync(filePath)) {
    report.skippedFiles.push(`${rel(filePath)} (missing)`);
    return;
  }

  const parsed = parseFarewellJson(filePath);
  report.jsonRepairNotes.push(`${rel(filePath)}: ${parsed.note}`);
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    const bodyZh = value(row, ["遗书", "正文", "body", "body_zh"]);
    if (!bodyZh) continue;
    const location = value(row, ["地区", "地点"]);
    await insert(client, "farewell_letters", {
      person_name: nullable(value(row, ["人名", "姓名", "person_name"])),
      person_name_zh: nullable(value(row, ["人名", "姓名", "person_name"])),
      body: nullable(bodyZh),
      body_zh: nullable(bodyZh),
      body_en: null,
      location: nullable(location),
      location_zh: nullable(location),
      location_en: null,
      age: nullable(value(row, ["年龄"])),
      gender: nullable(value(row, ["性别"])),
      occupation: nullable(value(row, ["职业"])),
      event_time: nullable(value(row, ["时间"])),
      method: nullable(value(row, ["方式"])),
      source_file: rel(filePath),
      source_row: index + 1,
      raw_json: row,
    });
  }

  report.missingZhFields.farewell_letters = ["body_en", "location_en"];
}

async function verifyCounts(client) {
  for (const table of TABLES) {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    report.counts[table] = result.rows[0].count;
  }
}

function writeReport() {
  const lines = [];
  lines.push("# Neon PostgreSQL 数据导入报告");
  lines.push("");
  lines.push(`生成时间：${new Date().toISOString()}`);
  lines.push("");
  lines.push("## 1. 数据库连接");
  lines.push("");
  lines.push(report.connected ? "- 连接成功：已连接 Neon PostgreSQL。" : "- 连接失败：未完成导入。");
  lines.push("");
  lines.push("## 2. 创建/重建的表");
  lines.push("");
  for (const table of report.tablesCreated) lines.push(`- ${table}`);
  lines.push("");
  lines.push("## 3. 导入数量与验证结果");
  lines.push("");
  lines.push("| 表 | 插入数量 | SELECT COUNT(*) 验证 |");
  lines.push("|---|---:|---:|");
  for (const table of TABLES) lines.push(`| ${table} | ${report.inserted[table] || 0} | ${report.counts[table] ?? "未验证"} |`);
  lines.push("");
  lines.push("## 4. 字段说明");
  lines.push("");
  lines.push("- `last_meals`：最后一餐数据，保留人物、食物、地点、国家/地区、罪名、执行年份/日期、执行方式、来源文件/sheet/行号、原始 JSON。");
  lines.push("- `grave_recipes`：墓地食谱数据，保留中英文标题、故事背景、食谱名、步骤、厨房笔记、图片相对路径数组、来源信息、原始 JSON。");
  lines.push("- `cemetery_stories`：墓地故事数据，保留中英文标题、地理背景、故事正文、观察感悟、图片相对路径数组、来源信息、原始 JSON。");
  lines.push("- `last_words`：死刑犯遗言数据，保留人物、遗言正文、县/地点、种族、年龄、执行编号、TDCJ 编号、执行日期、来源信息、原始 JSON。");
  lines.push("- `farewell_letters`：中文遗书数据，保留正文、年龄、性别、职业、地区、时间、方式、来源信息、原始 JSON。");
  lines.push("");
  lines.push("## 5. 数据来源文件");
  lines.push("");
  for (const [table, files] of Object.entries(report.sourceFiles)) {
    lines.push(`- ${table}:`);
    for (const file of files) lines.push(`  - ${file}`);
  }
  lines.push("");
  lines.push("## 6. 跳过的文件");
  lines.push("");
  if (report.skippedFiles.length) {
    for (const item of report.skippedFiles) lines.push(`- ${item}`);
  } else {
    lines.push("- 无。");
  }
  lines.push("");
  lines.push("## 7. 没有中文翻译或英文翻译的字段");
  lines.push("");
  for (const [table, fields] of Object.entries(report.missingZhFields)) {
    lines.push(`- ${table}: ${fields.join(", ")}`);
  }
  lines.push("");
  lines.push("## 8. 图片目录匹配情况");
  lines.push("");
  lines.push("### 成功匹配");
  lines.push("");
  for (const item of report.matchedImageFolders) lines.push(`- ${item}`);
  lines.push("");
  lines.push("### 未匹配");
  lines.push("");
  if (report.unmatchedImageFolders.length) {
    for (const item of report.unmatchedImageFolders) lines.push(`- ${item}`);
  } else {
    lines.push("- 无。");
  }
  lines.push("");
  lines.push("## 9. JSON 容错读取");
  lines.push("");
  for (const note of report.jsonRepairNotes) lines.push(`- ${note}`);
  lines.push("");
  lines.push("## 10. DBeaver 查看方式");
  lines.push("");
  lines.push("1. 在 DBeaver 新建 PostgreSQL 连接。");
  lines.push("2. 使用同一个 Neon 连接串连接数据库。");
  lines.push("3. 展开连接：`neondb` -> `Schemas` -> `public` -> `Tables`。");
  lines.push("4. 应看到 `last_meals`、`grave_recipes`、`cemetery_stories`、`last_words`、`farewell_letters` 五张表。");
  lines.push("5. 右键表名选择 `View Data`，或在 SQL Editor 执行：");
  lines.push("");
  lines.push("```sql");
  for (const table of TABLES) lines.push(`SELECT COUNT(*) FROM ${table};`);
  lines.push("```");
  lines.push("");

  fs.writeFileSync(path.join(ROOT, "DATABASE_IMPORT_REPORT.md"), `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Please create website/.env first.");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    report.connected = true;
    await client.query("BEGIN");
    await recreateTables(client);
    await importLastMeals(client);
    await importGraveRecipes(client);
    await importCemeteryStories(client);
    await importLastWords(client);
    await importFarewellLetters(client);
    await client.query("COMMIT");
    await verifyCounts(client);
    writeReport();

    console.log("Import completed.");
    for (const table of TABLES) {
      console.log(`${table}: inserted=${report.inserted[table]} count=${report.counts[table]}`);
    }
    console.log("Report written to DATABASE_IMPORT_REPORT.md");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    writeReport();
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exitCode = 1;
});
