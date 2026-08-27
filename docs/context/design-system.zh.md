# 设计系统上下文

[English](design-system.md) | 中文

## 产品体验原则

- 保持 Web UI 是聚焦的开发者工作台：导航、对话和可选详情占据稳定区域，临时提示与审批靠近当前任务。
- 通过语义主题 token 和明确的组件状态表达含义；已有 alias 能表示某种职责时，不引入字面颜色值。
- 创建新的局部控件或卡片之前，优先复用共享 primitive 和工具结果展示。
- 保持代码、terminal、diff 和结构化结果易读，包括有意设置的不换行与水平滚动行为。
- 把权限、风险确认、运行、失败和操作不可用作为可见交互状态，而不是隐藏的运行时事实。

## 基础规范

- **颜色：**`ui-theme` 为 light 和 dark 模式定义静态色板、语义 `--dsw-alias-*` 职责及组件专属 alias。视觉基础采用蓝灰中性色表面，以 DeepSeek 蓝表示品牌和选中状态，以绿、琥珀和红分别表示成功、警告和错误。参见[主题约定](../../packages/client/ui-theme/README.zh.md)和 `packages/client/ui-theme/src/styles/design-platform.css`。
- **主题选择：**内置 `light`、`dark` 和 `system` 偏好通过 `prefers-color-scheme` 解析；布局展示转换器负责应用 `color-scheme`、`data-ds-dark-theme`、alias override 和文档主题色。
- **排版：**UI 文本优先使用操作系统无衬线字体栈，并显式提供中文 fallback。代码使用 SF Mono、JetBrains Mono、Fira Code、Consolas、Liberation Mono、Menlo 和中文 fallback。Markdown 与通用文本职责在主题样式中成对定义字号和行高。
- **动效：**共享过渡时长为 0.1、0.2 和 0.3 秒，使用同一 ease-in-out 曲线。存在明显动画的界面为 `prefers-reduced-motion` 提供减少动效的分支。
- **间距与外形：**布局尺寸和组件间距由各自 CSS 值管理。圆角卡片和 pill 控件很常见，但仓库没有全局的间距、圆角、z-index、网格或密度尺度。

## 布局与响应式行为

- 主 `AppFrame` 是三列 grid：264–420px 的 sidebar（默认 280px，收起 rail 为 56px）、最小宽度 640px 的 conversation 列，以及 300–520px 的 detail 列（默认 360px）。
- 可用空间缩小时，sidebar 在 1024px 以下收起，detail 列先让出宽度、随后关闭，conversation 列最后收缩。拖动边界可调整桌面端宽度；details 是可选区域，当前没有已发布的产品内容占用它。
- Conversation 内容以 748px 宽度居中。Composer 是一个 22px 圆角的浮起 dock，比消息内容更宽；用户气泡最大宽度为 `min(525px, 82%)`。
- Settings 使用居中且受 viewport 限制的 modal，带左侧导航和约 800px 宽的内容框。各功能界面会在约 560–760px 处增加较窄断点，而不是依赖一个全局 mobile 布局。

## 组件与交互模式

- 共享 React primitive 包括 Button、Pill、Input、Menu、Modal、Toast、Tooltip、DisclosureRow、StateDot、OnboardingSurface、Markdown 与 JSON renderer，以及专门的 Terminal、Diff、Read、Search 和 Web 结果块；具体行为以[组件参考](../../packages/client/ui-primitives/README.zh.md)为准。
- UI 功能通过 slot 组合工作区／会话导航、conversation 与 trajectory 视图、附件、模型选择、settings、permissions、plans、goals、jobs、Skills、subagent、workflow、用户问题和产出文件。
- 控件实现 hover、active、focus、disabled、pending、success、warning 和 error 状态。工作区状态以琥珀色表示等待人工处理、蓝色表示运行中、绿色表示存在未查看的完成结果。
- 首次模型配置使用阻塞式 onboarding 界面。风险确认要求用户明确勾选复选框后，才开放破坏性操作。
- 工具调用使用声明的 render intent：未知工具使用通用 disclosure，terminal、read、diff、search、Web、workflow 和其他结构化结果使用按键选择的专属展示。

## 无障碍与响应式行为

- 已实现界面的 dialog、tree、menu、tab、disclosure、selection control、live status 和纯图标操作带有 ARIA role 或 label。阻塞式 onboarding 会把底层应用设为 inert；桌面启动装饰会对辅助技术隐藏，状态则使用 `aria-live`。
- Settings 导航、menu、提问流程、确认控件和 composer 交互具有键盘与焦点行为。必须保留可见焦点，以及 [Web 样式规则](../web-styling.zh.md)要求的 `prefers-reduced-motion` 分支。
- 仓库没有声明 WCAG 符合性目标，也没有通用视觉回归测试套件。现有交互测试只证明 DOM 状态和行为，不代表完整的视觉或辅助技术验收。
- 已知缺口包括：通用 Modal 没有焦点陷阱、附件 lightbox 没有焦点陷阱、`AppFrame` resize handle 只支持 pointer，并且共享 Menu 中没有观察到方向键／roving focus 实现。没有新证据时，不应把这些界面描述为完整支持键盘操作。

## Desktop Mint 展示

DSH Desktop Mint 在启动后使用同一个 Web 设计系统。它的原生启动页是独立的 Mint 品牌海洋场景，包含移动的鲸鱼、气泡和进度指示器；`prefers-reduced-motion` 会以静态状态取代这些动画。桌面端专属品牌元素不得进入上游 Web 组件。

## 设计限制与待确认问题

- 语义 token 是主 UI 的颜色权威，但启动 fallback 和少数组件仍包含字面颜色值；并非所有颜色都已 token 化。
- Pill 和 Input 没有独立的设计源记录；由于缺少精确的源 vector，部分品牌 glyph 是手工近似实现。
- Dark theme 的 token 应用经过测试，但仓库证据不能证明每个复杂界面都在两种主题下完成了人工视觉验收。
- 未记录最小支持 viewport、密度模式、正式无障碍目标和视觉回归 baseline。
