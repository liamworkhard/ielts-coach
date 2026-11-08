/* 词光 · 雅思词汇诊断 —— 本地单页应用 */

import {
  BANDS,
  BAND_LABEL,
  TOPIC_LABEL,
  allWords,
  bandWords,
  getWord,
  hashStr,
  loadWords,
  makeOptions,
  media,
  totalWords,
} from "./data.js";
import {
  answeredCount,
  buildTest,
  computeResult,
} from "./test.js";
import {
  DEFAULT_SETTINGS,
  bumpStat,
  dayKey,
  dueCount,
  importState,
  knownCount,
  learningCount,
  loadState,
  resetState,
  saveState,
  todayStat,
} from "./store.js";
import {
  GRADES,
  buildReport,
  download,
  gradeCard,
  markKnown,
  planSession,
  queueRemaining,
  rebuildQueue,
  wordsToCSV,
} from "./study.js";

const app = document.getElementById("app");
const modal = document.getElementById("modal");
const toastEl = document.getElementById("toast");

let S = loadState();
let route = "home";
let session = null;
let testLength = 100;
let locked = false;
let qStart = 0;
let currentOptions = null;
let toastTimer = 0;
let sessionCounted = false;

const wordFilter = {
  status: "queue",
  explicit: false, // 用户是否手动选过状态标签
  band: "",
  topic: "",
  q: "",
  limit: 80,
};

/* ================= 工具 ================= */

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

const pct = (x) => Math.round((x || 0) * 100);

const BAND_COLOR = {
  A1: "#a8c2b7",
  A2: "#83a99a",
  B1: "#5e8f7e",
  B2: "#3a7264",
  C1: "#b98a3e",
  C2: "#8a5a2b",
};

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function go(hash) {
  navigate(hash);
}

let audioEl = null;
function play(url) {
  try {
    if (audioEl) audioEl.pause();
    audioEl = new Audio(url);
    audioEl.play().catch(() => toast("音频暂时加载失败（可能网络或离线）"));
  } catch {
    toast("音频暂时加载失败");
  }
}

function openModal(html) {
  modal.innerHTML = html;
  modal.hidden = false;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
  const close = modal.querySelector(".modal-close");
  if (close) close.addEventListener("click", closeModal);
}

function closeModal() {
  modal.hidden = true;
  modal.innerHTML = "";
  modal.onclick = null;
}

function testResult() {
  if (!S.test || !S.test.finished) return null;
  return computeResult(S.test);
}

function ensureQueue() {
  if (S.test?.finished && !S.queue.length) {
    rebuildQueue(S);
    saveState(S);
  }
}

/* ================= 启动 ================= */

/* ---------- 离线安装（PWA） ---------- */

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* 部分浏览器或 file:// 下不支持，忽略 */
    });
  });
}

function isAppleMobile() {
  const ua = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1)
  );
}

function isInstalledApp() {
  try {
    if (window.navigator.standalone === true) return true;
  } catch {
    /* ignore */
  }
  try {
    return window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

function hintHidden() {
  try {
    return localStorage.getItem("wa-install-hint") === "1";
  } catch {
    return false;
  }
}

function hideHint() {
  try {
    localStorage.setItem("wa-install-hint", "1");
  } catch {
    /* ignore */
  }
}

async function init() {
  initTheme();
  bindGlobal();
  registerServiceWorker();
  try {
    await loadWords("data/words.json");
  } catch (err) {
    app.innerHTML = `
      <div class="empty">
        <b>词库加载失败</b>
        <p>${esc(err.message)}</p>
        <p class="small">请确认通过本地服务器打开（运行 <code>./run.sh</code>），而不是直接双击 HTML 文件。</p>
      </div>`;
    return;
  }
  onHashChange();
}

function onHashChange() {
  const raw = location.hash.replace(/^#\/?/, "").trim();
  route = raw.split("/")[0] || "home";
  if (!["home", "test", "result", "study", "words", "about"].includes(route)) route = "home";
  if (!modal.hidden) closeModal(); // 切换页面时关掉残留弹窗
  render();
}

function bindGlobal() {
  window.addEventListener("hashchange", onHashChange);
  document.getElementById("themeBtn").addEventListener("click", toggleTheme);

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-audio-url]");
    if (b) {
      play(b.dataset.audioUrl);
    }
  });

  document.addEventListener(
    "error",
    (e) => {
      if (e.target && e.target.tagName === "IMG") e.target.style.display = "none";
    },
    true
  );

  document.addEventListener("keydown", onKey);
}

function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem("wa-theme");
  } catch {
    /* ignore */
  }
  if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
}

function toggleTheme() {
  const cur =
    document.documentElement.dataset.theme ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("wa-theme", next);
  } catch {
    /* ignore */
  }
}

/* ================= 路由渲染 ================= */

function render() {
  document.querySelectorAll(".nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === route);
  });
  const titles = {
    home: "词光 · 雅思词汇诊断",
    test: "词汇摸底 · 词光",
    result: "诊断报告 · 词光",
    study: "学习 · 词光",
    words: "词表 · 词光",
    about: "方法与设置 · 词光",
  };
  document.title = titles[route] || titles.home;

  switch (route) {
    case "test":
      renderTest();
      break;
    case "result":
      renderResult();
      break;
    case "study":
      renderStudy();
      break;
    case "words":
      renderWords();
      break;
    case "about":
      renderAbout();
      break;
    default:
      renderHome();
  }
}

/* ================= 首页 ================= */

