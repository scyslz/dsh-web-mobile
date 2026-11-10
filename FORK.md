# 本 fork 的改动（compat/dsh-0.2.2）

基线：上游 **v3.3.5 + main 上的后续修复**（`1402ca8 fix(styles): 插件页交还宿主排版`），
peer `>=0.2.2-rc.1 <0.3.0-0`，对应 DSH `0.2.2-rc.1`。
版本号：`3.3.5-compat.3`。

只做两件事：**老 WebView 的 JS 兼容层**、**删除会话不再被反代 524**。
布局全部沿用上游，没有改任何 CSS，也没有改宿主的交互。

---

## 1. 老 WebView 兼容层（新增 `src/compat.ts`）

上游只做布局，不补 JS。老 Android WebView（Chromium < 119）打开 DSH 页面会在首帧前抛：

```
TypeError: Promise.withResolvers is not a function
```

前端整个崩掉，布局插件根本没机会执行，表现是白屏 / 半截页 + 一堆 unhandled rejection。

`src/compat.ts` 提供：

- `COMPAT_SCRIPT`：一段经典 `<script>` polyfill，覆盖
  `Promise.withResolvers / try / allSettled / any`、
  `AbortSignal.any / timeout / throwIfAborted`、
  `Array|String.prototype.at`、`findLast(Index)`、`flat / flatMap`、
  `toSorted / toReversed / toSpliced / with`、
  `Object.hasOwn / groupBy`、`Map.groupBy`、`structuredClone`、
  `crypto.randomUUID`、`queueMicrotask`、`HTMLDialogElement.showModal / close`。
  全部 feature-detect：现代浏览器上不产生任何行为。
- `installHtmlCompat(server)`：优先用宿主的 `webServer.tapIndex(transform)`
  （`renderIndex → taps → 响应`，**在压缩之前**执行，所以不用处理 gzip/br）。
  老宿主没有 `tapIndex` 时退化为包装 exact / prefix / fallback 路由，并自行
  解压 / 回压 gzip、br、deflate。

`src/index.ts` 在 `ctx.inject(['webServer'])` 作用域里安装：

```ts
webCtx.effect(
  () => installHtmlCompat(webCtx.webServer),
  'dsh-web-mobile: html compatibility shim',
)
```

注入点在第一个 `<script>` 之前，带标记属性 `data-dsh-web-compat`，幂等。

## 2. 删除会话不再 524（`src/index.ts` / `src/delete-session.ts`）

`POST /api/mobile-nav.session.delete` 在会话**正在运行**时要等 agent 收敛到 idle，
上游写死 20s；手机走反代（Cloudflare / EdgeOne 常在 15s 就回 524），
表现是「删除会话 → 网络 524」，而且不知道到底删没删。

- `IDLE_TIMEOUT_MS`：20s → **6s**，仍在跑的会话直接得到 409 `session-busy`
  （「该会话正在运行且无法停止，请先停止运行，再重试删除。」）；
- 整个删除再包一层 12s 硬上限（`withDeadline`），超时回 **504 `delete-timeout`**，
  绝不把请求挂到反代超时；
- 每次删除打印耗时：`session-delete '<id>' finished in Nms`。

---

## 构建

```bash
pnpm install --frozen-lockfile
pnpm run verify
pnpm run build        # 产物在 lib/，本仓库把 lib/ 一起提交，便于 git 安装
npm pack              # 可选：dsh-web-mobile-3.3.5-compat.3.tgz
```

## 安装

```bash
# tag（推荐，可复现）
dsh plugin --profile web add git+https://github.com/scyslz/dsh-web-mobile.git#v3.3.5-compat.3

# 或跟分支
dsh plugin --profile web add git+https://github.com/scyslz/dsh-web-mobile.git#compat/dsh-0.2.2

# 或本地 tarball
dsh plugin --profile web add file:/path/to/dsh-web-mobile-3.3.5-compat.3.tgz
```

装完重启：

```bash
systemctl kill -s TERM dsh.service     # systemd 会拉起
```

## 升级上游（下次 DSH 再升级时）

```bash
git fetch --tags
git checkout v<新版 tag>
git checkout -b compat/<新版>
git cherry-pick <本分支的提交>          # 只有两个文件的改动，冲突面很小
# 或手动搬两个文件：src/compat.ts、src/delete-session.ts 的常量与 src/index.ts 的 deadline
pnpm install --frozen-lockfile && pnpm run verify && pnpm run build
```

判断是否还能直接用的两条：

1. `grep -n "tapIndex" <dsh>/node_modules/@deepseek-ai/dsh-host-webserver/lib/index.js`
   还在 → 兼容层可以直接用；
2. `deleteSession()` 的 `IDLE_TIMEOUT_MS` 还在 `src/delete-session.ts` → deadline 补丁照搬。

## 验证

```bash
# 1) 兼容层注入（应输出 1）
curl -s -H "Cookie: dsh_session=<sid>" http://127.0.0.1:3080/ | grep -c data-dsh-web-compat

# 2) 老内核：在 DevTools 里删掉 Promise.withResolvers / AbortSignal.any 后刷新
#    window.__DSH_WEB_COMPAT__ === true，页面正常渲染，无 TypeError

# 3) 删除接口
#    不存在的 id → 404（几十毫秒）
#    空闲会话   → 200（几百毫秒）
#    运行中会话 → 6s 内 409；任何异常路径 12s 内 504，不会出现反代 524
```

## 没有做的部分

以下是在 DSH 0.2.1 时代做过、这次**没有**移植的界面改动（0.2.2 改了宿主结构，需要重新校准）：

- 会话头部右上角补「底部面板」入口；
- 右侧栏入口改成 toggle（打开后还能点同一颗收起）；
- 右侧栏打开时隐藏页面头部、把整屏让给面板。

需要时再按 0.2.2 的类名重做。
