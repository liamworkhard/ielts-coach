/* 学习队列、间隔复习与导出 */

import { bandWords, getWord, hashStr, TOPIC_LABEL } from "./data.js";
import { computeResult, targetBands } from "./test.js";
import { dayKey, todayStat } from "./store.js";

/** 依据测试结果生成“只学不会的”学习队列 */
export function buildQueue(state) {
  const result = computeResult(state.test, state.test.answers);
  const bands = targetBands(result);
  const anyWeak = result.bands.some(
    (b) => b.n > 0 && b.rate < (b.band === "C2" ? 0.96 : 0.93)
  );
  const weakTopics = new Set(result.weakTopics.map((t) => t.topic));
  const missedSet = new Set(result.missed);
  const seen = new Set();

  const queue = [];
  const push = (id) => {
    if (seen.has(id) || state.known[id]) return;
    seen.add(id);
    queue.push(id);
  };

  // 本次测试中明确不认识的词，优先
  for (const id of result.missed) {
    if (getWord(id)) push(id);
  }

  const rest = [];
  for (const band of bands) {
    for (const w of bandWords(band)) {
      if (missedSet.has(w.id) || state.known[w.id]) continue;
      rest.push(w);
    }
  }
  rest.sort((a, b) => {
    const ta = weakTopics.has(a.topic) ? 0 : 1;
    const tb = weakTopics.has(b.topic) ? 0 : 1;
    if (ta !== tb) return ta - tb;
    return hashStr(a.id + "|queue") - hashStr(b.id + "|queue");
  });

  // 如果没有明显薄弱层，就从 C1/C2 里取一批巩固词，避免队列无限长
  const pool = anyWeak ? rest : rest.slice(0, 400);
  for (const w of pool) push(w.id);

  return {
    ids: queue,
    meta: {
      created: Date.now(),
      bands,
      weakTopics: [...weakTopics],
      result: {
        known: result.known,
        knownLo: result.knownLo,
        knownHi: result.knownHi,
        level: result.level,
        unknown: result.unknown,
      },
    },
  };
}

export function rebuildQueue(state) {
  const { ids, meta } = buildQueue(state);
  state.queue = ids;
  state.queueMeta = meta;
  return ids;
}

/* ---------- 间隔复习 ---------- */

export const GRADES = [
  { g: 0, label: "忘了", hint: "明天再来", cls: "g0" },
  { g: 1, label: "模糊", hint: "短期复习", cls: "g1" },
  { g: 2, label: "记住", hint: "正常间隔", cls: "g2" },
  { g: 3, label: "太简单", hint: "拉长间隔", cls: "g3" },
];

export function gradeCard(state, id, grade) {
  const today = dayKey();
  let c = state.cards[id];
  if (!c) {
    c = {
      state: "learning",
      due: today,
      interval: 0,
      ease: 2.3,
      reps: 0,
      lapses: 0,
      first: today,
    };
  }
  if (grade === 0) {
    c.interval = 1;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.lapses = (c.lapses || 0) + 1;
    c.state = "learning";
  } else if (!c.reps) {
    c.interval = grade === 1 ? 1 : grade === 2 ? 2 : 4;
    c.state = "learning";
  } else {
    const factor = grade === 1 ? 0.75 : grade === 2 ? 1 : 1.3;
    c.interval = Math.max(1, Math.round((c.interval || 1) * c.ease * factor));
    c.ease = Math.min(2.8, Math.max(1.3, c.ease + (grade === 3 ? 0.1 : grade === 1 ? -0.05 : 0)));
    c.state = "review";
  }
  c.reps = (c.reps || 0) + 1;
  c.lastGrade = grade;
  c.last = Date.now();
  c.due = dayKey(c.interval);
  state.cards[id] = c;
  return c;
}

export function markKnown(state, id, via = "triage") {
  state.known[id] = { at: Date.now(), via };
  if (state.cards[id]) delete state.cards[id];
}

