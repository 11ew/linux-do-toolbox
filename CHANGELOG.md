# Linux.do 工具箱 - 开发日志

## 项目概述
油猴脚本，为 linux.do（Discourse 论坛）提供悬浮球工具箱，含4个功能标签页，支持四边停靠、面板尺寸调节与位置/尺寸持久化。

## 文件结构
- `Linux.do 工具箱.user.js` — 主脚本（当前 v3.9.2）
- `linux.do 小助手（增强版）.user.js` — 参考脚本（积分/CDK/自动刷贴逻辑来源）
- `Linux.do 快速回复按钮.user.js` — 参考脚本（快速回复逻辑来源）
- `LINUX DO Timeline.user.js` — 参考脚本（已删库，仅剩描述）

## 涉及的 API / 外部站点
| 站点 | 用途 |
|------|------|
| `linux.do/u/{user}.json` | 用户资料 |
| `linux.do/u/{user}/summary.json` | 用户统计（发帖/阅读/点赞等） |
| `linux.do/site.json` | 所有分类板块 |
| `linux.do/latest.json?order=created` | 最新帖子时间线 |
| `linux.do/leaderboard/1?period=daily/all` | 排行榜积分排名（容易429） |
| `connect.linux.do/` | TL2+升级条件（HTML页面，需解析） |
| `credit.linux.do/api/v1/oauth/user-info` | Credit积分用户信息 |
| `credit.linux.do/api/v1/dashboard/stats/daily?days=7` | 近7天收支 |
| `cdk.linux.do/api/v1/oauth/user-info` | CDK分数（常被Cloudflare拦截） |
| `cdk.linux.do/api/v1/projects/received` | CDK领取记录 |
| `cdk.linux.do/dashboard` | CDK页面（API失败时的备用解析） |

---

## 版本迭代

### v1.0.0
**用户需求：** 做油猴脚本，关于 linux.do 的悬浮球工具箱，按ESC显示/隐藏，不用时半隐藏到侧边，内容分3个板块：个人信息查询、时间线、快速回复

**实现：**
- 悬浮球（右侧半隐藏）+ 侧边面板 + 3个标签页
- Tab1 个人信息：头像/等级/统计 + TL0→TL1、TL1→TL2 升级进度条 + TL2+从connect.linux.do解析
- Tab2 时间线：`/latest.json?order=created` 按发帖时间排序
- Tab3 快速回复：模板回复 + 自定义输入 + MutationObserver注入帖内回复按钮

### v2.0.0
**用户需求：**
1. 加自动刷贴功能（参考小助手）
2. 积分和CDK融合到个人信息里
3. 第4个标签是自动刷贴
4. 时间线要分板块，各板块已读未读

**实现：**
- Tab1 新增 Credit 积分 + CDK 分数区域
- Tab4 自动刷贴：开始/停止、统计面板、自动点赞开关、帖子数滑块、跨页面状态持久化
- Tab2 时间线改造：分类标签栏（/site.json）、已读/未读检测、筛选按钮、统计摘要

### v3.0.0 — 大版本重构
**用户需求：**
1. 积分和CDK参照小助手重写（之前写得不行）
2. 悬浮球可拖动到网页边缘任意位置
3. 悬浮球用彩色渐变的L作为logo
4. 界面背景太暗，添加调节按钮
5. 补全所有板块类型（之前只显示有帖子的分类）

**实现：**
- Credit 重写：可用积分、明日积分预估、当前点数+排名、昨日点数、每日额度、总收支、近7天收支明细，30分钟缓存+429冷却
- CDK 重写：分数/信任等级/昵称、领取记录+复制按钮、Cloudflare检测、5分钟GM缓存
- 悬浮球拖拽：mousedown/move/up + 吸附左右边缘 + 位置持久化
- 渐变L logo：彩虹渐变斜体粗体
- 全部CSS改用CSS变量，暗色/亮色主题切换
- 面板跟随球所在边打开
- 从/site.json加载所有分类含子分类，按position排序，子分类└前缀，选父分类包含子分类

