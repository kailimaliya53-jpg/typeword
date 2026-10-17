# 部署说明（Cloudflare Pages）

本仓库是 [zyronon/TypeWords](https://github.com/zyronon/TypeWords) 的部署副本，协议 **GPL-3.0**（见 `LICENSE`，请保留原作者版权信息）。

- 上游项目：https://github.com/zyronon/TypeWords
- 对外站点：https://type.91stocks.com

## 项目特点

- 纯前端静态站，词库（`public/dicts/`）和文章列表（`public/list/`）都是仓库内的本地 JSON，**不需要自建后端**。
- 学习进度、设置、收藏都存在浏览器本地（localStorage / IndexedDB），无需登录。
- 单词发音使用有道词典公开接口（`dict.youdao.com`），需要访问外网。

## 已内置的词库与文章

上游仓库只内置了 1 个示例词库（CET-4）和 1 套示例文章，本仓库已从官方数据源同步：

- **词库（12 个）**：CET-4、CET-6、考研、专四、高考 3500 词、IELTS、TOEFL、GRE3000、牛津3000词、商务英语、计算机专用英语、程序员常用词
- **文章（4 套）**：新概念英语 1-4（共 276 篇，含逐句翻译，可直接跟打）

单词词条自带音标、释义、例句、短语、同义词、词根词缀等数据，因此“单词”和“句子”练习都有内容。

### 增加 / 更换词库

官方共有 194 个词库（全部约 400MB），用脚本按需同步到本地：

```bash
node scripts/mirror-official-dicts.mjs                        # 默认精选词库（约 45MB）
node scripts/mirror-official-dicts.mjs --all                  # 全部 194 个词库（约 400MB，仓库会很大）
node scripts/mirror-official-dicts.mjs --names="CET-4,专八,麦克米伦7000"
node scripts/mirror-official-dicts.mjs --with-audio           # 额外下载文章音频（约 360MB，慎用）
```

脚本会更新 `public/list/word.json`、`public/list/article.json` 和首页推荐列表。

> 文章音频（新概念朗读）体积很大（约 360MB），默认不下载，因此文章练习没有音频播放；
> 文字跟打、逐句翻译、单词发音（有道接口）都正常。
> 若需要音频，可在 Pages 项目里把 `ORIGIN` 之外再自行决定是否使用 `--with-audio`。

> ⚠️ 版权提示：新概念英语课文属于受版权保护的教材内容，词库数据来自上游公开 CDN。
> 如果是公开对外站点，请自行评估风险；也可以只保留词库、删掉 `public/dicts/en/article/` 下不需要的文章。

## 本地构建

```bash
pnpm install --frozen-lockfile
ORIGIN=https://type.91stocks.com HOST=type.91stocks.com pnpm run generate
# 静态产物：.output/public
```

本地预览：

```bash
npx serve .output/public
```

## Cloudflare Pages 构建配置

| 配置项 | 值 |
| --- | --- |
| Framework preset | `None` |
| Build command | `pnpm run generate` |
| Build output directory | `.output/public` |
| Root directory | `/` |
| 生产分支 | `main` |

环境变量（Settings → Environment variables，Production + Preview 都建议加）：

| 变量 | 值 | 作用 |
| --- | --- | --- |
| `NODE_VERSION` | `22` | Nuxt 4 需要 Node 20+ |
| `ORIGIN` | `https://type.91stocks.com` | 生成正确的 canonical / sitemap 地址 |
| `HOST` | `type.91stocks.com` | 站点域名 |

## 绑定自定义域名 type.91stocks.com

域名 NS 在新网（xincache），不在 Cloudflare，因此用 **CNAME 方式**接入，不影响现有主站解析：

1. Cloudflare 面板 → Workers & Pages → 该项目 → **Custom domains** → **Set up a domain** → 填 `type.91stocks.com` → Continue。
2. 到新网 DNS 管理，为 `type` 添加记录：
   - 类型：`CNAME`
   - 主机记录：`type`
   - 记录值：`<你的项目名>.pages.dev`
3. 等待生效（一般几分钟）。证书由 Cloudflare 自动签发，无需手动配置。

> 注意：必须先在 Pages 面板里添加该域名，再去加 CNAME；只加 CNAME 不关联域名会返回 522。
> `91stocks.com` 目前没有 CAA 记录，不会阻碍 Cloudflare 签发证书。

## 后续更新上游代码

本仓库不含上游的提交历史。要同步上游改动，建议：

```bash
git clone https://github.com/zyronon/TypeWords.git /tmp/TypeWords-upstream
rsync -a --delete --exclude .git --exclude node_modules --exclude .output \
  /tmp/TypeWords-upstream/ /path/to/this/repo/
```

然后在 `DEPLOY.md` 里确认配置未被覆盖，再提交推送，Cloudflare Pages 会自动重新构建。
