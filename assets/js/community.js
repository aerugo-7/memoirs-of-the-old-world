const state = {
  user: null,
  view: "wall",
  notes: [],
  posts: [],
  mine: null,
  activePostId: null,
};

const viewCopy = {
  wall: ["留言墙", "一面旧墙，贴着来自不同访客的短句。"],
  posts: ["分享社区", "把一段旧世界日志放进公共档案，等待他人的回声。"],
  mine: ["我的发布", "你留在公共档案馆里的纸条、日志与回声。"],
  agent: ["AI档案管理员", "暂时由预设回复值班，后续可以接入真正的工作流。"],
};

const noteColors = [
  "rgba(224, 205, 153, 0.9)",
  "rgba(213, 196, 165, 0.88)",
  "rgba(190, 174, 137, 0.9)",
  "rgba(226, 211, 178, 0.88)",
  "rgba(202, 181, 128, 0.88)",
];

const $ = (selector) => document.querySelector(selector);

const elements = {
  userAvatar: $("#userAvatar"),
  userName: $("#userName"),
  userRole: $("#userRole"),
  noteComposer: $("#noteComposer"),
  postComposer: $("#postComposer"),
  noteInput: $("#noteInput"),
  noteCount: $("#noteCount"),
  publishNoteBtn: $("#publishNoteBtn"),
  postTitle: $("#postTitle"),
  postContent: $("#postContent"),
  postImage: $("#postImage"),
  publishPostBtn: $("#publishPostBtn"),
  statusLine: $("#statusLine"),
  viewTitle: $("#viewTitle"),
  viewSubtitle: $("#viewSubtitle"),
  noteWall: $("#noteWall"),
  postGrid: $("#postGrid"),
  mineList: $("#mineList"),
  agentInput: $("#agentInput"),
  sendAgentBtn: $("#sendAgentBtn"),
  agentChat: $("#agentChat"),
  postDialog: $("#postDialog"),
  closePostDialog: $("#closePostDialog"),
  postDetail: $("#postDetail"),
};

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function setStatus(message, isError = false) {
  elements.statusLine.textContent = message || "";
  elements.statusLine.style.color = isError ? "rgba(244, 165, 130, 0.9)" : "";
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

  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || data.error || text || `请求失败：${response.status}`);
    error.status = response.status;
    throw error;
  }

  return data;
}

function renderAuthBlocked(message = "请先登录后进入旧世界社区。") {
  document.querySelector(".community-shell").innerHTML = `
    <section class="auth-block">
      <p class="eyebrow">Memoirs of the Old World</p>
      <h1>旧世界公共档案馆</h1>
      <p>${escapeHtml(message)}</p>
      <a class="paper-button" href="./login.html">去登录</a>
    </section>
  `;
}

async function loadMe() {
  const data = await fetchJson("/api/community/me");
  state.user = data.user;
  elements.userName.textContent = state.user.name || "匿名访客";
  elements.userRole.textContent = state.user.role || "旧世界访客";
  if (state.user.avatar) {
    elements.userAvatar.src = state.user.avatar;
  } else {
    elements.userAvatar.removeAttribute("src");
  }
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `${view === "posts" ? "posts" : view}View`);
  });

  elements.noteComposer.classList.toggle("is-hidden", view !== "wall");
  elements.postComposer.classList.toggle("is-hidden", view !== "posts");

  const [title, subtitle] = viewCopy[view] || viewCopy.wall;
  elements.viewTitle.textContent = title;
  elements.viewSubtitle.textContent = subtitle;

  if (view === "mine") loadMine();
}

function renderNotes() {
  if (!state.notes.length) {
    elements.noteWall.innerHTML = `<p class="empty-state">墙面还很安静。可以先留下一张纸条。</p>`;
    return;
  }

  elements.noteWall.innerHTML = state.notes.map((note, index) => {
    const rotate = ((index * 17) % 7) - 3;
    const color = noteColors[index % noteColors.length];
    return `
      <article class="note-card" style="--rotate:${rotate}deg;--note-color:${color}">
        <p>${escapeHtml(note.content)}</p>
        <div class="note-meta">${escapeHtml(note.authorName || "匿名访客")} · ${formatTime(note.createdAt)}</div>
      </article>
    `;
  }).join("");
}

async function loadNotes() {
  const data = await fetchJson("/api/community/notes");
  state.notes = data.notes || [];
  renderNotes();
}

