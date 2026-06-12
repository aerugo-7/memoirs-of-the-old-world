(function () {
  const input = document.getElementById("storyKeywordInput");
  const matchButton = document.getElementById("matchStoryBtn");
  const randomButton = document.getElementById("randomStoryBtn");
  const result = document.getElementById("storyMatchResult");

  let stories = [];
  let loadingPromise = null;

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function storyText(story) {
    return [
      story.title_zh,
      story.title_en,
      story.geographic_background_zh,
      story.story_body_zh,
      story.reflection_zh,
    ].filter(Boolean).join(" ").toLowerCase();
  }

  async function loadStories() {
    if (stories.length) return stories;
    if (!loadingPromise) {
      loadingPromise = fetch("/api/stories")
        .then((response) => {
          if (!response.ok) throw new Error(`读取墓地故事失败：${response.status}`);
          return response.json();
        })
        .then((data) => {
          stories = Array.isArray(data) ? data : [];
          return stories;
        });
    }
    return loadingPromise;
  }

  function pickRandom(list) {
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function renderStory(story, keyword, exact) {
    if (!story) {
      result.innerHTML = "<p>暂时没有读取到墓地故事。请稍后再试。</p>";
      return;
    }

    const body = story.story_body_zh || story.reflection_zh || story.geographic_background_zh || "";
    result.innerHTML = `
      <p class="story-place">${exact ? "匹配关键词" : "随机回声"}：${escapeHtml(keyword || "旧世界")}</p>
      <h3>${escapeHtml(story.title_zh || story.title_en || "未命名墓地故事")}</h3>
      ${story.geographic_background_zh ? `<p class="story-place">${escapeHtml(story.geographic_background_zh)}</p>` : ""}
      <p class="story-body">${escapeHtml(body || "这篇故事没有留下完整正文，但它仍然被保存在档案馆里。")}</p>
      <a href="../archives/keyword.html">进入墓地故事档案馆</a>
    `;
  }

  async function matchStory(forceRandom) {
    const keyword = input.value.trim();
    result.innerHTML = "<p>正在翻找墓地故事档案……</p>";

    try {
      const list = await loadStories();
      if (!list.length) {
        renderStory(null);
        return;
      }

      const lowerKeyword = keyword.toLowerCase();
      const matched = !forceRandom && lowerKeyword
        ? list.filter((story) => storyText(story).includes(lowerKeyword))
        : [];
      const story = pickRandom(matched.length ? matched : list);
      renderStory(story, keyword || "随机", matched.length > 0);
    } catch (error) {
      console.error("[KeywordStory] match failed", error);
      result.innerHTML = `<p>墓地故事暂时没有回应。${escapeHtml(error.message || "")}</p>`;
    }
  }

  if (matchButton && randomButton && input && result) {
    matchButton.addEventListener("click", () => matchStory(false));
    randomButton.addEventListener("click", () => matchStory(true));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") matchStory(false);
    });
  }
})();
