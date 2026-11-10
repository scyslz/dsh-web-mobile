# 本 fork 的改动（compat/dsh-0.2.1）

基线：上游 `v3.2.3`（`dsh 0.2.1` 对应区间 `>=0.2.0-rc.1 <0.3.0-0`）。
版本号：`3.2.3-compat.10`。

这个 fork 只做三类事：**老 WebView 兼容**、**手机端头部/面板的可用性**、**删除会话不再被反代 524**。
布局本身仍是上游的，没有重写。

---

## 1. 老 WebView 兼容层（新增 `src/compat.ts`）

`dsh-web-mobile` 只做布局，不补 JS。老 Android WebView（Chromium < 119）打开 DSH
stock 页面会在首帧前就抛：

```
TypeError: Promise.withResolvers is not a function
```

前端直接崩，布局插件根本没机会执行。

新增 `src/compat.ts`：

- `COMPAT_SCRIPT`：一段经典 `<script>` polyfill，覆盖
  `Promise.withResolvers / try / allSettled / any`、
  `AbortSignal.any / timeout / throwIfAborted`、
  `Array|String.prototype.at`、`findLast(Index)`、`flat/flatMap`、
  `toSorted/toReversed/toSpliced/with`、
  `Object.hasOwn / groupBy`、`Map.groupBy`、`structuredClone`、
  `crypto.randomUUID`、`queueMicrotask`、`HTMLDialogElement.showModal/close`。
  全部 feature-detect，现代浏览器上是 no-op。
- `installHtmlCompat(server)`：优先用宿主的 `webServer.tapIndex(transform)`
  （`renderIndex → taps → 响应`，**在压缩之前**执行，不需要处理 gzip/br）；
  老宿主没有 `tapIndex` 时退化为包装 exact/prefix/fallback 路由，并自行解压/回压
  gzip、br、deflate。
- 注入点：第一个 `<script>` 之前，标记 `data-dsh-web-compat`，幂等。

`src/index.ts` 在 `ctx.inject(['webServer'])` 作用域里安装：

```ts
webCtx.effect(() => installHtmlCompat(webCtx.webServer), 'dsh-web-mobile: html compatibility shim')
```

## 2. 会话头部：右上角补齐「底部面板 / 右侧栏」

### 2.1 头部被顶出视口（`src/client/styles/misc.css.ts`）

上游为「App 状态栏压在 WebView 上」写了 `header { margin-top: -12px }`。
在普通浏览器标签页里视口本来就在状态栏之下，再上提会把标题行、侧栏开关、
Files 按钮顶到视口外（实测 `header.y = -12`、开关 `y = -6`，按钮被裁掉一半）。
现在只在 App / 全屏 PWA 生效：

```css
@media (max-width:1023px) and (pointer:coarse) and (display-mode: browser) {
  header:has([class*="_headerLeading"]) { margin-top: 0 !important; }
}
```

### 2.2 补出「底部面板」入口

上游在手机档把 `headerUtilities` 整块 `display:none`，PC 右上角的
「展开底部面板」在手机上没有任何入口。现在只放出该按钮（「更多操作」仍隐藏），
绝对定位到 `right:38px`；`headerActions` 让出 34px，避免和「Standard mode」胶囊重叠。

### 2.3 右侧栏入口改成 toggle（`src/client/components/MobileNavToggle.tsx`）

宿主在右侧栏**打开后**会卸载 `data-sidebar-right-expand`，改成在**面板内部**
渲染「Collapse right sidebar」——那颗按钮被 z-index 更高的页面头部盖住，点不到，
表现就是「弹出来就关不掉」。

改用插件自己装在页面头部里的按钮做 toggle（`openFilesPanel()` 本身就是 toggle 语义：
关时点 opener、开时点 closer），图标换成镜像的 `panel-left`，文案
`右侧栏 / Right sidebar`，位置 `right:4px`。

### 2.4 右侧栏打开时让出整屏

右侧栏和底部面板是**同一套 tab 框架**（`_tabCell → _tabHost → _tabStrip`），
区别只是右侧栏铺满全屏。宿主没处理「页面头部压在面板 tab 条上」，于是打开后
只看到内容区（上次停在终端就只看见终端），面板自己的 tab 条和收起按钮都点不到。

试过两条死路，记下来避免重犯：

- **不能用 z-index**：`_tabCell` 是 `position:static`（z-index 无效），
  往上 `P3OORG_panel` 只有 `z-index:10`，低于头部的 `30`，面板盖不住头部。
