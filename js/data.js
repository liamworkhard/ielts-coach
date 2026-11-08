/* 词库加载与选项生成 */

export const BANDS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export const BAND_LABEL = {
  A1: "入门",
  A2: "基础",
  B1: "进阶",
  B2: "中高级",
  C1: "高级",
  C2: "精通",
};

export const TOPIC_LABEL = {
  education: "教育",
  work: "工作",
  technology: "科技",
  science: "科学",
  environment: "环境",
  health: "健康",
  society: "社会",
  government: "政府",
  economy: "经济",
  media: "媒体",
  arts: "艺术",
  travel: "旅行",
  city: "城市",
  nature: "自然",
  daily: "日常",
  emotion: "情绪",
  thinking: "思维",
  sport: "运动",
  history: "历史",
};

const MEDIA_BASE = "https://0xlei.tech/words/atlas";

let words = [];
let byId = new Map();
let byBand = new Map();
let byTopic = new Map();

export async function loadWords(url = "data/words.json") {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`词库加载失败（${res.status}）`);
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) throw new Error("词库格式不正确");
  words = data.map((w) => ({
    ...w,
    senses: Array.isArray(w.senses) && w.senses.length ? w.senses : [{ pos: "", zh: "", en: "" }],
    ex: Array.isArray(w.ex) ? w.ex : [],
    col: Array.isArray(w.col) ? w.col : [],
    fam: Array.isArray(w.fam) ? w.fam : [],
    syn: Array.isArray(w.syn) ? w.syn : [],
    ant: Array.isArray(w.ant) ? w.ant : [],
  }));
  byId = new Map(words.map((w) => [w.id, w]));
  byBand = new Map(BANDS.map((b) => [b, []]));
  byTopic = new Map();
  for (const w of words) {
    if (byBand.has(w.cefr)) byBand.get(w.cefr).push(w);
    if (!byTopic.has(w.topic)) byTopic.set(w.topic, []);
    byTopic.get(w.topic).push(w);
  }
  return words;
}

export const allWords = () => words;
export const getWord = (id) => byId.get(id);
export const bandWords = (band) => byBand.get(band) || [];
export const topicWords = (topic) => byTopic.get(topic) || [];
export const bandSize = (band) => (byBand.get(band) || []).length;
export const totalWords = () => words.length;

/* ---------- 伪随机 ---------- */

export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 选项 ---------- */

const normZh = (s) => String(s || "").replace(/[\s；;，,。.、]/g, "");

function related(a, b) {
  return (
    a.syn.includes(b.w) ||
    b.syn.includes(a.w) ||
    a.ant.includes(b.w) ||
    b.ant.includes(a.w)
  );
}

/**
 * 为目标词生成 4 个中文释义选项（1 正确 + 3 干扰）。
 * 同一 seed 下结果稳定，便于恢复测试进度。
 */
export function makeOptions(word, seed) {
  const correct = word.senses[0].zh;
  const pos = word.senses[0].pos;
  const rank = (w) => hashStr(w.id + "|" + seed);

  const samePos = [];
  const others = [];
  for (const w of words) {
    if (w.id === word.id) continue;
    if (w.senses[0].pos === pos) samePos.push(w);
    else others.push(w);
  }

  const pools = [
    samePos.filter((w) => w.topic !== word.topic),
    samePos,
    others,
  ];

  const seen = new Set([normZh(correct)]);
  const picked = [];
  for (const pool of pools) {
    if (picked.length >= 3) break;
    const sorted = pool.slice().sort((a, b) => rank(a) - rank(b));
    for (const w of sorted) {
      if (picked.length >= 3) break;
      if (picked.some((p) => p.id === w.id)) continue;
      const zh = w.senses[0].zh;
      const key = normZh(zh);
      if (!zh || seen.has(key) || related(word, w)) continue;
      seen.add(key);
      picked.push(w);
    }
  }

  const options = [
    { text: correct, correct: true },
    ...picked.map((w) => ({ text: w.senses[0].zh, correct: false })),
  ];
  return options.sort(
    (a, b) => hashStr(a.text + "|" + seed) - hashStr(b.text + "|" + seed)
  );
}

/* ---------- 媒体 ---------- */

export const media = {
  img: (id) => `${MEDIA_BASE}/img/${encodeURIComponent(id)}.webp`,
  thumb: (id) => `${MEDIA_BASE}/thumb/${encodeURIComponent(id)}.webp`,
  audio: (id, accent = "uk") => `${MEDIA_BASE}/audio/${accent}/${encodeURIComponent(id)}.mp3`,
  example: (id) => `${MEDIA_BASE}/audio/ex/${encodeURIComponent(id)}.mp3`,
};
