/* 分层抽样测试与结果估算 */

import {
  BANDS,
  bandSize,
  bandWords,
  getWord,
  hashStr,
  mulberry32,
} from "./data.js";

export function wilson(correct, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = correct / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** 按各层级词量比例分配题量，并保证每层至少 min 题 */
export function allocate(total) {
  const sizes = BANDS.map((b) => bandSize(b));
  const sum = sizes.reduce((a, b) => a + b, 0);
  const min = total >= 140 ? 8 : 6;
  const raw = sizes.map((n) => (total * n) / sum);
  const alloc = raw.map((v) => Math.floor(v));
  let left = total - alloc.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (left > 0) {
    alloc[order[k % order.length].i] += 1;
    k += 1;
    left -= 1;
  }
  for (let i = 0; i < alloc.length; i++) {
    while (alloc[i] < min) {
      let j = 0;
      for (let x = 1; x < alloc.length; x++) {
        if (alloc[x] > alloc[j]) j = x;
      }
      alloc[j] -= 1;
      alloc[i] += 1;
    }
  }
  return alloc;
}

export function buildTest(total = 100, seed = Date.now() >>> 0) {
  const alloc = allocate(total);
  const rng = mulberry32(seed);
  const items = [];
  BANDS.forEach((band, i) => {
    const pool = bandWords(band).slice();
    for (let j = pool.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [pool[j], pool[k]] = [pool[k], pool[j]];
    }
    for (const w of pool.slice(0, alloc[i])) items.push(w.id);
  });
  for (let j = items.length - 1; j > 0; j--) {
    const k = Math.floor(rng() * (j + 1));
    [items[j], items[k]] = [items[k], items[j]];
  }
  return {
    seed,
    length: items.length,
    items,
    answers: {},
    started: Date.now(),
    finished: 0,
  };
}

export function answeredCount(test) {
  return test ? Object.keys(test.answers).length : 0;
}

export function testProgress(test) {
  if (!test) return 0;
  return Math.min(1, answeredCount(test) / Math.max(1, test.length));
}

const LEVELS = [
  ["C2", 6800],
  ["C1", 5600],
  ["B2", 4200],
  ["B1", 2800],
  ["A2", 1500],
  ["A1", 0],
];

function levelFor(known) {
  for (const [level, threshold] of LEVELS) {
    if (known >= threshold) return level;
  }
  return "A1";
}

export function computeResult(test, answers = test?.answers || {}) {
  const recs = Object.entries(answers).map(([id, r]) => {
    const w = getWord(id);
    return {
      id,
      band: r.band || w?.cefr || "B2",
      topic: r.topic || w?.topic || "daily",
      correct: !!r.correct,
      skipped: !!r.skipped,
      ms: r.ms || 0,
    };
  });

  const bands = BANDS.map((band) => {
    const rs = recs.filter((r) => r.band === band);
    const n = rs.length;
    const correct = rs.filter((r) => r.correct).length;
    const rate = n ? correct / n : 0;
    const [lo, hi] = wilson(correct, n);
    const N = bandSize(band);
    return {
      band,
      N,
      n,
      correct,
      skipped: rs.filter((r) => r.skipped).length,
      rate,
      lo,
      hi,
      known: Math.round(N * rate),
      knownLo: Math.round(N * lo),
      knownHi: Math.round(N * hi),
      unknown: N - Math.round(N * rate),
    };
  });

  const answered = recs.length;
  const correct = recs.filter((r) => r.correct).length;
  const known = bands.reduce((a, b) => a + b.known, 0);
  const knownLo = bands.reduce((a, b) => a + b.knownLo, 0);
  const knownHi = bands.reduce((a, b) => a + b.knownHi, 0);
  const total = bands.reduce((a, b) => a + b.N, 0);

  const topicMap = new Map();
  for (const r of recs) {
    const t = topicMap.get(r.topic) || { topic: r.topic, n: 0, correct: 0 };
    t.n += 1;
    if (r.correct) t.correct += 1;
    topicMap.set(r.topic, t);
  }
  const weakTopics = [...topicMap.values()]
    .map((t) => ({ ...t, rate: t.n ? t.correct / t.n : 0 }))
    .filter((t) => t.n >= 3 && t.rate < 0.7)
    .sort((a, b) => b.n * (1 - b.rate) - a.n * (1 - a.rate))
    .slice(0, 5);

  const missed = recs.filter((r) => !r.correct).map((r) => r.id);

  return {
    answered,
    correct,
    accuracy: answered ? correct / answered : 0,
    bands,
    known,
    knownLo,
    knownHi,
    unknown: total - known,
    total,
    level: levelFor(known),
    weakTopics,
    missed,
  };
}

export const QUEUE_THRESHOLD = {
  A1: 0.8,
  A2: 0.82,
  B1: 0.86,
  B2: 0.9,
  C1: 0.93,
  C2: 0.96,
};

/** 根据测试结果决定主攻层级 */
export function targetBands(result) {
  const weak = result.bands
    .filter((b) => b.n > 0 && b.rate < QUEUE_THRESHOLD[b.band] && b.unknown >= 50)
    .map((b) => b.band);
  return weak.length ? weak : ["C1", "C2"];
}
