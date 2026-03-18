// ==UserScript==
// @name         币安合约：实时价格+多档深度（精简优化版）
// @namespace    https://binance.com
// @version      1.0
// @description  币安合约实时行情+订单簿深度，支持交易对/档位/速度配置
// @author       Custom
// @match        *://fapi.binance.com/*
// @match        *://www.binance.com/*/fapi/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function (window) {
    'use strict';

    // ====================== 核心数据模块（精简版） ======================
    const MarketData = {
        symbol: "BTCUSDT",       // 默认交易对
        depthLevels: 10,         // 默认深度档位
        depthSpeed: '100ms',     // 默认更新速度
        priceWs: null,
        depthWs: null,
        latestPrice: null,
        latestDepth: { bids: [], asks: [] },
        priceCallbacks: [],
        depthCallbacks: [],

        // 初始化连接
        init() {
            this.connectAll();
        },

        // 设置交易对
        setSymbol(newSymbol) {
            if (!newSymbol || this.symbol === newSymbol) return;
            this.symbol = newSymbol.toUpperCase();
            this.disconnectAll();
            this.connectAll();
        },

        // 设置深度档位
        setDepthLevels(levels) {
            if (levels === this.depthLevels) return;
            this.depthLevels = levels;
            this.reconnectDepth();
        },

        // 设置更新速度
        setDepthSpeed(speed) {
            if (speed === this.depthSpeed) return;
            this.depthSpeed = speed;
            this.reconnectDepth();
        },

        // 断开所有连接
        disconnectAll() {
            this.priceWs?.close();
            this.depthWs?.close();
            this.priceWs = this.depthWs = null;
        },

        // 重连深度数据
        reconnectDepth() {
            this.depthWs?.close();
            this.depthWs = null;
            this.connectDepth();
        },

        // 连接所有数据
        connectAll() {
            this.connectPrice();
            this.connectDepth();
        },

        // 连接实时价格WebSocket
        connectPrice() {
            const url = `wss://fstream.binance.com/ws/${this.symbol.toLowerCase()}@aggTrade`;
            this.priceWs = new WebSocket(url);
            
            this.priceWs.onmessage = (e) => {
                const data = JSON.parse(e.data);
                if (data.p) {
                    this.latestPrice = parseFloat(data.p);
                    this.priceCallbacks.forEach(cb => cb(this.latestPrice));
                }
            };
            
            this.priceWs.onclose = () => {
                setTimeout(() => this.connectPrice(), 3000);
            };
        },

        // 连接订单深度WebSocket
        connectDepth() {
            const url = `wss://fstream.binance.com/ws/${this.symbol.toLowerCase()}@depth${this.depthLevels}@${this.depthSpeed}`;
            this.depthWs = new WebSocket(url);
            
            this.depthWs.onmessage = (e) => {
                const data = JSON.parse(e.data);
                if (data.b && data.a) {
                    const bids = data.b.map(item => ({ price: parseFloat(item[0]), qty: parseFloat(item[1]) }));
                    const asks = data.a.map(item => ({ price: parseFloat(item[0]), qty: parseFloat(item[1]) }));
                    this.latestDepth = { bids, asks };
                    this.depthCallbacks.forEach(cb => cb(this.latestDepth));
                }
            };
            
            this.depthWs.onclose = () => {
                setTimeout(() => this.connectDepth(), 3000);
            };
        },

        // 注册价格更新回调
        onPrice(callback) {
            this.priceCallbacks.push(callback);
        },

        // 注册深度更新回调
        onDepth(callback) {
            this.depthCallbacks.push(callback);
        }
    };

    // ====================== 面板样式 ======================
    GM_addStyle(`
        #market-panel {
            position: fixed;
            top: 70px;
            right: 20px;
            background: #111827;
            color: #f3f4f6;
            padding: 12px;
            border-radius: 8px;
            font-size: 12px;
            font-family: Arial, sans-serif;
            z-index: 999999999;
            box-shadow: 0 4px 16px rgba(0,0,0,0.8);
            width: 480px;
            min-height: 520px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            resize: both;
            overflow: auto;
        }
        .drag-handle {
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
        }
        .symbol-bar {
            display: flex;
            gap: 8px;
            align-items: center;
            background: #1f2937;
            padding: 8px;
            border-radius: 6px;
        }
        .symbol-input {
            flex: 1;
            padding: 5px 7px;
            background: #374151;
            border: 1px solid #4b5563;
            border-radius: 4px;
            color: #fff;
            outline: none;
        }
        .symbol-btn {
            padding: 5px 10px;
            border: none;
            border-radius: 4px;
            background: #0071eb;
            color: #fff;
            cursor: pointer;
        }
        .price-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #1f2937;
            padding: 8px;
            border-radius: 6px;
        }
        .depth-container {
            display: flex;
            gap: 10px;
            flex: 1;
        }
        .depth-box {
            flex: 1;
            background: #1f2937;
            border-radius: 6px;
            padding: 8px;
            display: flex;
            flex-direction: column;
        }
        .depth-title {
            font-weight: bold;
            margin-bottom: 6px;
        }
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
        .config-bar {
            background: #1f2937;
            border-radius: 6px;
            padding: 8px;
            display: flex;
            gap: 10px;
            align-items: center;
        }
        .config-select {
            background: #374151;
            color: #fff;
            border: 1px solid #4b5563;
            border-radius: 4px;
            padding: 4px;
        }
    `);

    // ====================== 面板拖拽功能 ======================
    function makeDraggable(panelId) {
        const panel = document.getElementById(panelId);
        const dragHandle = panel.querySelector(".drag-handle");
        let isDragging = false, startX = 0, startY = 0, offsetX = 0, offsetY = 0;

        dragHandle.addEventListener("mousedown", (e) => {
            isDragging = true;
            const rect = panel.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            offsetX = startX - rect.left;
            offsetY = startY - rect.top;
            panel.style.transition = "none";
            e.preventDefault();
        });

        document.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            let left = e.clientX - offsetX;
            let top = e.clientY - offsetY;
            left = Math.max(0, Math.min(left, window.innerWidth - panel.offsetWidth));
            top = Math.max(0, Math.min(top, window.innerHeight - panel.offsetHeight));
            panel.style.left = left + "px";
            panel.style.top = top + "px";
            panel.style.right = "auto";
            panel.style.bottom = "auto";
        });

        const endDrag = () => isDragging = false;
        document.addEventListener("mouseup", endDrag);
        document.addEventListener("mouseleave", endDrag);
    }

    // ====================== 主面板创建 ======================
    function createMainPanel() {
        const panel = document.createElement('div');
        panel.id = 'market-panel';
        panel.innerHTML = `
            <div class="drag-handle">实时行情 + 订单簿深度 | 拖动/缩放面板</div>
            
            <!-- 交易对选择（集成到主面板） -->
            <div class="symbol-bar">
                <input class="symbol-input" id="symbol-input" value="${MarketData.symbol}" placeholder="输入交易对（如ETHUSDT）">
                <button class="symbol-btn" id="switch-btn">切换</button>
            </div>

            <!-- 实时价格 -->
            <div class="price-bar">
                <span style="font-weight:bold; color:#38bdf8;" id="current-symbol">${MarketData.symbol}</span>
                <span id="real-price" style="font-size:18px; font-weight:bold; color:#fbbf24;">--</span>
            </div>

            <!-- 订单深度 -->
            <div class="depth-container">
                <div class="depth-box">
                    <div class="depth-title" style="color:#10b981;">买单 (Bids)</div>
                    <div class="depth-header"><span>价格(USDT)</span><span>数量</span></div>
                    <div class="depth-list" id="bids-list"></div>
                </div>
                <div class="depth-box">
                    <div class="depth-title" style="color:#ef4444;">卖单 (Asks)</div>
                    <div class="depth-header"><span>价格(USDT)</span><span>数量</span></div>
                    <div class="depth-list" id="asks-list"></div>
                </div>
            </div>

            <!-- 配置选项 -->
            <div class="config-bar">
                <div>
                    <label style="color:#9ca3af;">档位</label>
                    <select class="config-select" id="depth-levels">
                        <option value="5">5档</option>
                        <option value="10" selected>10档</option>
                        <option value="20">20档</option>
                    </select>
                </div>
                <div>
                    <label style="color:#9ca3af;">更新速度</label>
                    <select class="config-select" id="depth-speed">
                        <option value="100ms" selected>100ms</option>
                        <option value="250ms">250ms</option>
                        <option value="500ms">500ms</option>
                    </select>
                </div>
                <button class="symbol-btn" id="apply-config">应用配置</button>
            </div>
        `;
        document.body.appendChild(panel);
        makeDraggable('market-panel');
        return panel;
    }

    // ====================== 数据渲染 ======================
    function bindDataRender() {
        const priceEl = document.getElementById('real-price');
        const symbolEl = document.getElementById('current-symbol');
        const bidsEl = document.getElementById('bids-list');
        const asksEl = document.getElementById('asks-list');
        const inputEl = document.getElementById('symbol-input');

        // 格式化数量
        const formatQty = (qty) => qty >= 1000 ? qty.toFixed(2) : qty >= 1 ? qty.toFixed(3) : qty.toFixed(4);

        // 更新价格
        MarketData.onPrice((price) => {
            priceEl.textContent = price.toFixed(2);
        });

        // 更新深度
        MarketData.onDepth((depth) => {
            // 买单
            bidsEl.innerHTML = depth.bids.map(b => 
                `<div style="display:flex; justify-content:space-between;">
                    <span style="color:#10b981;">${b.price.toFixed(2)}</span>
                    <span>${formatQty(b.qty)}</span>
                </div>`
            ).join('') || '<div style="color:#9ca3af;">加载中...</div>';

            // 卖单
            asksEl.innerHTML = depth.asks.map(a => 
                `<div style="display:flex; justify-content:space-between;">
                    <span style="color:#ef4444;">${a.price.toFixed(2)}</span>
                    <span>${formatQty(a.qty)}</span>
                </div>`
            ).join('') || '<div style="color:#9ca3af;">加载中...</div>';
        });

        // 交易对切换
        const switchSymbol = () => {
            const val = inputEl.value.trim().toUpperCase();
            if (!val) return;
            MarketData.setSymbol(val);
            symbolEl.textContent = val;
            priceEl.textContent = '--';
            bidsEl.innerHTML = asksEl.innerHTML = '<div style="color:#9ca3af;">切换中...</div>';
        };

        // 绑定事件
        document.getElementById('switch-btn').addEventListener('click', switchSymbol);
        inputEl.addEventListener('keydown', e => e.key === 'Enter' && switchSymbol());

        // 配置应用
        document.getElementById('apply-config').addEventListener('click', () => {
            const levels = parseInt(document.getElementById('depth-levels').value);
            const speed = document.getElementById('depth-speed').value;
            MarketData.setDepthLevels(levels);
            MarketData.setDepthSpeed(speed);
        });
    }

    // ====================== 初始化 ======================
    function init() {
        if (window.self !== window.top) return;
        createMainPanel();
        bindDataRender();
        MarketData.init();
    }

    // 页面加载完成后初始化
    if (document.readyState === "complete" || document.readyState === "interactive") {
        setTimeout(init, 300);
    } else {
        window.addEventListener("DOMContentLoaded", () => setTimeout(init, 300));
    }

})(window);
