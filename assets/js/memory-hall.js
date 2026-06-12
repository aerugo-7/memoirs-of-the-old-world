const NEWS_PROXY_URL = "/api/memory-hall/news";
const ARCHIVE_PROXY_URL = "/api/memory-hall/archive";
const NEWS_TIMEOUT_MS = 60000;
const ARCHIVE_TIMEOUT_MS = 60000;

// 本地 file:// 直接打开时 fetch("../tools/node.json") 可能被浏览器拦截。
// 因此这里内嵌 node.json 数据；后续部署到服务器后可以切回 fetch。
const hotspots = [
  { id: "node-1780946124158", name: "笔记本", question: "笔记本里写了什么？", x: 12.73, y: 76.21 },
  { id: "node-1780946156515", name: "电脑", question: "你想浏览什么网页？", x: 20.39, y: 61.63 },
  { id: "node-1780946177057", name: "文件夹", question: "文件夹里放了什么？", x: 7.58, y: 58.3 },
  { id: "node-1780946200579", name: "衣柜", question: "衣柜里藏了什么？", x: 32.19, y: 42.48 },
  { id: "node-1780946229837", name: "便签", question: "便签上记了什么？", x: 52.03, y: 41.78 },
  { id: "node-1780946245078", name: "照片", question: "照片里面是什么？", x: 58.05, y: 39.42 },
  { id: "node-1780946263516", name: "收音机", question: "收音机在播放什么？", x: 69.53, y: 63.3 },
  { id: "node-1780946281870", name: "床上的书", question: "这是一本什么书？", x: 86.17, y: 78.71 },
  { id: "node-1780946305229", name: "打开的抽屉", question: "抽屉里放了什么？", x: 32.19, y: 79.4 },
  { id: "node-1780946396084", name: "窗户", question: "窗户外面有什么？", x: 89.22, y: 31.51 },
];

const roomInner = document.getElementById("roomInner");
const memoryIntro = document.getElementById("memoryIntro");
const memoryRoom = document.getElementById("memoryRoom");
const enterRoomBtn = document.getElementById("enterRoomBtn");
const nodeLayer = document.getElementById("nodeLayer");
const memoryLayer = document.getElementById("memoryLayer");
const nodeCard = document.getElementById("nodeCard");
const nodeTitle = document.getElementById("nodeTitle");
const nodeQuestion = document.getElementById("nodeQuestion");
const memoryInput = document.getElementById("memoryInput");
const memoryCount = document.getElementById("memoryCount");
const digitalBrowser = document.getElementById("digitalBrowser");
const browserStatus = document.getElementById("browserStatus");
const newsList = document.getElementById("newsList");
const submitMemoriesBtn = document.getElementById("submitMemoriesBtn");

let activeNode = null;
let memoryRoomStore = { nodes: hotspots, memories: [], newsSelections: [] };
let currentUserId = null;
let currentRoom = null;
let archivePanel = null;
let archivePanelOpen = false;
let isArchiving = false;
let archiveError = null;
let archiveResult = null;

console.log("hotspots loaded", hotspots);

function getStore() {
  return memoryRoomStore;
}

