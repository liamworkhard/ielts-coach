/* 本地状态：进度保存在 localStorage，不上传任何数据 */

const KEY = "wa-ielts-coach:v1";

export const DEFAULT_SETTINGS = {
  dailyNew: 20,
  dailyReview: 150,
  autoplay: true,
  accent: "uk",
  spotCheck: true,
  showImage: true,
};

export function emptyState() {
  return {
    version: 1,
    test: null,
    queue: [],
    queueMeta: null,
    known: {},
    cards: {},
    stats: { days: {} },
    flags: { overconfident: [] },
    settings: { ...DEFAULT_SETTINGS },
    history: [],
    createdAt: Date.now(),
  };
}

function mergeState(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  const s = {
    ...base,
    ...raw,
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
    stats: { days: {}, ...(raw.stats || {}) },
    flags: { overconfident: [], ...(raw.flags || {}) },
    known: raw.known && typeof raw.known === "object" ? raw.known : {},
    cards: raw.cards && typeof raw.cards === "object" ? raw.cards : {},
    queue: Array.isArray(raw.queue) ? raw.queue : [],
    history: Array.isArray(raw.history) ? raw.history : [],
  };
  if (!s.stats.days || typeof s.stats.days !== "object") s.stats.days = {};
  if (s.test && (!Array.isArray(s.test.items) || typeof s.test.answers !== "object")) {
    s.test = null;
  }
  return s;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    return mergeState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function resetState() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function importState(raw) {
  const s = mergeState(raw);
  saveState(s);
  return s;
}

/* ---------- 日期 ---------- */

export function dayKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStat(state) {
  return state.stats.days[dayKey()] || { new: 0, review: 0, correct: 0 };
}

export function bumpStat(state, kind, correct) {
  const k = dayKey();
  const d = state.stats.days[k] || { new: 0, review: 0, correct: 0 };
  if (kind === "new") d.new += 1;
  else d.review += 1;
  if (correct) d.correct += 1;
  state.stats.days[k] = d;
  return d;
}

export function dueCount(state) {
  const t = dayKey();
  let n = 0;
  for (const [id, card] of Object.entries(state.cards)) {
    if (!state.known[id] && card.due <= t) n++;
  }
  return n;
}

export function knownCount(state) {
  return Object.keys(state.known).length;
}

export function learningCount(state) {
  return Object.keys(state.cards).filter((id) => !state.known[id]).length;
}
