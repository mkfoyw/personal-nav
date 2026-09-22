const API_BASE = location.hostname === "localhost" || location.hostname === "127.0.0.1"
  ? "/api"
  : "http://127.0.0.1:8788/api";

const colors = {
  blue: "#60a5fa",
  violet: "#a78bfa",
  cyan: "#22d3ee",
  pink: "#f472b6",
  amber: "#fbbf24",
  red: "#fb7185",
  slate: "#94a3b8",
  indigo: "#818cf8",
};

const sampleLinks = [
  { _id: "sample-1", title: "ChatGPT", url: "https://chatgpt.com", category: "AI 工具", note: "思考、写作与创造", color: "blue", isDefault: true },
  { _id: "sample-2", title: "GitHub", url: "https://github.com", category: "开发", note: "代码与项目", color: "violet", isDefault: true },
  { _id: "sample-3", title: "Notion", url: "https://notion.so", category: "效率", note: "知识与计划", color: "slate", isDefault: true },
  { _id: "sample-4", title: "Figma", url: "https://figma.com", category: "设计", note: "界面与原型", color: "pink", isDefault: true },
  { _id: "sample-5", title: "Linear", url: "https://linear.app", category: "效率", note: "任务与协作", color: "indigo", isDefault: true },
  { _id: "sample-6", title: "哔哩哔哩", url: "https://bilibili.com", category: "灵感", note: "视频与学习", color: "cyan", isDefault: true },
  { _id: "sample-7", title: "即刻", url: "https://okjike.com", category: "灵感", note: "发现有趣的人", color: "amber", isDefault: true },
  { _id: "sample-8", title: "少数派", url: "https://sspai.com", category: "阅读", note: "效率与生活方式", color: "red", isDefault: true },
];

const state = { links: [], query: "", category: "默认分组", online: false };
const elements = {
  grid: document.querySelector("#linkGrid"),
  filters: document.querySelector("#filters"),
  search: document.querySelector("#searchInput"),
  count: document.querySelector("#resultCount"),
  empty: document.querySelector("#emptyState"),
  connection: document.querySelector("#connectionState"),
  dialog: document.querySelector("#linkDialog"),
  form: document.querySelector("#linkForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  id: document.querySelector("#linkId"),
  title: document.querySelector("#titleInput"),
  url: document.querySelector("#urlInput"),
  category: document.querySelector("#categoryInput"),
  color: document.querySelector("#colorInput"),
  note: document.querySelector("#noteInput"),
  isDefault: document.querySelector("#defaultInput"),
  error: document.querySelector("#formError"),
  deleteButton: document.querySelector("#deleteButton"),
  saveButton: document.querySelector("#saveButton"),
  toast: document.querySelector("#toast"),
};

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;",
  })[char]);
}

function setGreeting() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 6 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
  document.querySelector("#greeting").textContent = `${greeting}，去想去的地方。`;
  document.querySelector("#dateText").textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long", day: "numeric", weekday: "long",
  }).format(now);
}

function setConnection(online) {
  state.online = online;
  elements.connection.className = `connection ${online ? "online" : "offline"}`;
  elements.connection.innerHTML = `<span class="pulse"></span><span>${online ? "本机 MongoDB 已连接" : "本机数据服务未连接 · 当前为预览"}</span>`;
}

function filteredLinks() {
  const query = state.query.toLowerCase();
  return state.links.filter((link) => {
    const categoryMatch = state.category === "全部"
      || (state.category === "默认分组" && Boolean(link.isDefault))
      || link.category === state.category;
    const textMatch = !query || [link.title, link.note, link.category, link.url].some((value) => String(value || "").toLowerCase().includes(query));
    return categoryMatch && textMatch;
  });
}

function renderFilters() {
  const categories = ["默认分组", "全部", ...new Set(state.links.map((link) => link.category).filter(Boolean))];
  if (!categories.includes(state.category)) state.category = "默认分组";
  elements.filters.innerHTML = categories.map((category) => `
    <button class="filter ${category === state.category ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>
  `).join("");
}

function renderLinks() {
  const links = filteredLinks();
  elements.count.textContent = `${links.length} 个链接`;
  elements.empty.hidden = links.length > 0;
  elements.grid.hidden = links.length === 0;
  elements.grid.innerHTML = links.map((link) => `
    <article class="link-card" style="--card-color:${colors[link.color] || colors.blue}">
      <a class="card-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" aria-label="打开 ${escapeHtml(link.title)}">
        <span class="monogram" aria-hidden="true">${escapeHtml(link.title.trim().slice(0, 1).toUpperCase())}</span>
        <h3>${escapeHtml(link.title)}</h3>
        <p>${escapeHtml(link.note || link.category)}</p>
      </a>
      <button class="card-edit" type="button" data-edit="${escapeHtml(link._id)}" aria-label="编辑 ${escapeHtml(link.title)}" title="编辑">•••</button>
    </article>
  `).join("");
}