function setStore(store) {
  memoryRoomStore = normalizeStore(store);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const message = data.message || data.error || text || `Request failed: ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

function normalizeStore(store) {
  const safeStore = store && typeof store === "object" ? store : {};
  return {
    ...safeStore,
    nodes: Array.isArray(safeStore.nodes) ? safeStore.nodes : hotspots,
    memories: Array.isArray(safeStore.memories) ? safeStore.memories : [],
    newsSelections: Array.isArray(safeStore.newsSelections) ? safeStore.newsSelections : [],
  };
}

function createMemoryId(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function renderNodes() {
  if (!nodeLayer) return;
  nodeLayer.innerHTML = "";
  hotspots.forEach((node) => {
    const dot = document.createElement("button");
    dot.className = "room-node";
    dot.type = "button";
    dot.dataset.name = node.name;
    dot.setAttribute("aria-label", node.name);
    dot.style.left = `${node.x}%`;
    dot.style.top = `${node.y}%`;
    dot.addEventListener("click", (event) => {
      event.stopPropagation();
      console.log("hotspot clicked", node);
      focusNode(node, dot);
    });
    nodeLayer.appendChild(dot);
  });
}

function enterMemoryRoom() {
  if (!memoryIntro || !memoryRoom) return;
  memoryIntro.classList.add("is-leaving");
  memoryRoom.classList.remove("is-room-hidden");
  window.setTimeout(() => {
    memoryIntro.classList.add("is-gone");
  }, 760);
}

function focusNode(node, dot) {
  activeNode = node;
  document.querySelectorAll(".room-node").forEach((item) => item.classList.remove("is-active"));
  dot.classList.add("is-active");
  roomInner.classList.add("is-focused");
  roomInner.style.transform = `translate(calc(-50% + ${50 - node.x}vw), calc(-50% + ${50 - node.y}vh)) scale(1.8)`;

  if (node.id === "node-1780946156515" || node.name === "电脑") {
    openDigitalBrowser();
    closeNodeCard();
    return;
  }

  nodeTitle.textContent = node.name;
  nodeQuestion.textContent = node.question;
  memoryInput.value = "";
  nodeCard.classList.add("is-open");
  nodeCard.setAttribute("aria-hidden", "false");
  window.setTimeout(() => memoryInput.focus(), 120);
}

function resetView() {
  roomInner.classList.remove("is-focused");
  roomInner.style.transform = "translate(-50%, -50%) scale(1)";
  document.querySelectorAll(".room-node").forEach((item) => item.classList.remove("is-active"));
  closeNodeCard();
  closeDigitalBrowser();
}

function closeNodeCard() {
  nodeCard.classList.remove("is-open");
  nodeCard.setAttribute("aria-hidden", "true");
}

function createLocalMemoryFragment(node, answer, styleVariant, extra = {}) {
  return {
    id: createMemoryId("local-memory"),
    nodeId: node.id,
    nodeName: node.name,
    question: node.question,
    answer,
    styleVariant,
    createdAt: new Date().toISOString(),
    isLocalOnly: true,
    ...extra,
  };
}

function addMemoryToRoom(memory) {
  if (!memory || !memory.nodeId || !memory.answer) return;
  const store = normalizeStore(getStore());
  const nextStore = {
    ...store,
    memories: [...store.memories, memory],
  };
  setStore(nextStore);
  renderMemoryObject(memory);
  updateCount();
  refreshNewsSaveButtons();
  closeNodeCard();
}

async function saveMemory() {
  const answer = memoryInput.value.trim();
  if (!activeNode || !answer) return;
  const node = activeNode;
  const styleVariant = Math.floor(Math.random() * 4) + 1;

  try {
    const data = await fetchJson("/api/memory-fragments", {
      method: "POST",
      body: JSON.stringify({
        nodeId: node.id,
        nodeName: node.name,
        question: node.question,
        answer,
        styleVariant,
      }),
    });
    if (!data.fragment) {
      throw new Error("Database response did not include fragment");
    }
    addMemoryToRoom(data.fragment);
  } catch (error) {
    console.warn("[MemoryHall] save memory to database failed; keeping local draft", error);
    addMemoryToRoom(createLocalMemoryFragment(node, answer, styleVariant));
  }
}

function renderMemoryObject(memory) {
  const node = hotspots.find((item) => item.id === memory.nodeId);
  if (!node) return;
  const item = document.createElement("div");
  item.className = `memory-object variant-${memory.styleVariant}`;
  item.dataset.memoryId = memory.id;
  item.title = memory.answer;

  const text = document.createElement("span");
  text.className = "memory-text";
  text.textContent = memory.answer.slice(0, 20);
  item.appendChild(text);

  const deleteButton = createDeleteButton("删除这张纸片", () => {
    removeMemoryItem("memories", memory.id, item);
  });
  item.appendChild(deleteButton);

  item.style.left = `${node.x + (Math.random() * 5 - 2.5)}%`;
  item.style.top = `${node.y + (Math.random() * 5 - 2.5)}%`;
  item.style.setProperty("--rotate", `${Math.random() * 14 - 7}deg`);
  memoryLayer.appendChild(item);
}

function renderNewsMemoryObject(newsItem) {
  const computerNode = hotspots.find((item) => item.id === "node-1780946156515");
  if (!computerNode || !newsItem.title) return;

  const item = document.createElement("div");
  item.className = "memory-object news-memory";
  item.dataset.memoryId = newsItem.id;
  item.title = newsItem.summary || newsItem.title;
  item.dataset.summary = newsItem.summary || newsItem.title;

  const text = document.createElement("span");
  text.className = "memory-text";
  text.textContent = newsItem.title.slice(0, 16);
  item.appendChild(text);

  const deleteButton = createDeleteButton("删除这条新闻记忆", () => {
    removeMemoryItem("newsSelections", newsItem.id, item);
  });
  item.appendChild(deleteButton);

  item.style.left = `${computerNode.x + (Math.random() * 8 - 1)}%`;
  item.style.top = `${computerNode.y + 6 + (Math.random() * 8 - 2)}%`;
  item.style.setProperty("--rotate", `${Math.random() * 10 - 5}deg`);
  memoryLayer.appendChild(item);
}

function createDeleteButton(label, onDelete) {
  const button = document.createElement("button");
  button.className = "memory-delete";
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.textContent = "×";
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onDelete();
  });
  return button;
}

async function removeMemoryItem(collectionName, id, element) {
  const store = normalizeStore(getStore());
  const memory = store.memories.find((item) => item.id === id);
  const isLocalOnly = String(id).startsWith("local-memory") || memory?.isLocalOnly;

  try {
    if (!isLocalOnly) {
      await fetchJson(`/api/memory-fragments/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    }
  } catch (error) {
    console.warn("[MemoryHall] delete memory from database failed; removing from current room view", error);
  }

  const latestStore = normalizeStore(getStore());
  const nextStore = {
    ...latestStore,
    memories: latestStore.memories.filter((item) => item.id !== id),
    newsSelections: latestStore.newsSelections.filter((item) => item.id !== id),
  };
  setStore(nextStore);
  element.remove();
  updateCount();
  refreshNewsSaveButtons();
}

