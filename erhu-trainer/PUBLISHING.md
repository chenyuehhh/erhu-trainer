# 发布说明 PUBLISHING

面向接手本项目做上线的人 / AI。**顺序别改，第 2 步漏了一定出事。**

## 0. 这次发布到哪

| 项 | 值 |
|---|---|
| 本地目录 | `C:\Users\Administrator\WorkBuddy\2026-09-23-10-17-22\erhu-trainer` |
| appId | `wbapp_FBIwTz7N17pNNdWjGQeFaj` |
| 线上链接 | https://erhu-trainer.app.workbuddy.host/ |
| 入口页 | `index.html` |
| 运行时 | 纯静态站点（`language: static`），无构建、无依赖安装 |
| 管理方式 | WorkBuddy 桌面端「设置—数据管理—应用」 |
| 发布能力 | 应用发布（`workbuddy_sites_deploy`）：整个目录打包上传，覆盖同名 appId 的内容，链接不变 |

## 1. 先理解缓存，否则一定发不对

站点带 Service Worker（`sw.js`）提供离线能力，**它会把资源钉住**。当前策略：

| 请求 | 策略 | 行为 |
|---|---|---|
| HTML / 导航 | network-first | 每次向服务器取最新 HTML，3s 超时或断网才回落缓存 |
| CSS / JS | stale-while-revalidate | 命中先返回（快），同时后台拉新版，**下次生效** |

第二行是坑的来源：CSS/JS 的 URL 不变时，用户**第一次进来仍是旧代码**。所以必须用 URL 版本号把这一拍消掉 —— 这就是第 2 步存在的理由。

历史教训：早期版本对 HTML 也是 cache-first，表现是「每次进去都是旧页面，必须手动刷新」。曾试过只 bump `sw.js` 的 `VERSION`，没用 —— 版本号只能让 SW 重装一次，策略本身会把用户再次困住。**修的是策略，不是版本号。**

## 2. 标准发布流程（5 步）

### 第 1 步 — 改完代码，确保已落盘
发布能力会把目录**按磁盘现状**打包上传。文件还在写就发布，会得到一个空站。

### 第 2 步 — 刷新资源版本号（必做）
```bash
node tools/bump-version.mjs
```
- 按文件内容算 md5 前 8 位，给 `index.html` 里的 css/js 引用写 `?v=<hash>`。
- 改过内容的文件 → hash 变 → URL 变 → 必然拉新；没改的文件保持原 hash，继续吃缓存。
- 输出「版本号无变化」是正常的（本轮没动 css/js），不代表没跑。

### 第 3 步 — 起本地服务并跑测试（必做）
```bash
node tools/serve.mjs                 # 另开一个终端，默认 127.0.0.1:8931
node test/smoke.mjs                  # 资源可达性 + 逻辑单测（要求：全部通过）
node test/dom.mjs                    # jsdom 集成测试（要求：DOM 集成测试全部通过）
```
跑完把本地服务停掉（关掉那个终端 / 杀掉 8931 端口进程）。

> `tools/serve.mjs` 是自带的零依赖静态服务器，响应带 `Cache-Control: no-store`，本地调试不会被缓存误导。`python -m http.server 8931` 也能用，但本机 python 环境不一定就绪。

### 第 4 步 — 清理临时文件
删掉调试过程中产生的 `.tmp-*` 之类文件，别打进发布包。

### 第 5 步 — 发布
调用应用发布（`workbuddy_sites_deploy`），参数照抄：

```json
{
  "action": "deploy",
  "directory": "C:\\Users\\Administrator\\WorkBuddy\\2026-09-23-10-17-22\\erhu-trainer",
  "appId": "wbapp_FBIwTz7N17pNNdWjGQeFaj",
  "updateExistingApp": true,
  "userAskedToPublish": true,
  "appName": "二胡练习台",
  "domainPrefix": "erhu-trainer",
  "language": "static",
  "entryHtml": "index.html"
}
```
- `appId` + `updateExistingApp` 保证**沿用原链接**，不要把 tooling 当新应用发布。
- `userAskedToPublish` 只有在用户当轮明确说过「发布 / 上线 / 重新发布」时才置 true；没说就先问，工具会拒绝静默覆盖线上内容。
- 成功标志：返回 `shareLink` 且 `verified: true`。
- 发布成功后要告诉用户：去「设置—数据管理—应用」管理。

## 3. 发布后验证（别只看返回成功）

```bash
curl -s https://erhu-trainer.app.workbuddy.host/ | grep -o 'css/base.css?v=[a-f0-9]*'
```
拿到的 hash 与本地 `index.html` 里的一致，才算真的发上去了。不一致 = 中间层缓存或漏了第 2 步。

浏览器侧再确认一次：DevTools → Network → 勾选 Disable cache → 硬刷新，看 `sw.js` 是否被重新拉取。

## 4. 踩过的坑（按发生概率排序）

1. **漏了第 2 步**：测试全绿、发布成功返回 verified，但用户手上仍是上一次的 CSS/JS。这是最常见的一条。
2. **改了 `sw.js` 的 `VERSION` 当万能药**：只能在需要强制全网清缓存时用。平时靠 `?v=` 就够了，乱改会白白丢掉用户所有离线资源。
3. **`test/dom.mjs` 依赖路径写死**：第 2 行 import 的是
   `file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js`。
   换机器或该目录被清理 → 直接 `ERR_MODULE_NOT_FOUND`。先确认 jsdom 在不在，再怀疑测试逻辑。
4. **dom.mjs 报错先别改产品代码**，先判断属于哪一类：
   - `TypeError: _ctx.createXxx is not a function` → `FakeAC` 音频桩缺方法，补桩（`js/core/audio.js` 加了新节点就要同步补）。
   - 断言拿不到元素 / 数量对不上 → 断言过期。例如曲库已从两组变三组（basic / drill / song）且默认全折叠，老断言按「入门曲目默认展开」写就必红。
   - 另外注意：**每次 toggle 分组都会重建列表 DOM**，旧节点引用会失效，断言里必须现查现用。
5. **`.vs` 目录被 VS 锁住**：打包时可能报 `EBUSY`。把 `.vs` 临时移出目录 → 发布 → 再移回来。（曾经踩过，别删。）
6. **本机 PowerShell 工具 stdout 常常不回显**：跑命令时重定向到文件（`*> .\x.log`）再用读文件工具看输出，比反复重跑省时间。

## 5. 紧急情况

| 情况 | 处理 |
|---|---|
| 个别用户卡在旧版 | 让他手动刷新一次；新 HTML 是 network-first 取到的，刷新后即恢复。极端情况：浏览器对该站点清「站点数据」，SW 会被一并清掉重装 |
| 要强制全网清缓存 | 改 `sw.js` 顶部 `VERSION`，发布。旧缓存桶会被整体删除、重新预缓存 |
| 要下线链接 | 应用发布 `action: "unpublish"`，同目录 + appId。链接会失效，**务必先跟用户确认** |

## 6. 相关信息在哪

- 缓存策略的实现细节：`sw.js`
- 版本号的生成逻辑：`tools/bump-version.mjs`
- 本地服务器：`tools/serve.mjs`
- 功能与目录结构：`README.md`
- 每次发布的内容变更：见当日工作日志（`.workbuddy/memory/YYYY-MM-DD.md`）
