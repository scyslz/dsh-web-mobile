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

# 或跟 main（改完推上去，重装即生效）
dsh plugin --profile web add github:scyslz/dsh-web-mobile#main

# 或本地 tarball
dsh plugin --profile web add file:/path/to/dsh-web-mobile-3.3.5-compat.3.tgz
```

> **跟 main 不等于自动更新**：`pnpm-lock.yaml` 会把解析到的 commit hash 写死，
> 所以每次更新完 main 都要重装一次（`remove` + `add` 最稳），否则还是旧提交：
>
> ```bash
> dsh plugin --profile web remove dsh-web-mobile
> dsh plugin --profile web add github:scyslz/dsh-web-mobile#main
> systemctl kill -s TERM dsh.service
> ```
>
> 想要可复现 / 好回滚，就把 specifier 换成 tag：`#v3.3.5-compat.3`。

装完重启：

```bash
systemctl kill -s TERM dsh.service     # systemd 会拉起
```

## 上游有新版本时：怎么更新 main 而不冲突

核心原则：**不要 `git merge upstream/main`**。上游把 `lib/`（构建产物）也提交进仓库，
merge 会把两套构建产物混在一起，冲突全在这里。正确做法是「搬补丁 + 重建 lib + 快进 main」。

```bash
cd dsh-web-mobile
git fetch upstream --tags

# 1) 从新上游开临时分支
git checkout -b tmp-update upstream/main

# 2) 只搬我们的源码补丁（lib 一律不要）
git checkout v3.3.5-compat.3 -- src/compat.ts
git diff v3.3.5-compat.3^ v3.3.5-compat.3 -- src/index.ts src/delete-session.ts | git apply

#    冲突只可能出现在这两处：
#      src/index.ts          —— import + inject(['webServer']) 里的一段
#      src/delete-session.ts —— IDLE_TIMEOUT_MS 常量
#    按新版本上下文微调即可（通常只需改行号，逻辑不动）

# 3) 重建：lib 冲突在这一步被彻底消灭
pnpm install --frozen-lockfile
pnpm run verify && pnpm run build

# 4) 提交并让 main 直接快进过去（保持线性历史）
git add -A
git commit -m "compat: 跟到上游 v<新版本>"
git checkout main
git reset --hard tmp-update
git branch -d tmp-update
git push origin main

# 5) 打 tag，装的时候用 tag 固定
git tag v<新版本>-compat.1
git push origin v<新版本>-compat.1
```

为什么这样几乎不会冲突：

| 文件 | 冲突概率 | 原因 |
|---|---|---|
| `src/compat.ts` | 0 | 新文件，上游没有 |
| `src/index.ts` | 低 | 只有 1 个 import + 1 个 effect 注入 |
| `src/delete-session.ts` | 低 | 只有 1 个常量 |
| `lib/**` | 0 | 不参与合并，直接重建 |
| `README.md` | 中 | 顶部 fork 说明；冲突时保留我们的那几行即可 |

另外两条经验：

- **不要把 `prepare` 脚本当解法。** 试过「安装时构建、不提交 lib」，pnpm 会拦截 git 依赖的
  build script（`allowBuilds` 的 key 带 commit hash，每次更新都变），实际上不可用。
- **`package.json` 的 version 每次更新都会冲突一次**（上游也在改），改一下数字就行，
  不要把它当成合并失败的信号。

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