function restoreMemories() {
  const store = normalizeStore(getStore());
  memoryLayer.innerHTML = "";
  store.memories.forEach(renderMemoryObject);
  store.newsSelections
    .filter((item) => item && item.title)
    .forEach(renderNewsMemoryObject);
  updateCount();
}

function updateCount() {
  const store = normalizeStore(getStore());
  const total = store.memories.length;
  memoryCount.textContent = `已放入 ${total} 个记忆碎片`;
}

function openDigitalBrowser() {
  digitalBrowser.classList.add("is-open");
  digitalBrowser.setAttribute("aria-hidden", "false");
  browserStatus.textContent = "";
  newsList.innerHTML = "";
}

function closeDigitalBrowser() {
  digitalBrowser.classList.remove("is-open");
  digitalBrowser.setAttribute("aria-hidden", "true");
}

function showLoadingSteps() {
  const steps = [
    "正在连接电脑里的今日世界……",
    "正在读取最近更新……",
    "正在整理为记忆材料……",
  ];
  browserStatus.innerHTML = steps.map((step) => `<span class="loading-line">${step}</span>`).join("");
  browserStatus.querySelectorAll(".loading-line").forEach((line, index) => {
    window.setTimeout(() => {
      line.classList.add("is-visible");
    }, index * 420);
  });
}

function getNewsItems(data) {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data.news)) return data.news;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data) && data[0]) {
    if (Array.isArray(data[0].news)) return data[0].news;
    if (Array.isArray(data[0].items)) return data[0].items;
    if (data[0].json && Array.isArray(data[0].json.news)) return data[0].json.news;
    if (data[0].json && Array.isArray(data[0].json.items)) return data[0].json.items;
  }
  return [];
}

function getNewsDisplayPayload(data) {
  if (!data || typeof data !== "object") return {};
  if (Array.isArray(data) && data[0]) {
    return data[0].json || data[0];
  }
  return data;
}

function replaceExternalCopy(text) {
  return String(text || "").replaceAll("外部信息流", "电脑里的今日世界");
}

function normalizeNewsItem(rawItem, category) {
  return {
    category,
    title: rawItem.titleZh || rawItem.title || "未命名新闻",
    summary: rawItem.summaryZh || rawItem.summary || "",
    source: rawItem.source || "电脑里的今日世界",
    url: rawItem.url || "",
    publishedAt: rawItem.publishedAt || "",
    imageUrl: rawItem.imageUrl || "",
  };
}