function renderHome() {
  const result = testResult();
  const inProgress = S.test && !S.test.finished;
  const answered = inProgress ? answeredCount(S.test) : 0;
  const due = dueCount(S);
  const stat = todayStat(S);
  const remaining = S.queue.length ? queueRemaining(S) : 0;

  let heroActions = "";
  let meta = `
    <div><b>7,298</b><span>雅思词条</span></div>
    <div><b>6</b><span>CEFR 层级</span></div>
    <div><b>19</b><span>话题</span></div>
    <div><b>20%</b><span>随机抽查防高估</span></div>`;

  if (inProgress) {
    heroActions = `
      <a class="btn lg" href="#/test">继续摸底（${answered} / ${S.test.length}）</a>
      <a class="btn ghost lg" href="#/result">查看已有结果</a>`;
  } else if (result) {
    heroActions = `
      <a class="btn lg" href="#/study">开始攻坚</a>
      <a class="btn ghost lg" href="#/result">查看诊断报告</a>`;
  } else {
    heroActions = `
      <a class="btn lg" href="#/test">开始 12 分钟摸底</a>
      <a class="btn ghost lg" href="#/words">先看看词库</a>`;
  }

  const dashboard = result
    ? `
    <div class="dash-grid">
      <div class="card panel">
        <p class="sub">估算已掌握（阅读词汇）</p>
        <div class="big-number">${result.known.toLocaleString()}<small> / ${result.total.toLocaleString()}</small></div>
        <p class="small muted" style="margin-top:4px">约 <b>${result.level}</b> · 估算缺口 ${result.unknown.toLocaleString()} 词</p>
        <div class="progress" style="margin-top:16px"><span style="width:${pct(result.known / result.total)}%"></span></div>
        <p class="small" style="margin-top:12px"><a href="#/result">查看完整诊断 →</a></p>
      </div>
      <div class="card panel">
        <p class="sub">今日学习</p>
        <div class="big-number">${due}<small> 待复习 · ${stat.new}/${S.settings.dailyNew} 新词</small></div>
        <p class="small muted" style="margin-top:4px">待攻克清单 ${remaining.toLocaleString()} 词 · 已掌握 ${knownCount(S).toLocaleString()} 词</p>
        <div class="btn-row" style="margin-top:16px">
          <a class="btn" href="#/study">${due > 0 || remaining > 0 ? "开始学习" : "今日已完成"}</a>
          <a class="btn ghost" href="#/words">词表</a>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="section-head">
        <h2>分层掌握情况</h2>
        <p>抽样 ${result.answered} 题 · 正确率 ${pct(result.accuracy)}%</p>
      </div>
      <div class="card panel">
        ${bandRowsHTML(result)}
      </div>
    </div>`
    : `
    <div class="dash-grid">
      <div class="card panel">
        <p class="sub">为什么不能只靠“我觉得我会”</p>
        <h2 style="margin:8px 0 6px">熟悉感 ≠ 能回忆</h2>
        <p class="small muted">看到单词觉得眼熟，和在考试中准确理解，是两种能力。这个工具用四选一 + “不认识”选项测真实识别率，并在学习中做 20% 随机抽查，专门抓“高估自己”的词。</p>
      </div>
      <div class="card panel">
        <p class="sub">测试怎么工作</p>
        <h2 style="margin:8px 0 6px">按 CEFR 分层抽样</h2>
        <p class="small muted">从 A1–C2 六个层级按词量比例抽 100 词。答完即可估算每个层级的掌握率和词汇量，再生成“只含缺口”的学习队列。</p>
      </div>
    </div>
    <div class="section">
      <div class="section-head"><h2>三步走</h2></div>
      <div class="dash-grid steps-grid">
        <div class="card panel">
          <span class="chip band">01 诊断</span>
          <h2 style="margin:10px 0 4px">12 分钟摸底</h2>
          <p class="small muted">四选一，不确定就点“不认识”。结束后看到每层掌握率与估算词汇量。</p>
        </div>
        <div class="card panel">
          <span class="chip band">02 排查</span>
          <h2 style="margin:10px 0 4px">只学不会的</h2>
          <p class="small muted">新词先问“认识吗”。认识就 1 秒跳过；随机抽查没通过，会自动加入学习。</p>
        </div>
        <div class="card panel">
          <span class="chip band">03 攻克</span>
          <h2 style="margin:10px 0 4px">插画 + 间隔复习</h2>
          <p class="small muted">词光的插画、英美音、例句和搭配，配合内置间隔复习，把缺口补上。</p>
        </div>
      </div>
    </div>`;

  const installHint =
    isAppleMobile() && !isInstalledApp() && !hintHidden()
      ? `
    <div class="install-hint card">
      <div class="ih-icon" aria-hidden="true">📱</div>
      <div class="ih-body">
        <b>装到 iPhone，随时随地背</b>
        <p>点 Safari 底部的<b>分享</b> → <b>添加到主屏幕</b>。之后从桌面图标打开：全屏运行、不带浏览器边框，词库和插画都能离线用，进度存在你手机上。</p>
      </div>
      <button class="btn soft" id="hideHintBtn">知道了</button>
    </div>`
      : "";

  app.innerHTML = `
    <section class="hero">
      <p class="eyebrow">IELTS VOCABULARY · 7,298 词</p>
      <h1>先诊断，<br><em>只学不会的</em>。</h1>
      <p class="lede">很多词你以为会了，其实只是眼熟。用分层抽样测出真实缺口，把时间花在刀刃上。</p>
      <div class="btn-row hero-actions">${heroActions}</div>
      <div class="hero-meta">${meta}</div>
    </section>
    ${installHint}
    ${dashboard}
  `;

  const hide = app.querySelector("#hideHintBtn");
  if (hide)
    hide.addEventListener("click", () => {
      hideHint();
      renderHome();
    });
}

function bandRowsHTML(result) {
  return `<div class="band-list">
    ${result.bands
      .map(
        (b) => `
      <div class="band-row">
        <div class="band-name">${b.band}<small>${BAND_LABEL[b.band]}</small></div>
        <div class="band-bar"><span style="width:${pct(b.rate)}%;background:${BAND_COLOR[b.band]}"></span></div>
        <div class="band-pct">${pct(b.rate)}%<small>${b.correct}/${b.n} 题</small></div>
        <div class="band-est">估计缺 <b>${b.unknown}</b></div>
      </div>`
      )
      .join("")}
  </div>`;
}

/* ================= 测试 ================= */