function renderPosts() {
  if (!state.posts.length) {
    elements.postGrid.innerHTML = `<p class="empty-state">还没有旧世界日志。你可以发布第一份。</p>`;
    return;
  }

  elements.postGrid.innerHTML = state.posts.map((post) => `
    <article class="post-card" data-post-id="${escapeHtml(post.id)}" tabindex="0">
      ${post.imageUrl ? `<img class="post-thumb" src="${escapeHtml(post.imageUrl)}" alt="">` : ""}
      <div class="post-body">
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.content).slice(0, 120)}${post.content.length > 120 ? "..." : ""}</p>
        <div class="post-meta">${escapeHtml(post.authorName || "匿名访客")} · ${formatTime(post.createdAt)}</div>
        <div class="post-stats">
          <span>${Number(post.commentCount || 0)} 条回声</span>
          <span>🕯 ${Number(post.visitCount || 0)} 来过</span>
        </div>
      </div>
    </article>
  `).join("");
}

async function loadPosts() {
  const data = await fetchJson("/api/community/posts");
  state.posts = data.posts || [];
  renderPosts();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      reject(new Error("图片不能超过 4MB。"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败。"));
    reader.readAsDataURL(file);
  });
}

async function publishNote() {
  const content = elements.noteInput.value.trim();
  if (!content) {
    setStatus("纸条内容不能为空。", true);
    return;
  }

  try {
    elements.publishNoteBtn.disabled = true;
    const data = await fetchJson("/api/community/notes", {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    state.notes.unshift(data.note);
    elements.noteInput.value = "";
    elements.noteCount.textContent = "0 / 50";
    renderNotes();
    setStatus("纸条已经贴上墙。");
  } catch (error) {
    console.error("[Community] publish note failed", error);
    setStatus(error.message || "发布纸条失败。", true);
  } finally {
    elements.publishNoteBtn.disabled = false;
  }
}

async function publishPost() {
  const title = elements.postTitle.value.trim();
  const content = elements.postContent.value.trim();
  if (!title || !content) {
    setStatus("标题和正文都要填写。", true);
    return;
  }

  try {
    elements.publishPostBtn.disabled = true;
    elements.publishPostBtn.textContent = "正在归档...";
    const imageUrl = await fileToDataUrl(elements.postImage.files[0]);
    await fetchJson("/api/community/posts", {
      method: "POST",
      body: JSON.stringify({ title, content, imageUrl }),
    });
    elements.postTitle.value = "";
    elements.postContent.value = "";
    elements.postImage.value = "";
    await loadPosts();
    setStatus("旧世界日志已经发布。");
  } catch (error) {
    console.error("[Community] publish post failed", error);
    setStatus(error.message || "发布日志失败。", true);
  } finally {
    elements.publishPostBtn.disabled = false;
    elements.publishPostBtn.textContent = "发布旧世界日志";
  }
}

async function openPost(postId) {
  try {
    state.activePostId = postId;
    const data = await fetchJson(`/api/community/posts/${encodeURIComponent(postId)}`);
    renderPostDetail(data.post, data.comments || []);
    elements.postDialog.showModal();
  } catch (error) {
    console.error("[Community] open post failed", error);
    setStatus(error.message || "读取帖子失败。", true);
  }
}

function renderPostDetail(post, comments) {
  elements.postDetail.innerHTML = `
    <article class="post-detail">
      <p class="eyebrow">Community Log</p>
      <h2>${escapeHtml(post.title)}</h2>
      <div class="post-meta">${escapeHtml(post.authorName || "匿名访客")} · ${formatTime(post.createdAt)}</div>
      ${post.imageUrl ? `<img class="post-detail-image" src="${escapeHtml(post.imageUrl)}" alt="">` : ""}
      <div class="post-detail-content">${escapeHtml(post.content)}</div>
      <div class="detail-actions">
        <button class="paper-button" id="visitPostBtn" type="button">🕯 来过</button>
        <span id="visitCount">${Number(post.visitCount || 0)} 人来过</span>
      </div>
      <section>
        <p class="eyebrow">Echoes</p>
        <h3>回声</h3>
        <div class="comments-list" id="commentsList">
          ${comments.length ? comments.map(renderComment).join("") : `<p class="empty-state">还没有回声。</p>`}
        </div>
        <div class="comment-form">
          <textarea id="commentInput" placeholder="写下回声"></textarea>
          <button class="paper-button" id="publishCommentBtn" type="button">写下回声</button>
        </div>
      </section>
    </article>
  `;

  $("#visitPostBtn").addEventListener("click", visitActivePost);
  $("#publishCommentBtn").addEventListener("click", publishComment);
}

function renderComment(comment) {
  return `
    <article class="comment-card">
      <p>${escapeHtml(comment.content)}</p>
      <div class="comment-meta">${escapeHtml(comment.authorName || "匿名访客")} · ${formatTime(comment.createdAt)}</div>
    </article>
  `;
}

async function visitActivePost() {
  if (!state.activePostId) return;
  try {
    const data = await fetchJson(`/api/community/posts/${encodeURIComponent(state.activePostId)}/visit`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    $("#visitCount").textContent = `${Number(data.visitCount || 0)} 人来过`;
    await loadPosts();
  } catch (error) {
    console.error("[Community] visit failed", error);
    setStatus(error.message || "记录来过失败。", true);
  }
}

async function publishComment() {
  const input = $("#commentInput");
  const content = input.value.trim();
  if (!state.activePostId || !content) {
    setStatus("回声不能为空。", true);
    return;
  }

  try {
    const data = await fetchJson(`/api/community/posts/${encodeURIComponent(state.activePostId)}/comments`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    input.value = "";
    const list = $("#commentsList");
    if (list.querySelector(".empty-state")) list.innerHTML = "";
    list.insertAdjacentHTML("beforeend", renderComment(data.comment));
    await loadPosts();
  } catch (error) {
    console.error("[Community] publish comment failed", error);
    setStatus(error.message || "写下回声失败。", true);
  }
}

async function loadMine() {
  try {
    const data = await fetchJson("/api/community/mine");
    state.mine = data;
    renderMine();
  } catch (error) {
    console.error("[Community] load mine failed", error);
    elements.mineList.innerHTML = `<p class="empty-state">${escapeHtml(error.message || "读取我的发布失败。")}</p>`;
  }
}

function renderMine() {
  const blocks = [];

  (state.mine.notes || []).forEach((note) => {
    blocks.push(`
      <article class="mine-card">
        <p class="eyebrow">留言</p>
        <h3>${escapeHtml(note.content)}</h3>
        <p>${formatTime(note.createdAt)}</p>
      </article>
    `);
  });

  (state.mine.posts || []).forEach((post) => {
    blocks.push(`
      <article class="mine-card">
        <p class="eyebrow">日志</p>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.content).slice(0, 160)}${post.content.length > 160 ? "..." : ""}</p>
        <p>${formatTime(post.createdAt)} · ${post.commentCount} 条回声 · 🕯 ${post.visitCount}</p>
      </article>
    `);
  });

  (state.mine.comments || []).forEach((comment) => {
    blocks.push(`
      <article class="mine-card">
        <p class="eyebrow">回声 · ${escapeHtml(comment.postTitle || "旧世界日志")}</p>
        <h3>${escapeHtml(comment.content)}</h3>
        <p>${formatTime(comment.createdAt)}</p>
      </article>
    `);
  });

  elements.mineList.innerHTML = blocks.length ? blocks.join("") : `<p class="empty-state">你还没有在公共档案馆留下内容。</p>`;
}

async function sendAgentMessage() {
  const message = elements.agentInput.value.trim();
  if (!message) return;

  elements.agentChat.insertAdjacentHTML("beforeend", `<p class="visitor-message">${escapeHtml(message)}</p>`);
  elements.agentInput.value = "";

  try {
    const data = await fetchJson("/api/community/agent", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    elements.agentChat.insertAdjacentHTML("beforeend", `<p class="agent-message">${escapeHtml(data.reply)}</p>`);
  } catch (error) {
    console.error("[Community] agent failed", error);
    elements.agentChat.insertAdjacentHTML("beforeend", `<p class="agent-message">值班窗口暂时没有回应。</p>`);
  }
}

function bindEvents() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  elements.noteInput.addEventListener("input", () => {
    elements.noteCount.textContent = `${elements.noteInput.value.length} / 50`;
  });
  elements.publishNoteBtn.addEventListener("click", publishNote);
  elements.publishPostBtn.addEventListener("click", publishPost);
  elements.sendAgentBtn.addEventListener("click", sendAgentMessage);
  elements.agentInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") sendAgentMessage();
  });

  $("#toggleAgentBtn").addEventListener("click", () => switchView("agent"));
  elements.closePostDialog.addEventListener("click", () => elements.postDialog.close());

  elements.postGrid.addEventListener("click", (event) => {
    const card = event.target.closest(".post-card");
    if (card) openPost(card.dataset.postId);
  });
  elements.postGrid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const card = event.target.closest(".post-card");
    if (card) openPost(card.dataset.postId);
  });
}

async function initCommunity() {
  bindEvents();
  try {
    await loadMe();
    await Promise.all([loadNotes(), loadPosts()]);
  } catch (error) {
    console.error("[Community] init failed", error);
    if (error.status === 401) {
      renderAuthBlocked(error.message);
    } else {
      setStatus(error.message || "社区加载失败。", true);
    }
  }
}

initCommunity();