function isNewsSaved(newsItem) {
  const store = normalizeStore(getStore());
  const newsKey = getNewsKey(newsItem);
  return store.memories.some((saved) => saved.answer === newsItem.title || saved.url === newsKey);
}

function getNewsKey(newsItem) {
  if (newsItem.url) return newsItem.url;
  return `${newsItem.title || ""}|${newsItem.publishedAt || ""}`;
}

function refreshNewsSaveButtons() {
  document.querySelectorAll(".news-save-button[data-news-key]").forEach((button) => {
    const saved = normalizeStore(getStore()).memories.some((item) => item.answer === button.dataset.newsKey || item.url === button.dataset.newsKey);
    button.textContent = saved ? "已存入房间" : "存入房间";
    button.disabled = saved;
    button.classList.toggle("is-saved", saved);
  });
}

async function saveNewsSelection(newsItem, button) {
  if (isNewsSaved(newsItem)) {
    button.textContent = "已存入房间";
    button.disabled = true;
    return;
  }

  const computerNode = {
    id: "node-1780946156515",
    name: newsItem.category || "电脑里的今日世界",
    question: "你想浏览什么网页？",
  };

  try {
    const data = await fetchJson("/api/memory-fragments", {
      method: "POST",
      body: JSON.stringify({
        nodeId: computerNode.id,
        nodeName: computerNode.name,
        question: computerNode.question,
        answer: newsItem.title,
        styleVariant: 4,
      }),
    });
    if (!data.fragment) {
      throw new Error("Database response did not include fragment");
    }
    addMemoryToRoom(data.fragment);
  } catch (error) {
    console.warn("[MemoryHall] save news memory to database failed; keeping local draft", error);
    addMemoryToRoom(createLocalMemoryFragment(computerNode, newsItem.title, 4, {
      url: getNewsKey(newsItem),
      summary: newsItem.summary || "",
    }));
  }

  button.textContent = "已存入房间";
  button.disabled = true;
  button.classList.add("is-saved");
}

function renderNewsCards(category, data) {
  const items = getNewsItems(data).map((item) => normalizeNewsItem(item, category));
  const displayPayload = getNewsDisplayPayload(data);
  const title = replaceExternalCopy(displayPayload.displayTitle || `${category} · 最近更新`);
  const copy = replaceExternalCopy(displayPayload.displayText || "以下内容来自电脑里的今日世界，已整理为可阅读的记忆材料。");

  browserStatus.innerHTML = `<strong>${title}</strong><span>${copy}</span>`;
  newsList.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "news-card error-card";
    empty.textContent = "电脑里的今日世界暂时没有可整理的内容。";
    newsList.appendChild(empty);
    return;
  }

  items.forEach((newsItem) => {
    const li = document.createElement("li");
    li.className = newsItem.imageUrl ? "news-card has-image" : "news-card no-image";

    if (newsItem.imageUrl) {
      const image = document.createElement("img");
      image.className = "news-image";
      image.src = newsItem.imageUrl;
      image.alt = newsItem.title;
      image.loading = "lazy";
      li.appendChild(image);
    }

    const body = document.createElement("div");
    body.className = "news-body";

    const heading = document.createElement("h3");
    heading.textContent = newsItem.title;
    body.appendChild(heading);

    if (newsItem.summary) {
      const summary = document.createElement("p");
      summary.textContent = newsItem.summary;
      body.appendChild(summary);
    }

    const meta = document.createElement("div");
    meta.className = "news-meta";
    meta.textContent = [newsItem.source, newsItem.publishedAt].filter(Boolean).join(" · ");
    body.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "news-actions";

    const saveButton = document.createElement("button");
    saveButton.className = "paper-button news-save-button";
    saveButton.type = "button";
    saveButton.dataset.newsKey = getNewsKey(newsItem);
    saveButton.textContent = isNewsSaved(newsItem) ? "已存入房间" : "存入房间";
    saveButton.disabled = isNewsSaved(newsItem);
    if (saveButton.disabled) saveButton.classList.add("is-saved");
    saveButton.addEventListener("click", () => saveNewsSelection(newsItem, saveButton));
    actions.appendChild(saveButton);

    if (newsItem.url) {
      const link = document.createElement("a");
      link.className = "news-open-link";
      link.href = newsItem.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "打开原文";
      actions.appendChild(link);
    }

    body.appendChild(actions);
    li.appendChild(body);
    newsList.appendChild(li);
  });
}

