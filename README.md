# Diagram

![License: MIT](https://img.shields.io/badge/License-MIT-6d7cb8.svg)

简单的架构图工具。用「块」来搭架构：块可以嵌套，线性容器按权重瓜分主轴，网格容器的列权重在容器上设置。数据全部保存在本机浏览器里，可导出成 `pop_diagram` 文本、JSON、SVG 或 PNG。

## 特性

- **8 个模板**：分层架构、协议栈、技术栈、系统上下文、部署拓扑、模块分解、内存布局、自由模板，每个都自带可读的初始布局。
- **块级嵌套**：线性 / 网格 / 流式 / 叠放 / 留白 / 叶子六种布局组件，权重决定占比。
- **结构面板直接操作**：大纲里拖拽改嵌套、右键增删块，检查器只用来微调显示效果。
- **项目列表**：本机保存多个项目，可切换、改名、导出、删除；数据存 `localStorage`。
- **连线独立成组件**：需要时手动添加，自定义文字与类型，随时删除。
- **自研文本协议** `pop_diagram`：纯文本、可读、可版本控制，导入导出无损。
- **导出**：SVG（不依赖外部样式）/ PNG（3×）/ JSON 备份 / pop_diagram 文本。
- **中英双语**，默认中文。

## 本地开发

```sh
npm install
npm run dev        # 开发服务器
npm run build      # 类型检查 + 生产构建到 dist/
npm run preview    # 预览构建产物
npm run typecheck  # 仅类型检查
npm test           # 单元测试（Vitest）
```

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

b1 "支付系统" linear(y) plain {
  b2 "接入层" linear(x) band {
    b5 "API 网关" leaf @water
    b6 "BFF" leaf @water
  }
  b3 "应用层" linear(x) band {
    b8 "订单服务" leaf @mint
  }
}
```

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
| `⌘ + / −` / `⌘ 0` / `⌘ 1` | 缩放 / 适应窗口 / 100% |
| `⌘ E` | 切换画布 / 源码视图 |
| `?` | 打开快捷键面板 |

## 数据存放位置

- 当前文档：`localStorage` 的 `macaron.diagram.v3`
- 项目列表：`macaron.projects.v1`（当前项目 id：`macaron.activeProject.v1`）
- 界面语言：`macaron.locale`

## 许可证

[MIT](LICENSE) © 2026 lollipop
