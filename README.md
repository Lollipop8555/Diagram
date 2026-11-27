# Diagram

![License: MIT](https://img.shields.io/badge/License-MIT-6d7cb8.svg)

简单的架构图工具。用「块」来搭架构：块可以嵌套，每层按权重分配父级空间；整张图的尺寸由 root 框控制，拖动 root 的手柄即可整体缩放。数据全部保存在本机浏览器里，可导出成 `pop_diagram` 文本、JSON、SVG 或 PNG。

## 特性

- **8 个模板**：分层架构、协议栈、技术栈、系统上下文、部署拓扑、模块分解、内存布局、自由模板，每个都自带可读的初始布局。
- **块级嵌套**：线性 / 网格 / 流式 / 叠放 / 留白 / 叶子六种布局组件；**嵌套深度不设上限**（只保留单块子项数量上限，防止误操作）。
- **整体尺寸可控**：root 是唯一的尺寸框（右侧 / 底部 / 右下角有手柄），拖动时所有内容按权重重新分配——这就是「按比例压缩」。
- **统一的分隔条**：只要容器是线性排列，**每对相邻子块之间都有分隔条**，不用先选中、也不用先设权重，像分屏一样直接拖；嵌套容器同样如此。分隔条平时隐藏，鼠标进入对应容器范围才显示一个小短握柄。
- **权重是份数**：权重 1 是保底可读的一份；调大权重、或把分隔条拖到 1 的下限后继续拖，会**撑开整体尺寸**而不是压缩同级，于是「放大某块」与「整体缩放」互不干扰。
- **画布操作**：滚轮平移、`⌘/Ctrl + 滚轮`缩放，窗口或分屏尺寸变化时在自动适配状态下重新居中；右键块可直接增删、排序、折叠，右键空白处快速适配。
- **结构面板直接操作**：大纲里拖拽改嵌套、右键增删块，检查器只用来微调显示效果。
- **项目列表**：本机保存多个项目，可切换、改名、复制、导出、删除；数据存 `localStorage`。
- **单标签页写入**：用 Web Locks（无则 localStorage 心跳）保证同一时间只有一个标签页有写权限，其他页只读等待，避免互相覆盖。
- **连线独立成组件**：需要时手动添加，自定义文字、类型与虚实线，随时删除。
- **自研文本协议** `pop_diagram`：纯文本、可读、可版本控制，导入导出无损；源码视图可直接编辑并应用回画布（可撤销）。
- **结构体检**：状态栏实时显示结构是否合法，问题可点击定位到对应块。
- **导出**：SVG（不依赖外部样式）/ PNG（3×）/ JSON 备份 / pop_diagram 文本。
- **中英双语**，默认中文；窄窗口下左右面板自动收成抽屉。

## 本地开发

```sh
npm install
npm run dev        # 开发服务器
npm run build      # 类型检查 + 生产构建到 dist/
npm run preview    # 预览构建产物（离线能力需在 preview / 线上验证）
npm run typecheck  # 仅类型检查
npm test           # 单元测试（Vitest）
```

## PWA（渐进式增强）

- `public/sw.js` 注册为 Service Worker：**导航请求网络优先、失败回落到缓存的壳**；同源静态资源 **stale-while-revalidate**（先给缓存、后台更新）。首次访问后即可**离线打开**。
- 数据本身存在 `localStorage`，所以离线启动仍能恢复上次的项目。
- `public/site.webmanifest` 提供安装信息（standalone、maskable 图标、主题色），浏览器给出「安装到桌面」提示时，顶栏会出现安装按钮（`InstallButton`，仅在支持 `beforeinstallprompt` 的浏览器出现，属于渐进增强，不支持就完全不显示）。
- Service Worker **只在生产构建注册**（`import.meta.env.PROD`），开发时不会缓存干扰调试。
- 注意：Service Worker 需要安全上下文（`https` 或 `localhost`）。

## 发布到 GitHub Pages

仓库已内置 `.github/workflows/deploy.yml`：推送到 `main` 即自动构建并部署。

1. 在 GitHub 仓库里打开 **Settings → Pages**，**Source** 选 **GitHub Actions**。
2. 推送代码到 `main`，或手动触发 `Deploy to GitHub Pages` 工作流。
3. 访问 `https://<用户名>.github.io/<仓库名>/`。

构建使用 `base: './'`（相对路径），因此部署在子路径下也能正常加载；`public/.nojekyll` 用于避免 GitHub Pages 的 Jekyll 处理静态资源。

## 文本协议示例

```text
@pop 1
@title "支付系统"
@template layered
@size 880 510

b1 "支付系统" linear(y) plain {
  b2 "接入层" linear(x) band w:1 {
    b5 "API 网关" leaf @water
    b6 "BFF" leaf @water
  }
  b3 "应用层" linear(x) band w:2 {
    b8 "订单服务" leaf @mint
  }
}
```

`@size <宽> <高>` 是 root 框的尺寸；省略时按内容测量一次作为初始尺寸。

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `⌘/Ctrl Z` / `⇧⌘Z` | 撤销 / 重做 |
| `⌘/Ctrl D` | 复制所选块 |
| `Alt ↑ / ↓` | 同级上移 / 下移 |
| `Alt ← / →` | 提升 / 降级一级 |
| `Enter` / `Tab` | 新建同级块 / 进入首个子块 |
| `Space` | 折叠 / 展开 |
| `F2` | 重命名（结构面板） |
| `Delete` | 删除所选块（含子块） |
| 滚轮 / `⌘/Ctrl + 滚轮` | 平移画布 / 以指针为中心缩放 |
| `⌘ + / −` / `⌘ 0` / `⌘ 1` | 缩放 / 适应窗口 / 100% |
| `⌘ E` | 切换画布 / 源码视图 |
| `⌘/Ctrl Enter` | 在源码视图中应用修改 |
| 右键 | 块操作菜单 / 画布视图菜单 |
| `?` | 打开快捷键面板 |

## 数据存放位置

- 当前文档：`localStorage` 的 `macaron.diagram.v3`
- 项目列表：`macaron.projects.v1`（当前项目 id：`macaron.activeProject.v1`）
- 界面语言：`macaron.locale`

## 许可证

[MIT](LICENSE) © 2026 lollipop