function renderNewsError() {
  browserStatus.textContent = "";
  newsList.innerHTML = "";
  const error = document.createElement("li");
  error.className = "news-card error-card";
  error.textContent = "电脑里的今日世界暂时不可用。请稍后再试。";
  newsList.appendChild(error);
}

async function loadNews(category) {
  newsList.innerHTML = "";
  showLoadingSteps();
  const requestUrl = `${NEWS_PROXY_URL}?category=${encodeURIComponent(category)}`;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), NEWS_TIMEOUT_MS);

  try {
    const response = await fetch(requestUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`News request failed: ${response.status}`);
    const data = await response.json();
    console.log("n8n news response", data);
    renderNewsCards(category, data);
  } catch (error) {
    console.error("news request failed", {
      category,
      requestUrl,
      error,
      name: error && error.name,
      message: error && error.message,
      stack: error && error.stack,
    });
    console.error(error);
    renderNewsError();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function buildArchivePayload() {
  const data = await fetchJson("/api/memory-room");

  currentUserId = data.userId;
  currentRoom = data.room;

  return {
    userId: currentUserId,
    roomId: currentRoom?.id,
    roomName: currentRoom?.title || "Memory Hall",
    createdAt: new Date().toISOString()
  };
}

function ensureArchivePanel() {
  if (archivePanel) return archivePanel;
  archivePanel = document.createElement("section");
  archivePanel.className = "archive-panel";
  archivePanel.setAttribute("aria-hidden", "true");
  memoryRoom.appendChild(archivePanel);
  return archivePanel;
}

function setArchivePanelOpen(nextValue) {
  archivePanelOpen = nextValue;
  ensureArchivePanel();
  archivePanel.classList.toggle("is-open", archivePanelOpen);
  archivePanel.setAttribute("aria-hidden", String(!archivePanelOpen));
}

function renderParagraphs(value) {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function renderArchivePanel() {
  ensureArchivePanel();

  if (isArchiving) {
    archivePanel.innerHTML = `
      <button class="archive-panel-close" type="button" aria-label="关闭">×</button>
      <p class="diary-kicker">Last Notes - Generate Diary</p>
      <h2>房间归档中</h2>
      <p class="diary-excerpt">正在整理这间房间留下的痕迹……</p>
      <div class="diary-loading-line" aria-hidden="true"></div>
    `;
  } else if (archiveError) {
    archivePanel.innerHTML = `
      <button class="archive-panel-close" type="button" aria-label="关闭">×</button>
      <p class="diary-kicker">Last Notes - Generate Diary</p>
      <h2>归档失败了</h2>
      <p class="diary-excerpt">${escapeHtml(archiveError)}</p>
      <p class="diary-error-message">${escapeHtml(archiveError)}</p>
    `;
  } else if (archiveResult) {
    archivePanel.innerHTML = `
      <button class="archive-panel-close" type="button" aria-label="关闭">×</button>
      <p class="diary-kicker">Last Notes - Generate Diary</p>
      <h2>房间归档完成</h2>
      <div class="diary-section">
        <h2>档案观察报告</h2>
        ${renderParagraphs(archiveResult.profile)}
      </div>
      <div class="diary-section">
        <h2>嘿，这里发现了你在旧世界最后一天的日记</h2>
        ${renderParagraphs(archiveResult.diary)}
      </div>
      <div class="diary-panel-actions">
        <a class="paper-button archive-next-link" href="./community.html">进入旧世界公共档案馆</a>
      </div>
    `;
  }

  archivePanel.querySelector(".archive-panel-close")?.addEventListener("click", () => {
    setArchivePanelOpen(false);
  });
}

function showArchiveError(message) {
  setArchivePanelOpen(true);
  isArchiving = false;
  archiveResult = null;
  archiveError = message;
  renderArchivePanel();
}

function setIsArchiving(nextValue) {
  isArchiving = nextValue;
  if (submitMemoriesBtn) {
    submitMemoriesBtn.disabled = isArchiving;
    submitMemoriesBtn.textContent = isArchiving ? "正在归档……" : "归档这个房间";
  }
}

function getArchiveResponseContent(data) {
  const profile =
    data?.profile ||
    data?.data?.profile ||
    data?.body?.profile ||
    data?.result?.profile;
  const diary =
    data?.diary ||
    data?.data?.diary ||
    data?.body?.diary ||
    data?.result?.diary;
  return { profile, diary };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function handleArchiveRoom(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  console.log("[MemoryHall] archive clicked");

  setArchivePanelOpen(true);
  setIsArchiving(true);
  archiveError = null;
  archiveResult = null;
  renderArchivePanel();

  console.log("[MemoryHall] archive proxy url", ARCHIVE_PROXY_URL);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ARCHIVE_TIMEOUT_MS);

  try {
  const payload = await buildArchivePayload();

  console.log("[MemoryHall] archive payload", payload);
  console.log("[MemoryHall] roomId", payload.roomId);
  console.log("[MemoryHall] userId", payload.userId);

  if (!payload.roomId || !payload.userId) {
    throw new Error("缺少 roomId 或 userId，无法归档房间。");
  }

  const response = await fetch(ARCHIVE_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });

  // 后面的 response 处理保持原样
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`n8n 返回错误：${response.status} ${errorText}`);
    }

    const rawText = await response.text();
    console.log("[MemoryHall] raw response text", rawText);

    if (!rawText) {
      throw new Error("n8n 返回了空内容。请检查 Respond to Webhook 节点是否返回 JSON。");
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      throw new Error(`n8n 返回的不是合法 JSON：${rawText.slice(0, 500)}`);
    }

    console.log("[MemoryHall] archive response", data);

    const { profile, diary } = getArchiveResponseContent(data);
    if (!profile || !diary) {
      console.log("[MemoryHall] invalid archive response", data);
      throw new Error("n8n 已返回，但没有找到 profile 或 diary 字段。请检查工作流 Respond to Webhook 的返回格式。");
    }

    archiveResult = { profile, diary };
    await fetchJson("/api/memory-archive", {
      method: "POST",
      body: JSON.stringify({ profile, diary }),
    });
  } catch (error) {
    console.error("[MemoryHall] archive failed", error);
    if (error.status === 401) {
      archiveError = "请先登录后再归档你的记忆房间。";
    } else if (error.message === "Failed to fetch") {
      archiveError = "读取房间记忆失败。";
    } else {
      archiveError = error instanceof Error ? error.message : String(error);
    }
  } finally {
    window.clearTimeout(timeoutId);
    setIsArchiving(false);
    renderArchivePanel();
  }
}