function renderTest() {
  if (!S.test) return renderTestSetup();
  if (S.test.finished) return renderResult();

  const idx = answeredCount(S.test);
  if (idx >= S.test.items.length) {
    finishTest();
    return;
  }

  const id = S.test.items[idx];
  const w = getWord(id);
  if (!w) {
    // 极端情况下数据缺失，直接跳过
    S.test.items.splice(idx, 1);
    saveState(S);
    return renderTest();
  }

  const seed = (S.test.seed ^ hashStr(id) ^ (idx * 2654435761)) >>> 0;
  const opts = makeOptions(w, seed);
  currentOptions = opts;
  qStart = Date.now();
  locked = false;

  app.innerHTML = `
    <div class="test-shell">
      <div class="test-top">
        <div class="progress"><span style="width:${pct(idx / S.test.length)}%"></span></div>
        <div class="test-count">${idx + 1} / ${S.test.length}</div>
      </div>
      <div class="card test-card">
        <div class="test-word">${esc(w.w)}</div>
        <div class="test-ipa">${esc(w.uk)} · ${esc(w.us)}</div>
        <span class="chip band test-pos">${esc(w.senses[0].pos)}</span>
        <p class="test-q">它最接近下面哪个意思？</p>
        <div class="options" id="options">
          ${opts
            .map(
              (o, i) => `
            <button class="option" data-opt="${i}">
              <span class="key">${i + 1}</span><span>${esc(o.text)}</span>
            </button>`
            )
            .join("")}
          <button class="option skip" data-skip>不认识 / 靠猜（跳过）</button>
        </div>
      </div>
      <p class="test-note">不确定就点“不认识”，不要猜——诊断会更准。</p>
      <div class="test-exit"><button class="btn quiet" data-exit>保存并退出</button></div>
    </div>
  `;

  app.querySelectorAll("[data-opt]").forEach((btn) => {
    btn.addEventListener("click", () => answerTest(Number(btn.dataset.opt), opts, w, id));
  });
  app.querySelector("[data-skip]").addEventListener("click", () => answerTest(-1, opts, w, id));
  app.querySelector("[data-exit]").addEventListener("click", () => {
    if (confirm("退出测试？已答的题目会保存，下次可以继续。")) go("#/home");
  });

  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function answerTest(choice, opts, w, id) {
  if (locked) return;
  locked = true;

  const correct = choice >= 0 && !!opts[choice]?.correct;
  S.test.answers[id] = {
    correct,
    skipped: choice < 0,
    band: w.cefr,
    topic: w.topic,
    choice,
    ms: Date.now() - qStart,
  };
  saveState(S);

  app.querySelectorAll("[data-opt]").forEach((btn, i) => {
    btn.disabled = true;
    if (opts[i].correct) btn.classList.add("correct");
    if (i === choice && !correct) btn.classList.add("wrong");
  });
  const skip = app.querySelector("[data-skip]");
  skip.disabled = true;
  if (choice < 0) skip.classList.add("wrong");

  setTimeout(() => {
    locked = false;
    if (answeredCount(S.test) >= S.test.items.length) finishTest();
    else renderTest();
  }, correct ? 480 : 1000);
}

function finishTest() {
  S.test.finished = Date.now();
  const result = computeResult(S.test);
  rebuildQueue(S);
  S.history.unshift({
    at: Date.now(),
    known: result.known,
    level: result.level,
    accuracy: result.accuracy,
  });
  S.history = S.history.slice(0, 12);
  session = null;
  saveState(S);
  go("#/result");
}

function renderTestSetup() {
  const hasHistory = S.test && S.test.finished;
  app.innerHTML = `
    <div class="test-setup">
      <div class="page-head">
        <p class="eyebrow">Diagnostic</p>
        <h1>词汇摸底</h1>
        <p>从 7,298 个词中按 CEFR 比例抽样。题目是“英文单词 → 中文释义”，不确定请点“不认识”。</p>
      </div>

      <div class="lengths">
        ${[
          { n: 60, label: "快速", desc: "约 6–8 分钟", note: "先看大概水平" },
          { n: 100, label: "标准", desc: "约 10–14 分钟", note: "推荐，误差更小" },
          { n: 150, label: "精细", desc: "约 15–20 分钟", note: "层内估计更稳" },
        ]
          .map(
            (o) => `
          <button class="length-opt ${testLength === o.n ? "selected" : ""}" data-length="${o.n}">
            <b>${o.n} 题</b>
            <span>${o.label} · ${o.desc}</span>
            <em>${o.note}</em>
          </button>`
          )
          .join("")}
      </div>

      <div class="method">
        <b>结果是什么？</b> 每个 CEFR 层级的掌握率、估算词汇量（含 95% 区间）、薄弱话题，以及一份只包含“可能不会”的学习队列。诊断是统计估计，不是逐词判定；之后学习时的“认识/不认识”会把清单进一步校准。
      </div>

      <div class="btn-row" style="margin-top:22px">
        <button class="btn lg" id="startTest">开始 ${testLength} 题摸底</button>
        ${hasHistory ? '<a class="btn ghost lg" href="#/result">查看上次报告</a>' : ""}
      </div>
      <p class="small muted" style="margin-top:14px">${hasHistory ? "重新测试会覆盖当前报告，但不会删除已掌握词和学习记录。" : "进度保存在本机浏览器，不会上传。"}</p>
    </div>
  `;

  app.querySelectorAll("[data-length]").forEach((b) => {
    b.addEventListener("click", () => {
      testLength = Number(b.dataset.length);
      renderTestSetup();
    });
  });

  app.querySelector("#startTest").addEventListener("click", () => {
    if (S.test && S.test.finished && !confirm("重新测试会覆盖当前诊断报告（学习记录保留），继续？")) return;
    S.test = buildTest(testLength, (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    session = null;
    saveState(S);
    renderTest();
  });
}

/* ================= 结果 ================= */

function renderResult() {
  if (!S.test || !S.test.finished) {
    app.innerHTML = `
      <div class="empty">
        <b>还没有诊断结果</b>
        <p>先完成一次词汇摸底，才能生成针对性学习清单。</p>
        <div class="btn-row" style="justify-content:center;margin-top:18px">
          <a class="btn" href="#/test">开始摸底</a>
        </div>
      </div>`;
    return;
  }

  const result = computeResult(S.test);
  const meta = S.queueMeta;
  const queueSize = S.queue.length;
  const days = queueSize ? Math.ceil(queueRemaining(S) / Math.max(1, S.settings.dailyNew)) : 0;
  const missed = result.missed.slice(0, 12).map(getWord).filter(Boolean);
  const over = S.flags.overconfident.length;

  app.innerHTML = `
    <div class="page-head">
      <p class="eyebrow">Your Diagnosis</p>
      <h1>诊断报告</h1>
      <p>基于 ${result.answered} 题分层抽样。结果是统计估计，不是逐词判定。</p>
    </div>

    <div class="card result-hero">
      <div>
        <p class="label">估算已掌握 · 阅读词汇</p>
        <div class="value">${result.known.toLocaleString()}<small> / ${result.total.toLocaleString()}</small></div>
        <p class="level">约 <b>${result.level}</b> 水平 · 估算缺口 <b>${result.unknown.toLocaleString()}</b> 词</p>
        <p class="small muted" style="margin-top:10px">95% 置信区间：${result.knownLo.toLocaleString()} – ${result.knownHi.toLocaleString()} 词 · 本次正确率 ${pct(result.accuracy)}%</p>
      </div>
      <div class="ring" style="--p:${pct(result.known / result.total)}">
        <div class="ring-in"><b>${pct(result.known / result.total)}%</b><span>词库覆盖</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2>分层掌握</h2>
        <p>每层抽样 ${result.bands.map((b) => b.n).join(" / ")} 题</p>
      </div>
      <div class="card panel">
        ${bandRowsHTML(result)}
        <p class="tiny muted" style="margin-top:14px">“估计缺”= 该层总词量 ×（1 − 掌握率）。A1/A2 若接近满分，说明基础稳固，可直接主攻高层的缺口。</p>
      </div>
    </div>

    ${
      result.weakTopics.length
        ? `<div class="section">
      <div class="section-head"><h2>薄弱话题</h2><p>这些话题的正确率明显偏低</p></div>
      <div class="card panel">
        <div class="btn-row">
          ${result.weakTopics
            .map(
              (t) =>
                `<span class="chip gold">${esc(TOPIC_LABEL[t.topic] || t.topic)} · ${t.correct}/${t.n}</span>`
            )
            .join("")}
        </div>
        <p class="small muted" style="margin-top:12px">学习队列会优先安排这些话题的词。</p>
      </div>
    </div>`
        : ""
    }

    ${
      missed.length
        ? `<div class="section">
      <div class="section-head"><h2>这次没认出的词</h2><p>已优先放进学习队列</p></div>
      <div class="missed-list">
        ${missed
          .map(
            (w) => `
          <button class="missed-word" data-word-id="${esc(w.id)}">
            <b>${esc(w.w)}</b>
            <span>${esc(w.senses[0].zh)}</span>
            <span class="chip band">${w.cefr}</span>
          </button>`
          )
          .join("")}
      </div>
    </div>`
        : ""
    }

    <div class="section">
      <div class="card plan-card">
        <div>
          <h3>针对性学习计划</h3>
          <p>待攻克 <b>${queueSize.toLocaleString()}</b> 词 · 主攻 ${(meta?.bands || []).join(" / ") || "—"} · 每天 ${S.settings.dailyNew} 个新词约 <b>${days}</b> 天</p>
          <p class="tiny muted" style="margin-top:4px">${over ? `已有 ${over} 个“以为认识但抽查没通过”的词被自动加入学习。` : "学习时会对“认识”做随机抽查，防止高估。"}</p>
        </div>
        <div class="btn-row">
          <a class="btn" href="#/study">开始攻克</a>
          <button class="btn ghost" id="dlReport">下载报告</button>
        </div>
      </div>
    </div>

    <p class="tiny muted center" style="margin-top:26px">诊断方法：每层按词量比例随机抽样，Wilson 95% 区间估算。词库来自 Word Atlas（CC BY 4.0）。</p>
  `;

  app.querySelectorAll("[data-word-id]").forEach((b) => {
    b.addEventListener("click", () => openWord(b.dataset.wordId));
  });

  const dl = app.querySelector("#dlReport");
  if (dl)
    dl.addEventListener("click", () => {
      download(`雅思词汇诊断-${dayKey()}.md`, buildReport(S, result), "text/markdown;charset=utf-8");
      toast("报告已下载");
    });
}

/* ================= 学习 ================= */

function isStale(item) {
  if (!item) return true;
  if (S.known[item.id]) return true;
  const c = S.cards[item.id];
  if (item.type === "new") return !!c;
  if (item.type === "review") return !c || c.due > dayKey();
  return false;
}

function startSession(extraNew = 0) {
  const plan = planSession(S, extraNew);
  session = {
    items: plan.items,
    i: 0,
    revealed: false,
    retried: new Set(),
    started: Date.now(),
  };
  sessionCounted = false;
}

function renderStudy() {
  ensureQueue();

  if (!S.test || !S.test.finished) {
    app.innerHTML = `
      <div class="empty">
        <b>先做一次摸底</b>
        <p>诊断之后，才能生成“只学不会的”学习队列。</p>
        <div class="btn-row" style="justify-content:center;margin-top:18px">
          <a class="btn" href="#/test">开始摸底</a>
        </div>
      </div>`;
    return;
  }

  if (!session) startSession();
  while (session.i < session.items.length && isStale(session.items[session.i])) session.i++;
  if (session.i >= session.items.length) return renderDone();

  const item = session.items[session.i];
  const w = getWord(item.id);
  if (!w) {
    session.i++;
    return renderStudy();
  }
  const isNew = item.type === "new";

  const head = `
    <div class="study-top">
      <span class="chip ${isNew ? "band" : "gold"}">${isNew ? "新词" : "复习"}</span>
      <div class="progress"><span style="width:${pct(session.i / Math.max(1, session.items.length))}%"></span></div>
      <span class="study-stats">${session.i + 1} / ${session.items.length}</span>
    </div>`;

  if (!session.revealed) {
    app.innerHTML = `
      <div class="study-shell">
        ${head}
        <div class="card flashcard">
          <div class="fc-head">
            <div>
              <div class="fc-word">${esc(w.w)}</div>
              <div class="fc-ipa">${esc(w.uk)} · ${esc(w.us)}</div>
            </div>
            <div class="fc-audio">
              <button class="audio-btn" data-audio-url="${media.audio(w.id, "uk")}">UK</button>
              <button class="audio-btn" data-audio-url="${media.audio(w.id, "us")}">US</button>
            </div>
          </div>
          <div class="fc-body">
            <div class="fc-prompt">
              <p>${isNew ? "认识这个词吗？认识就直接跳过，只学不确定的。" : "先回忆它的意思，再显示答案。"}</p>
              <div class="btn-row">
                ${isNew ? '<button class="btn soft" id="knownBtn">认识，跳过</button>' : ""}
                <button class="btn" id="revealBtn">显示答案</button>
              </div>
              <p class="tiny muted" style="margin-top:16px">空格显示答案${isNew ? " · K 标记认识" : ""}</p>
            </div>
          </div>
        </div>
      </div>`;
    if (isNew) app.querySelector("#knownBtn").addEventListener("click", () => handleKnown(item.id));
    app.querySelector("#revealBtn").addEventListener("click", () => {
      session.revealed = true;
      renderStudy();
    });
    return;
  }

  const card = S.cards[item.id];
  const dueInfo = card ? `下次复习：${card.due}` : "";

  app.innerHTML = `
    <div class="study-shell">
      ${head}
      <div class="card flashcard">
        <div class="fc-head">
          <div>
            <div class="fc-word">${esc(w.w)}</div>
            <div class="fc-ipa">${esc(w.uk)} · ${esc(w.us)}</div>
          </div>
          <div class="fc-audio">
            <button class="audio-btn" data-audio-url="${media.audio(w.id, "uk")}">UK</button>
            <button class="audio-btn" data-audio-url="${media.audio(w.id, "us")}">US</button>
          </div>
        </div>
        <div class="fc-body">
          ${detailHTML(w)}
        </div>
        <div class="grades">
          ${GRADES.map(
            (g) => `
            <button class="grade ${g.cls}" data-grade="${g.g}">
              ${g.label}<small>${g.hint} · ${g.g + 1}</small>
            </button>`
          ).join("")}
        </div>
        <p class="tiny muted center" style="margin-top:10px">${dueInfo}</p>
      </div>
    </div>`;

  app.querySelectorAll("[data-grade]").forEach((b) => {
    b.addEventListener("click", () => handleGrade(Number(b.dataset.grade)));
  });
}

function detailHTML(w) {
  const image = S.settings.showImage
    ? `<img class="fc-image" src="${media.img(w.id)}" alt="${esc(w.w)} 的插画" loading="lazy">`
    : "";

  const senses = w.senses
    .map(
      (s) => `
      <div class="sense">
        <span class="pos">${esc(s.pos)}</span>
        <span><span class="zh">${esc(s.zh)}</span><span class="en">${esc(s.en)}</span></span>
      </div>`
    )
    .join("");

  const examples = w.ex
    .slice(0, 2)
    .map(
      (e, i) => `
      <div class="ex">
        <div class="en">${esc(e.en)}</div>
        <div class="zh">${esc(e.zh)}</div>
        ${i === 0 ? `<button class="audio-btn" data-audio-url="${media.example(w.id)}">▶ 听例句</button>` : ""}
      </div>`
    )
    .join("");

  const kv = [];
  if (w.col.length)
    kv.push(`<dt>搭配</dt><dd>${w.col.map((c) => esc(c.replace(/\｜/g, " · "))).join("<br>")}</dd>`);
  if (w.fam.length) kv.push(`<dt>词族</dt><dd>${w.fam.map(esc).join("、")}</dd>`);
  if (w.syn.length) kv.push(`<dt>近义</dt><dd>${w.syn.map(esc).join("、")}</dd>`);
  if (w.ant.length) kv.push(`<dt>反义</dt><dd>${w.ant.map(esc).join("、")}</dd>`);

  return `
    ${image}
    <div class="fc-senses">${senses}</div>
    <div class="fc-ex">${examples}</div>
    ${kv.length ? `<dl class="kv">${kv.join("")}</dl>` : ""}
    ${w.tip ? `<div class="tip"><b>提示</b>　${esc(w.tip)}</div>` : ""}
    ${w.note ? `<div class="tip"><b>注意</b>　${esc(w.note)}</div>` : ""}
    <div class="btn-row" style="margin-top:16px">
      <span class="chip band">${w.cefr} · ${BAND_LABEL[w.cefr] || ""}</span>
      <span class="chip">${esc(TOPIC_LABEL[w.topic] || w.topic)}</span>
    </div>`;
}

function handleKnown(id) {
  if (S.settings.spotCheck && Math.random() < 0.2) {
    openSpotCheck(id);
    return;
  }
  markKnown(S, id, "triage");
  saveState(S);
  toast("已跳过，之后可在词表“已掌握”里找回");
  session.i++;
  session.revealed = false;
  renderStudy();
}

function openSpotCheck(id) {
  const w = getWord(id);
  const opts = makeOptions(w, (hashStr(id) ^ 0x9e3779b9) >>> 0);
  openModal(`
    <div class="modal-card spot">
      <button class="modal-close" aria-label="关闭">×</button>
      <h3>抽查一下：确认你真的认识</h3>
      <p class="tiny muted">这一步是为了抓“眼熟但想不起来”的词。</p>
      <div class="spot-word">${esc(w.w)}</div>
      <div class="spot-ipa">${esc(w.uk)}</div>
      <div class="options">
        ${opts
          .map(
            (o, i) => `
          <button class="option" data-spot="${i}">
            <span class="key">${i + 1}</span><span>${esc(o.text)}</span>
          </button>`
          )
          .join("")}
      </div>
    </div>`);

  modal.querySelectorAll("[data-spot]").forEach((b) => {
    b.addEventListener("click", () => {
      const i = Number(b.dataset.spot);
      const correct = !!opts[i]?.correct;
      closeModal();
      if (correct) {
        markKnown(S, id, "triage");
        if (S.known[id]) S.known[id].spot = true;
        saveState(S);
        toast("抽查通过 ✓");
        session.i++;
        session.revealed = false;
        renderStudy();
      } else {
        S.flags.overconfident.unshift({ id, at: Date.now() });
        S.flags.overconfident = S.flags.overconfident.slice(0, 200);
        saveState(S);
        toast("抽查没选对——已加入学习");
        session.revealed = true;
        renderStudy();
      }
    });
  });
}

function handleGrade(grade) {
  const item = session.items[session.i];
  if (!item) return;
  const correct = grade >= 2;
  bumpStat(S, item.type, correct);
  gradeCard(S, item.id, grade);
  if (grade === 0 && !session.retried.has(item.id)) {
    session.retried.add(item.id);
    session.items.push({ ...item });
  }
  saveState(S);
  session.i++;
  session.revealed = false;
  renderStudy();
}

function renderDone() {
  const stat = todayStat(S);
  const due = dueCount(S);
  const remaining = queueRemaining(S);
  const acc = stat.new + stat.review ? Math.round((stat.correct / (stat.new + stat.review)) * 100) : 0;

  app.innerHTML = `
    <div class="study-shell">
      <div class="card done-card">
        <div class="mark">✓</div>
        <h2>${due > 0 ? "这一轮完成了" : "今日计划完成"}</h2>
        <p>${remaining > 0 ? `待攻克清单还剩 ${remaining.toLocaleString()} 词。` : "清单已全部过了一遍，接下来靠复习巩固。"}</p>
        <div class="done-stats">
          <div><b>${stat.new}</b><span>今日新词</span></div>
          <div><b>${stat.review}</b><span>今日复习</span></div>
          <div><b>${acc}%</b><span>正确率</span></div>
        </div>
        <div class="btn-row" style="justify-content:center">
          <button class="btn" id="moreBtn">再学 10 个</button>
          <a class="btn ghost" href="#/words">查看词表</a>
          <a class="btn ghost" href="#/result">诊断报告</a>
        </div>
        <p class="tiny muted" style="margin-top:16px">${due > 0 ? `还有 ${due} 个到期复习，明天继续。` : "下一次复习会根据你的评分自动安排。"}</p>
      </div>
    </div>`;

  app.querySelector("#moreBtn").addEventListener("click", () => {
    startSession(10);
    renderStudy();
  });
}

/* ================= 词表 ================= */

function wordStatus(id) {
  if (S.known[id]) return "known";
  if (S.cards[id]) return "learning";
  if (S.queue.includes(id)) return "queue";
  return "other";
}

function filteredWords() {
  let list;
  if (wordFilter.status === "queue") {
    list = S.queue.map(getWord).filter((w) => w && !S.known[w.id] && !S.cards[w.id]);
  } else if (wordFilter.status === "learning") {
    list = Object.keys(S.cards)
      .filter((id) => !S.known[id])
      .map(getWord)
      .filter(Boolean);
    list.sort((a, b) => (S.cards[a.id].due < S.cards[b.id].due ? -1 : 1));
  } else if (wordFilter.status === "known") {
    list = Object.keys(S.known)
      .sort((a, b) => (S.known[b].at || 0) - (S.known[a].at || 0))
      .map(getWord)
      .filter(Boolean);
  } else {
    list = allWords();
  }

  if (wordFilter.band) list = list.filter((w) => w.cefr === wordFilter.band);
  if (wordFilter.topic) list = list.filter((w) => w.topic === wordFilter.topic);

  const q = wordFilter.q.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (w) =>
        w.w.toLowerCase().includes(q) ||
        w.senses.some((s) => (s.zh || "").includes(q) || (s.en || "").toLowerCase().includes(q))
    );
  }
  return list;
}

function renderWords() {
  const counts = {
    queue: 0,
    learning: learningCount(S),
    known: knownCount(S),
    all: totalWords(),
  };
  for (const id of S.queue) if (!S.known[id] && !S.cards[id]) counts.queue++;

  // 还没做过摸底时队列为空：默认展示全部词，而不是空白页
  if (!wordFilter.explicit && wordFilter.status === "queue" && counts.queue === 0) {
    wordFilter.status = "all";
  }

  const topics = [...new Set(allWords().map((w) => w.topic))].sort();

  app.innerHTML = `
    <div class="page-head">
      <p class="eyebrow">Word List</p>
      <h1>词表</h1>
      <p>按状态、层级和话题筛选。点任意词看插画、例句、搭配与词族。</p>
    </div>

    <div class="filters">
      <div class="tabs">
        ${[
          ["queue", `待学 ${counts.queue.toLocaleString()}`],
          ["learning", `学习中 ${counts.learning.toLocaleString()}`],
          ["known", `已掌握 ${counts.known.toLocaleString()}`],
          ["all", `全部 ${counts.all.toLocaleString()}`],
        ]
          .map(
            ([k, label]) =>
              `<button class="tab ${wordFilter.status === k ? "active" : ""}" data-status="${k}">${label}</button>`
          )
          .join("")}
      </div>
      <input class="search" id="wordSearch" placeholder="搜索单词或中文释义…" value="${esc(wordFilter.q)}">
      <select class="select" id="bandFilter">
        <option value="">全部层级</option>
        ${BANDS.map(
          (b) => `<option value="${b}" ${wordFilter.band === b ? "selected" : ""}>${b} · ${BAND_LABEL[b]}</option>`
        ).join("")}
      </select>
      <select class="select" id="topicFilter">
        <option value="">全部话题</option>
        ${topics
          .map(
            (t) =>
              `<option value="${t}" ${wordFilter.topic === t ? "selected" : ""}>${esc(TOPIC_LABEL[t] || t)}</option>`
          )
          .join("")}
      </select>
    </div>

    <div id="wordRows" class="word-rows"></div>
    <div id="wordMore"></div>
  `;

  updateWordRows();

  app.querySelectorAll("[data-status]").forEach((b) => {
    b.addEventListener("click", () => {
      wordFilter.status = b.dataset.status;
      wordFilter.explicit = true;
      wordFilter.limit = 80;
      renderWords();
    });
  });

  const search = app.querySelector("#wordSearch");
  let timer = 0;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      wordFilter.q = search.value;
      wordFilter.limit = 80;
      updateWordRows();
    }, 160);
  });

  app.querySelector("#bandFilter").addEventListener("change", (e) => {
    wordFilter.band = e.target.value;
    wordFilter.limit = 80;
    updateWordRows();
  });
  app.querySelector("#topicFilter").addEventListener("change", (e) => {
    wordFilter.topic = e.target.value;
    wordFilter.limit = 80;
    updateWordRows();
  });
}