### v3.1.0
**用户需求：**
1. 添加蓝白绿渐变新主题
2. CDK数据获取有问题，点数在个人信息里获取
3. 悬浮球改为椭圆
4. 用户点开面板球消失，关闭面板球出现
5. 升级条件/积分/CDK增加展开按钮，默认简略展示，点开详细展示

**实现：**
- 新增海洋主题（蓝白绿渐变），3主题循环：暗色☀️→亮色🌊→海洋🌙
- CDK新增 `fetchCdkFromPage()` 备用方案：API失败时解析dashboard页面HTML
- 悬浮球改椭圆：58x34px
- 面板打开时球消失(opacity:0)，关闭时出现(opacity:1)
- 三区域折叠展示：默认collapsed，标题旁显示简要值，▶展开/▼收起，各区域独立刷新

**Bug修复：** renderCdkInfo 中重复变量声明（score/trustLevel/username/nickname）

### v3.2.0
**用户需求：**
1. 悬浮球换回圆形
2. 悬浮球靠边缘时要有过渡效果
3. CDK 还是有问题，照搬小助手的 iframe Bridge 机制

**实现：**
- 悬浮球改回圆形（46x46px），字号调回20px
- 新增 `::before` 伪元素实现边缘发光过渡（blur+inherit背景色），根据 `side-left`/`side-right` class 自动调整方向
- `positionBall` 改回 `size=46`，`hideAmount=35%`，拖拽偏移回23px
- transition 增加 left/right 平滑动画
- CDK 完全重写为小助手的 iframe Bridge 架构：
  - `ensureCdkBridge()`：创建隐藏 iframe 指向 `cdk.linux.do/dashboard`，监听 postMessage
  - `fetchCdkViaBridge()`：向 iframe 发送请求，8秒超时，Promise 等待回调
  - `loadCdkInfo` 新流程：GM缓存 → 直接API → iframe Bridge → 旧缓存 → 未登录提示
  - 移除 `fetchCdkFromPage()`（dashboard HTML 解析）和 `fetchCdkReceived()`（Bridge 已包含领取记录）
  - 脚本顶部 CDK Bridge 端（cdk.linux.do）使用 `credentials: 'include'` 同源 fetch

### v3.3.0 — 自动刷贴重写
**用户需求：** 刷贴直接照搬小助手的

**实现（照搬小助手核心逻辑，适配工具箱非class结构）：**
- **sessionStorage 窗口独立状态**：`ssGet/ssSet` 替代 `GM_setValue`，每个窗口/标签页的刷贴状态互不干扰（autoRunning/topicList/sessionRead/accumulatedTime）
- **导航守护 `startNavigationGuard`**：每5秒检测页面是否卡住（帖子页60秒/列表页30秒无动作），自动调用 `recoverFromStuck` 恢复
- **防卡死恢复 `recoverFromStuck`**：停止滚动 → 等1秒 → 帖子页重新滚动 / 列表页重新获取并导航
- **累计时间休息**：`accumulateTime` 每次滚动累加时间，浏览满15分钟后 `pauseForRest` 休息2分钟再自动继续
- **跳过已读帖子**：新增 `skipReadEnabled` 开关，`isTopicReadForAuto/markTopicAsRead` 基于 GM 存储的已读ID列表（最多保留2000条）
- **`getNextTopic` 辅助函数**：从 topicList 弹出帖子时二次检查已读，跳过已读的
- **帖子获取增强 `getLatestTopics`**：重试机制（最多3次）、空页检测（连续3页空则停止）、进度条UI、跳过已读统计
- **导航增强 `navigateNextTopic`**：
  - 跳转超时保护（10秒内未跳转则强制重试）
  - 记录当前帖子为已读
  - URL 格式兼容 `last_read_post_number`
