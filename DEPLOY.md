# 部署说明（Cloudflare Pages）

本仓库是 [zyronon/TypeWords](https://github.com/zyronon/TypeWords) 的部署副本，协议 **GPL-3.0**（见 `LICENSE`，请保留原作者版权信息）。

- 上游项目：https://github.com/zyronon/TypeWords
- 对外站点：https://type.91stocks.com

## 项目特点

- 纯前端静态站，词库（`public/dicts/`）和文章列表（`public/list/`）都是仓库内的本地 JSON，**不需要自建后端**。
- 学习进度、设置、收藏都存在浏览器本地（localStorage / IndexedDB），无需登录。
- 单词发音使用有道词典公开接口（`dict.youdao.com`），需要访问外网。

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