function updateWordRows() {
  const rows = app.querySelector("#wordRows");
  const more = app.querySelector("#wordMore");
  if (!rows) return;
  const list = filteredWords();
  const shown = list.slice(0, wordFilter.limit);

  if (!list.length) {
    rows.innerHTML = `<div class="empty"><b>没有符合条件的词</b><p>${
      wordFilter.status === "queue" ? "先完成摸底，或换个筛选条件。" : "换个筛选条件试试。"
    }</p></div>`;
    more.innerHTML = "";
    return;
  }

  rows.innerHTML = shown
    .map((w) => {
      const st = wordStatus(w.id);
      const chip =
        st === "known"
          ? '<span class="chip ok">已掌握</span>'
          : st === "learning"
            ? `<span class="chip gold">复习 ${S.cards[w.id].due}</span>`
            : st === "queue"
              ? '<span class="chip band">待学</span>'
              : "";
      return `
      <button class="word-row" data-word-id="${esc(w.id)}">
        <span class="w">${esc(w.w)}<small>${esc(w.uk)}</small></span>
        <span class="zh">${esc(w.senses[0].zh)}</span>
        <span class="meta">
          <span class="chip">${w.cefr}</span>
          ${chip}
        </span>
      </button>`;
    })
    .join("");

  more.innerHTML =
    list.length > wordFilter.limit
      ? `<button class="btn ghost load-more" id="loadMore">加载更多（还有 ${(list.length - wordFilter.limit).toLocaleString()}）</button>`
      : `<p class="tiny muted center" style="margin-top:16px">共 ${list.length.toLocaleString()} 个词</p>`;

  rows.querySelectorAll("[data-word-id]").forEach((b) => {
    b.addEventListener("click", () => openWord(b.dataset.wordId));
  });
  const lm = more.querySelector("#loadMore");
  if (lm)
    lm.addEventListener("click", () => {
      wordFilter.limit += 120;
      updateWordRows();
    });
}