export function planSession(state, extraNew = 0) {
  const today = dayKey();
  const due = [];
  for (const [id, c] of Object.entries(state.cards)) {
    if (state.known[id]) continue;
    if (c.due <= today) due.push({ id, due: c.due });
  }
  due.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  const reviews = due.slice(0, state.settings.dailyReview).map(({ id }) => ({ id, type: "review" }));

  const doneNew = todayStat(state).new;
  const limit = Math.max(0, state.settings.dailyNew - doneNew) + extraNew;
  const newItems = [];
  for (const id of state.queue) {
    if (newItems.length >= limit) break;
    if (state.known[id] || state.cards[id]) continue;
    newItems.push({ id, type: "new" });
  }

  return {
    items: [...reviews, ...newItems],
    reviewTotal: due.length,
    newAvailable: limit,
  };
}

export function queueRemaining(state) {
  let n = 0;
  for (const id of state.queue) {
    if (!state.known[id] && !state.cards[id]) n++;
  }
  return n;
}

/* ---------- 导出 ---------- */

const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const coll = (w) => (w.col || []).join("; ");
const fam = (w) => (w.fam || []).join("; ");

export function wordsToCSV(list) {
  const head = [
    "word",
    "ipa_uk",
    "ipa_us",
    "pos",
    "meaning_zh",
    "meaning_en",
    "example",
    "example_zh",
    "collocations",
    "word_family",
    "cefr",
    "topic",
  ];
  const rows = list.map((w) => [
    w.w,
    w.uk,
    w.us,
    w.senses[0]?.pos || "",
    w.senses[0]?.zh || "",
    w.senses[0]?.en || "",
    w.ex[0]?.en || "",
    w.ex[0]?.zh || "",
    coll(w),
    fam(w),
    w.cefr,
    TOPIC_LABEL[w.topic] || w.topic,
  ]);
  return [head, ...rows].map((r) => r.map(q).join(",")).join("\n");
}

export function buildReport(state, result) {
  const meta = state.queueMeta || {};
  const days = state.settings.dailyNew ? Math.ceil((meta.result ? Math.max(0, state.queue.length) : 0) / state.settings.dailyNew) : 0;
  const lines = [];
  lines.push("# 雅思词汇诊断报告");
  lines.push("");
  lines.push(`生成时间：${new Date().toLocaleString("zh-CN")}`);
  lines.push("");
  lines.push("## 估算结果");
  lines.push("");
  lines.push(`- 估算已掌握：**${result.known.toLocaleString()} / ${result.total.toLocaleString()}** 词（95% 区间 ${result.knownLo.toLocaleString()}–${result.knownHi.toLocaleString()}）`);
  lines.push(`- 估算缺口：**${result.unknown.toLocaleString()}** 词`);
  lines.push(`- 对应水平：**${result.level}**（阅读词汇）`);
  lines.push(`- 本次答题：${result.correct}/${result.answered}（${Math.round(result.accuracy * 100)}%）`);
  lines.push("");
  lines.push("## 分层掌握情况");
  lines.push("");
  lines.push("| CEFR | 词量 | 抽样 | 答对 | 掌握率 | 估计未掌握 |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const b of result.bands) {
    lines.push(`| ${b.band} | ${b.N} | ${b.n} | ${b.correct} | ${Math.round(b.rate * 100)}% | ${b.unknown} |`);
  }
  lines.push("");
  if (result.weakTopics.length) {
    lines.push("## 薄弱话题");
    lines.push("");
    for (const t of result.weakTopics) {
      lines.push(`- ${TOPIC_LABEL[t.topic] || t.topic}：抽样 ${t.n} 题，正确 ${t.correct} 题（${Math.round(t.rate * 100)}%）`);
    }
    lines.push("");
  }
  if (state.queue.length) {
    lines.push("## 学习计划");
    lines.push("");
    lines.push(`- 待攻克清单：**${state.queue.length.toLocaleString()}** 词`);
    lines.push(`- 主攻层级：${(meta.bands || []).join(" / ") || "—"}`);
    lines.push(`- 按每天 ${state.settings.dailyNew} 个新词计算：约 **${days} 天**（不含复习）`);
    lines.push("");
  }
  if (result.missed.length) {
    lines.push("## 本次未认出的词");
    lines.push("");
    lines.push(result.missed.slice(0, 80).map((id) => `- ${getWord(id)?.w || id}`).join("\n"));
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("词库与插画来自 Word Atlas contributors（词光），CC BY 4.0。诊断基于分层抽样，结果为统计估计，不是逐词判定。");
  return lines.join("\n");
}

export function download(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
