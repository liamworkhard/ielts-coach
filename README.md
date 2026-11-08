# 词光 · 雅思词汇诊断

先诊断雅思词汇的真实缺口，**只学不会的**。基于 [词光 Word Atlas](https://github.com/designfuchen/word-atlas) 开源词库（7,298 词 · CEFR A1–C2 · 19 话题 · 插画 + 英美音）构建的离线优先 PWA，可安装到 iPhone 主屏随时背。

## 功能

- **分层摸底测试**：按 CEFR 层级比例抽样（60 / 100 / 150 题），四选一 + “不认识”跳过。用 Wilson 95% 置信区间估算每层掌握率与词汇量，避免“眼熟但不会”的假掌握。
- **学习队列**：答错的词 → 薄弱话题 → 未达标层级，按优先级生成。学习时点“认识，跳过”会有 20% 概率随机抽查，选错自动打回学习（抓自评高估）。
- **间隔复习**：简化 SRS，评分越低间隔越短，评分越高间隔拉长，每天有节奏地过到期卡片。
- **词表**：按状态 / 层级 / 话题筛选，搜索词义，点开看插画、例句、搭配与词族。
- **数据本地化**：所有进度存在浏览器 localStorage，可导出 Markdown / CSV 报告、备份与恢复 JSON。
- **离线 PWA**：Service Worker 缓存应用外壳 + 7.7MB 词库 + 已浏览的插画 / 录音，飞行模式也能背。

## 本地运行

```bash
./run.sh          # 等价于 python3 -m http.server 8123
# 打开 http://localhost:8123
```

> 注意：必须通过 HTTP(S) 访问，直接双击 `index.html`（file://）无法注册 Service Worker。

## 部署到 GitHub Pages

1. 在 GitHub 创建仓库（建议命名 `ielts-coach`），把本目录全部文件推到 `main` 分支。
2. 仓库 **Settings → Pages**：Source 选 `Deploy from a branch`，Branch 选 `main` / `(root)`，保存。
3. 等 1–2 分钟，访问 `https://<你的用户名>.github.io/ielts-coach/`。
4. 仓库根目录已包含 `.nojekyll`（禁用 Jekyll 处理），所有资源均为相对路径，兼容子路径部署。

### 从本机推送（任选一种授权方式）

```bash
# 方式 A：GitHub CLI（推荐）
brew install gh
gh auth login --web
git init && git add . && git commit -m "init"
gh repo create ielts-coach --public --source=. --push

# 方式 B：SSH 密钥
# 把 ~/.ssh/id_rsa.pub 添加到 GitHub → Settings → SSH keys，然后：
git remote add origin git@github.com:<你>/ielts-coach.git
git push -u origin main
```

## 在 iPhone 上使用

1. 用 **Safari** 打开部署后的 HTTPS 网址。
2. 点底部工具栏 **分享** 图标 → **添加到主屏幕**。
3. 回到桌面点绿色星形图标打开：全屏运行、无地址栏，看起来就是个 App。
4. 首次打开后词库与已浏览的插画、发音会缓存到手机，**飞行模式也能背**。
5. 进度只存手机本地；换手机或清缓存前，先在「关于」里导出 JSON 备份。

## 目录结构

```
ielts-coach/
├── index.html          # 单页应用外壳（含 PWA meta）
├── styles.css          # 全部样式
├── manifest.json       # PWA 清单
├── sw.js               # Service Worker（改代码后请把 VERSION 加一）
├── data/words.json     # 词库快照（来自词光仓库 data/word-atlas.json）
├── js/
│   ├── app.js          # 路由 / 测试 / 学习 / 词表 / 设置
│   ├── data.js         # 词库加载、干扰项生成、媒体 URL
│   ├── test.js         # 分层抽样与置信区间估算
│   ├── study.js        # 学习队列、SRS、导出
│   └── store.js        # localStorage 状态
├── icons/              # PWA 图标（scripts/make_icons.py 生成）
├── scripts/make_icons.py
└── run.sh
```

## 致谢与许可

- 词库、插画与发音来自 [Word Atlas（词光）](https://github.com/designfuchen/word-atlas) contributors，**CC BY 4.0**；插画与录音热链自 `0xlei.tech`。词库内容由 AI 生成，可能有错，仅供学习参考。
- 本应用为独立构建的诊断 / 学习前端，与词光原站功能相互独立。