function openWord(id) {
  const w = getWord(id);
  if (!w) return;
  const st = wordStatus(id);
  const action =
    st === "known"
      ? `<button class="btn ghost" id="unmarkKnown">移出已掌握</button>`
      : st === "learning"
        ? `<span class="chip gold">学习中 · 下次 ${S.cards[id].due}</span>`
        : st === "queue"
          ? `<button class="btn soft" id="markKnownBtn">我已认识，移出清单</button>`
          : `<button class="btn soft" id="addQueue">加入学习队列</button>`;

  openModal(`
    <div class="modal-card">
      <button class="modal-close" aria-label="关闭">×</button>
      <div class="fc-head">
        <div>
          <div class="fc-word">${esc(w.w)}</div>
          <div class="fc-ipa">${esc(w.uk)} · ${esc(w.us)}</div>
        </div>
        <div class="fc-audio">
          <button class="audio-btn" data-audio-url="${media.audio(w.id, "uk")}">UK</button>
          <button class="audio-btn" data-audio-url="${media.audio(w.id, "us")}">US</button>
        </div>
      </div>
      <div class="fc-body">
        ${detailHTML(w)}
      </div>
      <div class="btn-row" style="margin-top:20px">${action}</div>
    </div>`);

  const un = modal.querySelector("#unmarkKnown");
  if (un)
    un.addEventListener("click", () => {
      delete S.known[id];
      saveState(S);
      closeModal();
      toast("已恢复为待学");
      renderWords();
    });

  const mk = modal.querySelector("#markKnownBtn");
  if (mk)
    mk.addEventListener("click", () => {
      markKnown(S, id, "manual");
      saveState(S);
      closeModal();
      toast("已标记为掌握");
      renderWords();
    });

  const add = modal.querySelector("#addQueue");
  if (add)
    add.addEventListener("click", () => {
      if (!S.queue.includes(id)) S.queue.unshift(id);
      saveState(S);
      closeModal();
      toast("已加入学习队列");
      renderWords();
    });
}