- **不能用 `:has([data-sidebar-right-expand])` 判断**：有些关闭路径上 opener
  不会立刻挂回，头部会永久消失。

最终（新增 `src/client/effects/right-sidebar-state.ts`）：读宿主那颗 Collapse 按钮的
**computed visibility**（关着 `hidden`、开着 `visible`），写成
`<html data-dsh-right-sidebar="open|closed">`，CSS 只在 `open` 时隐藏会话头部：

```css
html[data-dsh-right-sidebar="open"] header:has([class*="_crumbs"]) { display: none !important; }
```

关闭带过渡，mutation 发生时按钮还是 visible，之后不再有 mutation，
所以跨过渡重查（0/120/320/800ms）+ 打开期间 800ms 兜底轮询。

## 3. 删除会话不再 524（`src/index.ts` / `src/delete-session.ts`）

`POST /api/mobile-nav.session.delete` 在会话**正在运行**时要等 agent 收敛到 idle，
上游写死 20s；手机走反代（Cloudflare/EdgeOne 常在 15s 就回 524），
表现是「删除会话 → 网络 524」。

- `IDLE_TIMEOUT_MS`：20s → **6s**，仍在跑的会话直接得到 409 `session-busy`
  （中文提示「该会话正在运行且无法停止，请先停止运行，再重试删除。」）；
- 整个删除再包一层 12s 硬上限（`withDeadline`），超时回 **504 `delete-timeout`**，
  绝不把请求挂到反代超时；
- 每次删除打印耗时：`session-delete '<id>' finished in Nms`。

## 4. 未改的部分

- 移动布局本体、抽屉、输入区、gzip 压缩、会话删除的 trash 逻辑；
- 没有新增依赖；没有改 `cordis.patch.yml` 的行结构（仍是单行 insert）。

---

## 构建

```bash
pnpm install --frozen-lockfile
pnpm run verify
pnpm run build        # 产物在 lib/，本仓库把 lib/ 一起提交，便于 git 安装
npm pack              # 可选：产出 dsh-web-mobile-3.2.3-compat.10.tgz
```

## 安装

### 方式一：从仓库安装（推荐，需先把 fork push 上去）

```bash
# tag 安装（固定版本，可复现）
dsh plugin --profile web add git+https://github.com/<你的账号>/dsh-web-mobile.git#v3.2.3-compat.10

# 或者跟分支走（每次都要 --force 重装才会更新）
dsh plugin --profile web add git+https://github.com/<你的账号>/dsh-web-mobile.git#compat/dsh-0.2.1
```

仓库里 `lib/` 是提交进 git 的构建产物，所以 git 安装不需要本地跑 `pnpm build`。

### 方式二：本地 tarball

```bash
dsh plugin --profile web add file:/path/to/dsh-web-mobile-3.2.3-compat.10.tgz
```

### 方式三：npm（如果之后发布到自己的 scope）

```bash
dsh plugin --profile web add @your-scope/dsh-web-mobile@3.2.3-compat.10
```

装完重启：

```bash
systemctl kill -s TERM dsh.service   # systemd 会拉起
# 或 dsh 前台运行时直接重启进程
```

## 升级上游

```bash
git fetch --tags
git checkout v<新版 tag>
git checkout -b compat/<新版>
git apply /path/to/compat.patch      # 本 fork 相对 v3.2.3 的 diff
# 解决冲突 → verify → build → 提交
```

注意：上游 3.3.x 起 peer 要求 `@deepseek-ai/dsh-client-ui-* >= 0.2.2-rc.1`，
当前 DSH 是 `0.2.1-rc.2`，升插件前先升 DSH。

## 验证清单

```bash
# 1) 兼容层是否注入（应输出 1）
curl -s -H "Cookie: dsh_session=<sid>" http://127.0.0.1:3080/ | grep -c data-dsh-web-compat

# 2) 老内核：删掉 Promise.withResolvers 后打开页面，window.__DSH_WEB_COMPAT__ === true

# 3) 头部与面板（390×844 触屏）
#    header.y = 0；右上角 [Standard mode][底部面板][右侧栏]
#    点右侧栏 → 页面头部让位 + 面板 tab 条可见 → 点 Collapse 收起 → 头部回来

# 4) 删除会话（外网域名）
#    空闲会话 200/几毫秒；运行中会话 6s 内 409；异常路径 12s 内 504
```