document.getElementById("resetViewBtn").addEventListener("click", resetView);
document.getElementById("saveMemoryBtn").addEventListener("click", saveMemory);
document.getElementById("cancelMemoryBtn").addEventListener("click", closeNodeCard);
document.getElementById("closeBrowserBtn").addEventListener("click", closeDigitalBrowser);
if (enterRoomBtn) enterRoomBtn.addEventListener("click", enterMemoryRoom);
if (submitMemoriesBtn) submitMemoriesBtn.addEventListener("click", handleArchiveRoom);

memoryInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    saveMemory();
  }
});

document.querySelectorAll("[data-category]").forEach((button) => {
  button.addEventListener("click", () => loadNews(button.dataset.category));
});

async function initializeMemoryHall() {
  renderNodes();
  try {
    const data = await fetchJson("/api/memory-room");
    currentUserId = data.userId;
    currentRoom = data.room;
    setStore({
      nodes: hotspots,
      memories: Array.isArray(data.fragments) ? data.fragments : [],
      newsSelections: [],
    });
    restoreMemories();
  } catch (error) {
    console.warn("[MemoryHall] load room failed; starting with local empty room", error);
    currentUserId = null;
    currentRoom = null;
    setStore({ nodes: hotspots, memories: [], newsSelections: [] });
    restoreMemories();
  }
}

initializeMemoryHall();