/* ================= 关于 / 设置 ================= */

function renderAbout() {
  const result = testResult();
  const queueSize = queueRemaining(S);
  app.innerHTML = `
    <div class="page-head">
      <p class="eyebrow">Method & Settings</p>
      <h1>方法与设置</h1>
      <p>本地优先：所有进度保存在这个浏览器的 localStorage 里，不上传服务器。</p>
    </div>

    <div class="prose">
      <h2>诊断怎么做的</h2>
      <ul>
        <li>从 A1–C2 六个层级按词量比例随机抽样（默认 100 题），保证 B2/C1 这些大层有足够样本。</li>
        <li>每题四选一 + “不认识”选项。答对算认识，答错或跳过算不认识；用 Wilson 区间估算每层掌握率。</li>
        <li>“估算词汇量”= 各层总词量 × 该层掌握率之和，所以它是统计估计，不是逐词判定。</li>
        <li>学习队列优先安排：本次答错的词 → 薄弱话题 → 未达标层级。学习时的“认识/不认识”会继续校准。</li>
      </ul>

      <h2>为什么还要抽查</h2>
      <p>“看着眼熟”和“能准确回忆”不是一回事。你点“认识，跳过”时，有 20% 概率触发一次快速抽查；选错就自动加入学习，并计入“高估”记录。这是专门对付“我觉得我会了”的。</p>

      <h2>复习算法</h2>
      <p>使用简化间隔复习：评分越低，间隔越短、难度越高；评分越高，间隔拉长。不追求复杂模型，重点是每天有节奏地过到期卡片。</p>
    </div>

    <div class="section">
      <div class="section-head">
        <h2>在 iPhone 上使用</h2>
        <p>装成 App，随时随地背，离线可用</p>
      </div>
      <div class="card panel">
        <ol class="steps-list">
          <li><b>Safari 打开本页</b>（部署后的 HTTPS 网址），点底部工具栏的 <b>分享</b> 图标。</li>
          <li>在弹出的菜单里选择 <b>“添加到主屏幕”</b>，确认名称后添加。</li>
          <li>回到桌面，点绿色星形图标打开：<b>全屏运行</b>，没有浏览器地址栏，看起来就是个 App。</li>
          <li>首次打开后，词库、插画和发音会缓存到手机，<b>飞行模式也能背</b>；进度只存在手机本地，不会上传。</li>
          <li>换手机或清了缓存，用上方的 <b>备份 / 恢复</b> 导出 JSON 再导入即可。</li>
        </ol>
        <div class="btn-row" style="margin-top:14px">
          <span class="chip ${isInstalledApp() ? "ok" : ""}">${isInstalledApp() ? "当前：已安装为 App" : "当前：未安装"}</span>
          <span class="chip">${isAppleMobile() ? "检测到 iPhone/iPad 浏览器" : "在电脑浏览器中打开"}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>学习设置</h2></div>
      <div class="settings-grid">
        <div class="setting">
          <label for="dailyNew">每天新词</label>
          <span>完成后可点“再学 10 个”加量</span>
          <select id="dailyNew">
            ${[10, 20, 30, 50].map(
              (n) => `<option value="${n}" ${S.settings.dailyNew === n ? "selected" : ""}>${n} 个</option>`
            ).join("")}
          </select>
        </div>
        <div class="setting">
          <label for="accent">默认发音</label>
          <span>卡片上仍可切换英美音</span>
          <select id="accent">
            <option value="uk" ${S.settings.accent === "uk" ? "selected" : ""}>英音 UK</option>
            <option value="us" ${S.settings.accent === "us" ? "selected" : ""}>美音 US</option>
          </select>
        </div>
        <div class="setting">
          <label>随机抽查</label>
          <span>点“认识”时 20% 概率抽查</span>
          <select id="spotCheck">
            <option value="1" ${S.settings.spotCheck ? "selected" : ""}>开启（推荐）</option>
            <option value="0" ${!S.settings.spotCheck ? "selected" : ""}>关闭</option>
          </select>
        </div>
        <div class="setting">
          <label>卡片插画</label>
          <span>关闭可加快加载、省流量</span>
          <select id="showImage">
            <option value="1" ${S.settings.showImage ? "selected" : ""}>显示</option>
            <option value="0" ${!S.settings.showImage ? "selected" : ""}>隐藏</option>
          </select>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>数据</h2></div>
      <div class="card panel">
        <div class="stat-strip">
          <div class="stat-box"><b>${knownCount(S).toLocaleString()}</b><span>已掌握</span></div>
          <div class="stat-box"><b>${learningCount(S).toLocaleString()}</b><span>学习中</span></div>
          <div class="stat-box"><b>${queueSize.toLocaleString()}</b><span>待学</span></div>
          <div class="stat-box"><b>${S.flags.overconfident.length}</b><span>抽查高估</span></div>
        </div>
        <div class="export-row">
          ${
            result
              ? '<button class="btn soft" id="expReport">下载诊断报告（.md）</button>'
              : ""
          }
          <button class="btn ghost" id="expQueue" ${queueSize ? "" : "disabled"}>导出待学清单（.csv）</button>
          <button class="btn ghost" id="expKnown" ${knownCount(S) ? "" : "disabled"}>导出已掌握（.csv）</button>
          <button class="btn ghost" id="expBackup">备份进度（.json）</button>
          <label class="btn ghost" style="cursor:pointer">恢复备份<input type="file" id="restoreFile" accept="application/json,.json" hidden></label>
          <button class="btn danger" id="resetBtn">清空全部进度</button>
        </div>
        <p class="tiny muted" style="margin-top:12px">CSV 可直接导入 Anki / Excel（字段：单词、音标、词性、中英释义、例句、搭配、词族、CEFR、话题）。</p>
      </div>
    </div>

    <div class="section">
      <div class="prose">
        <h2>关于词库</h2>
        <p>7,298 个词条、插画和英美发音来自开源项目 <a href="https://github.com/designfuchen/word-atlas" target="_blank" rel="noreferrer">Word Atlas（词光）</a>，内容许可为 CC BY 4.0，署名 “Word Atlas contributors”。本工具使用其公开数据集与媒体资源，仅用于个人学习。</p>
        <p>词条释义、例句和插画由生成式 AI 生成，未经逐条人工审校，可能存在错误；发现疑问时以词典为准。</p>
      </div>
    </div>
  `;

  bindSetting("#dailyNew", (v) => (S.settings.dailyNew = Number(v)));
  bindSetting("#accent", (v) => (S.settings.accent = v));
  bindSetting("#spotCheck", (v) => (S.settings.spotCheck = v === "1"));
  bindSetting("#showImage", (v) => (S.settings.showImage = v === "1"));

  const rep = app.querySelector("#expReport");
  if (rep)
    rep.addEventListener("click", () => {
      download(`雅思词汇诊断-${dayKey()}.md`, buildReport(S, result), "text/markdown;charset=utf-8");
      toast("报告已下载");
    });

  app.querySelector("#expQueue").addEventListener("click", () => {
    const list = S.queue.map(getWord).filter((w) => w && !S.known[w.id] && !S.cards[w.id]);
    download(`雅思待攻克清单-${dayKey()}.csv`, "\ufeff" + wordsToCSV(list), "text/csv;charset=utf-8");
    toast(`已导出 ${list.length} 个词`);
  });

  app.querySelector("#expKnown").addEventListener("click", () => {
    const list = Object.keys(S.known).map(getWord).filter(Boolean);
    download(`雅思已掌握-${dayKey()}.csv`, "\ufeff" + wordsToCSV(list), "text/csv;charset=utf-8");
    toast(`已导出 ${list.length} 个词`);
  });

  app.querySelector("#expBackup").addEventListener("click", () => {
    download(`ielts-coach-backup-${dayKey()}.json`, JSON.stringify(S, null, 1), "application/json");
    toast("备份已下载");
  });

  app.querySelector("#restoreFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      S = importState(raw);
      session = null;
      toast("备份已恢复");
      onHashChange();
    } catch {
      toast("备份文件无法读取");
    }
  });

  app.querySelector("#resetBtn").addEventListener("click", () => {
    if (!confirm("确定清空全部进度？诊断结果、学习记录和已掌握词都会删除，且无法撤销。")) return;
    if (!confirm("再确认一次：真的要清空吗？建议先备份。")) return;
    resetState();
    S = loadState();
    session = null;
    toast("已清空");
    go("#/home");
  });
}

