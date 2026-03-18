// ==UserScript==
// @name         币安 现货+合约 多开实时行情面板
// @namespace    https://binance.com
// @version      2.0
// @description  支持多开面板 | 币安现货/合约实时价格+多档深度 | 独立交易对/配置
// @author       Custom
// @match        *://*.binance.com/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function (window) {
    'use strict';

    // ====================== 全局样式 ======================
    GM_addStyle(`
        /* 全局新建按钮 */
        #create-market-panel-btn {
            position: fixed;
            top: 20px;
            left: 20px;
            z-index: 9999999999;
            background: #0071eb;
            color: #fff;
            border: none;
            border-radius: 6px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        }
        #create-market-panel-btn:hover { background: #0088ff; }

        /* 行情面板通用样式 */
        .binance-market-panel {
            position: fixed;
            background: #111827;
            color: #f3f4f6;
            padding: 12px;
            border-radius: 8px;
            font-size: 12px;
            font-family: Arial, sans-serif;
            z-index: 999999999;
            box-shadow: 0 4px 16px rgba(0,0,0,0.8);
            width: 480px;
            min-height: 550px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            resize: both;
            overflow: auto;
        }
        .panel-drag-handle {
            padding: 8px 12px;
            background: #0f172a;
            border-radius: 6px;
            font-size: 13px;
            font-weight: bold;
            color: #60a5fa;
            text-align: center;
            border: 1px solid #334155;
            cursor: move;
            user-select: none;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .panel-close-btn {
            background: #ef4444;
            color: #fff;
            border: none;
            border-radius: 4px;
            width: 18px;
            height: 18px;
            line-height: 18px;
            text-align: center;
            cursor: pointer;
            padding: 0;
            font-size: 10px;
        }
        .market-type-bar, .symbol-bar, .price-bar, .depth-container, .config-bar {
            background: #1f2937;
            padding: 8px;
            border-radius: 6px;
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .market-type-bar { justify-content: center; }
        .symbol-bar { flex-wrap: wrap; }
        .price-bar { justify-content: space-between; }
        .depth-container { gap: 10px; flex: 1; }
        .config-bar { flex-wrap: wrap; justify-content: center; }
        .market-select, .symbol-input, .config-select {
            background: #374151;
            color: #fff;
            border: 1px solid #4b5563;
            border-radius: 4px;
            padding: 4px 6px;
            outline: none;
        }
        .symbol-input { flex: 1; min-width: 150px; }
        .action-btn {
            background: #0071eb;
            color: #fff;
            border: none;
            border-radius: 4px;
            padding: 4px 8px;
            cursor: pointer;
        }
        .action-btn:hover { background: #0088ff; }
        .depth-box {
            flex: 1;
            background: #1f2937;
            border-radius: 6px;
            padding: 8px;
            display: flex;
            flex-direction: column;
        }
        .depth-title { font-weight: bold; margin-bottom: 6px; }
        .depth-header {
            font-size: 11px;
            color: #9ca3af;
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
        }
        .depth-list {
            flex: 1;
            overflow-y: auto;
            font-size: 11px;
            line-height: 1.8;
        }
    `);

    // ====================== 面板拖拽功能 ======================
    function makeDraggable(panelEl) {
        const dragHandle = panelEl.querySelector(".panel-drag-handle");
        let isDragging = false, startX = 0, startY = 0, offsetX = 0, offsetY = 0;

        dragHandle.addEventListener("mousedown", (e) => {
            if (e.target.classList.contains("panel-close-btn")) return;
            isDragging = true;
            const rect = panelEl.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            offsetX = startX - rect.left;
            offsetY = startY - rect.top;
            panelEl.style.transition = "none";
            e.preventDefault();
        });

        document.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            let left = e.clientX - offsetX;
            let top = e.clientY - offsetY;
            left = Math.max(0, Math.min(left, window.innerWidth - panelEl.offsetWidth));
            top = Math.max(0, Math.min(top, window.innerHeight - panelEl.offsetHeight));
            panelEl.style.left = left + "px";
            panelEl.style.top = top + "px";
            panelEl.style.right = "auto";
            panelEl.style.bottom = "auto";
        });

        const endDrag = () => isDragging = false;
        document.addEventListener("mouseup", endDrag);
        document.addEventListener("mouseleave", endDrag);
    }

    // ====================== 行情面板类（支持多实例） ======================
    class MarketPanel {
        constructor(index) {
            this.index = index;
            this.panelId = `market-panel-${index}`;
            // 配置
            this.marketType = "spot"; // spot=现货, futures=合约
            this.symbol = "BTCUSDT";
            this.depthLevels = 10;
            this.depthSpeed = "100ms";
            // WS实例
            this.priceWs = null;
            this.depthWs = null;
            // 数据
            this.latestPrice = null;
            this.latestDepth = { bids: [], asks: [] };
            // DOM
            this.panel = null;
            this.init();
        }

        // 获取WS基础地址
        getWsBase() {
            return this.marketType === "spot"
                ? "wss://stream.binance.com/ws/"
                : "wss://fstream.binance.com/ws/";
        }

        // 创建面板DOM
        createPanel() {
            this.panel = document.createElement('div');
            this.panel.id = this.panelId;
            this.panel.className = "binance-market-panel";
            // 默认位置错开
            this.panel.style.left = `${50 + this.index * 30}px`;
            this.panel.style.top = `${70 + this.index * 30}px`;

            this.panel.innerHTML = `
                <div class="panel-drag-handle">
                    <span>币安行情面板 ${this.index + 1}</span>
                    <button class="panel-close-btn">×</button>
                </div>

                <!-- 市场类型：现货/合约 -->
                <div class="market-type-bar">
                    <select class="market-select" data-type="market">
                        <option value="spot" selected>现货</option>
                        <option value="futures">合约</option>
                    </select>
                </div>

                <!-- 交易对 -->
                <div class="symbol-bar">
                    <input class="symbol-input" value="${this.symbol}" placeholder="交易对（如ETHUSDT）">
                    <button class="action-btn switch-symbol-btn">切换</button>
                </div>

                <!-- 实时价格 -->
                <div class="price-bar">
                    <span style="font-weight:bold; color:#38bdf8;" class="current-symbol">${this.symbol}</span>
                    <span class="real-price" style="font-size:18px; font-weight:bold; color:#fbbf24;">--</span>
                </div>

                <!-- 订单深度 -->
                <div class="depth-container">
                    <div class="depth-box">
                        <div class="depth-title" style="color:#10b981;">买单 (Bids)</div>
                        <div class="depth-header"><span>价格(USDT)</span><span>数量</span></div>
                        <div class="depth-list bids-list"></div>
                    </div>
                    <div class="depth-box">
                        <div class="depth-title" style="color:#ef4444;">卖单 (Asks)</div>
                        <div class="depth-header"><span>价格(USDT)</span><span>数量</span></div>
                        <div class="depth-list asks-list"></div>
                    </div>
                </div>

                <!-- 配置 -->
                <div class="config-bar">
                    <div>
                        <label style="color:#9ca3af;">档位</label>
                        <select class="config-select" data-type="levels">
                            <option value="5">5档</option>
                            <option value="10" selected>10档</option>
                            <option value="20">20档</option>
                        </select>
                    </div>
                    <div>
                        <label style="color:#9ca3af;">速度</label>
                        <select class="config-select" data-type="speed">
                            <option value="100ms" selected>100ms</option>
                            <option value="250ms">250ms</option>
                            <option value="500ms">500ms</option>
                        </select>
                    </div>
                    <button class="action-btn apply-config-btn">应用</button>
                </div>
            `;
            document.body.appendChild(this.panel);
            makeDraggable(this.panel);
            this.bindEvents();
        }

        // 绑定事件
        bindEvents() {
            // 关闭按钮
            this.panel.querySelector(".panel-close-btn").addEventListener("click", () => this.destroy());
            // 切换市场
            this.panel.querySelector("[data-type='market']").addEventListener("change", (e) => {
                this.marketType = e.target.value;
                this.restartAllWs();
            });
            // 切换交易对
            const switchSymbol = () => {
                const input = this.panel.querySelector(".symbol-input");
                const val = input.value.trim().toUpperCase();
                if (!val) return;
                this.symbol = val;
                this.panel.querySelector(".current-symbol").textContent = val;
                this.panel.querySelector(".real-price").textContent = "--";
                this.panel.querySelector(".bids-list").innerHTML = '<div>切换中...</div>';
                this.panel.querySelector(".asks-list").innerHTML = '<div>切换中...</div>';
                this.restartAllWs();
            };
            this.panel.querySelector(".switch-symbol-btn").addEventListener("click", switchSymbol);
            this.panel.querySelector(".symbol-input").addEventListener("keydown", e => e.key === "Enter" && switchSymbol());
            // 应用配置
            this.panel.querySelector(".apply-config-btn").addEventListener("click", () => {
                const levels = parseInt(this.panel.querySelector("[data-type='levels']").value);
                const speed = this.panel.querySelector("[data-type='speed']").value;
                this.depthLevels = levels;
                this.depthSpeed = speed;
                this.restartDepthWs();
            });
        }

        // 断开所有WS
        disconnectAllWs() {
            if (this.priceWs) { this.priceWs.close(); this.priceWs = null; }
            if (this.depthWs) { this.depthWs.close(); this.depthWs = null; }
        }

        // 重启价格WS
        restartPriceWs() {
            if (this.priceWs) this.priceWs.close();
            const symbolLower = this.symbol.toLowerCase();
            const url = `${this.getWsBase()}${symbolLower}@aggTrade`;
            this.priceWs = new WebSocket(url);

            this.priceWs.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data.p) this.latestPrice = parseFloat(data.p);
                    this.panel.querySelector(".real-price").textContent = this.latestPrice?.toFixed(2) || "--";
                } catch (err) {}
            };

            this.priceWs.onclose = () => setTimeout(() => this.restartPriceWs(), 3000);
            this.priceWs.onerror = () => this.disconnectAllWs();
        }

        // 重启深度WS
        restartDepthWs() {
            if (this.depthWs) this.depthWs.close();
            const symbolLower = this.symbol.toLowerCase();
            const url = `${this.getWsBase()}${symbolLower}@depth${this.depthLevels}@${this.depthSpeed}`;
            this.depthWs = new WebSocket(url);

            this.depthWs.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    const bids = (data.bids || data.b || []).map(item => ({
                        price: parseFloat(item[0]),
                        qty: parseFloat(item[1])
                    }));
                    const asks = (data.asks || data.a || []).map(item => ({
                        price: parseFloat(item[0]),
                        qty: parseFloat(item[1])
                    }));
                    this.renderDepth(bids, asks);
                } catch (err) {}
            };

            this.depthWs.onclose = () => setTimeout(() => this.restartDepthWs(), 3000);
            this.depthWs.onerror = () => this.disconnectAllWs();
        }

        // 渲染深度数据
        renderDepth(bids, asks) {
            const formatQty = (q) => q >= 1000 ? q.toFixed(2) : q >= 1 ? q.toFixed(3) : q.toFixed(4);
            const bidsEl = this.panel.querySelector(".bids-list");
            const asksEl = this.panel.querySelector(".asks-list");

            bidsEl.innerHTML = bids.map(b => `
                <div style="display:flex;justify-content:space-between;">
                    <span style="color:#10b981;">${b.price.toFixed(2)}</span>
                    <span>${formatQty(b.qty)}</span>
                </div>
            `).join('') || '<div style="color:#9ca3af;">无数据</div>';

            asksEl.innerHTML = asks.map(a => `
                <div style="display:flex;justify-content:space-between;">
                    <span style="color:#ef4444;">${a.price.toFixed(2)}</span>
                    <span>${formatQty(a.qty)}</span>
                </div>
            `).join('') || '<div style="color:#9ca3af;">无数据</div>';
        }

        // 重启所有WS
        restartAllWs() {
            this.disconnectAllWs();
            this.restartPriceWs();
            this.restartDepthWs();
        }

        // 初始化
        init() {
            this.createPanel();
            this.restartAllWs();
        }

        // 销毁面板（清理资源）
        destroy() {
            this.disconnectAllWs();
            this.panel.remove();
            // 从全局实例列表移除
            const idx = marketPanels.indexOf(this);
            if (idx > -1) marketPanels.splice(idx, 1);
        }
    }

    // ====================== 全局管理 ======================
    const marketPanels = [];
    let panelIndex = 0;

    // 新建面板按钮
    function createAddButton() {
        const btn = document.createElement('button');
        btn.id = 'create-market-panel-btn';
        btn.textContent = '➕ 新建行情面板';
        btn.addEventListener('click', () => {
            marketPanels.push(new MarketPanel(panelIndex++));
        });
        document.body.appendChild(btn);
    }

    // 初始化：默认创建1个面板
    function init() {
        if (window.self !== window.top) return;
        createAddButton();
        marketPanels.push(new MarketPanel(panelIndex++));
    }

    // 启动
    if (document.readyState === "complete" || document.readyState === "interactive") {
        setTimeout(init, 300);
    } else {
        window.addEventListener("DOMContentLoaded", () => setTimeout(init, 300));
    }

})(window);
