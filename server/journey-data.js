const { query } = require("./db");

const WORD_KEYWORDS = [
  "love",
  "family",
  "mother",
  "home",
  "peace",
  "thank",
  "forgive",
  "god",
  "friend",
  "hope",
  "children",
  "kids",
  "sorry",
  "strong",
  "remember",
];

const FOOD_TERMS = {
  rice: ["rice", "fried rice", "steamed rice"],
  bread: ["bread", "toast", "biscuit"],
  coffee: ["coffee"],
  dessert: ["cake", "pie", "ice cream", "sweet"],
  stew: ["stew", "soup", "braised"],
  bbq: ["barbecue", "bbq", "roast", "grilled"],
  soup: ["soup", "stew"],
  noodle: ["noodle", "pasta", "spaghetti", "noodles"],
  "米饭": ["rice", "fried rice", "steamed rice"],
  "面包": ["bread", "toast", "biscuit"],
  "面条": ["noodle", "pasta", "spaghetti"],
  "咖啡": ["coffee"],
  "蛋糕": ["cake", "pie"],
  "汤": ["soup", "stew"],
  "烤肉": ["roast", "barbecue", "bbq"],
};

function limitParam(value, fallback = 20, max = 200) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function sendImage(res, row) {
  if (!row || !row.image_data) {
    res.status(404).json({ error: "image_not_found" });
    return;
  }
  res.setHeader("Content-Type", row.mime_type || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(row.image_data);
}

function registerJourneyDataRoutes(app) {
  app.get("/api/stats", asyncRoute(async (req, res) => {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM last_meals) AS meals_count,
        (SELECT COUNT(*) FROM last_words) AS words_count,
        (SELECT COUNT(*) FROM grave_recipes) AS recipes_count,
        (SELECT COUNT(*) FROM cemetery_stories) AS stories_count,
        (SELECT COUNT(*) FROM farewell_letters) AS letters_count
    `);
    res.json(result.rows[0]);
  }));

  app.get("/api/meals/random", asyncRoute(async (req, res) => {
    const count = limitParam(req.query.count, 20, 80);
    const result = await query(`
      SELECT id, person_name, food_zh, food_en, country_zh, country_en, region_zh, execution_year
      FROM last_meals
      ORDER BY RANDOM()
      LIMIT $1
    `, [count]);
    res.json(result.rows);
  }));

  app.get("/api/meals/:id", asyncRoute(async (req, res) => {
    const result = await query("SELECT * FROM last_meals WHERE id = $1", [req.params.id]);
    if (!result.rows.length) {
      res.status(404).json({ error: "meal_not_found" });
      return;
    }
    res.json(result.rows[0]);
  }));

  app.get("/api/search/food", asyncRoute(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (!q) {
      res.status(400).json({ error: "missing_query" });
      return;
    }

    const lower = q.toLowerCase();
    const terms = new Set([lower]);
    Object.entries(FOOD_TERMS).forEach(([key, values]) => {
      if (lower.includes(key.toLowerCase()) || values.some((value) => lower.includes(value))) {
        values.forEach((value) => terms.add(value));
      }
    });

    const values = Array.from(terms).slice(0, 12);
    const conditions = values.map((_, index) => (
      `(LOWER(COALESCE(food_zh, '')) LIKE $${index + 1} OR LOWER(COALESCE(food_en, '')) LIKE $${index + 1})`
    )).join(" OR ");
    const result = await query(`
      SELECT id, person_name, food_zh, food_en, country_zh, country_en, region_zh, execution_year
      FROM last_meals
      WHERE ${conditions}
      ORDER BY RANDOM()
      LIMIT 20
    `, values.map((value) => `%${value}%`));

    res.json({ results: result.rows, total: result.rows.length });
  }));

  app.get("/api/words", asyncRoute(async (req, res) => {
    const result = await query(`
      SELECT id, body_en AS body_zh, body_en, location_zh, county_zh, race_zh, age
      FROM last_words
      WHERE body_en IS NOT NULL AND LENGTH(body_en) > 3
      ORDER BY RANDOM()
      LIMIT 160
    `);
    res.json(result.rows);
  }));

  app.get("/api/word-stats", asyncRoute(async (req, res) => {
    const result = await query("SELECT body_en FROM last_words WHERE body_en IS NOT NULL");
    const keywords = WORD_KEYWORDS.map((word) => {
      const count = result.rows.reduce((sum, row) => {
        const text = String(row.body_en || "").toLowerCase();
        return sum + (text.includes(word) ? 1 : 0);
      }, 0);
      return { word, count };
    }).sort((a, b) => b.count - a.count);
    res.json({ keywords, total: result.rows.length });
  }));

  app.get("/api/words/random", asyncRoute(async (req, res) => {
    const count = limitParam(req.query.count, 10, 80);
    const result = await query(`
      SELECT id, body_en AS body_zh, body_en, location_zh, county_zh, race_zh, age
      FROM last_words
      WHERE body_en IS NOT NULL AND LENGTH(body_en) > 5
      ORDER BY RANDOM()
      LIMIT $1
    `, [count]);
    res.json(result.rows);
  }));

  app.get("/api/words/:id", asyncRoute(async (req, res) => {
    const result = await query("SELECT * FROM last_words WHERE id = $1", [req.params.id]);
    if (!result.rows.length) {
      res.status(404).json({ error: "word_not_found" });
      return;
    }
    res.json(result.rows[0]);
  }));

  app.get("/api/recipes", asyncRoute(async (req, res) => {
    const result = await query(`
      SELECT id, title_zh, title_en, story_background_zh, recipe_name_zh, recipe_steps_zh,
             kitchen_notes_zh, image_names, CARDINALITY(images) AS image_count
      FROM grave_recipes
      ORDER BY id
    `);
    res.json(result.rows);
  }));

  app.get("/api/recipes/:id", asyncRoute(async (req, res) => {
    const result = await query(`
      SELECT *, CARDINALITY(images) AS image_count
      FROM grave_recipes
      WHERE id = $1
    `, [req.params.id]);
    if (!result.rows.length) {
      res.status(404).json({ error: "recipe_not_found" });
      return;
    }
    res.json(result.rows[0]);
  }));

  app.get("/api/recipes/:id/image/:index", asyncRoute(async (req, res) => {
    const index = Number.parseInt(req.params.index, 10) + 1;
    const result = await query(`
      SELECT images[$2] AS image_data, image_mime_types[$2] AS mime_type
      FROM grave_recipes
      WHERE id = $1
    `, [req.params.id, index]);
    sendImage(res, result.rows[0]);
  }));

  app.get("/api/stories", asyncRoute(async (req, res) => {
    const result = await query(`
      SELECT id, title_zh, title_en, geographic_background_zh, story_body_zh,
             reflection_zh, image_names, CARDINALITY(images) AS image_count
      FROM cemetery_stories
      ORDER BY RANDOM()
      LIMIT 80
    `);
    res.json(result.rows);
  }));

  app.get("/api/stories/:id", asyncRoute(async (req, res) => {
    const result = await query(`
      SELECT *, CARDINALITY(images) AS image_count
      FROM cemetery_stories
      WHERE id = $1
    `, [req.params.id]);
    if (!result.rows.length) {
      res.status(404).json({ error: "story_not_found" });
      return;
    }
    res.json(result.rows[0]);
  }));

  app.get("/api/stories/:id/image/:index", asyncRoute(async (req, res) => {
    const index = Number.parseInt(req.params.index, 10) + 1;
    const result = await query(`
      SELECT images[$2] AS image_data, image_mime_types[$2] AS mime_type
      FROM cemetery_stories
      WHERE id = $1
    `, [req.params.id, index]);
    sendImage(res, result.rows[0]);
  }));

  app.get("/api/letters", asyncRoute(async (req, res) => {
    const result = await query(`
      SELECT id, person_name, body_zh, body_en, location_zh, age
      FROM farewell_letters
      ORDER BY RANDOM()
      LIMIT 80
    `);
    res.json(result.rows);
  }));

  app.get("/api/letters/:id", asyncRoute(async (req, res) => {
    const result = await query("SELECT * FROM farewell_letters WHERE id = $1", [req.params.id]);
    if (!result.rows.length) {
      res.status(404).json({ error: "letter_not_found" });
      return;
    }
    res.json(result.rows[0]);
  }));
}

module.exports = {
  registerJourneyDataRoutes,
};