function bindSetting(sel, fn) {
  const el = app.querySelector(sel);
  if (!el) return;
  el.addEventListener("change", () => {
    fn(el.value);
    saveState(S);
    toast("设置已保存");
  });
}

/* ================= 键盘 ================= */

function onKey(e) {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

  if (e.key === "Escape") {
    if (!modal.hidden) {
      closeModal();
      return;
    }
  }

  if (route === "test" && S.test && !S.test.finished) {
    if (e.key >= "1" && e.key <= "4") {
      app.querySelector(`[data-opt="${Number(e.key) - 1}"]`)?.click();
      e.preventDefault();
    } else if (e.key === "0" || e.key === " ") {
      app.querySelector("[data-skip]")?.click();
      e.preventDefault();
    }
    return;
  }

  if (route === "study" && session) {
    if (!modal.hidden) return;
    const item = session.items[session.i];
    if (!item) return;
    if (!session.revealed) {
      if (e.key === " ") {
        app.querySelector("#revealBtn")?.click();
        e.preventDefault();
      } else if (e.key.toLowerCase() === "k") {
        app.querySelector("#knownBtn")?.click();
        e.preventDefault();
      }
    } else if (e.key >= "1" && e.key <= "4") {
      app.querySelector(`[data-grade="${Number(e.key) - 1}"]`)?.click();
      e.preventDefault();
    }
  }
}

/* ================= 启动 ================= */

init();