- **自动点赞改进**：
  - `autoLikeTopic`：精确按钮选择器 `div.discourse-reactions-reaction-button button.btn-toggle-reaction-like`，记录已赞帖子ID防重复（最多500条）
  - 新增 `quickLikeReplies`：随机点赞最多3个楼层的回复
- **UI 新增**：
  - 快速点赞开关（💬）
  - 跳过已读开关（⏭️）
  - 帖子获取状态区（进度条+统计）
- **移除**：旧的 `origToggle/origNav` 函数包装模式 + `GM_setValue` 跨页面状态（改用 sessionStorage）
- `SCROLL_CONFIG` 扩展：新增 maxScrollTime/browseTime/restTime/retryLimit/commentLimit/navTimeout/guardInterval/stuckTopicTime/stuckListTime

### v3.4.0
**用户需求：**
1. 时间线往下滑了要自动加载，不要点"加载更多"
2. 悬浮球边缘过渡效果像"皮肤长痘了"，要平滑

**实现：**
- **时间线无限滚动**：
  - 移除"加载更多"按钮，替换为底部哨兵元素 `#ld-tl-sentinel`
  - `IntersectionObserver` 监听哨兵进入视口（提前100px触发），自动调用 `loadTimeline(true)`
  - 追加模式优化：`appendTimelineTopics` 直接向 DOM 插入新帖子（DocumentFragment），不重建整个列表，保持滚动位置不跳
  - 新帖子带 `opacity 0→1` 淡入动画
  - `filterTopics` 辅助函数：追加时也遵循当前的分类/已读筛选条件
  - `updateTimelineSummary` 追加后实时更新统计数字
  - 没有更多数据时显示"没有更多帖子了"
- **悬浮球边缘过渡修复**：
  - 移除 `::before` 伪元素（blur光晕导致锯齿感 = "长痘"）
  - 改用方向性 `box-shadow`：靠右时阴影向左扩散 `-8px 0 20px 6px`，靠左时向右扩散 `8px 0 20px 6px`
  - hover 时改为全方向均匀发光 `0 0 28px 8px`
  - `transition` 时长从 `.3s` 调为 `.4s` 更柔和

### v3.5.0
**用户需求：**
1. 回复板块新增点赞和书签选项
2. 支持回复模板添加和删除
3. 未读帖显示高亮以作区分
4. 鼠标悬停悬浮球时显示全貌

**实现：**
- **快速回复 — 点赞/收藏开关**：
  - 新增 `❤️ 回复时点赞` 和 `🔖 回复时收藏` 两个开关按钮，状态持久化到 GM
  - `triggerReply` 中回复后延迟自动点击点赞/书签按钮（800ms/1000ms）
  - 按钮选择器：点赞用 `discourse-reactions-reaction-button`，书签用 `.bookmark`
- **回复模板管理**：
  - `REPLY_TEMPLATES` 常量改为 `replyTemplates` 变量，从 `GM_getValue("ld_replyTemplates")` 读取，首次使用自动初始化默认模板
  - 每个模板右侧新增 `×` 删除按钮（hover 时显示），点击后 splice 并重新渲染
  - 模板列表下方新增"添加新模板"输入框 + 按钮，支持 Enter 快捷添加
  - 增删后自动 `GM_setValue` 持久化
- **未读帖高亮增强**：
  - `.ld-topic-item.unread` 新增：背景色 `rgba(102,126,234,.08)` + 内阴影 `inset box-shadow` 边框
  - `.ld-topic-item.unread .ld-topic-title` 强制白色字体
  - `.ld-topic-item.read` 透明度从 `.65` 降到 `.55`，标题用 `--text-3` 灰色
  - 已读/未读对比度更大，一眼可分
- **悬浮球 hover 全貌**：
  - hover 时 `right: 0 !important` / `left: 0 !important` 让球完全滑出边缘，展示全貌
  - 配合 `transition: left .3s ease, right .3s ease` 平滑滑入滑出
- **悬浮球隐藏量调整**：`hideAmount` 从 `35%` 改为 `65%`（30px 藏入，16px 露出），靠边时像椭圆切面

