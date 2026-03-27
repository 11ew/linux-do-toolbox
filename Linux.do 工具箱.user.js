// ==UserScript==
// @name         Linux.do 工具箱
// @namespace    https://linux.do/
// @version      3.9.2
// @description  悬浮球工具箱：个人信息（升级条件+积分+CDK）、时间线、快速回复、自动刷贴。可拖拽悬浮球，11主题切换，按 ESC 显示/隐藏。
// @author       You
// @match        https://linux.do/*
// @match        https://cdk.linux.do/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      connect.linux.do
// @connect      credit.linux.do
// @connect      cdk.linux.do
// @connect      linux.do
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";
  if (window.top !== window && window.location.hostname !== "cdk.linux.do") return;

  // ========== CDK Bridge（在 cdk.linux.do 域上运行）==========
  if (window.location.hostname === "cdk.linux.do") {
    const bridgeInit = async () => {
      try {
        const [userRes, receivedRes] = await Promise.all([
          fetch("https://cdk.linux.do/api/v1/oauth/user-info", { credentials: "include" }),
          fetch("https://cdk.linux.do/api/v1/projects/received?current=1&size=20&search=", { credentials: "include" }),
        ]);
        const userData = userRes.ok ? await userRes.json() : null;
        const receivedData = receivedRes.ok ? await receivedRes.json() : null;
        if (!userData?.data) return;
        const cacheData = { user: userData.data, received: receivedData?.data || null };
        GM_setValue("lda_cdk_cache", { data: cacheData, ts: Date.now() });
        try { window.parent?.postMessage({ type: "lda-cdk-data", payload: { data: cacheData } }, "*"); } catch {}
        console.log("[工具箱 CDK Bridge] 数据已缓存");
      } catch (e) { console.error("[工具箱 CDK Bridge] 失败:", e); }
    };
    bridgeInit();
    window.addEventListener("message", (e) => { if (e.data?.type === "lda-cdk-request") bridgeInit(); });
    return; // cdk.linux.do 上不渲染面板
  }

  // ========== 以下仅在 linux.do 上运行 ==========
  if (window.top !== window) return;

  const BASE_URL = "https://linux.do";

  // ==================== 配置 ====================
  const LEVEL_REQUIREMENTS = {
    0: {
      topics_entered: { label: "浏览的话题", required: 5 },
      posts_read_count: { label: "已读帖子", required: 30 },
      time_read: { label: "阅读时长(分)", required: 10, unit: "minutes" },
    },
    1: {
      days_visited: { label: "访问天数", required: 15 },
      likes_given: { label: "给出的赞", required: 1 },
      likes_received: { label: "收到的赞", required: 1 },
      post_count: { label: "帖子数量", required: 3 },
      topics_entered: { label: "浏览的话题", required: 20 },
      posts_read_count: { label: "已读帖子", required: 100 },
      time_read: { label: "阅读时长(分)", required: 60, unit: "minutes" },
    },
  };

  const TRUST_LEVEL_NAMES = {
    0: "Lv0 新手", 1: "Lv1 入门", 2: "Lv2 成员", 3: "Lv3 常驻", 4: "Lv4 领袖",
  };

  const SCROLL_CONFIG = {
    minSpeed: 10, maxSpeed: 15, minDistance: 2, maxDistance: 4,
    fastScrollChance: 0.08, fastScrollMin: 80, fastScrollMax: 200,
    maxScrollTime: 30000,    // 单帖最大滚动时间 30秒
    browseTime: 15 * 60000,  // 浏览 15 分钟
    restTime: 2 * 60000,     // 休息 2 分钟
    retryLimit: 3,           // 获取帖子列表重试次数
    commentLimit: 5000,      // 跳过评论超多的帖
    navTimeout: 10000,       // 导航超时保护 10秒
    guardInterval: 5000,     // 导航守护检测间隔 5秒
    stuckTopicTime: 60000,   // 帖子页卡住阈值 60秒
    stuckListTime: 30000,    // 列表页卡住阈值 30秒
  };

  const DEFAULT_TEMPLATES = [
    "感谢分享！", "学到了，谢谢！", "非常实用，收藏了", "好帖，支持一下",
    "感谢楼主的分享，辛苦了！", "写得很详细，学习了", "这个方法不错，试试看", "顶一下，好文章", "参与一下，谢谢！",
  ];
  let replyTemplates = GM_getValue("ld_replyTemplates", null) || [...DEFAULT_TEMPLATES];

  // ==================== 样式（含主题变量） ====================
  GM_addStyle(`
    /* === 主题变量 === */
    #ld-toolbox-panel {
      --bg-main: linear-gradient(135deg, #1e2240 0%, #1c2b50 50%, #1a3360 100%);
      --bg-card: rgba(255,255,255,.07);
      --bg-card-hover: rgba(255,255,255,.12);
      --bg-header: rgba(255,255,255,.07);
      --bg-input: rgba(255,255,255,.08);
      --text-1: #fff;
      --text-2: #e0e0e0;
      --text-3: rgba(255,255,255,.7);
      --text-4: rgba(255,255,255,.5);
      --text-5: rgba(255,255,255,.3);
      --border: rgba(255,255,255,.09);
      --accent: #667eea;
      --accent2: #764ba2;
      --green: #4ade80;
      --red: #f87171;
      --gold: #ffd700;
      --cyan: #22d3ee;
      --scrollbar: rgba(255,255,255,.15);
    }
    #ld-toolbox-panel[data-theme="light"] {
      --bg-main: linear-gradient(135deg, #f8f9fc 0%, #eef1f6 50%, #f3f5f9 100%);
      --bg-card: rgba(0,0,0,.04);
      --bg-card-hover: rgba(0,0,0,.08);
      --bg-header: rgba(0,0,0,.04);
      --bg-input: rgba(0,0,0,.05);
      --text-1: #1a1a2e;
      --text-2: #333;
      --text-3: #555;
      --text-4: #888;
      --text-5: #aaa;
      --border: rgba(0,0,0,.1);
      --accent: #5a6fd6;
      --accent2: #7c4daf;
      --green: #16a34a;
      --red: #dc2626;
      --gold: #b8860b;
      --cyan: #0891b2;
      --scrollbar: rgba(0,0,0,.15);
    }
    #ld-toolbox-panel[data-theme="ocean"] {
      --bg-main: linear-gradient(135deg, #e3f0ff 0%, #ffffff 50%, #e0f5ec 100%);
      --bg-card: rgba(30,100,180,.06);
      --bg-card-hover: rgba(30,100,180,.1);
      --bg-header: rgba(30,100,180,.06);
      --bg-input: rgba(30,100,180,.05);
      --text-1: #1a3350;
      --text-2: #2d4a6f;
      --text-3: #4a7099;
      --text-4: #7a9bb8;
      --text-5: #a0bdd4;
      --border: rgba(30,100,180,.12);
      --accent: #3b82f6;
      --accent2: #10b981;
      --green: #059669;
      --red: #dc2626;
      --gold: #d97706;
      --cyan: #0891b2;
      --scrollbar: rgba(30,100,180,.15);
    }
    #ld-toolbox-panel[data-theme="pink"] {
      --bg-main: linear-gradient(135deg, #fce4ec 0%, #fff0f5 50%, #fde2ff 100%);
      --bg-card: rgba(220,60,120,.06);
      --bg-card-hover: rgba(220,60,120,.1);
      --bg-header: rgba(220,60,120,.06);
      --bg-input: rgba(220,60,120,.05);
      --text-1: #4a1942;
      --text-2: #6b2a5e;
      --text-3: #995080;
      --text-4: #b87aa0;
      --text-5: #d4a6c4;
      --border: rgba(220,60,120,.12);
      --accent: #ec4899;
      --accent2: #d946ef;
      --green: #10b981;
      --red: #ef4444;
      --gold: #f59e0b;
      --cyan: #06b6d4;
      --scrollbar: rgba(220,60,120,.15);
    }
    #ld-toolbox-panel[data-theme="red"] {
      --bg-main: linear-gradient(135deg, #2a0a0a 0%, #3d1212 50%, #4a1a1a 100%);
      --bg-card: rgba(255,80,80,.08);
      --bg-card-hover: rgba(255,80,80,.14);
      --bg-header: rgba(255,80,80,.08);
      --bg-input: rgba(255,80,80,.06);
      --text-1: #ffd7d7;
      --text-2: #f0b0b0;
      --text-3: rgba(255,200,200,.7);
      --text-4: rgba(255,180,180,.5);
      --text-5: rgba(255,160,160,.3);
      --border: rgba(255,80,80,.15);
      --accent: #ef4444;
      --accent2: #f97316;
      --green: #4ade80;
      --red: #fca5a5;
      --gold: #fbbf24;
      --cyan: #67e8f9;
      --scrollbar: rgba(255,80,80,.2);
    }
    #ld-toolbox-panel[data-theme="white"] {
      --bg-main: linear-gradient(135deg, #ffffff 0%, #fafafa 50%, #f5f5f5 100%);
      --bg-card: rgba(0,0,0,.03);
      --bg-card-hover: rgba(0,0,0,.06);
      --bg-header: rgba(0,0,0,.03);
      --bg-input: rgba(0,0,0,.04);
      --text-1: #111;
      --text-2: #333;
      --text-3: #666;
      --text-4: #999;
      --text-5: #bbb;
      --border: rgba(0,0,0,.08);
      --accent: #2563eb;
      --accent2: #7c3aed;
      --green: #16a34a;
      --red: #dc2626;
      --gold: #ca8a04;
      --cyan: #0891b2;
      --scrollbar: rgba(0,0,0,.1);
    }
    #ld-toolbox-panel[data-theme="gradient"] {
      --bg-main: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
      --bg-card: rgba(255,255,255,.06);
      --bg-card-hover: rgba(255,255,255,.1);
      --bg-header: rgba(255,255,255,.06);
      --bg-input: rgba(255,255,255,.07);
      --text-1: #f0e6ff;
      --text-2: #d4c0f0;
      --text-3: rgba(220,200,255,.7);
      --text-4: rgba(200,180,255,.5);
      --text-5: rgba(180,160,255,.3);
      --border: rgba(150,100,255,.12);
      --accent: #a78bfa;
      --accent2: #f472b6;
      --green: #34d399;
      --red: #fb7185;
      --gold: #fbbf24;
      --cyan: #22d3ee;
      --scrollbar: rgba(150,100,255,.2);
    }
    #ld-toolbox-panel[data-theme="particle"] {
      --bg-main: linear-gradient(135deg, #0d001a 0%, #1a0033 50%, #0d001a 100%);
      --bg-card: rgba(168,85,247,.08);
      --bg-card-hover: rgba(168,85,247,.14);
      --bg-header: rgba(168,85,247,.08);
      --bg-input: rgba(168,85,247,.06);
      --text-1: #e9d5ff;
      --text-2: #d8b4fe;
      --text-3: rgba(216,180,254,.7);
      --text-4: rgba(196,150,240,.5);
      --text-5: rgba(170,120,220,.3);
      --border: rgba(168,85,247,.15);
      --accent: #a855f7;
      --accent2: #c084fc;
      --green: #4ade80;
      --red: #fb7185;
      --gold: #fbbf24;
      --cyan: #67e8f9;
      --scrollbar: rgba(168,85,247,.2);
    }
    #ld-toolbox-panel[data-theme="pinkwhite"] {
      --bg-main: linear-gradient(135deg, #ffe0ec 0%, #fff5f5 30%, #ffffff 60%, #ffe0ec 100%);
      --bg-card: rgba(236,72,153,.06);
      --bg-card-hover: rgba(236,72,153,.1);
      --bg-header: rgba(236,72,153,.06);
      --bg-input: rgba(236,72,153,.05);
      --text-1: #831843;
      --text-2: #9d174d;
      --text-3: #be185d;
      --text-4: #db2777;
      --text-5: #f472b6;
      --border: rgba(236,72,153,.12);
      --accent: #e11d48;
      --accent2: #ec4899;
      --green: #10b981;
      --red: #ef4444;
      --gold: #f59e0b;
      --cyan: #06b6d4;
      --scrollbar: rgba(236,72,153,.15);
    }
    #ld-toolbox-panel[data-theme="royalgold"] {
      --bg-main: linear-gradient(135deg, #0a0012 0%, #1a0a2e 30%, #12081f 60%, #1a1000 100%);
      --bg-card: rgba(255,215,0,.07);
      --bg-card-hover: rgba(255,215,0,.12);
      --bg-header: rgba(168,85,247,.08);
      --bg-input: rgba(255,215,0,.06);
      --text-1: #fde68a;
      --text-2: #fcd34d;
      --text-3: rgba(253,230,138,.7);
      --text-4: rgba(253,224,71,.5);
      --text-5: rgba(250,204,21,.3);
      --border: rgba(255,215,0,.12);
      --accent: #eab308;
      --accent2: #a855f7;
      --green: #4ade80;
      --red: #fb7185;
      --gold: #ffd700;
      --cyan: #67e8f9;
      --scrollbar: rgba(255,215,0,.2);
    }
    #ld-toolbox-panel[data-theme="streamline"] {
      --bg-main: linear-gradient(135deg, #e3f0ff 0%, #ffffff 50%, #e0f5ec 100%);
      --bg-card: rgba(30,100,180,.06);
      --bg-card-hover: rgba(30,100,180,.1);
      --bg-header: rgba(30,100,180,.06);
      --bg-input: rgba(30,100,180,.05);
      --text-1: #1a3350;
      --text-2: #2d4a6f;
      --text-3: #4a7099;
      --text-4: #7a9bb8;
      --text-5: #a0bdd4;
      --border: rgba(30,100,180,.12);
      --accent: #3b82f6;
      --accent2: #10b981;
      --green: #059669;
      --red: #dc2626;
      --gold: #d97706;
      --cyan: #0891b2;
      --scrollbar: rgba(30,100,180,.15);
    }
    /* 特效画布（粒子/流线共用样式） */
    #ld-particle-canvas, #ld-stream-canvas {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 0; border-radius: inherit;
    }
    #ld-toolbox-panel[data-theme="particle"] > *:not(#ld-particle-canvas),
    #ld-toolbox-panel[data-theme="streamline"] > *:not(#ld-stream-canvas) {
      position: relative; z-index: 1;
    }

    /* === 悬浮球（圆形） === */
    #ld-toolbox-ball {
      position: fixed; z-index: 99999;
      width: 46px; height: 46px; border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      cursor: grab; display: flex; align-items: center; justify-content: center;
      transition: box-shadow .4s ease, opacity .3s ease, top .3s ease, right .3s ease, bottom .3s ease, left .3s ease, transform .3s ease;
      user-select: none; touch-action: none;
    }
    #ld-toolbox-ball:active { cursor: grabbing; }
    #ld-toolbox-ball.hidden { opacity: 0; pointer-events: none; }
    #ld-toolbox-ball.side-right {
      box-shadow: -8px 0 20px 6px rgba(102,126,234,0.35), 0 4px 12px rgba(118,75,162,0.25);
    }
    #ld-toolbox-ball.side-left {
      box-shadow: 8px 0 20px 6px rgba(102,126,234,0.35), 0 4px 12px rgba(118,75,162,0.25);
    }
    #ld-toolbox-ball.side-top {
      box-shadow: 0 8px 20px 6px rgba(102,126,234,0.35), 0 4px 12px rgba(118,75,162,0.25);
    }
    #ld-toolbox-ball.side-bottom {
      box-shadow: 0 -8px 20px 6px rgba(102,126,234,0.35), 0 4px 12px rgba(118,75,162,0.25);
    }
    #ld-toolbox-ball:hover {
      box-shadow: 0 0 28px 8px rgba(102,126,234,0.5), 0 4px 15px rgba(118,75,162,0.3);
    }
    #ld-toolbox-ball.side-right:hover {
      right: 0 !important; left: auto !important;
    }
    #ld-toolbox-ball.side-left:hover {
      left: 0 !important; right: auto !important;
    }
    #ld-toolbox-ball.side-top:hover {
      top: 0 !important; bottom: auto !important;
    }
    #ld-toolbox-ball.side-bottom:hover {
      bottom: 0 !important; top: auto !important;
    }
    #ld-toolbox-ball .ball-logo {
      font-size: 20px; font-weight: 900; font-style: italic;
      font-family: Georgia, 'Times New Roman', serif;
      background: linear-gradient(135deg, #ff6b6b, #feca57, #48dbfb, #ff9ff3, #54a0ff);
      -webkit-background-clip: text; background-clip: text;
      -webkit-text-fill-color: transparent;
      line-height: 1; pointer-events: none;
    }

    /* === 面板 === */
    #ld-toolbox-panel {
      position: fixed;
      width: 390px; height: 520px;
      min-width: 320px; min-height: 280px;
      max-width: calc(100vw - 24px); max-height: calc(100vh - 24px);
      background: var(--bg-main);
      z-index: 99998;
      transition: transform .35s cubic-bezier(.4,0,.2,1), opacity .2s ease;
      display: flex; flex-direction: column; overflow: hidden;
      color: var(--text-2);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      resize: none;
      box-sizing: border-box;
      transform: translate3d(0, 0, 0);
      opacity: .98;
    }
    #ld-toolbox-panel.side-right { border-radius: 16px 0 0 16px; box-shadow: -8px 0 40px rgba(0,0,0,0.25); }
    #ld-toolbox-panel.side-left { border-radius: 0 16px 16px 0; box-shadow: 8px 0 40px rgba(0,0,0,0.25); }
    #ld-toolbox-panel.side-top { border-radius: 0 0 16px 16px; box-shadow: 0 8px 40px rgba(0,0,0,0.25); }
    #ld-toolbox-panel.side-bottom { border-radius: 16px 16px 0 0; box-shadow: 0 -8px 40px rgba(0,0,0,0.25); }
    #ld-toolbox-panel.dragging { transition: none; user-select: none; }

    .ld-panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; background: var(--bg-header);
      border-bottom: 1px solid var(--border); flex-shrink: 0;
      cursor: move;
    }
    .ld-panel-header .title { font-size: 15px; font-weight: 700; color: var(--text-1); }
    .ld-header-actions { display: flex; align-items: center; gap: 4px; }
    .ld-theme-btn, .ld-panel-close {
      background: none; border: none; color: var(--text-4);
      font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 6px;
      transition: all .2s; line-height: 1;
    }
    .ld-theme-btn:hover, .ld-panel-close:hover { color: var(--text-1); background: var(--bg-card); }
    .ld-panel-resizer {
      position: absolute; width: 16px; height: 16px; z-index: 3;
      border-radius: 0 0 8px 0;
      background:
        linear-gradient(135deg, transparent 0 42%, rgba(255,255,255,.18) 42% 50%, transparent 50% 58%, rgba(255,255,255,.32) 58% 66%, transparent 66%);
      opacity: .8;
    }
    #ld-toolbox-panel[data-resize-corner="bottom-right"] .ld-panel-resizer {
      right: 2px; bottom: 2px; cursor: nwse-resize;
    }
    #ld-toolbox-panel[data-resize-corner="bottom-left"] .ld-panel-resizer {
      left: 2px; bottom: 2px; cursor: nesw-resize; transform: scaleX(-1);
    }
    #ld-toolbox-panel[data-resize-corner="top-right"] .ld-panel-resizer {
      right: 2px; top: 2px; cursor: nesw-resize; transform: scaleY(-1);
    }
    #ld-toolbox-panel[data-resize-corner="top-left"] .ld-panel-resizer {
      left: 2px; top: 2px; cursor: nwse-resize; transform: scale(-1);
    }

    /* 标签页 */
    .ld-tab-nav {
      display: flex; background: var(--bg-card);
      border-bottom: 1px solid var(--border); flex-shrink: 0;
    }
    .ld-tab-btn {
      flex: 1; padding: 9px 0; background: none; border: none;
      color: var(--text-4); font-size: 11px; font-weight: 600;
      cursor: pointer; transition: all .2s; position: relative; white-space: nowrap;
    }
    .ld-tab-btn:hover { color: var(--text-3); background: var(--bg-card-hover); }
    .ld-tab-btn.active { color: var(--text-1); }
    .ld-tab-btn.active::after {
      content: ''; position: absolute; bottom: 0; left: 20%; right: 20%; height: 2px;
      background: linear-gradient(90deg, var(--accent), var(--accent2)); border-radius: 1px;
    }
    .ld-tab-content {
      display: none; padding: 14px; overflow-y: auto; flex: 1; min-height: 0;
    }
    .ld-tab-content.active { display: block; }
    .ld-tab-content::-webkit-scrollbar { width: 5px; }
    .ld-tab-content::-webkit-scrollbar-track { background: transparent; }
    .ld-tab-content::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }

    /* === 通用组件 === */
    .ld-loading { text-align: center; padding: 30px; color: var(--text-4); font-size: 12px; }
    .ld-loading .spinner {
      display: inline-block; width: 20px; height: 20px;
      border: 2px solid var(--bg-card); border-top-color: var(--accent);
      border-radius: 50%; animation: ld-spin .8s linear infinite; margin-bottom: 8px;
    }
    @keyframes ld-spin { to { transform: rotate(360deg); } }
    .ld-section-title {
      font-size: 13px; font-weight: 700; color: var(--text-1); margin: 14px 0 8px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .ld-refresh-btn {
      background: var(--bg-card); border: none; color: var(--text-3);
      font-size: 11px; padding: 3px 10px; border-radius: 4px; cursor: pointer;
      transition: all .2s;
    }
    .ld-refresh-btn:hover { background: var(--bg-card-hover); color: var(--text-1); }
    .ld-refresh-btn:disabled { opacity: .5; cursor: not-allowed; }
    .ld-jump-btn {
      background: var(--bg-card); border: none; color: var(--text-3);
      font-size: 11px; padding: 3px 10px; border-radius: 4px; cursor: pointer;
      transition: all .2s;
    }
    .ld-jump-btn:hover { background: var(--bg-card-hover); color: var(--text-1); }
    .ld-card {
      background: var(--bg-card); padding: 10px 12px;
      border-radius: 8px; margin-bottom: 8px;
    }

    /* === Tab1: 个人信息 === */
    .ld-user-header {
      display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
      padding: 12px; background: var(--bg-card); border-radius: 10px;
    }
    .ld-user-avatar { width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--border); }
    .ld-user-name { font-size: 15px; font-weight: 700; color: var(--text-1); }
    .ld-user-level { font-size: 12px; color: var(--text-4); margin-top: 2px; }
    .ld-user-stats {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 12px;
    }
    .ld-stat-card {
      background: var(--bg-card); padding: 8px 4px; border-radius: 8px; text-align: center;
    }
    .ld-stat-value { font-size: 16px; font-weight: 700; color: var(--text-1); }
    .ld-stat-label { font-size: 9px; color: var(--text-4); margin-top: 2px; }

    /* 进度条 */
    .ld-progress-item { margin-bottom: 8px; }
    .ld-progress-label {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;
    }
    .ld-progress-name { font-size: 11px; color: var(--text-3); }
    .ld-progress-value { font-size: 10px; color: var(--text-4); }
    .ld-progress-bar {
      height: 5px; background: var(--bg-card); border-radius: 3px; overflow: hidden;
    }
    .ld-progress-fill {
      height: 100%; border-radius: 3px;
      background: linear-gradient(90deg, var(--accent), var(--accent2));
      transition: width .6s ease;
    }
    .ld-progress-fill.completed { background: linear-gradient(90deg, #4ade80, #22c55e); }
    .ld-met-summary {
      text-align: center; padding: 8px; border-radius: 8px; margin-top: 8px;
      font-size: 11px; font-weight: 600;
    }
    .ld-met-summary.all-met { background: rgba(74,222,128,.15); color: var(--green); }
    .ld-met-summary.not-met { background: var(--bg-card); color: var(--text-3); }

    /* 积分/CDK */
    .ld-credit-main {
      padding: 10px; border-radius: 10px; text-align: center; margin-bottom: 8px;
      background: var(--bg-card); border: 1px solid var(--border);
    }
    .ld-credit-main .lbl { font-size: 11px; color: var(--text-4); margin-bottom: 4px; }
    .ld-credit-main .val { font-size: 30px; font-weight: 800; }
    .ld-credit-gold { background: linear-gradient(135deg, rgba(255,215,0,.15) 0%, rgba(255,165,0,.1) 100%); border-color: rgba(255,215,0,.3); }
    .ld-credit-gold .val { color: var(--gold); text-shadow: 0 2px 8px rgba(255,215,0,.3); }
    .ld-info-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 5px 0; font-size: 12px;
    }
    .ld-info-row .label { color: var(--text-4); }
    .ld-info-row .value { color: var(--text-1); font-weight: 600; }
    .ld-sub-title {
      font-size: 11px; font-weight: 700; color: var(--text-3); margin: 10px 0 4px;
      padding-top: 8px; border-top: 1px solid var(--border);
    }
    .ld-link-btn {
      display: inline-block; margin-top: 6px; font-size: 11px; color: var(--accent);
      text-decoration: none; transition: color .2s;
    }
    .ld-link-btn:hover { color: var(--accent2); }
    .ld-cdk-item {
      background: var(--bg-card); border-radius: 6px; padding: 8px; margin-bottom: 6px;
      border: 1px solid var(--border);
    }
    .ld-cdk-item .name { font-weight: 600; color: var(--cyan); font-size: 11px; }
    .ld-cdk-item .time { font-size: 9px; color: var(--text-5); }
    .ld-cdk-item .creator { font-size: 10px; color: var(--text-4); margin-top: 2px; }
    .ld-cdk-code-row {
      display: flex; align-items: center; gap: 6px; margin-top: 4px;
      background: rgba(0,0,0,.2); padding: 4px 8px; border-radius: 4px;
    }
    .ld-cdk-code-row code {
      flex: 1; font-size: 11px; color: var(--gold); word-break: break-all; font-family: monospace;
    }
    .ld-copy-btn {
      background: rgba(34,211,238,.2); border: 1px solid rgba(34,211,238,.3); color: var(--cyan);
      padding: 2px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; white-space: nowrap;
      transition: all .2s;
    }
    .ld-copy-btn:hover { background: rgba(34,211,238,.35); }
    .ld-login-prompt {
      text-align: center; padding: 12px; font-size: 12px; color: var(--text-4);
    }
    .ld-login-btn {
      display: inline-block; margin-top: 6px; padding: 6px 16px; border-radius: 8px;
      font-size: 12px; font-weight: 600; color: #fff; text-decoration: none;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      transition: all .2s;
    }
    .ld-login-btn:hover { box-shadow: 0 2px 12px rgba(102,126,234,.4); }
    .ld-cdk-login-btn {
      background: linear-gradient(135deg, #a855f7, #9333ea);
    }

    /* === Tab2: 时间线 === */
    .ld-tl-toolbar {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 8px; gap: 6px;
    }
    .ld-tl-filter-bar {
      display: flex; gap: 4px; overflow-x: auto; padding-bottom: 6px; flex-wrap: wrap;
    }
    .ld-tl-filter-bar::-webkit-scrollbar { height: 3px; }
    .ld-tl-filter-bar::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 2px; }
    .ld-cat-chip {
      padding: 3px 8px; border-radius: 10px; border: 1px solid var(--border);
      background: var(--bg-card); color: var(--text-4);
      font-size: 10px; cursor: pointer; transition: all .2s; white-space: nowrap; flex-shrink: 0;
    }
    .ld-cat-chip:hover { background: var(--bg-card-hover); color: var(--text-1); }
    .ld-cat-chip.active {
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      border-color: transparent; color: #fff; font-weight: 600;
    }
    .ld-cat-chip .cat-count {
      display: inline-block; min-width: 14px; height: 14px; line-height: 14px;
      font-size: 9px; text-align: center; border-radius: 7px;
      background: rgba(255,255,255,.15); margin-left: 3px; padding: 0 3px;
    }
    .ld-cat-chip.active .cat-count { background: rgba(255,255,255,.25); }
    .ld-read-filter { display: flex; gap: 2px; flex-shrink: 0; }
    .ld-rf-btn {
      padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border);
      background: var(--bg-card); color: var(--text-4);
      font-size: 10px; cursor: pointer; transition: all .2s; white-space: nowrap;
    }
    .ld-rf-btn:hover { color: var(--text-3); }
    .ld-rf-btn.active { background: rgba(102,126,234,.25); border-color: rgba(102,126,234,.4); color: #fff; }
    .ld-topic-item {
      padding: 10px 12px; background: var(--bg-card); border-radius: 8px;
      margin-bottom: 6px; transition: background .2s; cursor: pointer;
      position: relative; border-left: 3px solid transparent;
    }
    .ld-topic-item:hover { background: var(--bg-card-hover); }
    .ld-topic-item.unread {
      border-left-color: var(--accent);
      background: rgba(102,126,234,.08);
      box-shadow: inset 0 0 0 1px rgba(102,126,234,.12);
    }
    .ld-topic-item.unread .ld-topic-title { color: var(--text-1); }
    .ld-topic-item.read { opacity: .55; }
    .ld-topic-item.read .ld-topic-title { color: var(--text-3); }
    .ld-topic-item.ld-topic-item-focus {
      box-shadow: 0 0 0 1px rgba(102,126,234,.55), 0 0 18px rgba(102,126,234,.35);
      animation: ld-topic-focus 1.2s ease-out;
    }
    @keyframes ld-topic-focus {
      from { transform: translateX(0); }
      35% { transform: translateX(4px); }
      to { transform: translateX(0); }
    }
    .ld-read-dot {
      display: inline-block; padding: 1px 5px; border-radius: 3px;
      margin-right: 5px; flex-shrink: 0; vertical-align: middle;
      font-size: 9px; font-weight: 700; line-height: 1.4;
    }
    .ld-read-dot.unread { background: var(--accent); color: #fff; }
    .ld-read-dot.read { background: var(--text-5); color: var(--bg-card); }
    .ld-topic-title {
      font-size: 13px; font-weight: 600; color: var(--text-1); margin-bottom: 4px; line-height: 1.4;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .ld-topic-title a { color: inherit; text-decoration: none; }
    .ld-topic-title a:hover { text-decoration: underline; }
    .ld-topic-meta {
      display: flex; align-items: center; gap: 6px; font-size: 10px;
      color: var(--text-4); flex-wrap: wrap;
    }
    .ld-topic-meta .category {
      background: rgba(102,126,234,.2); color: var(--text-3);
      padding: 1px 5px; border-radius: 3px; font-size: 10px;
    }
    .ld-topic-stats {
      display: flex; gap: 10px; margin-top: 3px; font-size: 10px; color: var(--text-5);
    }
    .ld-tl-summary {
      display: flex; justify-content: space-between; padding: 6px 10px;
      background: var(--bg-card); border-radius: 6px; margin-bottom: 8px;
      font-size: 10px; color: var(--text-4);
    }
    .ld-tl-summary .num { color: var(--text-1); font-weight: 600; }
    .ld-load-more {
      display: block; width: 100%; padding: 10px; margin-top: 6px;
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 8px; color: var(--text-4); font-size: 12px;
      cursor: pointer; transition: all .2s; text-align: center;
    }
    .ld-load-more:hover { background: var(--bg-card-hover); color: var(--text-1); }

    /* === Tab3: 快速回复 === */
    .ld-qr-template {
      padding: 8px 12px; background: var(--bg-card); border-radius: 8px;
      font-size: 12px; color: var(--text-3); cursor: pointer;
      transition: all .2s; border: 1px solid transparent; margin-bottom: 5px;
    }
    .ld-qr-template:hover {
      background: var(--bg-card-hover); border-color: rgba(102,126,234,.3); color: var(--text-1);
    }
    .ld-qr-custom { display: flex; gap: 8px; margin-top: 10px; }
    .ld-qr-input {
      flex: 1; padding: 8px 12px; border-radius: 8px;
      border: 1px solid var(--border); background: var(--bg-input);
      color: var(--text-1); font-size: 12px; outline: none; transition: border-color .2s;
    }
    .ld-qr-input:focus { border-color: rgba(102,126,234,.5); }
    .ld-qr-input::placeholder { color: var(--text-5); }
    .ld-qr-send {
      padding: 8px 16px; border-radius: 8px; border: none;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      color: #fff; font-size: 12px; font-weight: 600; cursor: pointer;
      transition: all .2s; white-space: nowrap;
    }
    .ld-qr-send:hover { box-shadow: 0 2px 10px rgba(102,126,234,.4); }
    .ld-qr-tpl-del {
      display: inline-block; margin-left: 6px; color: var(--text-5); font-size: 14px;
      cursor: pointer; line-height: 1; vertical-align: middle; opacity: 0; transition: opacity .15s;
    }
    .ld-qr-template:hover .ld-qr-tpl-del { opacity: 1; }
    .ld-qr-tpl-del:hover { color: var(--red); }
    .ld-qr-add-row { display: flex; gap: 6px; margin-top: 8px; }
    .ld-qr-add-input {
      flex: 1; padding: 6px 10px; border-radius: 6px;
      border: 1px dashed var(--border); background: var(--bg-input);
      color: var(--text-2); font-size: 11px; outline: none;
    }
    .ld-qr-add-input::placeholder { color: var(--text-5); }
    .ld-qr-add-btn {
      padding: 6px 12px; border-radius: 6px; border: none;
      background: var(--bg-card); color: var(--text-3); font-size: 11px;
      cursor: pointer; transition: all .2s;
    }
    .ld-qr-add-btn:hover { background: var(--bg-card-hover); color: var(--text-1); }
    .ld-qr-actions {
      display: flex; gap: 8px; margin: 10px 0;
    }
    .ld-qr-action-btn {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;
      padding: 8px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg-card); color: var(--text-3); font-size: 12px;
      cursor: pointer; transition: all .2s; user-select: none;
    }
    .ld-qr-action-btn:hover { background: var(--bg-card-hover); color: var(--text-1); }
    .ld-qr-action-btn.active { border-color: rgba(102,126,234,.5); color: var(--accent); background: rgba(102,126,234,.1); }
    .ld-quick-reply-inline {
      display: inline-flex; align-items: center; gap: 2px;
      padding: 2px 6px; border-radius: 4px; cursor: pointer;
      font-size: 11px; font-weight: 600; color: #888;
      background: transparent; border: 1px solid transparent;
      transition: all .2s; margin-left: 6px; vertical-align: middle; user-select: none;
    }
    .ld-quick-reply-inline:hover {
      background: rgba(102,126,234,.1); color: #667eea;
      border-color: rgba(102,126,234,.3);
    }

    /* === Tab4: 自动刷贴 === */
    .ld-auto-btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 12px; border-radius: 10px; border: none;
      font-size: 14px; font-weight: 700; cursor: pointer; transition: all .2s;
      color: #fff;
    }
    .ld-auto-btn.start {
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
    }
    .ld-auto-btn.start:hover {
      box-shadow: 0 4px 20px rgba(102,126,234,.4); transform: translateY(-1px);
    }
    .ld-auto-btn.running {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      animation: ld-pulse 2s infinite;
    }
    @keyframes ld-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(245,87,108,.4); }
      50% { box-shadow: 0 0 0 8px rgba(245,87,108,0); }
    }
    .ld-auto-stats {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 10px;
    }
    .ld-auto-stat {
      background: var(--bg-card); padding: 8px; border-radius: 8px; text-align: center;
    }
    .ld-auto-stat .num { font-size: 16px; font-weight: 700; color: var(--text-1); }
    .ld-auto-stat .lbl { font-size: 9px; color: var(--text-4); margin-top: 2px; }
    .ld-auto-status {
      margin-top: 8px; padding: 8px 12px; border-radius: 8px;
      background: var(--bg-card); font-size: 11px;
      color: var(--text-3); line-height: 1.6;
    }
    .ld-auto-status .highlight { color: var(--gold); font-weight: 600; }
    .ld-toggle-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; background: var(--bg-card); border-radius: 8px;
      margin-top: 6px;
    }
    .ld-toggle-label { font-size: 12px; color: var(--text-3); }
    .ld-toggle-switch {
      position: relative; width: 36px; height: 20px; appearance: none;
      background: var(--text-5); border-radius: 10px; outline: none;
      cursor: pointer; transition: background .2s;
    }
    .ld-toggle-switch:checked { background: var(--accent); }
    .ld-toggle-switch::before {
      content: ''; position: absolute; top: 2px; left: 2px;
      width: 16px; height: 16px; border-radius: 50%; background: #fff;
      transition: transform .2s;
    }
    .ld-toggle-switch:checked::before { transform: translateX(16px); }
    .ld-slider-row {
      padding: 8px 12px; background: var(--bg-card); border-radius: 8px;
      margin-top: 6px;
    }
    .ld-slider-header {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 12px; color: var(--text-3); margin-bottom: 4px;
    }
    .ld-slider-value { color: var(--gold); font-weight: 600; }
    .ld-slider {
      width: 100%; height: 4px; appearance: none; background: var(--scrollbar);
      border-radius: 2px; outline: none;
    }
    .ld-slider::-webkit-slider-thumb {
      appearance: none; width: 14px; height: 14px; border-radius: 50%;
      background: var(--accent); cursor: pointer;
    }

    /* 折叠区域 */
    .ld-expand-btn {
      background: none; border: none; color: var(--text-4);
      font-size: 10px; cursor: pointer; padding: 2px 6px; border-radius: 4px;
      transition: all .2s; margin-left: 4px;
    }
    .ld-expand-btn:hover { color: var(--text-1); background: var(--bg-card); }
    .ld-brief-val {
      font-size: 13px; font-weight: 700; color: var(--gold); margin-right: 2px;
    }
    .ld-brief-val.cyan { color: var(--cyan); }
    .ld-brief-jump {
      cursor: pointer;
      text-decoration: underline dotted transparent;
      transition: text-decoration-color .2s;
    }
    .ld-brief-jump:hover { text-decoration-color: currentColor; }
    .ld-detail-section {
      overflow: hidden; transition: max-height .35s ease, opacity .25s ease;
      max-height: 2000px; opacity: 1;
    }
    .ld-detail-section.collapsed {
      max-height: 0; opacity: 0; margin: 0; padding: 0;
    }

    /* ESC 提示 */
    .ld-esc-hint {
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%,-50%) scale(.8);
      background: rgba(0,0,0,.75); color: #fff;
      padding: 10px 24px; border-radius: 8px;
      font-size: 13px; font-weight: 600; z-index: 100000;
      opacity: 0; pointer-events: none; transition: all .25s;
      backdrop-filter: blur(10px);
    }
    .ld-esc-hint.show { opacity: 1; transform: translate(-50%,-50%) scale(1); }

    /* 通知 */
    .ld-notification {
      position: fixed; bottom: 20px; right: 20px; padding: 10px 20px;
      background: rgba(0,0,0,.8); color: #fff; border-radius: 8px;
      font-size: 13px; z-index: 100001; transition: opacity .3s;
      backdrop-filter: blur(10px);
    }
  `);

  // ==================== 工具函数 ====================
  const Utils = {
    random: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    isNearBottom: () => {
      const { scrollHeight, clientHeight, scrollTop } = document.documentElement;
      return scrollTop + clientHeight >= scrollHeight - 200;
    },
    isPageLoaded: () => document.querySelectorAll(".loading, .infinite-scroll").length === 0,
  };

  function formatTimeAgo(d) {
    const s = Math.floor((Date.now() - new Date(d)) / 1000);
    if (s < 60) return `${s}秒前`;
    if (s < 3600) return `${Math.floor(s / 60)}分钟前`;
    if (s < 86400) return `${Math.floor(s / 3600)}小时前`;
    if (s < 2592000) return `${Math.floor(s / 86400)}天前`;
    return new Date(d).toLocaleDateString("zh-CN");
  }

  async function safeFetchJson(url) {
    try {
      const r = await fetch(url, { credentials: "include" });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  function gmFetch(url, headers = {}) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "GET", url, anonymous: false, timeout: 15000,
        headers: { Accept: "application/json", ...headers },
        onload: (r) => {
          if (r.status >= 200 && r.status < 300) {
            try { resolve(JSON.parse(r.responseText)); } catch { resolve(null); }
          } else resolve(null);
        },
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    });
  }

  function gmFetchHtml(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET", url, timeout: 15000,
        onload: (r) => r.status === 200 ? resolve(r.responseText) : reject(new Error(`HTTP ${r.status}`)),
        onerror: () => reject(new Error("network")),
        ontimeout: () => reject(new Error("timeout")),
      });
    });
  }

  function gmRequest(url, headers = {}) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "GET", url, anonymous: false, timeout: 15000,
        headers: { Accept: "application/json", ...headers },
        onload: (r) => {
          if (r.responseText && r.responseText.includes("Just a moment")) { resolve({ blocked: true }); return; }
          if (r.status === 401 || r.status === 403) { resolve(null); return; }
          if (r.status >= 200 && r.status < 300) {
            try { const j = JSON.parse(r.responseText); resolve(j); } catch { resolve(null); }
          } else resolve(null);
        },
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    });
  }

  function escapeHtml(s) {
    if (!s) return "";
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  function showNotification(text) {
    const el = document.createElement("div");
    el.className = "ld-notification";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 2000);
  }

  const TIMELINE_RESTORE_KEY = "ld_timeline_restore_ctx";
  const TIMELINE_RESTORE_TTL = 30 * 60 * 1000;
  const TIMELINE_RESTORE_MAX_TOPICS = 800;

  function readTimelineRestoreContextOnce() {
    try {
      const raw = sessionStorage.getItem(TIMELINE_RESTORE_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(TIMELINE_RESTORE_KEY);
      const data = JSON.parse(raw);
      if (!data?.ts || Date.now() - data.ts > TIMELINE_RESTORE_TTL) return null;
      return data;
    } catch {
      return null;
    }
  }

  // ==================== 状态 ====================
  const DOCK_EDGES = ["top", "right", "bottom", "left"];
  const BALL_SIZE = 46;
  const BALL_HIDE_RATIO = 0.65;
  const PANEL_VIEWPORT_MARGIN = 12;
  const PANEL_MIN_WIDTH = 320;
  const PANEL_MIN_HEIGHT = 280;
  const PANEL_DEFAULT_WIDTH = 390;
  const PANEL_DEFAULT_HEIGHT = 520;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeDockEdge(value, fallback = "right") {
    return DOCK_EDGES.includes(value) ? value : fallback;
  }

  function normalizeDockOffset(value) {
    const num = Number(value);
    return clamp(Number.isFinite(num) ? num : 0.5, 0.05, 0.95);
  }

  function clampPanelWidth(value) {
    const max = Math.max(PANEL_MIN_WIDTH, window.innerWidth - PANEL_VIEWPORT_MARGIN * 2);
    const num = Number(value);
    return Math.round(clamp(Number.isFinite(num) ? num : PANEL_DEFAULT_WIDTH, PANEL_MIN_WIDTH, max));
  }

  function clampPanelHeight(value) {
    const max = Math.max(PANEL_MIN_HEIGHT, window.innerHeight - PANEL_VIEWPORT_MARGIN * 2);
    const num = Number(value);
    return Math.round(clamp(Number.isFinite(num) ? num : PANEL_DEFAULT_HEIGHT, PANEL_MIN_HEIGHT, max));
  }

  const legacyDockEdge = normalizeDockEdge(GM_getValue("ld_ballSide", "right"));
  const legacyDockOffset = normalizeDockOffset(GM_getValue("ld_ballOffset", 0.5));
  const state = {
    ballVisible: true,
    panelOpen: false,
    activeTab: GM_getValue("ld_activeTab", 0),
    dockEdge: normalizeDockEdge(GM_getValue("ld_dockEdge", legacyDockEdge), legacyDockEdge),
    dockOffset: normalizeDockOffset(GM_getValue("ld_dockOffset", legacyDockOffset)),
    panelWidth: clampPanelWidth(GM_getValue("ld_panelWidth", PANEL_DEFAULT_WIDTH)),
    panelHeight: clampPanelHeight(GM_getValue("ld_panelHeight", PANEL_DEFAULT_HEIGHT)),
    theme: GM_getValue("ld_theme", "ocean"),
    username: null,
    userDataCache: null,
    creditLoggedIn: false,
    cdkLoggedIn: false,
    // 时间线
    timelineTopics: [],
    timelinePage: 0,
    timelineLoading: false,
    categoriesMap: null,
    allCategoryIds: [],
    tlFilterCat: "all",
    tlFilterRead: "all",
    timelineRestoreCtx: null,
    shouldAutoOpenPanel: false,
    // 自动刷贴（sessionStorage 窗口独立）
    autoRunning: false,
    isScrolling: false,
    topicList: [],
    sessionReadCount: 0,
    todayReadCount: parseInt(GM_getValue("ld_todayRead_" + new Date().toDateString(), "0")),
    autoLikeEnabled: GM_getValue("ld_autoLike", false),
    quickLikeEnabled: GM_getValue("ld_quickLike", false),
    skipReadEnabled: GM_getValue("ld_skipRead", false),
    topicLimitCount: GM_getValue("ld_topicLimit", 50),
    scrollStartTime: 0,
    lastActionTime: 0,
    accumulatedTime: 0,
    likedTopics: GM_getValue("ld_likedTopics", []),
    navigationGuardInterval: null,
    navigationTimeout: null,
    pageLoadTime: 0,
    lastPageUrl: "",
  };

  const timelineRestoreCtx = readTimelineRestoreContextOnce();
  if (timelineRestoreCtx) {
    if (Array.isArray(timelineRestoreCtx.topics) && timelineRestoreCtx.topics.length) {
      state.timelineTopics = timelineRestoreCtx.topics;
      state.timelinePage = Math.max(0, Number(timelineRestoreCtx.timelinePage) || 0);
    }
    if (timelineRestoreCtx.tlFilterCat != null) state.tlFilterCat = String(timelineRestoreCtx.tlFilterCat);
    if (timelineRestoreCtx.tlFilterRead != null) state.tlFilterRead = String(timelineRestoreCtx.tlFilterRead);
    state.timelineRestoreCtx = timelineRestoreCtx;
    state.activeTab = 1;
    state.shouldAutoOpenPanel = true;
  }

  // ==================== 获取用户名 ====================
  function getCurrentUsername() {
    if (state.username) return state.username;
    try {
      const el = document.getElementById("data-preloaded");
      if (el) {
        const parsed = JSON.parse(el.dataset.preloaded);
        if (parsed.currentUser) {
          const u = JSON.parse(parsed.currentUser);
          if (u?.username) { state.username = u.username; return u.username; }
        }
      }
    } catch {}
    try {
      const a = document.querySelector(".header-dropdown-toggle .current-user a, #current-user a");
      if (a) { const m = a.getAttribute("href")?.match(/\/u\/([^/]+)/); if (m) { state.username = m[1]; return m[1]; } }
    } catch {}
    try {
      const m = document.querySelector('meta[name="discourse-username"]');
      if (m) { state.username = m.content; return m.content; }
    } catch {}
    return null;
  }

  // ==================== DOM 构建 ====================
  function persistDockState() {
    GM_setValue("ld_dockEdge", state.dockEdge);
    GM_setValue("ld_dockOffset", state.dockOffset);
  }

  function persistPanelSize() {
    GM_setValue("ld_panelWidth", state.panelWidth);
    GM_setValue("ld_panelHeight", state.panelHeight);
  }

  function getClosestEdgeFromPoint(x, y) {
    const distances = {
      left: x,
      right: window.innerWidth - x,
      top: y,
      bottom: window.innerHeight - y,
    };
    return Object.entries(distances).sort((a, b) => a[1] - b[1])[0][0];
  }

  function getClosestEdgeFromRect(rect) {
    const distances = {
      left: rect.left,
      right: window.innerWidth - rect.right,
      top: rect.top,
      bottom: window.innerHeight - rect.bottom,
    };
    return Object.entries(distances).sort((a, b) => a[1] - b[1])[0][0];
  }

  function getDockOffsetFromPoint(edge, x, y) {
    return normalizeDockOffset(edge === "left" || edge === "right" ? y / window.innerHeight : x / window.innerWidth);
  }

  function getDockOffsetFromRect(edge, rect) {
    return getDockOffsetFromPoint(edge, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function getResizedDockRect(edge, rect, width, height) {
    if (edge === "left") {
      return { left: rect.left, top: rect.top, right: rect.left + width, bottom: rect.top + height, width, height };
    }
    if (edge === "right") {
      return { left: rect.right - width, top: rect.top, right: rect.right, bottom: rect.top + height, width, height };
    }
    if (edge === "top") {
      return { left: rect.left, top: rect.top, right: rect.left + width, bottom: rect.top + height, width, height };
    }
    return { left: rect.right - width, top: rect.bottom - height, right: rect.right, bottom: rect.bottom, width, height };
  }

  function getResizeCornerByEdge(edge) {
    if (edge === "right") return "bottom-left";
    if (edge === "bottom") return "top-left";
    return "bottom-right";
  }

  // 悬浮球
  const ball = document.createElement("div");
  ball.id = "ld-toolbox-ball";
  ball.innerHTML = '<span class="ball-logo">L</span>';
  document.body.appendChild(ball);

  function positionBall(edge, offset, animate) {
    ball.style.transition = animate ? "" : "none";
    const hideAmount = BALL_SIZE * BALL_HIDE_RATIO;
    const centerX = clamp(offset * window.innerWidth, BALL_SIZE / 2, window.innerWidth - BALL_SIZE / 2);
    const centerY = clamp(offset * window.innerHeight, BALL_SIZE / 2, window.innerHeight - BALL_SIZE / 2);
    ball.classList.remove("side-top", "side-right", "side-bottom", "side-left");
    ball.classList.add(`side-${edge}`);
    ball.style.top = "auto";
    ball.style.right = "auto";
    ball.style.bottom = "auto";
    ball.style.left = "auto";
    if (edge === "left") {
      ball.style.left = `${-hideAmount}px`;
      ball.style.top = `${centerY}px`;
      ball.style.transform = "translateY(-50%)";
    } else if (edge === "right") {
      ball.style.right = `${-hideAmount}px`;
      ball.style.top = `${centerY}px`;
      ball.style.transform = "translateY(-50%)";
    } else if (edge === "top") {
      ball.style.top = `${-hideAmount}px`;
      ball.style.left = `${centerX}px`;
      ball.style.transform = "translateX(-50%)";
    } else {
      ball.style.bottom = `${-hideAmount}px`;
      ball.style.left = `${centerX}px`;
      ball.style.transform = "translateX(-50%)";
    }
    if (!animate) requestAnimationFrame(() => { ball.style.transition = ""; });
  }
  positionBall(state.dockEdge, state.dockOffset, false);

  function syncBallVisibility() {
    const visible = state.ballVisible && !state.panelOpen;
    ball.classList.toggle("hidden", !visible);
    ball.style.opacity = visible ? "1" : "0";
    ball.style.pointerEvents = visible ? "auto" : "none";
  }

  // 拖拽逻辑
  let dragging = false, dragStartX, dragStartY, hasMoved;
  ball.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dragging = true; hasMoved = false;
    dragStartX = e.clientX; dragStartY = e.clientY;
    ball.style.transition = "none";
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasMoved = true;
    if (!hasMoved) return;
    ball.style.left = e.clientX + "px";
    ball.style.right = "auto";
    ball.style.bottom = "auto";
    ball.style.top = e.clientY + "px";
    ball.style.transform = "translate(-50%, -50%)";
  });
  document.addEventListener("mouseup", (e) => {
    if (!dragging) return;
    dragging = false;
    if (!hasMoved) { togglePanel(!state.panelOpen); return; }
    state.dockEdge = getClosestEdgeFromPoint(e.clientX, e.clientY);
    state.dockOffset = getDockOffsetFromPoint(state.dockEdge, e.clientX, e.clientY);
    persistDockState();
    updatePanelSide();
    positionBall(state.dockEdge, state.dockOffset, true);
    applyPanelLayout(true);
  });

  // ESC 提示
  const escHint = document.createElement("div");
  escHint.className = "ld-esc-hint";
  document.body.appendChild(escHint);

  // 面板
  const panel = document.createElement("div");
  panel.id = "ld-toolbox-panel";
  panel.dataset.theme = state.theme;
  panel.className = `side-${state.dockEdge}`;
  panel.dataset.resizeCorner = getResizeCornerByEdge(state.dockEdge);
  panel.innerHTML = `
    <div class="ld-panel-header">
      <span class="title">Linux.do 工具箱</span>
      <div class="ld-header-actions">
        <button class="ld-theme-btn" id="ld-theme-toggle" title="切换主题">${({ dark: "☀️", light: "🌊", ocean: "🌸", pink: "🔴", red: "⬜", white: "🌈", gradient: "✨", particle: "💗", pinkwhite: "👑", royalgold: "🌊", streamline: "🌙" })[state.theme] || "🌸"}</button>
        <button class="ld-panel-close">✕</button>
      </div>
    </div>
    <div class="ld-tab-nav">
      <button class="ld-tab-btn active" data-tab="0">📊 信息</button>
      <button class="ld-tab-btn" data-tab="1">📰 时间线</button>
      <button class="ld-tab-btn" data-tab="2">💬 回复</button>
      <button class="ld-tab-btn" data-tab="3">📖 刷贴</button>
    </div>
    <div class="ld-tab-content active" data-tab="0"><div class="ld-loading"><div class="spinner"></div><div>加载中...</div></div></div>
    <div class="ld-tab-content" data-tab="1"><div class="ld-loading"><div class="spinner"></div><div>加载中...</div></div></div>
    <div class="ld-tab-content" data-tab="2"></div>
    <div class="ld-tab-content" data-tab="3"></div>
    <div class="ld-panel-resizer" aria-hidden="true"></div>
  `;
  document.body.appendChild(panel);
  const panelHeader = panel.querySelector(".ld-panel-header");
  const panelResizer = panel.querySelector(".ld-panel-resizer");

  function getPanelDockMetrics() {
    const width = clampPanelWidth(state.panelWidth);
    const height = clampPanelHeight(state.panelHeight);
    const maxLeft = Math.max(PANEL_VIEWPORT_MARGIN, window.innerWidth - width - PANEL_VIEWPORT_MARGIN);
    const maxTop = Math.max(PANEL_VIEWPORT_MARGIN, window.innerHeight - height - PANEL_VIEWPORT_MARGIN);
    const centerX = clamp(
      state.dockOffset * window.innerWidth,
      PANEL_VIEWPORT_MARGIN + width / 2,
      window.innerWidth - PANEL_VIEWPORT_MARGIN - width / 2
    );
    const centerY = clamp(
      state.dockOffset * window.innerHeight,
      PANEL_VIEWPORT_MARGIN + height / 2,
      window.innerHeight - PANEL_VIEWPORT_MARGIN - height / 2
    );
    const metrics = {
      width,
      height,
      top: "auto",
      right: "auto",
      bottom: "auto",
      left: "auto",
      shiftX: 0,
      shiftY: 0,
    };
    if (state.dockEdge === "left") {
      metrics.left = "0px";
      metrics.top = `${clamp(centerY - height / 2, PANEL_VIEWPORT_MARGIN, maxTop)}px`;
      metrics.shiftX = -(width + PANEL_VIEWPORT_MARGIN * 2);
    } else if (state.dockEdge === "right") {
      metrics.right = "0px";
      metrics.top = `${clamp(centerY - height / 2, PANEL_VIEWPORT_MARGIN, maxTop)}px`;
      metrics.shiftX = width + PANEL_VIEWPORT_MARGIN * 2;
    } else if (state.dockEdge === "top") {
      metrics.top = "0px";
      metrics.left = `${clamp(centerX - width / 2, PANEL_VIEWPORT_MARGIN, maxLeft)}px`;
      metrics.shiftY = -(height + PANEL_VIEWPORT_MARGIN * 2);
    } else {
      metrics.bottom = "0px";
      metrics.left = `${clamp(centerX - width / 2, PANEL_VIEWPORT_MARGIN, maxLeft)}px`;
      metrics.shiftY = height + PANEL_VIEWPORT_MARGIN * 2;
    }
    return metrics;
  }

  function updatePanelSide() {
    panel.classList.remove("side-top", "side-right", "side-bottom", "side-left");
    panel.classList.add(`side-${state.dockEdge}`);
    panel.dataset.resizeCorner = getResizeCornerByEdge(state.dockEdge);
  }

  function syncEffectCanvasSize() {
    const width = Math.max(1, panel.clientWidth || state.panelWidth);
    const height = Math.max(1, panel.clientHeight || state.panelHeight);
    if (particleCanvas) {
      particleCanvas.width = width;
      particleCanvas.height = height;
    }
    if (streamCanvas) {
      streamCanvas.width = width;
      streamCanvas.height = height;
    }
  }

  function applyPanelLayout(animate) {
    const metrics = getPanelDockMetrics();
    state.panelWidth = metrics.width;
    state.panelHeight = metrics.height;
    if (!animate) panel.style.transition = "none";
    updatePanelSide();
    panel.style.width = `${metrics.width}px`;
    panel.style.height = `${metrics.height}px`;
    panel.style.top = metrics.top;
    panel.style.right = metrics.right;
    panel.style.bottom = metrics.bottom;
    panel.style.left = metrics.left;
    panel.style.transform = state.panelOpen
      ? "translate3d(0, 0, 0)"
      : `translate3d(${metrics.shiftX}px, ${metrics.shiftY}px, 0)`;
    panel.style.pointerEvents = state.panelOpen ? "auto" : "none";
    if (!animate) requestAnimationFrame(() => { if (!panel.classList.contains("dragging")) panel.style.transition = ""; });
    syncEffectCanvasSize();
  }

  // ==================== 面板交互 ====================
  let panelDragging = false, panelDragMoved = false, panelDragOffsetX = 0, panelDragOffsetY = 0, panelDragWidth = 0, panelDragHeight = 0;
  let panelResizing = false, resizeStartX = 0, resizeStartY = 0, resizeStartWidth = 0, resizeStartHeight = 0;

  panelHeader.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    const rect = panel.getBoundingClientRect();
    panelDragging = true;
    panelDragMoved = false;
    panelDragOffsetX = e.clientX - rect.left;
    panelDragOffsetY = e.clientY - rect.top;
    panelDragWidth = rect.width;
    panelDragHeight = rect.height;
    panel.classList.add("dragging");
    panel.style.transition = "none";
    e.preventDefault();
  });

  panelResizer.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    panelResizing = true;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeStartWidth = panel.clientWidth || state.panelWidth;
    resizeStartHeight = panel.clientHeight || state.panelHeight;
    panel.classList.add("dragging");
    panel.style.transition = "none";
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener("mousemove", (e) => {
    if (panelDragging) {
      const nextLeft = clamp(
        e.clientX - panelDragOffsetX,
        PANEL_VIEWPORT_MARGIN,
        Math.max(PANEL_VIEWPORT_MARGIN, window.innerWidth - panelDragWidth - PANEL_VIEWPORT_MARGIN)
      );
      const nextTop = clamp(
        e.clientY - panelDragOffsetY,
        PANEL_VIEWPORT_MARGIN,
        Math.max(PANEL_VIEWPORT_MARGIN, window.innerHeight - panelDragHeight - PANEL_VIEWPORT_MARGIN)
      );
      panelDragMoved = true;
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.transform = "translate3d(0, 0, 0)";
      return;
    }
    if (!panelResizing) return;
    const rect = panel.getBoundingClientRect();
    const dx = e.clientX - resizeStartX;
    const dy = e.clientY - resizeStartY;
    const resizeCorner = panel.dataset.resizeCorner || "bottom-right";
    const nextWidth = clampPanelWidth(resizeCorner.includes("left") ? resizeStartWidth - dx : resizeStartWidth + dx);
    const nextHeight = clampPanelHeight(resizeCorner.includes("top") ? resizeStartHeight - dy : resizeStartHeight + dy);
    state.panelWidth = nextWidth;
    state.panelHeight = nextHeight;
    state.dockOffset = getDockOffsetFromRect(state.dockEdge, getResizedDockRect(state.dockEdge, rect, nextWidth, nextHeight));
    applyPanelLayout(false);
  });

  document.addEventListener("mouseup", () => {
    if (panelDragging) {
      panelDragging = false;
      panel.classList.remove("dragging");
      panel.style.transition = "";
      if (panelDragMoved) {
        const rect = panel.getBoundingClientRect();
        state.dockEdge = getClosestEdgeFromRect(rect);
        state.dockOffset = getDockOffsetFromRect(state.dockEdge, rect);
        persistDockState();
        positionBall(state.dockEdge, state.dockOffset, true);
      }
      applyPanelLayout(true);
    }
    if (!panelResizing) return;
    panelResizing = false;
    panel.classList.remove("dragging");
    persistDockState();
    persistPanelSize();
    applyPanelLayout(false);
  });

  panel.querySelector(".ld-panel-close").addEventListener("click", () => togglePanel(false));
  const themeIcons = { dark: "☀️", light: "🌊", ocean: "🌸", pink: "🔴", red: "⬜", white: "🌈", gradient: "✨", particle: "💗", pinkwhite: "👑", royalgold: "🌊", streamline: "🌙" };
  const themeOrder = ["dark", "light", "ocean", "pink", "red", "white", "gradient", "particle", "pinkwhite", "royalgold", "streamline"];
  document.getElementById("ld-theme-toggle").addEventListener("click", () => {
    const oldTheme = state.theme;
    const idx = (themeOrder.indexOf(state.theme) + 1) % themeOrder.length;
    state.theme = themeOrder[idx];
    panel.dataset.theme = state.theme;
    document.getElementById("ld-theme-toggle").textContent = themeIcons[state.theme];
    GM_setValue("ld_theme", state.theme);
    // 特效控制
    if (state.theme === "particle") startParticles();
    else if (oldTheme === "particle") stopParticles();
    if (state.theme === "streamline") startStreamlines();
    else if (oldTheme === "streamline") stopStreamlines();
  });

  // ── 紫色粒子特效 ──
  let particleCanvas = null, particleCtx = null, particleRAF = null, particles = [];
  function startParticles() {
    stopParticles();
    particleCanvas = document.createElement("canvas");
    particleCanvas.id = "ld-particle-canvas";
    panel.insertBefore(particleCanvas, panel.firstChild);
    particleCtx = particleCanvas.getContext("2d");
    const resize = () => { particleCanvas.width = panel.offsetWidth; particleCanvas.height = panel.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);
    particleCanvas._resize = resize;
    particles = [];
    for (let i = 0; i < 60; i++) particles.push(makeParticle());
    (function loop() {
      particleRAF = requestAnimationFrame(loop);
      particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.life -= p.decay;
        if (p.life <= 0 || p.x < -10 || p.x > particleCanvas.width + 10 || p.y < -10 || p.y > particleCanvas.height + 10) {
          Object.assign(p, makeParticle());
        }
        particleCtx.save();
        particleCtx.globalAlpha = p.life * 0.8;
        particleCtx.shadowColor = p.color;
        particleCtx.shadowBlur = p.size * 3;
        particleCtx.fillStyle = p.color;
        particleCtx.beginPath();
        particleCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        particleCtx.fill();
        particleCtx.restore();
      });
    })();
  }
  function makeParticle() {
    const colors = ["#a855f7", "#c084fc", "#e9d5ff", "#7c3aed", "#d946ef", "#f0abfc"];
    return {
      x: Math.random() * (panel.offsetWidth || 380),
      y: Math.random() * (panel.offsetHeight || 520),
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6 - 0.2,
      size: Math.random() * 2.5 + 1,
      life: Math.random() * 0.6 + 0.4,
      decay: Math.random() * 0.003 + 0.001,
      color: colors[Math.floor(Math.random() * colors.length)]
    };
  }
  function stopParticles() {
    if (particleRAF) { cancelAnimationFrame(particleRAF); particleRAF = null; }
    if (particleCanvas) {
      if (particleCanvas._resize) window.removeEventListener("resize", particleCanvas._resize);
      particleCanvas.remove(); particleCanvas = null; particleCtx = null;
    }
    particles = [];
  }
  // 页面加载时如果已经是粒子主题则启动
  if (state.theme === "particle") startParticles();

  // ── 蓝白绿流线拖尾特效 ──
  let streamCanvas = null, streamCtx = null, streamRAF = null, streamLines = [];
  function startStreamlines() {
    stopStreamlines();
    streamCanvas = document.createElement("canvas");
    streamCanvas.id = "ld-stream-canvas";
    panel.insertBefore(streamCanvas, panel.firstChild);
    streamCtx = streamCanvas.getContext("2d");
    const resize = () => { streamCanvas.width = panel.offsetWidth; streamCanvas.height = panel.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);
    streamCanvas._resize = resize;
    streamLines = [];
    for (let i = 0; i < 25; i++) streamLines.push(makeStreamLine());
    (function loop() {
      streamRAF = requestAnimationFrame(loop);
      // 半透明覆盖实现拖尾（亮色背景）
      streamCtx.fillStyle = "rgba(227, 240, 255, 0.12)";
      streamCtx.fillRect(0, 0, streamCanvas.width, streamCanvas.height);
      streamLines.forEach(s => {
        // 保存历史轨迹
        s.trail.push({ x: s.x, y: s.y });
        if (s.trail.length > s.maxTrail) s.trail.shift();
        // 正弦波动 + 前进
        s.angle += s.curve;
        s.x += Math.cos(s.angle) * s.speed;
        s.y += s.vy;
        s.life -= s.decay;
        if (s.life <= 0 || s.y < -20 || s.y > streamCanvas.height + 20 || s.x < -40 || s.x > streamCanvas.width + 40) {
          Object.assign(s, makeStreamLine());
          s.trail = [];
        }
        // 绘制拖尾线条
        if (s.trail.length > 2) {
          streamCtx.save();
          streamCtx.strokeStyle = s.color;
          streamCtx.shadowColor = s.color;
          streamCtx.shadowBlur = 8;
          streamCtx.lineWidth = s.width;
          streamCtx.lineCap = "round";
          streamCtx.globalAlpha = s.life * 0.7;
          streamCtx.beginPath();
          streamCtx.moveTo(s.trail[0].x, s.trail[0].y);
          for (let i = 1; i < s.trail.length; i++) {
            const prev = s.trail[i - 1], cur = s.trail[i];
            streamCtx.quadraticCurveTo(prev.x, prev.y, (prev.x + cur.x) / 2, (prev.y + cur.y) / 2);
          }
          streamCtx.stroke();
          // 头部亮点
          streamCtx.globalAlpha = s.life;
          streamCtx.fillStyle = "#fff";
          streamCtx.shadowBlur = 12;
          streamCtx.beginPath();
          streamCtx.arc(s.x, s.y, s.width * 0.8, 0, Math.PI * 2);
          streamCtx.fill();
          streamCtx.restore();
        }
      });
    })();
  }
  function makeStreamLine() {
    const colors = ["#0891b2", "#0d9488", "#2563eb", "#0284c7", "#059669", "#1e7bb8", "#3b82f6", "#10b981"];
    const w = panel.offsetWidth || 380, h = panel.offsetHeight || 520;
    const goingDown = Math.random() > 0.3;
    return {
      x: Math.random() * w,
      y: goingDown ? -10 : h + 10,
      vy: goingDown ? (Math.random() * 1.2 + 0.4) : -(Math.random() * 1.2 + 0.4),
      speed: Math.random() * 0.8 + 0.3,
      angle: Math.random() * Math.PI * 2,
      curve: (Math.random() - 0.5) * 0.04,
      width: Math.random() * 1.5 + 0.5,
      life: Math.random() * 0.5 + 0.5,
      decay: Math.random() * 0.002 + 0.0008,
      maxTrail: Math.floor(Math.random() * 25) + 15,
      trail: [],
      color: colors[Math.floor(Math.random() * colors.length)]
    };
  }
  function stopStreamlines() {
    if (streamRAF) { cancelAnimationFrame(streamRAF); streamRAF = null; }
    if (streamCanvas) {
      if (streamCanvas._resize) window.removeEventListener("resize", streamCanvas._resize);
      streamCanvas.remove(); streamCanvas = null; streamCtx = null;
    }
    streamLines = [];
  }
  // 页面加载时如果已经是流线主题则启动
  if (state.theme === "streamline") startStreamlines();

  const tabBtns = panel.querySelectorAll(".ld-tab-btn");
  const tabContents = panel.querySelectorAll(".ld-tab-content");
  tabBtns.forEach((b) => b.addEventListener("click", () => switchTab(parseInt(b.dataset.tab))));

  if (typeof ResizeObserver === "function") {
    const panelResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || panelDragging) return;
      const width = clampPanelWidth(entry.contentRect.width);
      const height = clampPanelHeight(entry.contentRect.height);
      if (width !== state.panelWidth || height !== state.panelHeight) {
        state.panelWidth = width;
        state.panelHeight = height;
        persistPanelSize();
        applyPanelLayout(false);
      } else {
        syncEffectCanvasSize();
      }
    });
    panelResizeObserver.observe(panel);
  }

  window.addEventListener("resize", () => {
    state.panelWidth = clampPanelWidth(state.panelWidth);
    state.panelHeight = clampPanelHeight(state.panelHeight);
    persistPanelSize();
    positionBall(state.dockEdge, state.dockOffset, false);
    applyPanelLayout(false);
  });

  function switchTab(i) {
    state.activeTab = i;
    GM_setValue("ld_activeTab", i);
    tabBtns.forEach((b) => b.classList.remove("active"));
    tabContents.forEach((c) => c.classList.remove("active"));
    tabBtns[i].classList.add("active");
    tabContents[i].classList.add("active");
    if (i === 0) loadUserInfo();
    if (i === 1 && !state.timelineTopics.length) loadTimeline();
    else if (i === 1) {
      if (!state.categoriesMap) ensureCategories().then(() => renderTimeline());
      else renderTimeline();
    }
    if (i === 2) renderQuickReplyTab();
    if (i === 3) renderAutoReadTab();
  }

  function togglePanel(open) {
    state.panelOpen = open;
    panel.classList.toggle("open", open);
    applyPanelLayout(true);
    syncBallVisibility();
    if (open) switchTab(state.activeTab);
  }

  let escTimer = null;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (state.panelOpen) { togglePanel(false); return; }
      state.ballVisible = !state.ballVisible;
      syncBallVisibility();
      escHint.textContent = state.ballVisible ? "工具箱已显示" : "工具箱已隐藏 (按 ESC 恢复)";
      escHint.classList.add("show");
      clearTimeout(escTimer);
      escTimer = setTimeout(() => escHint.classList.remove("show"), 1200);
    }
  });

  if (state.shouldAutoOpenPanel) {
    applyPanelLayout(false);
    togglePanel(true);
    state.shouldAutoOpenPanel = false;
  } else {
    applyPanelLayout(false);
    syncBallVisibility();
    switchTab(state.activeTab);
  }

  // ==================== Tab1: 个人信息 ====================
  async function loadUserInfo(force = false) {
    const ct = tabContents[0];
    const username = getCurrentUsername();
    if (!username) { ct.innerHTML = '<div class="ld-loading">请先登录 linux.do</div>'; return; }
    if (state.userDataCache && !force) { renderUserInfo(); return; }
    ct.innerHTML = '<div class="ld-loading"><div class="spinner"></div><div>加载用户数据...</div></div>';
    try {
      const [profileData, summaryData] = await Promise.all([
        safeFetchJson(`${BASE_URL}/u/${encodeURIComponent(username)}.json`),
        safeFetchJson(`${BASE_URL}/u/${encodeURIComponent(username)}/summary.json`),
      ]);
      let connectData = null;
      try { connectData = await gmFetchHtml("https://connect.linux.do/"); } catch {}
      state.userDataCache = {
        user: profileData?.user || profileData,
        summary: summaryData?.user_summary || summaryData?.summary || summaryData,
        connectData, username,
      };
      renderUserInfo();
      loadCreditInfo();
      loadCdkInfo();
    } catch (e) {
      console.error("[工具箱] 加载用户信息失败:", e);
      ct.innerHTML = '<div class="ld-loading">加载失败，请稍后重试</div>';
    }
  }

  function renderUserInfo() {
    const ct = tabContents[0];
    const { user, summary, connectData, username } = state.userDataCache;
    const tl = user?.trust_level ?? summary?.trust_level ?? 0;
    const levelName = TRUST_LEVEL_NAMES[tl] || `Lv${tl}`;
    const avatar = user?.avatar_template ? BASE_URL + user.avatar_template.replace("{size}", "96") : "";
    const s = summary || {};

    let html = `
      <div class="ld-user-header">
        ${avatar ? `<img class="ld-user-avatar" src="${avatar}" alt="">` : ""}
        <div>
          <div class="ld-user-name">${escapeHtml(user?.name || username)}</div>
          <div class="ld-user-level">${levelName} · @${escapeHtml(username)}</div>
        </div>
      </div>
      <div class="ld-user-stats">
        <div class="ld-stat-card"><div class="ld-stat-value">${(s.topic_count ?? user?.topic_count ?? 0).toLocaleString()}</div><div class="ld-stat-label">发帖</div></div>
        <div class="ld-stat-card"><div class="ld-stat-value">${(s.post_count ?? user?.post_count ?? 0).toLocaleString()}</div><div class="ld-stat-label">回帖</div></div>
        <div class="ld-stat-card"><div class="ld-stat-value">${(s.likes_given ?? 0).toLocaleString()}</div><div class="ld-stat-label">送赞</div></div>
        <div class="ld-stat-card"><div class="ld-stat-value">${(s.likes_received ?? 0).toLocaleString()}</div><div class="ld-stat-label">获赞</div></div>
      </div>
    `;

    // === 升级条件（折叠） ===
    const upgradeBrief = getUpgradeBrief(tl, state.userDataCache);
    html += `<div class="ld-section-title">
      <span>升级条件</span>
      <div>
        <span class="ld-brief-val" style="font-size:11px;color:var(--text-3);">${upgradeBrief}</span>
        <button class="ld-expand-btn" data-target="ld-upgrade-detail">▶</button>
        <button class="ld-refresh-btn" data-action="refresh-all">刷新</button>
      </div>
    </div>`;
    html += `<div id="ld-upgrade-detail" class="ld-detail-section collapsed">`;
    html += renderUpgradeProgress(tl, state.userDataCache);
    html += `</div>`;

    // === 积分（折叠） ===
    html += `<div class="ld-section-title">
      <span>💰 Credit 积分</span>
      <div>
        <span class="ld-brief-val ld-brief-jump" id="ld-credit-brief" data-jump="credit">--</span>
        <button class="ld-jump-btn" data-jump="credit">登录</button>
        <button class="ld-expand-btn" data-target="ld-credit-detail">▶</button>
        <button class="ld-refresh-btn" data-action="refresh-credit">刷新</button>
      </div>
    </div>`;
    html += `<div id="ld-credit-detail" class="ld-detail-section collapsed">`;
    html += `<div id="ld-credit-area" class="ld-card"><div class="ld-loading" style="padding:10px;">加载中...</div></div>`;
    html += `</div>`;

    // === CDK（折叠） ===
    html += `<div class="ld-section-title">
      <span>🎮 CDK 分数</span>
      <div>
        <span class="ld-brief-val cyan ld-brief-jump" id="ld-cdk-brief" data-jump="cdk">--</span>
        <button class="ld-jump-btn" data-jump="cdk">登录</button>
        <button class="ld-expand-btn" data-target="ld-cdk-detail">▶</button>
        <button class="ld-refresh-btn" data-action="refresh-cdk">刷新</button>
      </div>
    </div>`;
    html += `<div id="ld-cdk-detail" class="ld-detail-section collapsed">`;
    html += `<div id="ld-cdk-area" class="ld-card"><div class="ld-loading" style="padding:10px;">加载中...</div></div>`;
    html += `</div>`;

    ct.innerHTML = html;

    // 绑定展开/折叠按钮
    ct.querySelectorAll(".ld-expand-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const collapsed = target.classList.toggle("collapsed");
        btn.textContent = collapsed ? "▶" : "▼";
      });
    });

    // 绑定刷新按钮
    ct.querySelectorAll(".ld-refresh-btn").forEach((b) => {
      if (b.dataset.action === "refresh-credit") b.addEventListener("click", () => loadCreditInfo(true));
      else if (b.dataset.action === "refresh-cdk") b.addEventListener("click", () => loadCdkInfo(true));
      else if (b.dataset.action === "refresh-all") b.addEventListener("click", () => { state.userDataCache = null; loadUserInfo(true); });
    });

    // 绑定跳转：未登录去登录页，已登录去详情页
    ct.querySelectorAll(".ld-jump-btn, .ld-brief-jump").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        openInfoSite(el.dataset.jump);
      });
    });
    syncInfoJumpButtons();
  }

  function getUpgradeBrief(tl, data) {
    const { summary, connectData } = data;
    if (connectData && tl >= 2) {
      const r = parseConnectData(connectData, tl);
      if (r) {
        const met = r.requirements.filter((i) => i.isMet).length;
        return met === r.requirements.length ? "✅ 已满足" : `${met}/${r.requirements.length}`;
      }
    }
    if (tl <= 1 && LEVEL_REQUIREMENTS[tl]) {
      const reqs = LEVEL_REQUIREMENTS[tl];
      const s = summary || {};
      let met = 0, total = 0;
      for (const [key, cfg] of Object.entries(reqs)) {
        total++;
        const cur = key === "time_read" ? Math.floor((s.time_read || 0) / 60) : (s[key] ?? 0);
        if (cur >= cfg.required) met++;
      }
      return met === total ? "✅ 已满足" : `${met}/${total}`;
    }
    return TRUST_LEVEL_NAMES[tl] || `Lv${tl}`;
  }

  function renderUpgradeProgress(tl, data) {
    const { summary, connectData } = data;
    let html = "";

    if (connectData && tl >= 2) {
      const r = parseConnectData(connectData, tl);
      if (r) {
        html += `<div class="ld-section-title"><span>升级到 Lv${r.targetLevel} 的条件</span><button class="ld-refresh-btn">刷新</button></div>`;
        html += renderProgressItems(r.requirements);
        html += renderMetSummary(r.requirements, r.targetLevel);
        return html;
      }
    }

    if (tl <= 1 && LEVEL_REQUIREMENTS[tl]) {
      const reqs = LEVEL_REQUIREMENTS[tl];
      const target = tl + 1;
      const items = [];
      for (const [key, cfg] of Object.entries(reqs)) {
        let cur = key === "time_read" ? Math.floor((summary?.time_read || 0) / 60) : (summary?.[key] ?? 0);
        items.push({ name: cfg.label, current: cur, required: cfg.required, isMet: cur >= cfg.required });
      }
      html += `<div class="ld-section-title"><span>升级到 Lv${target} 的条件</span><button class="ld-refresh-btn">刷新</button></div>`;
      html += renderProgressItems(items);
      html += renderMetSummary(items, target);
      return html;
    }

    if (tl >= 2) {
      html += `<div class="ld-section-title"><span>等级信息</span><button class="ld-refresh-btn">刷新</button></div>`;
      html += `<div class="ld-met-summary not-met">当前 ${TRUST_LEVEL_NAMES[tl] || `Lv${tl}`} · 高级等级详情需从 connect.linux.do 获取</div>`;
    }
    return html;
  }

  function parseConnectData(htmlStr, currentLevel) {
    try {
      const tmp = document.createElement("div");
      tmp.innerHTML = htmlStr;
      let target = null;
      for (const div of tmp.querySelectorAll("div")) {
        const h = div.querySelector("h1, h2, h3");
        if (h && h.textContent.includes("信任级别") && h.textContent.includes("的要求")) { target = div; break; }
      }
      if (!target) return null;
      const h2 = target.querySelector("h2, h1, h3");
      const m = h2?.textContent.match(/信任级别\s*(\d+)\s*的要求/);
      const targetLevel = m ? parseInt(m[1]) : currentLevel + 1;
      const requirements = [];
      target.querySelectorAll(".tl3-ring").forEach((r) => {
        const l = r.querySelector(".tl3-ring-label"), c = r.querySelector(".tl3-ring-current"), t = r.querySelector(".tl3-ring-target"), ci = r.querySelector(".tl3-ring-circle");
        if (l && c) requirements.push({ name: l.textContent.trim(), current: parseInt(c.textContent) || 0, required: t ? parseInt(t.textContent.replace(/^[\s/]+/, "")) || 0 : 0, isMet: ci?.classList.contains("met") || false });
      });
      target.querySelectorAll(".tl3-bar-item").forEach((b) => {
        const l = b.querySelector(".tl3-bar-label"), n = b.querySelector(".tl3-bar-nums");
        if (l && n) { const p = n.textContent.trim().split("/"); requirements.push({ name: l.textContent.trim(), current: parseInt(p[0]) || 0, required: parseInt(p[1]) || 0, isMet: n.classList.contains("met") }); }
      });
      target.querySelectorAll(".tl3-quota-card").forEach((q) => {
        const l = q.querySelector(".tl3-quota-label"), n = q.querySelector(".tl3-quota-nums");
        if (l && n) { const p = n.textContent.trim().split("/"); requirements.push({ name: l.textContent.trim(), current: parseInt(p[0]) || 0, required: parseInt(p[1]) || 0, isMet: q.classList.contains("met") }); }
      });
      target.querySelectorAll(".tl3-veto-item").forEach((v) => {
        const l = v.querySelector(".tl3-veto-label"), val = v.querySelector(".tl3-veto-value");
        if (l && val) requirements.push({ name: l.textContent.trim(), current: parseInt(val.textContent) || 0, required: 0, isMet: v.classList.contains("met") });
      });
      if (!requirements.length) {
        target.querySelectorAll("table tbody tr").forEach((row) => {
          const c = row.querySelectorAll("td");
          if (c.length >= 3) requirements.push({ name: c[0].textContent.trim(), current: parseInt(c[2].textContent) || 0, required: parseInt(c[1].textContent) || 0, isMet: c[2].classList.contains("status-met") || c[2].classList.contains("text-green-500") });
        });
      }
      return requirements.length ? { targetLevel, requirements } : null;
    } catch { return null; }
  }

  function renderProgressItems(items) {
    return items.map((i) => {
      const p = i.required > 0 ? Math.min((i.current / i.required) * 100, 100) : i.isMet ? 100 : 0;
      const name = i.name.replace("已读帖子（所有时间）", "已读帖子").replace("浏览的话题（所有时间）", "浏览话题").replace(/访问次数（过去(\d+)个月）/, "访问次数($1月)").replace(/回复次数（最近(\d+)天内）/, "回复(近$1天)");
      return `<div class="ld-progress-item"><div class="ld-progress-label"><span class="ld-progress-name">${escapeHtml(name)}</span><span class="ld-progress-value">${i.current}/${i.required}</span></div><div class="ld-progress-bar"><div class="ld-progress-fill ${i.isMet ? "completed" : ""}" style="width:${p}%"></div></div></div>`;
    }).join("");
  }

  function renderMetSummary(items, target) {
    const met = items.filter((i) => i.isMet).length;
    return met === items.length
      ? `<div class="ld-met-summary all-met">已满足 Lv${target} 所有要求 (${met}/${items.length})</div>`
      : `<div class="ld-met-summary not-met">还需完成 ${items.length - met} 项升级到 Lv${target} (${met}/${items.length})</div>`;
  }

  // --- Credit 积分（参照小助手） ---
  function fetchCreditUserInfo() {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: "https://credit.linux.do/api/v1/oauth/user-info",
        anonymous: false, timeout: 15000,
        headers: { Accept: "application/json", Referer: "https://credit.linux.do/home", Origin: "https://credit.linux.do" },
        onload: (r) => {
          if (r.status === 200) {
            try { const j = JSON.parse(r.responseText); resolve(j?.data || null); return; } catch {}
          }
          resolve(null);
        },
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    });
  }

  function fetchCreditDailyStats() {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: "https://credit.linux.do/api/v1/dashboard/stats/daily?days=7",
        anonymous: false, timeout: 15000,
        headers: { Accept: "application/json", Referer: "https://credit.linux.do/home", Origin: "https://credit.linux.do" },
        onload: (r) => {
          if (r.status === 200) {
            try { const j = JSON.parse(r.responseText); resolve(j?.data || []); return; } catch {}
          }
          resolve([]);
        },
        onerror: () => resolve([]),
        ontimeout: () => resolve([]),
      });
    });
  }

  function fetchLeaderboardData() {
    return new Promise((resolve) => {
      const cooldownUntil = GM_getValue("ld_lb429Until", 0);
      if (cooldownUntil > Date.now()) {
        resolve(GM_getValue("ld_lbCache", null));
        return;
      }
      let got429 = false;
      Promise.all([
        fetch(`${BASE_URL}/leaderboard/1?period=daily`, { credentials: "include", headers: { Accept: "application/json" } })
          .then((r) => { if (r.status === 429) { got429 = true; return null; } return r.ok ? r.json() : null; }).catch(() => null),
        fetch(`${BASE_URL}/leaderboard/1?period=all`, { credentials: "include", headers: { Accept: "application/json" } })
          .then((r) => { if (r.status === 429) { got429 = true; return null; } return r.ok ? r.json() : null; }).catch(() => null),
      ]).then(([daily, all]) => {
        if (got429) GM_setValue("ld_lb429Until", Date.now() + 30 * 60 * 1000);
        const dailyScore = daily?.personal?.user?.total_score || 0;
        const totalCredits = all?.personal?.user?.total_score || 0;
        const rank = all?.personal?.position || all?.personal?.user?.position || 0;
        if (totalCredits || rank) {
          const result = { totalCredits, rank, dailyScore };
          GM_setValue("ld_lbCache", result);
          resolve(result);
        } else {
          resolve(GM_getValue("ld_lbCache", null));
        }
      }).catch(() => resolve(null));
    });
  }

  async function loadCreditInfo(isRefresh = false) {
    const area = document.getElementById("ld-credit-area");
    if (!area) return;

    const cacheKey = "ld_creditCache";
    const cacheTimeKey = "ld_creditCacheTime";
    const MIN_INTERVAL = 30 * 60 * 1000;

    if (!isRefresh) {
      const cached = GM_getValue(cacheKey, null);
      const cachedTime = GM_getValue(cacheTimeKey, 0);
      if (cached && (Date.now() - cachedTime) < MIN_INTERVAL) {
        renderCreditInfo(area, cached.userData, cached.dailyStats, cached.leaderboard);
        return;
      }
    }

    area.innerHTML = '<div style="text-align:center;padding:8px;font-size:12px;color:var(--text-4);">加载积分数据...</div>';

    const userData = await fetchCreditUserInfo();
    if (!userData) {
      state.creditLoggedIn = false;
      syncInfoJumpButtons();
      updateBriefVal("ld-credit-brief", "未登录");
      area.innerHTML = `<div class="ld-login-prompt">未登录 credit.linux.do<br><a href="https://credit.linux.do" target="_blank" class="ld-login-btn">去登录</a></div>`;
      return;
    }

    const [dailyStats, leaderboard] = await Promise.all([
      fetchCreditDailyStats(),
      fetchLeaderboardData(),
    ]);

    GM_setValue(cacheKey, { userData, dailyStats, leaderboard });
    GM_setValue(cacheTimeKey, Date.now());

    renderCreditInfo(area, userData, dailyStats, leaderboard);
  }

  function updateBriefVal(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function getInfoSiteUrl(type) {
    if (type === "credit") return state.creditLoggedIn ? "https://credit.linux.do/home" : "https://credit.linux.do";
    if (type === "cdk") return state.cdkLoggedIn ? "https://cdk.linux.do/dashboard" : "https://cdk.linux.do";
    return "";
  }

  function openInfoSite(type) {
    const url = getInfoSiteUrl(type);
    if (!url) return;
    window.open(url, "_blank", "noopener");
  }

  function syncInfoJumpButtons() {
    [
      { type: "credit", loggedIn: state.creditLoggedIn },
      { type: "cdk", loggedIn: state.cdkLoggedIn },
    ].forEach(({ type, loggedIn }) => {
      const btn = document.querySelector(`.ld-jump-btn[data-jump="${type}"]`);
      if (btn) {
        btn.textContent = loggedIn ? "详情" : "登录";
        btn.title = loggedIn ? "已登录，点击查看详情页" : "未登录，点击前往登录页";
      }
      const brief = document.querySelector(`.ld-brief-jump[data-jump="${type}"]`);
      if (brief) brief.title = loggedIn ? "已登录，点击查看详情页" : "未登录，点击前往登录页";
    });
  }

  function renderCreditInfo(area, userData, dailyStats, leaderboard) {
    state.creditLoggedIn = true;
    syncInfoJumpButtons();
    const balance = userData.available_balance || "0";
    const communityBalance = userData.community_balance || "0";
    const dailyLimit = userData.remain_quota || "0";
    const incomeTotal = userData.total_receive || "0";
    const expenseTotal = userData.total_payment || "0";

    // 更新简要值
    updateBriefVal("ld-credit-brief", balance);

    let h = `<div class="ld-credit-main"><div class="lbl">可用积分</div><div class="val" style="color:var(--gold);font-size:28px;">${escapeHtml(balance)}</div></div>`;

    if (leaderboard) {
      const tomorrowCredits = (leaderboard.totalCredits - parseFloat(communityBalance)).toFixed(0);
      h += `<div class="ld-credit-main ld-credit-gold"><div class="lbl">明日积分（预估）</div><div class="val">${escapeHtml(tomorrowCredits)}</div></div>`;
      h += `<div class="ld-info-row"><span class="label">当前点数</span><span class="value" style="color:var(--gold);">${escapeHtml(leaderboard.totalCredits)} <span style="color:var(--cyan);font-weight:normal;font-size:11px;">#${escapeHtml(leaderboard.rank)}</span></span></div>`;
      h += `<div class="ld-info-row"><span class="label">昨日点数</span><span class="value" style="color:var(--green);">${escapeHtml(communityBalance)}</span></div>`;
    }

    h += `<div class="ld-info-row"><span class="label">每日额度</span><span class="value">${escapeHtml(dailyLimit)}</span></div>`;
    h += `<div class="ld-info-row"><span class="label">总收入</span><span class="value" style="color:var(--green);">+${escapeHtml(incomeTotal)}</span></div>`;
    h += `<div class="ld-info-row"><span class="label">总支出</span><span class="value" style="color:var(--red);">-${escapeHtml(expenseTotal)}</span></div>`;

    // 近7天收支
    if (dailyStats && dailyStats.length > 0) {
      const incomeList = [], expenseList = [];
      dailyStats.forEach((item) => {
        const date = item.date.substring(5).replace("-", "/");
        const income = parseFloat(item.income) || 0;
        const expense = parseFloat(item.expense) || 0;
        if (income !== 0) incomeList.push({ date, amount: income > 0 ? "+" + income.toFixed(2) : income.toFixed(2), neg: income < 0 });
        if (expense > 0) expenseList.push({ date, amount: "-" + expense.toFixed(2) });
      });
      incomeList.reverse();
      expenseList.reverse();

      if (incomeList.length) {
        h += `<div class="ld-sub-title">近7天收入</div>`;
        incomeList.slice(0, 5).forEach((i) => {
          h += `<div class="ld-info-row"><span class="label">${escapeHtml(i.date)}${i.neg ? " (扣除)" : ""}</span><span class="value" style="color:${i.neg ? "var(--red)" : "var(--green)"};">${escapeHtml(i.amount)}</span></div>`;
        });
      }
      if (expenseList.length) {
        h += `<div class="ld-sub-title">近7天支出</div>`;
        expenseList.slice(0, 3).forEach((i) => {
          h += `<div class="ld-info-row"><span class="label">${escapeHtml(i.date)}</span><span class="value" style="color:var(--red);">${escapeHtml(i.amount)}</span></div>`;
        });
      }
    }

    h += `<div style="text-align:right;margin-top:6px;"><a href="https://credit.linux.do/home" target="_blank" class="ld-link-btn">查看详情 →</a></div>`;
    area.innerHTML = h;
  }

  // --- CDK 分数（照搬小助手 Bridge 机制） ---
  let cdkBridgeInit = false, cdkWaiters = [], cdkBridgeFrame = null;

  function ensureCdkBridge() {
    if (cdkBridgeInit) return;
    cdkBridgeInit = true;
    // 监听来自 iframe 的消息
    window.addEventListener("message", (event) => {
      if (event.origin !== "https://cdk.linux.do") return;
      const payload = event.data?.payload || event.data;
      if (!payload?.data) return;
      console.log("[工具箱 CDK] 收到 Bridge 数据");
      GM_setValue("lda_cdk_cache", { data: payload.data, ts: Date.now() });
      const waiters = [...cdkWaiters];
      cdkWaiters = [];
      waiters.forEach(fn => fn(payload.data));
    });
    // 创建隐藏 iframe
    const iframe = document.createElement("iframe");
    iframe.id = "lda-cdk-bridge";
    iframe.src = "https://cdk.linux.do/dashboard";
    iframe.style.cssText = "width:0;height:0;opacity:0;position:absolute;border:0;pointer-events:none;";
    document.body.appendChild(iframe);
    cdkBridgeFrame = iframe;
  }

  function fetchCdkViaBridge() {
    return new Promise((resolve, reject) => {
      ensureCdkBridge();
      const timer = setTimeout(() => {
        cdkWaiters = cdkWaiters.filter(fn => fn !== done);
        reject(new Error("CDK bridge timeout"));
      }, 8000);
      const done = (data) => { clearTimeout(timer); resolve(data); };
      cdkWaiters.push(done);
      try { cdkBridgeFrame?.contentWindow?.postMessage({ type: "lda-cdk-request" }, "https://cdk.linux.do"); } catch (_) {}
    });
  }

  function fetchCdkDirect() {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: "https://cdk.linux.do/api/v1/oauth/user-info",
        anonymous: false, timeout: 10000,
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        onload: (r) => {
          if (r.responseText && r.responseText.includes("Just a moment")) { resolve(null); return; }
          if (r.status === 401 || r.status === 403) { resolve(null); return; }
          if (r.status >= 200 && r.status < 300) {
            try {
              const j = JSON.parse(r.responseText);
              resolve(j?.data || (j?.username ? j : null));
              return;
            } catch {}
          }
          resolve(null);
        },
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    });
  }

  async function loadCdkInfo(isRefresh = false) {
    const area = document.getElementById("ld-cdk-area");
    if (!area) return;

    // 1. 先检查 GM 缓存（5分钟内有效）
    const cache = GM_getValue("lda_cdk_cache", null);
    if (!isRefresh && cache?.data && cache.ts && Date.now() - cache.ts < 5 * 60 * 1000) {
      console.log("[工具箱 CDK] 使用 GM 缓存");
      renderCdkInfo(area, cache.data);
      return;
    }

    area.innerHTML = '<div style="text-align:center;padding:8px;font-size:12px;color:var(--text-4);">加载 CDK 数据...</div>';

    // 2. 尝试直接 API 请求
    try {
      const directResult = await fetchCdkDirect();
      if (directResult) {
        console.log("[工具箱 CDK] 直接请求成功");
        const cacheData = { user: directResult, received: null };
        GM_setValue("lda_cdk_cache", { data: cacheData, ts: Date.now() });
        renderCdkInfo(area, cacheData);
        return;
      }
    } catch (e) {
      console.log("[工具箱 CDK] 直接请求失败:", e.message);
    }

    // 3. 使用 iframe Bridge 方式
    try {
      const bridgeResult = await fetchCdkViaBridge();
      if (bridgeResult) {
        console.log("[工具箱 CDK] Bridge 请求成功");
        renderCdkInfo(area, bridgeResult);
        return;
      }
    } catch (e) {
      console.log("[工具箱 CDK] Bridge 请求失败:", e.message);
    }

    // 4. 最后检查旧缓存
    if (cache?.data) {
      console.log("[工具箱 CDK] 使用旧缓存");
      renderCdkInfo(area, cache.data);
      return;
    }

    state.cdkLoggedIn = false;
    syncInfoJumpButtons();
    updateBriefVal("ld-cdk-brief", "未登录");
    area.innerHTML = `<div class="ld-login-prompt">未登录/无法连接 CDK<br><a href="https://cdk.linux.do" target="_blank" class="ld-login-btn ld-cdk-login-btn">去授权</a></div>`;
  }

  function renderCdkInfo(area, cdkData) {
    state.cdkLoggedIn = true;
    syncInfoJumpButtons();
    const userData = cdkData.user || cdkData;
    const receivedData = cdkData.received || null;
    const score = userData.score || 0;
    const trustLevel = userData.trust_level ?? userData.trustLevel ?? "-";
    const username = userData.username || "-";
    const nickname = userData.nickname || userData.name || username;

    // 更新简要值
    updateBriefVal("ld-cdk-brief", score);

    let h = `<div class="ld-credit-main" style="border-color:rgba(34,211,238,.3);"><div class="lbl">CDK 分数</div><div class="val" style="color:var(--cyan);font-size:32px;text-shadow:0 0 10px rgba(34,211,238,.3);">${escapeHtml(score)}</div></div>`;
    h += `<div class="ld-info-row"><span class="label">信任等级</span><span class="value" style="color:var(--cyan);font-weight:700;">Lv${escapeHtml(trustLevel)}</span></div>`;
    h += `<div class="ld-info-row"><span class="label">用户名</span><span class="value">${escapeHtml(username)}</span></div>`;
    h += `<div class="ld-info-row"><span class="label">昵称</span><span class="value">${escapeHtml(nickname)}</span></div>`;
    h += `<div style="font-size:10px;color:var(--text-5);margin-top:6px;padding:6px 8px;background:var(--bg-card);border-radius:6px;">基于徽章计算的社区信誉分</div>`;

    // 领取记录
    if (receivedData && receivedData.results && receivedData.results.length > 0) {
      h += `<div class="ld-sub-title">我的领取 (${Math.min(receivedData.total, 20)}条)</div>`;
      h += `<div style="max-height:180px;overflow-y:auto;">`;
      receivedData.results.slice(0, 20).forEach((item) => {
        const name = escapeHtml(item.project_name || "-");
        const creator = escapeHtml(item.project_creator_nickname || item.project_creator || "-");
        const content = escapeHtml(item.content || "-");
        const time = item.received_at ? new Date(item.received_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
        h += `<div class="ld-cdk-item">
          <div style="display:flex;justify-content:space-between;align-items:center;"><span class="name">${name}</span><span class="time">${time}</span></div>
          <div class="creator">创建者: ${creator}</div>
          <div class="ld-cdk-code-row"><code>${content}</code><button class="ld-copy-btn" data-content="${content}">复制</button></div>
        </div>`;
      });
      h += `</div>`;
    } else if (receivedData?.blocked) {
      h += `<div style="font-size:10px;color:var(--text-5);margin-top:6px;text-align:center;">领取记录被 Cloudflare 拦截，请先访问 cdk.linux.do</div>`;
    }

    h += `<div style="text-align:right;margin-top:6px;"><a href="https://cdk.linux.do/dashboard" target="_blank" class="ld-link-btn">查看详情 →</a></div>`;
    area.innerHTML = h;

    // 复制按钮
    area.querySelectorAll(".ld-copy-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(btn.dataset.content);
          const orig = btn.textContent;
          btn.textContent = "已复制";
          btn.style.color = "var(--green)";
          setTimeout(() => { btn.textContent = orig; btn.style.color = ""; }, 1500);
        } catch {}
      });
    });
  }

  // ==================== Tab2: 时间线（分板块 + 已读未读） ====================
  function isTopicRead(topic) {
    if (topic.unseen) return false;
    if (topic.last_read_post_number != null) {
      return topic.last_read_post_number >= (topic.highest_post_number || topic.posts_count || 1);
    }
    if ((topic.unread_posts || 0) > 0 || (topic.new_posts || 0) > 0) return false;
    return true;
  }

  async function ensureCategories() {
    if (state.categoriesMap) return;
    try {
      const s = await safeFetchJson(`${BASE_URL}/site.json`);
      if (s?.categories) {
        state.categoriesMap = {};
        state.allCategoryIds = [];
        s.categories.forEach((c) => {
          state.categoriesMap[c.id] = {
            name: c.name,
            slug: c.slug,
            color: c.color,
            parentId: c.parent_category_id || null,
            topicCount: c.topic_count || 0,
            position: c.position ?? 999,
          };
        });
        // 排序：先顶级分类按 position，再子分类跟在父分类后面
        const topLevel = Object.entries(state.categoriesMap)
          .filter(([, v]) => !v.parentId)
          .sort((a, b) => a[1].position - b[1].position);
        topLevel.forEach(([id, cat]) => {
          state.allCategoryIds.push(parseInt(id));
          // 子分类
          const subs = Object.entries(state.categoriesMap)
            .filter(([, v]) => v.parentId === parseInt(id))
            .sort((a, b) => a[1].position - b[1].position);
          subs.forEach(([sid]) => state.allCategoryIds.push(parseInt(sid)));
        });
      }
    } catch {}
  }

  async function loadTimeline(append = false) {
    const ct = tabContents[1];
    if (state.timelineLoading) return;
    state.timelineLoading = true;
    if (!append) {
      state.timelineTopics = [];
      state.timelinePage = 0;
      ct.innerHTML = '<div class="ld-loading"><div class="spinner"></div><div>加载最新帖子...</div></div>';
    }
    try {
      await ensureCategories();
      const data = await safeFetchJson(`${BASE_URL}/latest.json?order=created&page=${state.timelinePage}`);
      if (!data?.topic_list?.topics) {
        if (!append) ct.innerHTML = '<div class="ld-loading">加载失败</div>';
        state.timelineLoading = false; return;
      }
      const users = {};
      (data.users || []).forEach((u) => (users[u.id] = u));
      const cats = state.categoriesMap || {};
      const newTopics = data.topic_list.topics.filter((t) => !t.pinned_globally)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map((t) => ({
          id: t.id, title: t.title, slug: t.slug, createdAt: t.created_at,
          postsCount: t.posts_count, views: t.views, likeCount: t.like_count,
          categoryId: t.category_id,
          categoryName: cats[t.category_id]?.name || "",
          categoryColor: cats[t.category_id]?.color || "",
          posterUsername: t.posters?.[0]?.user_id != null ? (users[t.posters[0].user_id]?.username || "") : "",
          isRead: isTopicRead(t),
          unseen: !!t.unseen,
          unreadPosts: t.unread_posts || 0,
          lastReadPost: t.last_read_post_number || 0,
          highestPost: t.highest_post_number || t.posts_count || 0,
        }));
      state.timelineTopics = append ? [...state.timelineTopics, ...newTopics] : newTopics;
      state.timelinePage++;

      if (append && newTopics.length > 0) {
        // 追加模式：直接向 DOM 插入新帖子，不重建整个列表
        appendTimelineTopics(ct, newTopics);
      } else if (append && newTopics.length === 0) {
        // 没有更多数据
        const sentinel = ct.querySelector("#ld-tl-sentinel");
        if (sentinel) sentinel.textContent = "没有更多帖子了";
      } else {
        renderTimeline();
      }
    } catch { if (!append) ct.innerHTML = '<div class="ld-loading">加载失败</div>'; }
    finally { state.timelineLoading = false; }
  }

  // 追加帖子到 DOM（不重建整个列表，保持滚动位置）
  function appendTimelineTopics(ct, topics) {
    const sentinel = ct.querySelector("#ld-tl-sentinel");
    if (!sentinel) return;

    // 根据当前筛选条件过滤新帖子
    const filtered = filterTopics(topics);
    if (filtered.length === 0) return;

    const fragment = document.createDocumentFragment();
    filtered.forEach((t) => {
      const div = document.createElement("div");
      const readClass = t.isRead ? "read" : "unread";
      const catColor = t.categoryColor ? `border-left-color:#${t.categoryColor};` : "";
      const catStyle = t.categoryColor ? `background:rgba(${parseInt(t.categoryColor.slice(0,2),16)},${parseInt(t.categoryColor.slice(2,4),16)},${parseInt(t.categoryColor.slice(4,6)||"00",16)},.2);color:#${t.categoryColor};` : "";
      const unreadInfo = !t.isRead && t.unreadPosts > 0 ? ` · ${t.unreadPosts}条未读` : "";
      div.className = `ld-topic-item ${readClass}`;
      if (!t.isRead && catColor) div.style.cssText = catColor;
      const readTag = t.isRead ? '<span class="ld-read-dot read">已读</span>' : '<span class="ld-read-dot unread">未读</span>';
      div.innerHTML = `
        <div class="ld-topic-title">${readTag}<a class="ld-topic-link" data-topic-id="${t.id}" href="${BASE_URL}/t/${t.slug}/${t.id}" target="_blank">${escapeHtml(t.title)}</a></div>
        <div class="ld-topic-meta">
          ${t.categoryName ? `<span class="category" style="${catStyle}">${escapeHtml(t.categoryName)}</span>` : ""}
          <span>@${escapeHtml(t.posterUsername)}</span>
          <span>${formatTimeAgo(t.createdAt)}${unreadInfo}</span>
        </div>
        <div class="ld-topic-stats"><span>💬 ${t.postsCount - 1}</span><span>👁 ${t.views}</span><span>❤ ${t.likeCount}</span></div>`;
      // 淡入动画
      div.style.opacity = "0";
      div.style.transition = "opacity .3s ease";
      fragment.appendChild(div);
    });

    // 插入到哨兵之前
    sentinel.parentNode.insertBefore(fragment, sentinel);

    // 触发淡入
    requestAnimationFrame(() => {
      ct.querySelectorAll(".ld-topic-item").forEach(el => {
        if (el.style.opacity === "0") el.style.opacity = "1";
      });
    });

    // 更新统计摘要
    updateTimelineSummary(ct);
  }

  // 筛选帖子（用于追加模式）
  function filterTopics(topics) {
    let list = topics;
    if (state.tlFilterCat !== "all") {
      const catId = parseInt(state.tlFilterCat);
      const childIds = Object.entries(state.categoriesMap || {})
        .filter(([, v]) => v.parentId === catId)
        .map(([id]) => parseInt(id));
      const matchIds = new Set([catId, ...childIds]);
      list = list.filter(t => matchIds.has(t.categoryId));
    }
    if (state.tlFilterRead === "unread") list = list.filter(t => !t.isRead);
    else if (state.tlFilterRead === "read") list = list.filter(t => t.isRead);
    return list;
  }

  // 更新统计摘要数字
  function updateTimelineSummary(ct) {
    const all = state.timelineTopics;
    const totalUnread = all.filter(t => !t.isRead).length;
    const summary = ct.querySelector(".ld-tl-summary");
    if (summary) {
      summary.innerHTML = `
        <span>共 <span class="num">${all.length}</span> 篇</span>
        <span>未读 <span class="num" style="color:var(--accent);">${totalUnread}</span></span>
        <span>已读 <span class="num">${all.length - totalUnread}</span></span>`;
    }
  }

  function getTimelineFiltered() {
    let list = state.timelineTopics;
    if (state.tlFilterCat !== "all") {
      const catId = parseInt(state.tlFilterCat);
      // 如果选的是顶级分类，也包含其子分类
      const childIds = Object.entries(state.categoriesMap || {})
        .filter(([, v]) => v.parentId === catId)
        .map(([id]) => parseInt(id));
      const matchIds = new Set([catId, ...childIds]);
      list = list.filter((t) => matchIds.has(t.categoryId));
    }
    if (state.tlFilterRead === "unread") list = list.filter((t) => !t.isRead);
    else if (state.tlFilterRead === "read") list = list.filter((t) => t.isRead);
    return list;
  }

  function saveTimelineRestoreContext(topicId) {
    const ct = tabContents[1];
    const payload = {
      ts: Date.now(),
      topicId: Number(topicId) || 0,
      scrollTop: ct?.scrollTop || 0,
      timelinePage: state.timelinePage,
      tlFilterCat: state.tlFilterCat,
      tlFilterRead: state.tlFilterRead,
      topics: Array.isArray(state.timelineTopics)
        ? state.timelineTopics.slice(0, TIMELINE_RESTORE_MAX_TOPICS)
        : [],
    };
    try {
      sessionStorage.setItem(TIMELINE_RESTORE_KEY, JSON.stringify(payload));
    } catch {}
  }

  function bindTimelineTopicClickDelegation(ct) {
    if (ct.dataset.tlTopicJumpBound === "1") return;
    ct.dataset.tlTopicJumpBound = "1";
    ct.addEventListener("click", (e) => {
      const link = e.target.closest("a.ld-topic-link");
      if (!link || !ct.contains(link)) return;
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      saveTimelineRestoreContext(link.dataset.topicId);
      state.activeTab = 1;
      GM_setValue("ld_activeTab", 1);
      window.location.href = link.href;
    });
  }

  function restoreTimelinePosition(ct) {
    const ctx = state.timelineRestoreCtx;
    if (!ctx) return;
    state.timelineRestoreCtx = null;

    requestAnimationFrame(() => {
      const targetLink = ct.querySelector(`a.ld-topic-link[data-topic-id="${ctx.topicId}"]`);
      const targetItem = targetLink?.closest(".ld-topic-item");
      if (targetItem) {
        const top = targetItem.offsetTop - Math.max(40, Math.floor(ct.clientHeight * 0.28));
        ct.scrollTop = Math.max(0, top);
        targetItem.classList.add("ld-topic-item-focus");
        setTimeout(() => targetItem.classList.remove("ld-topic-item-focus"), 1800);
        return;
      }
      if (Number.isFinite(ctx.scrollTop)) {
        ct.scrollTop = Math.max(0, ctx.scrollTop);
      }
    });
  }

  function renderTimeline() {
    const ct = tabContents[1];
    const allTopics = state.timelineTopics;

    // 统计各分类帖子数（从加载的帖子中）
    const catCounts = {};
    const unreadCatCounts = {};
    allTopics.forEach((t) => {
      catCounts[t.categoryId] = (catCounts[t.categoryId] || 0) + 1;
      if (!t.isRead) unreadCatCounts[t.categoryId] = (unreadCatCounts[t.categoryId] || 0) + 1;
    });
    // 向上归集到父分类
    const catCountsWithSubs = {};
    const unreadCountsWithSubs = {};
    if (state.categoriesMap) {
      for (const [id, count] of Object.entries(catCounts)) {
        const cat = state.categoriesMap[id];
        const pid = cat?.parentId;
        catCountsWithSubs[id] = (catCountsWithSubs[id] || 0) + count;
        if (pid) catCountsWithSubs[pid] = (catCountsWithSubs[pid] || 0) + count;
      }
      for (const [id, count] of Object.entries(unreadCatCounts)) {
        const cat = state.categoriesMap[id];
        const pid = cat?.parentId;
        unreadCountsWithSubs[id] = (unreadCountsWithSubs[id] || 0) + count;
        if (pid) unreadCountsWithSubs[pid] = (unreadCountsWithSubs[pid] || 0) + count;
      }
    }

    const totalUnread = allTopics.filter((t) => !t.isRead).length;

    let h = "";

    // 工具栏
    h += `<div class="ld-tl-toolbar">
      <div class="ld-read-filter">
        <button class="ld-rf-btn ${state.tlFilterRead === "all" ? "active" : ""}" data-rf="all">全部</button>
        <button class="ld-rf-btn ${state.tlFilterRead === "unread" ? "active" : ""}" data-rf="unread">未读</button>
        <button class="ld-rf-btn ${state.tlFilterRead === "read" ? "active" : ""}" data-rf="read">已读</button>
      </div>
      <button class="ld-refresh-btn" data-action="refresh-tl">刷新</button>
    </div>`;

    // 分类标签栏 — 显示所有板块
    h += `<div class="ld-tl-filter-bar">`;
    h += `<span class="ld-cat-chip ${state.tlFilterCat === "all" ? "active" : ""}" data-cat="all">全部<span class="cat-count">${allTopics.length}</span></span>`;

    const displayCatIds = state.allCategoryIds && state.allCategoryIds.length > 0
      ? state.allCategoryIds
      : Object.keys(state.categoriesMap || {}).map(Number);

    for (const catId of displayCatIds) {
      const catInfo = state.categoriesMap?.[catId];
      if (!catInfo) continue;
      const isChild = !!catInfo.parentId;
      const catName = isChild ? catInfo.name : catInfo.name;
      const count = catCountsWithSubs[catId] || 0;
      const unread = unreadCountsWithSubs[catId] || 0;
      const activeClass = state.tlFilterCat === String(catId) ? "active" : "";
      const dotColor = catInfo.color ? `#${catInfo.color}` : "";
      const dot = dotColor ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dotColor};margin-right:3px;vertical-align:middle;"></span>` : "";
      const indent = isChild ? "padding-left:14px;" : "";
      const prefix = isChild ? "└ " : "";
      h += `<span class="ld-cat-chip ${activeClass}" data-cat="${catId}" style="${indent}">${dot}${prefix}${escapeHtml(catName)}<span class="cat-count">${unread > 0 ? unread : count}</span></span>`;
    }
    h += `</div>`;

    // 统计摘要
    h += `<div class="ld-tl-summary">
      <span>共 <span class="num">${allTopics.length}</span> 篇</span>
      <span>未读 <span class="num" style="color:var(--accent);">${totalUnread}</span></span>
      <span>已读 <span class="num">${allTopics.length - totalUnread}</span></span>
    </div>`;

    // 帖子列表
    const filtered = getTimelineFiltered();
    if (filtered.length === 0) {
      h += `<div class="ld-loading" style="padding:20px;">当前筛选条件下没有帖子</div>`;
    } else {
      filtered.forEach((t) => {
        const url = `${BASE_URL}/t/${t.slug}/${t.id}`;
        const readClass = t.isRead ? "read" : "unread";
        const catColor = t.categoryColor ? `style="border-left-color:#${t.categoryColor};"` : "";
        const catStyle = t.categoryColor ? `style="background:rgba(${parseInt(t.categoryColor.slice(0,2),16)},${parseInt(t.categoryColor.slice(2,4),16)},${parseInt(t.categoryColor.slice(4,6)||"00",16)},.2);color:#${t.categoryColor};"` : "";
        const unreadInfo = !t.isRead && t.unreadPosts > 0 ? ` · ${t.unreadPosts}条未读` : "";
        const readTag = t.isRead ? '<span class="ld-read-dot read">已读</span>' : '<span class="ld-read-dot unread">未读</span>';
        h += `<div class="ld-topic-item ${readClass}" ${t.isRead ? "" : catColor}>
          <div class="ld-topic-title">${readTag}<a class="ld-topic-link" data-topic-id="${t.id}" href="${url}" target="_blank">${escapeHtml(t.title)}</a></div>
          <div class="ld-topic-meta">
            ${t.categoryName ? `<span class="category" ${catStyle}>${escapeHtml(t.categoryName)}</span>` : ""}
            <span>@${escapeHtml(t.posterUsername)}</span>
            <span>${formatTimeAgo(t.createdAt)}${unreadInfo}</span>
          </div>
          <div class="ld-topic-stats"><span>💬 ${t.postsCount - 1}</span><span>👁 ${t.views}</span><span>❤ ${t.likeCount}</span></div>
        </div>`;
      });
    }

    h += '<div id="ld-tl-sentinel" style="text-align:center;padding:12px;font-size:11px;color:var(--text-4);">滚动加载更多...</div>';
    ct.innerHTML = h;

    // 绑定事件
    ct.querySelector('[data-action="refresh-tl"]')?.addEventListener("click", () => { state.timelinePage = 0; loadTimeline(false); });
    ct.querySelectorAll(".ld-cat-chip").forEach((chip) => {
      chip.addEventListener("click", () => { state.tlFilterCat = chip.dataset.cat; renderTimeline(); });
    });
    ct.querySelectorAll(".ld-rf-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.tlFilterRead = btn.dataset.rf; renderTimeline(); });
    });

    // 无限滚动：IntersectionObserver 监听哨兵元素
    setupTimelineInfiniteScroll(ct);
    bindTimelineTopicClickDelegation(ct);
    restoreTimelinePosition(ct);
  }

  // 无限滚动
  let tlObserver = null;
  function setupTimelineInfiniteScroll(ct) {
    // 清理旧的 observer
    if (tlObserver) { tlObserver.disconnect(); tlObserver = null; }
    const sentinel = ct.querySelector("#ld-tl-sentinel");
    if (!sentinel) return;

    tlObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !state.timelineLoading) {
          sentinel.textContent = "加载中...";
          loadTimeline(true).then(() => {
            // 加载完成后如果没有新数据，显示已到底
            const newSentinel = ct.querySelector("#ld-tl-sentinel");
            if (newSentinel) newSentinel.textContent = "滚动加载更多...";
          });
        }
      });
    }, {
      root: ct,      // 在 tab 内容容器内监听
      rootMargin: "0px 0px 100px 0px",  // 提前 100px 触发
      threshold: 0,
    });

    tlObserver.observe(sentinel);
  }

  // ==================== Tab3: 快速回复 ====================
  // 回复时附带的操作
  let qrAutoLike = GM_getValue("ld_qrAutoLike", false);
  let qrAutoBookmark = GM_getValue("ld_qrAutoBookmark", false);

  function renderQuickReplyTab() {
    const ct = tabContents[2];
    const isTopic = /\/t\//.test(location.pathname);

    let h = "";
    // 回复附带操作
    h += `<div class="ld-qr-actions">
      <div class="ld-qr-action-btn ${qrAutoLike ? "active" : ""}" id="ld-qr-like">❤️ 点赞</div>
      <div class="ld-qr-action-btn ${qrAutoBookmark ? "active" : ""}" id="ld-qr-bookmark">🔖 书签</div>
    </div>`;
    h += `<div style="font-size:10px;color:var(--text-5);margin-bottom:10px;text-align:center;">选中后，点击模板会自动回复并执行勾选的操作</div>`;

    // 模板列表（可删除，点击自动执行所有勾选操作）
    h += `<div style="font-size:13px;font-weight:700;color:var(--text-1);margin-bottom:8px;">回复模板</div>`;
    replyTemplates.forEach((t, i) => {
      h += `<div class="ld-qr-template" data-tpl="${i}">${escapeHtml(t)}<span class="ld-qr-tpl-del" data-del="${i}" title="删除此模板">×</span></div>`;
    });

    // 添加模板
    h += `<div class="ld-qr-add-row">
      <input class="ld-qr-add-input" placeholder="添加新模板...">
      <button class="ld-qr-add-btn">+ 添加</button>
    </div>`;

    // 自定义回复
    h += `<div style="font-size:13px;font-weight:700;color:var(--text-1);margin:14px 0 8px;">自定义回复</div>`;
    h += `<div class="ld-qr-custom"><input class="ld-qr-input" placeholder="输入回复内容..."><button class="ld-qr-send">发送</button></div>`;
    h += `<div style="margin-top:12px;padding:10px;background:var(--bg-card);border-radius:8px;text-align:center;font-size:12px;color:var(--text-4);">${isTopic ? "点击模板自动回复+执行勾选操作" : "请进入帖子页面后使用快速回复"}</div>`;
    ct.innerHTML = h;

    // --- 事件绑定 ---
    // 点赞/书签开关
    document.getElementById("ld-qr-like")?.addEventListener("click", (e) => {
      qrAutoLike = !qrAutoLike;
      GM_setValue("ld_qrAutoLike", qrAutoLike);
      e.currentTarget.classList.toggle("active", qrAutoLike);
    });
    document.getElementById("ld-qr-bookmark")?.addEventListener("click", (e) => {
      qrAutoBookmark = !qrAutoBookmark;
      GM_setValue("ld_qrAutoBookmark", qrAutoBookmark);
      e.currentTarget.classList.toggle("active", qrAutoBookmark);
    });

    // 模板点击 → 自动执行所有勾选操作
    ct.querySelectorAll(".ld-qr-template").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.classList.contains("ld-qr-tpl-del")) return;
        triggerReply(replyTemplates[parseInt(el.dataset.tpl)]);
      });
    });

    // 模板删除
    ct.querySelectorAll(".ld-qr-tpl-del").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(el.dataset.del);
        replyTemplates.splice(idx, 1);
        GM_setValue("ld_replyTemplates", replyTemplates);
        renderQuickReplyTab();
        showNotification("已删除模板");
      });
    });

    // 添加模板
    const addInput = ct.querySelector(".ld-qr-add-input");
    const addBtn = ct.querySelector(".ld-qr-add-btn");
    if (addBtn && addInput) {
      const doAdd = () => {
        const val = addInput.value.trim();
        if (!val) return;
        replyTemplates.push(val);
        GM_setValue("ld_replyTemplates", replyTemplates);
        renderQuickReplyTab();
        showNotification("已添加模板");
      };
      addBtn.addEventListener("click", doAdd);
      addInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(); });
    }

    // 自定义回复发送
    const sendBtn = ct.querySelector(".ld-qr-send");
    const input = ct.querySelector(".ld-qr-input");
    if (sendBtn && input) {
      const send = () => { const t = input.value.trim(); if (t) { triggerReply(t); input.value = ""; } };
      sendBtn.addEventListener("click", send);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    }
  }

  function triggerReply(text) {
    if (!/\/t\//.test(location.pathname)) { showNotification("请先进入帖子页面"); return; }

    // 1. 回复
    const replyBtn = document.querySelector(".topic-footer-main-buttons .create, .btn-primary.create, button.reply");
    if (replyBtn) {
      replyBtn.click();
      setTimeout(() => {
        const ta = document.querySelector(".d-editor-input, .reply-area textarea");
        if (ta) {
          ta.focus(); ta.value = text; ta.dispatchEvent(new Event("input", { bubbles: true }));
          showNotification("已填入回复内容");
        } else { showNotification("编辑器未打开"); }
      }, 500);
    } else { showNotification("未找到回复按钮"); }

    // 2. 点赞（给发帖人/首帖，不是评论区）
    if (qrAutoLike) {
      setTimeout(() => {
        // 定位第一个帖子（主楼）的点赞按钮
        const firstPost = document.querySelector(".topic-post:first-child, #post_1, article[data-post-number='1']");
        let likeBtn = null;
        if (firstPost) {
          likeBtn = firstPost.querySelector(".discourse-reactions-reaction-button button.btn-toggle-reaction-like");
        }
        // 回退：如果没找到首帖内的按钮，找页面上第一个
        if (!likeBtn) {
          likeBtn = document.querySelector(".discourse-reactions-reaction-button button.btn-toggle-reaction-like");
        }
        if (likeBtn && !likeBtn.classList.contains("has-like") && !likeBtn.classList.contains("liked")) {
          likeBtn.click();
          console.log("[工具箱] 自动点赞首帖");
        }
      }, 800);
    }

    // 3. 书签（不设置提醒：点击后如果弹出提醒弹窗，自动关掉）
    if (qrAutoBookmark) {
      setTimeout(() => {
        const bmBtn = document.querySelector(".topic-footer-main-buttons .bookmark, button.bookmark, .bookmark-menu-trigger");
        if (bmBtn && !bmBtn.classList.contains("bookmarked")) {
          bmBtn.click();
          // Discourse 书签会弹出提醒设置弹窗，需要找到"不提醒"或直接保存
          setTimeout(() => {
            // 尝试点击"不设提醒"选项 或 直接关闭弹窗保存
            const noneOption = document.querySelector(".bookmark-option-none, .tap-tile[data-name='none'], [data-name='none']");
            if (noneOption) {
              noneOption.click();
              console.log("[工具箱] 书签已设置（无提醒）");
              return;
            }
            // 尝试直接点保存按钮（如果有）
            const saveBtn = document.querySelector(".bookmark-reminder-modal .btn-primary, .modal-footer .btn-primary, .d-modal__footer .btn-primary");
            if (saveBtn) {
              saveBtn.click();
              console.log("[工具箱] 书签已保存");
              return;
            }
            // 最后尝试关闭弹窗（某些版本 Discourse 点击后直接书签了）
            const closeBtn = document.querySelector(".modal-close, .d-modal__dismiss, .bootbox .btn");
            if (closeBtn) closeBtn.click();
            console.log("[工具箱] 自动书签");
          }, 600);
        }
      }, 1000);
    }
  }

  // 帖子内注入快速回复按钮
  function injectQuickReplyButtons() {
    if (!/\/t\//.test(location.pathname)) return;
    document.querySelectorAll(".topic-post, article.boxed").forEach((post) => {
      const names = post.querySelector(".names, .topic-meta-data .names");
      if (!names || names.querySelector(".ld-quick-reply-inline")) return;
      const uEl = names.querySelector(".username a, a.username, .username") || names.querySelector(".full-name a, a.full-name, .full-name");
      if (!uEl) return;
      const b = document.createElement("button");
      b.className = "ld-quick-reply-inline";
      b.innerHTML = "💬 回复";
      b.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const rb = post.querySelector(".post-controls .reply, button.reply") || document.querySelector(".topic-footer-main-buttons .create, .btn-primary.create");
        if (rb) rb.click();
      });
      uEl.parentNode.insertBefore(b, uEl.nextSibling);
    });
  }
  const replyObs = new MutationObserver(() => injectQuickReplyButtons());
  replyObs.observe(document.body, { childList: true, subtree: true });
  injectQuickReplyButtons();

  // ==================== Tab4: 自动刷贴（照搬小助手核心逻辑） ====================

  // --- sessionStorage 辅助（窗口独立状态） ---
  function ssGet(key, def = null) {
    try { const v = sessionStorage.getItem("ld_" + key); return v ? JSON.parse(v) : def; } catch { return def; }
  }
  function ssSet(key, val) {
    try { sessionStorage.setItem("ld_" + key, JSON.stringify(val)); } catch {}
  }

  // 初始化时从 sessionStorage 恢复窗口独立状态
  (function restoreSessionState() {
    const ssRunning = ssGet("autoRunning", false);
    const ssList = ssGet("topicList", []);
    const ssSession = ssGet("sessionRead", 0);
    const ssAccum = ssGet("accumulatedTime", 0);
    if (ssRunning) {
      state.autoRunning = true;
      state.topicList = ssList;
      state.sessionReadCount = ssSession;
      state.accumulatedTime = ssAccum;
    }
  })();

  function renderAutoReadTab() {
    const ct = tabContents[3];
    const isRunning = state.autoRunning;
    const isTopic = /\/t\//.test(location.pathname);

    let h = "";
    h += `<button class="ld-auto-btn ${isRunning ? "running" : "start"}" id="ld-auto-toggle">
      <span>${isRunning ? "⏸ 停止刷贴" : "▶ 开始刷贴"}</span>
    </button>`;

    h += `<div class="ld-auto-stats">
      <div class="ld-auto-stat"><div class="num" id="ld-stat-session">${state.sessionReadCount}</div><div class="lbl">本次已读</div></div>
      <div class="ld-auto-stat"><div class="num" id="ld-stat-today">${state.todayReadCount}</div><div class="lbl">今日已读</div></div>
      <div class="ld-auto-stat"><div class="num" id="ld-stat-remaining">${state.topicList.length}</div><div class="lbl">待读帖子</div></div>
    </div>`;

    // 帖子获取状态区（动态更新）
    h += `<div id="ld-topic-status" style="display:none;padding:8px;background:var(--bg-card);border-radius:8px;margin-bottom:8px;font-size:11px;"></div>`;

    h += `<div class="ld-auto-status" id="ld-auto-status">
      ${isRunning ? (isTopic ? "📖 正在阅读帖子..." : "📥 正在获取帖子列表...") : '点击"开始刷贴"自动浏览帖子，增加阅读量和活跃度'}
    </div>`;

    h += `<div class="ld-toggle-row">
      <span class="ld-toggle-label">👍 自动点赞（主题首帖）</span>
      <input type="checkbox" class="ld-toggle-switch" id="ld-auto-like-toggle" ${state.autoLikeEnabled ? "checked" : ""}>
    </div>`;

    h += `<div class="ld-toggle-row">
      <span class="ld-toggle-label">💬 快速点赞（随机楼层）</span>
      <input type="checkbox" class="ld-toggle-switch" id="ld-quick-like-toggle" ${state.quickLikeEnabled ? "checked" : ""}>
    </div>`;

    h += `<div class="ld-toggle-row">
      <span class="ld-toggle-label">⏭️ 跳过已读帖子</span>
      <input type="checkbox" class="ld-toggle-switch" id="ld-skip-read-toggle" ${state.skipReadEnabled ? "checked" : ""}>
    </div>`;

    h += `<div class="ld-slider-row">
      <div class="ld-slider-header"><span>📚 获取帖子数</span><span class="ld-slider-value" id="ld-limit-val">${state.topicLimitCount}</span></div>
      <input type="range" class="ld-slider" id="ld-limit-slider" min="10" max="200" step="10" value="${state.topicLimitCount}">
    </div>`;

    ct.innerHTML = h;

    // 事件绑定
    document.getElementById("ld-auto-toggle")?.addEventListener("click", handleAutoButtonClick);
    document.getElementById("ld-auto-like-toggle")?.addEventListener("change", (e) => {
      state.autoLikeEnabled = e.target.checked;
      GM_setValue("ld_autoLike", state.autoLikeEnabled);
    });
    document.getElementById("ld-quick-like-toggle")?.addEventListener("change", (e) => {
      state.quickLikeEnabled = e.target.checked;
      GM_setValue("ld_quickLike", state.quickLikeEnabled);
    });
    document.getElementById("ld-skip-read-toggle")?.addEventListener("change", (e) => {
      state.skipReadEnabled = e.target.checked;
      GM_setValue("ld_skipRead", state.skipReadEnabled);
    });
    const slider = document.getElementById("ld-limit-slider");
    const sliderVal = document.getElementById("ld-limit-val");
    if (slider && sliderVal) {
      slider.addEventListener("input", () => {
        state.topicLimitCount = parseInt(slider.value);
        sliderVal.textContent = slider.value;
        GM_setValue("ld_topicLimit", state.topicLimitCount);
      });
    }
  }

  function updateAutoStats() {
    const s = document.getElementById("ld-stat-session");
    const t = document.getElementById("ld-stat-today");
    const r = document.getElementById("ld-stat-remaining");
    if (s) s.textContent = state.sessionReadCount;
    if (t) t.textContent = state.todayReadCount;
    if (r) r.textContent = state.topicList.length;
  }

  function updateAutoStatus(text) {
    const el = document.getElementById("ld-auto-status");
    if (el) el.innerHTML = text;
  }

  function updateTopicStatus(html) {
    const el = document.getElementById("ld-topic-status");
    if (!el) return;
    if (html) { el.style.display = "block"; el.innerHTML = html; }
    else el.style.display = "none";
  }

  // --- 核心：开始/停止按钮 ---
  async function handleAutoButtonClick() {
    if (state.autoRunning || state.isScrolling) {
      // 停止
      stopAutoReading();
      showNotification("已停止自动刷贴");
    } else {
      // 开始
      state.autoRunning = true;
      ssSet("autoRunning", true);
      const btn = document.getElementById("ld-auto-toggle");
      if (btn) { btn.className = "ld-auto-btn running"; btn.innerHTML = "<span>⏸ 停止刷贴</span>"; }
      showNotification("开始自动刷贴");
      startNavigationGuard();

      const isTopic = /\/t\//.test(location.pathname);
      if (isTopic) {
        startScrolling();
        if (state.autoLikeEnabled) autoLikeTopic();
        if (state.quickLikeEnabled) quickLikeReplies();
      } else {
        await getLatestTopics();
        await navigateNextTopic();
      }
    }
  }

  function stopAutoReading() {
    state.isScrolling = false;
    state.autoRunning = false;
    ssSet("autoRunning", false);
    stopNavigationGuard();
    if (state.navigationTimeout) { clearTimeout(state.navigationTimeout); state.navigationTimeout = null; }
    const btn = document.getElementById("ld-auto-toggle");
    if (btn) { btn.className = "ld-auto-btn start"; btn.innerHTML = "<span>▶ 开始刷贴</span>"; }
    updateAutoStatus("已停止刷贴");
    console.log("[工具箱] 自动阅读已停止");
  }

  // --- 获取帖子列表（分页+重试+跳过已读） ---
  async function getLatestTopics() {
    let topicList = [];
    let retryCount = 0;
    let totalSkipped = 0;
    let emptyPageCount = 0;
    const topicLimit = state.topicLimitCount || 50;
    const maxPagesPerFetch = Math.max(20, Math.ceil(topicLimit / 5));
    let page = 0;

    updateAutoStatus("📥 正在获取帖子列表...");
    updateTopicStatus(`<div style="color:var(--text-3);">正在获取帖子...</div>`);

    while (topicList.length < topicLimit && retryCount < SCROLL_CONFIG.retryLimit && page <= maxPagesPerFetch) {
      try {
        const data = await safeFetchJson(`${BASE_URL}/latest.json?no_definitions=true&page=${page}`);
        if (data?.topic_list?.topics?.length > 0) {
          emptyPageCount = 0;
          let filtered = data.topic_list.topics.filter(t => t.posts_count < SCROLL_CONFIG.commentLimit);

          // 跳过已读帖子
          if (state.skipReadEnabled) {
            const before = filtered.length;
            filtered = filtered.filter(t => !isTopicReadForAuto(t.id));
            const skipped = before - filtered.length;
            if (skipped > 0) { totalSkipped += skipped; }
          }

          topicList.push(...filtered);
          page++;

          const pct = Math.min(100, Math.round((topicList.length / topicLimit) * 100));
          updateTopicStatus(`
            <div style="color:var(--text-3);margin-bottom:4px;">正在获取帖子（第${page}页）...</div>
            <div style="height:4px;background:var(--bg-card);border-radius:2px;overflow:hidden;margin-bottom:4px;">
              <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width .3s;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;color:var(--text-4);font-size:10px;">
              <span>已获取: ${topicList.length}/${topicLimit}</span>
              ${totalSkipped > 0 ? `<span>跳过已读: ${totalSkipped}</span>` : ""}
            </div>
          `);
          updateAutoStatus(`📥 已获取 <span class="highlight">${topicList.length}</span> 篇帖子 (第${page}页)...`);
        } else {
          emptyPageCount++;
          if (emptyPageCount >= 3) break;
          page++;
        }
      } catch {
        retryCount++;
        await Utils.sleep(1000);
      }
    }

    if (topicList.length > topicLimit) topicList = topicList.slice(0, topicLimit);
    state.topicList = topicList;
    ssSet("topicList", topicList);
    updateAutoStats();

    if (topicList.length === 0) {
      updateTopicStatus(`<div style="color:var(--red);">未获取到帖子</div>`);
      updateAutoStatus("没有可阅读的帖子");
    } else {
      updateTopicStatus(`<div style="color:var(--green);">✅ 已获取 ${topicList.length} 篇帖子${totalSkipped > 0 ? `（跳过已读 ${totalSkipped}）` : ""}</div>`);
      updateAutoStatus(`已获取 <span class="highlight">${topicList.length}</span> 篇帖子，开始阅读`);
      setTimeout(() => updateTopicStatus(null), 3000);
    }
  }

  // 简单的已读检测（基于 GM 存储）
  function isTopicReadForAuto(topicId) {
    const readList = GM_getValue("ld_readTopicIds", []);
    return readList.includes(String(topicId));
  }
  function markTopicAsRead(topicId) {
    const readList = GM_getValue("ld_readTopicIds", []);
    const id = String(topicId);
    if (!readList.includes(id)) {
      readList.push(id);
      // 最多保留 2000 条记录
      if (readList.length > 2000) readList.splice(0, readList.length - 2000);
      GM_setValue("ld_readTopicIds", readList);
    }
  }

  // --- getNextTopic：随机选帖 + 跳过已读 ---
  async function getNextTopic() {
    if (state.topicList.length === 0) {
      await getLatestTopics();
    }
    while (state.topicList.length > 0) {
      // 随机选取一个帖子，而非总是取第一个
      const idx = Math.floor(Math.random() * state.topicList.length);
      const topic = state.topicList.splice(idx, 1)[0];
      if (state.skipReadEnabled && isTopicReadForAuto(topic.id)) {
        console.log(`[工具箱] 跳过已读: ${topic.title}`);
        ssSet("topicList", state.topicList);
        updateAutoStats();
        continue;
      }
      ssSet("topicList", state.topicList);
      return topic;
    }
    return null;
  }

  // --- 导航到下一个帖子 ---
  async function navigateNextTopic() {
    if (!state.autoRunning) return;

    const nextTopic = await getNextTopic();
    if (nextTopic) {
      console.log("[工具箱] 导航到:", nextTopic.title);

      // 记录当前帖子为已读
      const curMatch = location.pathname.match(/\/t\/[^/]+\/(\d+)/);
      if (curMatch) markTopicAsRead(curMatch[1]);

      // 更新计数
      state.sessionReadCount++;
      state.todayReadCount++;
      GM_setValue("ld_todayRead_" + new Date().toDateString(), state.todayReadCount.toString());
      ssSet("sessionRead", state.sessionReadCount);
      ssSet("topicList", state.topicList);
      ssSet("autoRunning", true);
      updateAutoStats();
      updateAutoStatus(`📖 正在阅读: <span class="highlight">${escapeHtml(nextTopic.title)}</span>`);

      const url = nextTopic.last_read_post_number
        ? `${BASE_URL}/t/topic/${nextTopic.id}/${nextTopic.last_read_post_number}`
        : `${BASE_URL}/t/${nextTopic.slug || "topic"}/${nextTopic.id}`;

      // 跳转超时保护
      state.navigationTimeout = setTimeout(() => {
        console.warn("[工具箱] 跳转超时，强制重试...");
        if (window.location.href !== url) window.location.href = url;
      }, SCROLL_CONFIG.navTimeout);

      window.location.href = url;
    } else {
      console.log("[工具箱] 没有更多帖子");
      updateAutoStatus("没有更多帖子可阅读");
      stopAutoReading();
    }
  }

  // --- 滚动阅读（含累计时间+休息） ---
  async function startScrolling() {
    if (state.isScrolling || !state.autoRunning) return;
    state.isScrolling = true;
    state.scrollStartTime = Date.now();
    state.lastActionTime = Date.now();

    updateAutoStatus("📖 正在阅读帖子...");

    // 进入帖子时先点赞
    if (state.autoLikeEnabled) await autoLikeTopic();
    if (state.quickLikeEnabled) await quickLikeReplies();

    while (state.isScrolling && state.autoRunning) {
      const step = Utils.random(SCROLL_CONFIG.minDistance, SCROLL_CONFIG.maxDistance) * 2.5;
      window.scrollBy({ top: step, behavior: "smooth" });

      // 到达底部
      if (Utils.isNearBottom()) {
        await Utils.sleep(800);
        if (Utils.isNearBottom() && Utils.isPageLoaded()) {
          console.log("[工具箱] 到达底部，导航下一篇");
          await Utils.sleep(1000);
          state.isScrolling = false;
          await navigateNextTopic();
          return;
        }
      }

      // 超时强制跳转
      if (Date.now() - state.scrollStartTime > SCROLL_CONFIG.maxScrollTime) {
        console.log("[工具箱] 滚动超时，强制跳转下一篇");
        state.isScrolling = false;
        await navigateNextTopic();
        return;
      }

      await Utils.sleep(Utils.random(SCROLL_CONFIG.minSpeed, SCROLL_CONFIG.maxSpeed));

      // 累计时间 → 定时休息
      accumulateTime();

      // 偶尔往上滑一点，增加真实感（约12%概率）
      if (Math.random() < 0.12) {
        const upStep = Utils.random(30, 120);
        window.scrollBy({ top: -upStep, behavior: "smooth" });
        await Utils.sleep(Utils.random(300, 800));
      }

      // 偶尔随机暂停，模拟阅读停留（约8%概率）
      if (Math.random() < 0.08) {
        await Utils.sleep(Utils.random(1000, 3000));
      }

      // 随机快速滚动
      if (Math.random() < SCROLL_CONFIG.fastScrollChance) {
        window.scrollBy({ top: Utils.random(SCROLL_CONFIG.fastScrollMin, SCROLL_CONFIG.fastScrollMax), behavior: "smooth" });
        await Utils.sleep(200);
      }
    }
  }

  function accumulateTime() {
    const now = Date.now();
    state.accumulatedTime += now - state.lastActionTime;
    state.lastActionTime = now;
    ssSet("accumulatedTime", state.accumulatedTime);
    if (state.accumulatedTime >= SCROLL_CONFIG.browseTime) {
      state.accumulatedTime = 0;
      ssSet("accumulatedTime", 0);
      pauseForRest();
    }
  }

  async function pauseForRest() {
    state.isScrolling = false;
    const restMin = Math.floor(SCROLL_CONFIG.restTime / 60000);
    console.log(`[工具箱] 休息 ${restMin} 分钟...`);
    updateAutoStatus(`⏸️ 已浏览15分钟，休息 ${restMin} 分钟后继续...`);
    showNotification(`休息 ${restMin} 分钟`);
    await Utils.sleep(SCROLL_CONFIG.restTime);
    if (state.autoRunning) {
      console.log("[工具箱] 休息结束，继续浏览");
      showNotification("休息结束，继续浏览");
      startScrolling();
    }
  }

  // --- 自动点赞：主题首帖 ---
  async function autoLikeTopic() {
    if (!state.autoLikeEnabled || !state.autoRunning) return;

    const match = location.pathname.match(/\/t\/[^/]+\/(\d+)/);
    if (!match) return;
    const topicId = match[1];
    if (state.likedTopics.includes(topicId)) return;

    await Utils.sleep(2000);
    const likeBtn = document.querySelector("div.discourse-reactions-reaction-button button.btn-toggle-reaction-like");
    if (likeBtn && !likeBtn.classList.contains("has-like") && !likeBtn.classList.contains("liked")) {
      likeBtn.scrollIntoView({ behavior: "smooth", block: "center" });
      await Utils.sleep(1000);
      if (!state.autoRunning) return;
      console.log("[工具箱] 自动点赞主题", topicId);
      likeBtn.click();
      await Utils.sleep(1000);
      state.likedTopics.push(topicId);
      // 最多保留 500 条
      if (state.likedTopics.length > 500) state.likedTopics.splice(0, state.likedTopics.length - 500);
      GM_setValue("ld_likedTopics", state.likedTopics);
    } else {
      // 已点赞的也记录，避免重复检查
      if (likeBtn && (likeBtn.classList.contains("has-like") || likeBtn.classList.contains("liked"))) {
        if (!state.likedTopics.includes(topicId)) {
          state.likedTopics.push(topicId);
          GM_setValue("ld_likedTopics", state.likedTopics);
        }
      }
    }
  }

  // --- 快速点赞：随机楼层 ---
  async function quickLikeReplies() {
    if (!state.quickLikeEnabled || !state.autoRunning) return;

    await Utils.sleep(2000);
    const allPosts = Array.from(document.querySelectorAll(".topic-post"));
    const available = allPosts.filter(post => {
      const btn = post.querySelector(".discourse-reactions-reaction-button button.btn-toggle-reaction-like");
      return btn && !btn.classList.contains("has-like") && !btn.classList.contains("liked") && btn.offsetParent !== null;
    });

    // 随机选最多 3 个楼层点赞
    const shuffled = available.sort(() => Math.random() - 0.5);
    const maxLikes = Math.min(3, shuffled.length);

    for (let i = 0; i < maxLikes; i++) {
      const post = shuffled[i];
      const btn = post.querySelector(".discourse-reactions-reaction-button button.btn-toggle-reaction-like");
      if (!btn || !state.autoRunning) break;
      btn.scrollIntoView({ behavior: "smooth", block: "center" });
      await Utils.sleep(500);
      btn.click();
      console.log("[工具箱] 快速点赞楼层");
      await Utils.sleep(500);
    }
  }

  // --- 导航守护（防卡死） ---
  function startNavigationGuard() {
    stopNavigationGuard();
    state.pageLoadTime = Date.now();
    state.lastPageUrl = location.href;

    state.navigationGuardInterval = setInterval(() => {
      if (!state.autoRunning) return;
      const now = Date.now();
      const timeOnPage = now - state.pageLoadTime;
      const curUrl = location.href;

      if (curUrl !== state.lastPageUrl) {
        state.pageLoadTime = now;
        state.lastPageUrl = curUrl;
        return;
      }

      const isTopic = /\/t\//.test(location.pathname);
      if (isTopic && timeOnPage > SCROLL_CONFIG.stuckTopicTime && !state.isScrolling) {
        console.warn("[工具箱] 帖子页卡住，尝试恢复...");
        recoverFromStuck();
      }
      if (!isTopic && timeOnPage > SCROLL_CONFIG.stuckListTime) {
        console.warn("[工具箱] 列表页卡住，尝试恢复...");
        recoverFromStuck();
      }
    }, SCROLL_CONFIG.guardInterval);
    console.log("[工具箱] 导航守护已启动");
  }

  function stopNavigationGuard() {
    if (state.navigationGuardInterval) {
      clearInterval(state.navigationGuardInterval);
      state.navigationGuardInterval = null;
    }
  }

  async function recoverFromStuck() {
    console.log("[工具箱] 恢复流程...");
    state.isScrolling = false;
    await Utils.sleep(1000);
    const isTopic = /\/t\//.test(location.pathname);
    if (isTopic) {
      startScrolling();
    } else {
      if (state.topicList.length === 0) await getLatestTopics();
      await navigateNextTopic();
    }
    state.pageLoadTime = Date.now();
  }

  // --- 页面加载时恢复自动刷贴 ---
  function resumeAutoRead() {
    if (!state.autoRunning) return;
    console.log("[工具箱] 恢复自动刷贴状态");
    const btn = document.getElementById("ld-auto-toggle");
    if (btn) { btn.className = "ld-auto-btn running"; btn.innerHTML = "<span>⏸ 停止刷贴</span>"; }

    startNavigationGuard();

    const isTopic = /\/t\//.test(location.pathname);
    if (isTopic) {
      setTimeout(() => {
        startScrolling();
        if (state.autoLikeEnabled) autoLikeTopic();
        if (state.quickLikeEnabled) quickLikeReplies();
      }, 2000);
    } else {
      setTimeout(async () => {
        if (state.topicList.length === 0) await getLatestTopics();
        await navigateNextTopic();
      }, 1500);
    }
  }

  // 初始化调用（延迟到 Tab 渲染之后）
  setTimeout(() => resumeAutoRead(), 500);

  console.log("[Linux.do 工具箱] v3.6.0 已加载");
})();