function render() {
  renderFilters();
  renderLinks();
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

async function loadLinks() {
  try {
    const payload = await api("/links");
    state.links = payload.links;
    setConnection(true);
  } catch {
    state.links = sampleLinks;
    setConnection(false);
  }
  render();
}

function openDialog(link) {
  elements.form.reset();
  elements.isDefault.checked = true;
  elements.error.textContent = "";
  elements.id.value = link?._id || "";
  elements.dialogTitle.textContent = link ? "编辑链接" : "添加链接";
  elements.deleteButton.hidden = !link || String(link._id).startsWith("sample-");
  if (link) {
    elements.title.value = link.title;
    elements.url.value = link.url;
    elements.category.value = link.category || "";
    elements.color.value = link.color || "blue";
    elements.note.value = link.note || "";
    elements.isDefault.checked = Boolean(link.isDefault);
  }
  elements.dialog.showModal();
  requestAnimationFrame(() => elements.title.focus());
}

function formPayload() {
  return {
    title: elements.title.value,
    url: elements.url.value,
    category: elements.category.value || "其他",
    color: elements.color.value,
    note: elements.note.value,
    isDefault: elements.isDefault.checked,
  };
}

function toast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

async function saveLink() {
  if (!elements.form.reportValidity()) return;
  if (!state.online) {
    elements.error.textContent = "请先在本机启动数据服务，再保存收藏。";
    return;
  }
  elements.saveButton.disabled = true;
  elements.error.textContent = "";
  try {
    const id = elements.id.value;
    const payload = await api(id ? `/links/${id}` : "/links", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(formPayload()),
    });
    if (id) state.links = state.links.map((link) => link._id === id ? payload.link : link);
    else state.links = [...state.links, payload.link];
    elements.dialog.close();
    render();
    toast(id ? "链接已更新" : "链接已收藏");
  } catch (error) {
    elements.error.textContent = error.message;
  } finally {
    elements.saveButton.disabled = false;
  }
}

async function deleteLink() {
  const id = elements.id.value;
  const title = elements.title.value;
  if (!id || !confirm(`确定删除「${title}」吗？`)) return;
  try {
    await api(`/links/${id}`, { method: "DELETE" });
    state.links = state.links.filter((link) => link._id !== id);
    elements.dialog.close();
    render();
    toast("链接已删除");
  } catch (error) {
    elements.error.textContent = error.message;
  }
}

document.querySelector("#addButton").addEventListener("click", () => openDialog());
document.querySelector("#themeToggle").addEventListener("click", () => {
  document.documentElement.classList.toggle("light");
});
elements.saveButton.addEventListener("click", saveLink);
elements.deleteButton.addEventListener("click", deleteLink);
elements.search.addEventListener("input", (event) => { state.query = event.target.value.trim(); renderLinks(); });
elements.filters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  render();
});
elements.grid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit]");
  if (!button) return;
  event.preventDefault();
  const link = state.links.find((item) => item._id === button.dataset.edit);
  openDialog(link);
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    elements.search.focus();
  }
  if (event.key === "Escape" && document.activeElement === elements.search) elements.search.blur();
});

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const register = (tool) => Promise.resolve(context.registerTool(tool)).catch(() => {});

  register({
    name: "list_navigation_links",
    title: "列出导航链接",
    description: "读取当前个人导航中的全部链接。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async () => ({ links: state.links.map(({ _id, title, url, category, note, isDefault }) => ({ id: _id, title, url, category, note, isDefault })) }),
  });
  register({
    name: "add_navigation_link",
    title: "添加导航链接",
    description: "将一个 http(s) 链接保存到本机 MongoDB，并刷新页面。",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 80 },
        url: { type: "string", format: "uri" },
        category: { type: "string", maxLength: 30 },
        note: { type: "string", maxLength: 120 },
        isDefault: { type: "boolean", description: "是否显示在默认分组" },
      },
      required: ["title", "url"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: async (input) => {
      if (!state.online) throw new Error("本机数据服务未连接");
      const parsed = new URL(String(input.url));
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("仅支持 http(s) 链接");
      const payload = await api("/links", {
        method: "POST",
        body: JSON.stringify({ ...input, category: input.category || "其他", color: "blue", isDefault: input.isDefault !== false }),
      });
      state.links = [...state.links, payload.link];
      render();
      return { id: payload.link._id, title: payload.link.title, saved: true };
    },
  });
}

setGreeting();
loadLinks();
registerWebMcp();