### v3.6.0
**用户需求：**
1. 已读未读区分不明显，直接在帖子上加标签
2. 收藏改为书签，用户选择模板+点赞+书签后自动执行
3. 点赞默认给发帖人（首帖），不是评论区
4. 书签点击后不同时设置提醒

**实现：**
- **已读/未读标签**：`.ld-read-dot` 从6px圆点改为文字标签（`已读`/`未读`），带底色和圆角，一眼可辨
- **快速回复板块改造**：
  - "收藏"按钮改为"🔖 书签"
  - 添加提示文字：「选中后，点击模板会自动回复并执行勾选的操作」
  - 底部提示改为「点击模板自动回复+执行勾选操作」
- **点赞定位到首帖**：先找 `article[data-post-number='1']` / `#post_1` / `.topic-post:first-child` 内的点赞按钮，确保点赞给发帖人而非评论区
- **书签不设提醒**：点击书签按钮后，600ms 内自动处理弹出的提醒弹窗：
  1. 优先点击"不设提醒"选项 `[data-name='none']`
  2. 回退点击保存按钮 `.btn-primary`
  3. 最终回退关闭弹窗

### v3.7.0 — 多主题扩展
**用户需求：** 新增粉、红、白、渐变主题，紫色粒子特效主题

**实现：**
- **5个新主题 CSS 变量**：
  - `pink`（粉色）：玫瑰粉渐变背景 `#fdf2f8→#fce7f3`，强调色 `#ec4899`
  - `red`（红色）：深红背景 `#1a0505→#2d0a0a`，强调色 `#ef4444`，红色氛围
  - `white`（白色）：纯白背景 `#ffffff→#f8fafc`，强调色 `#2563eb`，深色文字
  - `gradient`（渐变）：深紫蓝渐变背景，双强调色 `#a78bfa`/`#f472b6`，多处渐变装饰
  - `particle`（紫色粒子）：深紫黑背景 `#0a0015→#1a0030`，强调色 `#a855f7`，配合 canvas 粒子动画
- **粒子动画系统**：
  - `startParticles()`：创建 `<canvas id="ld-particle-canvas">`，生成60个紫色系粒子（6种颜色随机），requestAnimationFrame 循环渲染
  - 粒子属性：位置/速度/大小/生命值/衰减率/颜色，shadowBlur 发光效果
  - 粒子到达边界或生命耗尽自动重生
  - canvas 响应窗口 resize
  - `stopParticles()`：取消 animationFrame、移除 canvas、清理 resize 监听
  - 页面加载时检测主题，已是 `particle` 则自动启动
- **主题切换**：8主题循环 dark→light→ocean→pink→red→white→gradient→particle
- **主题图标**：☀️🌊🌸🔴⬜🌈✨🌙

### v3.8.0 — 新增3个特色主题
**用户需求：** 新增粉红白渐变主题、紫黑金渐变主题、蓝白绿流线拖尾主题

**实现：**
- **3个新主题 CSS 变量**：
  - `pinkwhite`（粉红白渐变）：粉→白→粉柔和渐变背景，强调色 `#e11d48`/`#ec4899`，深玫红文字
  - `royalgold`（紫黑金渐变）：深紫黑底 + 金色装饰，强调色 `#eab308`/`#a855f7`，金色文字系
  - `streamline`（蓝白绿流线）：深青黑背景，强调色 `#14b8a6`/`#3b82f6`，搭配 canvas 流线拖尾动画
- **流线拖尾动画系统**：
  - `startStreamlines()`：创建 `<canvas id="ld-stream-canvas">`，生成25条流线
  - 流线属性：位置/正弦波动角度/曲率/速度/宽度/生命值/轨迹数组/颜色（8种蓝绿系颜色随机）
  - 拖尾实现：半透明覆盖 `rgba(0,26,26,0.08)` 实现自然拖尾残影
  - 轨迹绘制：`quadraticCurveTo` 平滑曲线连接历史位置点（最多40点）
  - 头部亮点：白色发光圆点标记流线前端
  - 流线从上/下方随机生成，正弦波动前进，生命耗尽自动重生
  - `stopStreamlines()`：取消 animationFrame、移除 canvas、清理监听
