# Streamline RSS 极简阅读器

Vue 3 构建的极简 RSS 阅读器:
暗色 / 亮色双主题, 玻璃拟态风格, 完整的订阅管理、规则过滤与离线阅读体验。

![Vue](https://img.shields.io/badge/Vue-3.5-brightgreen) ![Vite](https://img.shields.io/badge/Vite-6-purple) ![Tailwind](https://img.shields.io/badge/Tailwind-3.4-blue) ![License](https://img.shields.io/badge/License-MIT-green)

## ✨ 功能

**阅读**
- 三栏布局 (桌面): 订阅侧栏 + 文章列表 + 阅读页; 移动端: 顶部玻璃导航 (未读角标一键跳第一条未读) + 右下角悬浮操作按钮 (搜索 / 标记已读 / 刷新) + 菜单内分类列表
- 阅读页: 进度条 / 悬浮工具栏 (返回、字号、**全文抓取**、分享、星标) / 上一篇下一篇 / 原文链接
- 阅读增强: 长文自动生成**目录** (折叠跳转) / 代码块**高亮** (highlight.js) / 正文**图片点击放大**
- 阅读进度记忆: 中途退出自动保存, 重新进入恢复到上次位置, 可一键从头开始
- 长标题悬停无缝滚动 (常驻省略号, 悬停该行平滑滚动全文)

**订阅**
- 真实 RSS 解析: RSS 2.0 + Atom; 抓取优先走**自建 Cloudflare Worker 代理** (设置里配置,
  稳定/快/隐私可控, 15 分钟边缘缓存), 失败自动回退公共代理 (`allorigins` → `corsproxy` → `codetabs`);
  **全文阅读模式**: 摘要太短时由 Worker 用 Readability 提取原文正文 (阅读页 📖 按钮),
  结果本地持久化离线可读; 相对链接补全、正文清洗去脚本
- 订阅管理: 设置弹窗「订阅源」栏目统一管理 — 自定义玻璃菜单切换分类、两步确认删除; 侧栏分类树 (未读汇总、折叠状态记忆) 保持纯净, 按源/分类筛选
- 订阅分类: 设置弹窗「分类」栏目 — 新建 (**可直接选图标**)/重命名/删除/**自设图标**; 「未分类」仅内部兜底, 界面不显示
- 订阅规则: 按来源 URL / 标题关键词自动已读 / 星标 / 隐藏, 隐藏可一键恢复

**效率**
- 快捷键: 列表 `j/k` 选择、`Enter` 打开、`/` 搜索、`m` 已读、`r` 刷新、`1/2/3` 筛选;
  阅读页 `←/→` 上一篇下一篇、`s` 星标、`f` 字号、`Esc` 返回 (`?` 查看全部)
- 搜索增强: 桌面悬停展开玻璃胶囊搜索框; 分词 AND + 子序列模糊匹配 (标题/来源/作者/摘要), 最近搜索记录 (持久化/下拉回填/清空)
- 自动刷新 + 通知: 每 15 分钟静默刷新, 发现新文章时发送桌面通知 (侧栏铃铛开启, 权限持久化)
- 双主题: 暗色 (Vivid Stream) / 亮色 (Vivid Stream Light) 一键切换

**数据与离线**
- 统一设置 (侧栏齿轮): 「订阅规则 / 分类 / 订阅源 / 数据管理」四个标签页
  - 数据管理: OPML 导入/导出、全量 JSON 备份下载、JSON 恢复 (覆盖确认)
- PWA 离线: 可安装到桌面/主屏, 应用壳离线加载, 已抓取文章本地可读
- 数据持久化: 订阅/文章/已读/星标/规则/分类/搜索历史/阅读进度均存于 `localStorage`, 刷新不丢失
- PWA 未读角标: 安装到桌面/主屏后图标显示未读数 (Badge API)
- 列表分页: 超过 30 篇滚动触底自动加载更多
- 工程规范: ESLint + Prettier, 组件测试 (@vue/test-utils), 路由懒加载分包
- 纯净起始: 不含内置演示数据, 首次打开为欢迎空状态

## 🚀 快速开始

```bash
npm install        # 安装依赖
npm run dev        # 开发服务器 → http://localhost:5173
npm run build      # 生产构建 → dist/ (含 PWA Service Worker)
npm run preview    # 预览生产构建 (含 SW 注册, 可验证离线)
npm test           # 运行核心逻辑测试 (vitest + jsdom)
```

> PWA 说明: `npm run preview` 后首次访问会注册 Service Worker, 之后断网刷新仍可打开应用;
> 已抓取的文章全文保存在 localStorage, 离线可读。
>
> 提示: 若 `npm install` 报 `/Users/xxx/.npm` 权限错误, 可加 `--cache /tmp/npm-cache` 换一个缓存目录。

## 🗂 目录结构

```
rss-reader/
├── worker/                # 自建 RSS 代理 (Cloudflare Worker, 部署说明见 worker/README.md)
├── public/pwa/            # PWA 图标 (常规 + maskable)
├── src/
│   ├── assets/main.css    # 双主题令牌 + 玻璃拟态等自定义样式
│   ├── components/        # AppShell / Sidebar / MobileHeader / ArticleCard / EmptyState
│   │                      # AddFeedModal / CategoryManager / SettingsModal
│   ├── views/             # ListView (列表) / ArticleView (阅读页)
│   ├── stores/reader.js   # Pinia: 订阅/文章/规则/分类/主题/搜索/通知/备份
│   ├── utils/rss.js       # 抓取 / 解析 / 清洗 / 相对时间 / 阅读时长
│   └── __tests__/         # vitest 单元测试
└── tailwind.config.js     # 设计令牌 → Tailwind 映射
```

## 🧩 数据持久化 (localStorage)

| key | 内容 |
| --- | --- |
| `streamline:v1:feeds` / `articles` | 订阅源 / 文章缓存 |
| `streamline:v1:read` / `starred` | 已读 / 星标 id |
| `streamline:v1:theme` / `scale` | 主题 / 阅读字号 |
| `streamline:v1:rules` / `hidden` | 订阅规则 / 被隐藏文章 |
| `streamline:v1:progress` | 阅读进度 (articleId → 0..1) |
| `streamline:v1:categories` / `category-icons` | 订阅分类 / 分类图标 |
| `streamline:v1:collapsed-cats` | 分类树折叠状态 |
| `streamline:v1:notify` / `search-history` | 通知开关 / 搜索历史 |
| `streamline:v1:proxy-url` | 自建 RSS 代理地址 (Cloudflare Worker) |

## 📝 已知限制

- 图标与字体依赖 Google Fonts CDN (Material Symbols / Hanken Grotesk / Inter / JetBrains Mono),
  离线时回退为系统字体
- 公共 CORS 代理的稳定性取决于第三方服务
- 阅读页正文为抓取源 HTML 的清洗后渲染 (`v-html`), 已移除脚本与事件属性

## 🤝 贡献

欢迎 Issue 与 PR。开发前请保持:

- 代码风格: `npm run lint` + `npm run format` (ESLint + Prettier)
- 功能变更请补测试: `npm test`
- 提交前跑一遍 `npm run build` 确保构建通过

## 📄 开源许可

[MIT](./LICENSE) © 2026 sjpqxuzdly03646

数据与隐私: 所有阅读数据 (订阅/文章/已读/星标/规则/分类/进度) 均保存在浏览器本地
(`localStorage`), 除抓取 RSS 与可选的全文提取 (自建 Worker) 外不上传任何服务器。