- **主题切换**：11主题循环 dark→light→ocean→pink→red→white→gradient→particle→pinkwhite→royalgold→streamline
- **主题图标**：☀️🌊🌸🔴⬜🌈✨💗👑🌊🌙

### v3.9.0 — 默认主题 + 刷贴真实感优化
**用户需求：** ocean 为默认主题；刷贴时选帖尽量随机，偶尔往上滑增加真实感

**实现：**
- **默认主题改为 ocean**：`state.theme` 默认值从 `"dark"` 改为 `"ocean"`，新用户首次打开即为海洋主题
- **streamline 主题改用 ocean 配色**：流线拖尾主题背景从深青黑改为 ocean 亮色背景（`#e3f0ff→#ffffff→#e0f5ec`），拖尾覆盖色改为 `rgba(227,240,255,0.12)`，流线颜色调深以适配亮色背景
- **随机选帖**：`getNextTopic()` 从帖子列表中随机抽取（`Math.random() * length`），而非总是顺序取第一个
- **偶尔上滑**（12%概率）：滚动过程中随机回滚 30~120px，模拟"回头看"行为
- **随机暂停**（8%概率）：阅读中偶尔停留 1~3 秒，模拟认真阅读某段内容
- **description 更新**：主题描述从"三主题"改为"11主题切换"

### v3.9.1 — 信息板块一键跳转
**用户需求：** 信息板块添加网址跳转；未登录点击可直达登录，已登录点击可查看对应详情。

**实现：**
- **Credit/CDK 标题区新增跳转入口**：新增 `登录/详情` 按钮，并允许点击简要值直接跳转
- **按登录态自动切换目标地址**：
  - Credit：未登录跳 `https://credit.linux.do`，已登录跳 `https://credit.linux.do/home`
  - CDK：未登录跳 `https://cdk.linux.do`，已登录跳 `https://cdk.linux.do/dashboard`
- **登录态实时联动 UI**：在 Credit/CDK 成功加载时标记已登录，加载失败时标记未登录，并同步按钮文案和提示

### v3.9.2 — 时间线跳转恢复 + 工具箱交互升级
**用户需求：**
1. 从时间线点击帖子后，自动打开小助手并定位到当前帖子，方便继续向下翻看
2. 工具箱打开后可拖到任意边缘停靠
3. 面板支持自行调整大小，并持久化保存位置与尺寸
4. 面板尺寸变化时特效画布同步，关闭再打开保持状态恢复

**实现：**
- **新增时间线恢复上下文**：点击帖子时保存 `topicId`、滚动位置、筛选条件、已加载列表和页码到 `sessionStorage`
- **跨页恢复与自动展开**：帖子页加载后检测恢复上下文，自动打开面板并切换到“时间线”Tab
- **定位当前帖子**：优先按 `topicId` 精确定位并滚动到可视区，找不到时回退到原滚动位置
- **视觉高亮提示**：定位成功后对目标帖子短暂高亮，便于确认当前阅读位置
- **兼容交互细节**：仅拦截普通左键点击；`Ctrl/Command + 点击` 仍保留新标签页行为
- **四边停靠**：悬浮球支持吸附上/右/下/左四个边缘；打开面板后也可通过拖拽标题栏重新停靠到最近边缘
- **面板可调尺寸**：新增基于停靠方向自动切换的缩放角，支持手动调整宽高，并限制最小尺寸与视口边距
- **位置 / 尺寸持久化**：`dockEdge`、`dockOffset`、`panelWidth`、`panelHeight` 使用 GM 存储保存，关闭重开和刷新页面后自动恢复
- **特效画布联动**：粒子 / 流线主题的 canvas 会随面板尺寸变化即时同步，避免特效区域与面板大小脱节
