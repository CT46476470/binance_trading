// ==UserScript==
// @name         币安多合约计算器 (记忆版)
// @namespace    https://binance.com
// @version      1.4
// @description  支持变量定义、表达式计算，自动保存/恢复设置，实时获取币安价格（无eval，CSP安全）
// @author       Custom
// @match        *://*.binance.com/*
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 存储键名 ====================
    const STORAGE_VARS = 'binance_calc_variables';
    const STORAGE_EXPR = 'binance_calc_expression';

    // ==================== 样式 ====================
    GM_addStyle(`
        #calc-panel {
            position: fixed;
            top: 100px;
            right: 20px;
            width: 380px;
            background: #1f2937;
            color: #f3f4f6;
            border-radius: 12px;
            box-shadow: 0 8px 20px rgba(0,0,0,0.4);
            font-family: monospace;
            font-size: 13px;
            z-index: 999999999;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            resize: both;
            min-width: 320px;
        }
        .calc-header {
            background: #0f172a;
            padding: 8px 12px;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #334155;
            user-select: none;
        }
        .calc-header span { font-weight: bold; color: #60a5fa; }
        .calc-close {
            background: #ef4444;
            border: none;
            color: white;
            width: 22px;
            height: 22px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .calc-content { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
        .variables-section, .expression-section {
            background: #111827;
            border-radius: 8px;
            padding: 8px;
        }
        .section-title { font-weight: bold; margin-bottom: 8px; color: #9ca3af; font-size: 12px; }
        .var-list {
            max-height: 200px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 8px;
        }
        .var-item {
            background: #1f2937;
            border-radius: 6px;
            padding: 6px;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
        }
        .var-name { font-weight: bold; min-width: 40px; color: #fbbf24; }
        .var-desc { flex: 1; color: #d1d5db; font-size: 11px; }
        .var-remove { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px; }
        .add-var-form {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 6px;
            align-items: center;
        }
        .add-var-form input, .add-var-form select {
            background: #374151;
            border: 1px solid #4b5563;
            color: white;
            border-radius: 4px;
            padding: 4px 6px;
            font-size: 11px;
        }
        .add-var-form .symbol-input { width: 90px; }
        .btn {
            background: #3b82f6;
            border: none;
            color: white;
            border-radius: 4px;
            padding: 4px 8px;
            cursor: pointer;
            font-size: 11px;
        }
        .btn:hover { background: #2563eb; }
        .expr-input {
            width: 100%;
            background: #374151;
            border: 1px solid #4b5563;
            color: white;
            border-radius: 6px;
            padding: 6px;
            font-family: monospace;
            font-size: 13px;
            box-sizing: border-box;
        }
        .result {
            margin-top: 8px;
            background: #0f172a;
            border-radius: 6px;
            padding: 8px;
            text-align: right;
            font-size: 16px;
            font-weight: bold;
            color: #10b981;
            word-break: break-all;
        }
        .result-label { font-size: 11px; color: #9ca3af; margin-right: 6px; }
        .error-msg {
            color: #ef4444;
            font-size: 11px;
            margin-top: 4px;
            text-align: right;
        }
    `);

    // ==================== 安全的表达式解析器 ====================
    function safeEval(expr, variables) {
        let replaced = expr;
        for (const [name, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\b${name}\\b`, 'g');
            replaced = replaced.replace(regex, value);
        }
        if (!/^[\d+\-*/()\s.]+$/.test(replaced)) {
            return { error: '表达式包含非法字符或未定义变量' };
        }
        try {
            const result = parseExpression(replaced);
            if (isNaN(result) || !isFinite(result)) {
                return { error: '无效表达式' };
            }
            return { value: result };
        } catch (e) {
            return { error: '表达式语法错误: ' + e.message };
        }
    }

    function parseExpression(str) {
        let pos = 0;
        const s = str.replace(/\s/g, '');
        function peek() { return s[pos]; }
        function consume(ch) {
            if (peek() === ch) {
                pos++;
                return true;
            }
            return false;
        }
        function parsePrimary() {
            if (consume('(')) {
                const expr = parseExpression();
                if (!consume(')')) throw new Error('缺少右括号');
                return expr;
            }
            let start = pos;
            while (pos < s.length && (s[pos] >= '0' && s[pos] <= '9' || s[pos] === '.')) pos++;
            if (start === pos) throw new Error('期望数字或括号');
            const num = parseFloat(s.substring(start, pos));
            if (isNaN(num)) throw new Error('无效数字');
            return num;
        }
        function parseTerm() {
            let left = parsePrimary();
            while (true) {
                if (consume('*')) {
                    left *= parsePrimary();
                } else if (consume('/')) {
                    const divisor = parsePrimary();
                    if (divisor === 0) throw new Error('除零错误');
                    left /= divisor;
                } else {
                    break;
                }
            }
            return left;
        }
        function parseExpression() {
            let left = parseTerm();
            while (true) {
                if (consume('+')) {
                    left += parseTerm();
                } else if (consume('-')) {
                    left -= parseTerm();
                } else {
                    break;
                }
            }
            return left;
        }
        const result = parseExpression();
        if (pos < s.length) throw new Error('多余字符');
        return result;
    }

    // ==================== WebSocket 部分 ====================
    let variables = [];
    let currentPrices = {};
    let wsConnections = {};

    function getWsBase(market) {
        return market === 'spot' ? 'wss://stream.binance.com/ws/' : 'wss://fstream.binance.com/ws/';
    }

    function subscribeVariable(varObj) {
        const key = varObj.name;
        if (wsConnections[key]) {
            wsConnections[key].close();
            delete wsConnections[key];
        }

        const symbolLower = varObj.symbol.toLowerCase();
        let streamName = '';
        if (varObj.priceType === 'latest') {
            streamName = `${symbolLower}@aggTrade`;
        } else if (varObj.priceType === 'bid1' || varObj.priceType === 'ask1') {
            streamName = `${symbolLower}@bookTicker`;
        }
        const wsUrl = `${getWsBase(varObj.market)}${streamName}`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {};
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                let price = null;
                if (varObj.priceType === 'latest') {
                    if (data.p) price = parseFloat(data.p);
                } else if (varObj.priceType === 'bid1') {
                    if (data.b) price = parseFloat(data.b);
                } else if (varObj.priceType === 'ask1') {
                    if (data.a) price = parseFloat(data.a);
                }
                if (price !== null && !isNaN(price)) {
                    currentPrices[varObj.name] = price;
                    updateVariableDisplay(varObj.name, price);
                    updateResult();
                }
            } catch(e) {}
        };
        ws.onerror = () => {};
        ws.onclose = () => {
            setTimeout(() => {
                if (variables.some(v => v.name === varObj.name)) {
                    subscribeVariable(varObj);
                }
            }, 3000);
        };
        wsConnections[key] = ws;
    }

    function updateVariableDisplay(name, price) {
        const varItems = document.querySelectorAll('.var-item');
        for (let item of varItems) {
            const nameSpan = item.querySelector('.var-name');
            if (nameSpan && nameSpan.textContent === name) {
                const priceSpan = item.querySelector('.var-price');
                if (priceSpan) priceSpan.textContent = price.toFixed(4);
                break;
            }
        }
    }

    // 保存变量到 localStorage
    function saveVariables() {
        const toStore = variables.map(v => ({
            name: v.name,
            market: v.market,
            symbol: v.symbol,
            priceType: v.priceType
        }));
        localStorage.setItem(STORAGE_VARS, JSON.stringify(toStore));
    }

    // 保存表达式
    function saveExpression(expr) {
        localStorage.setItem(STORAGE_EXPR, expr);
    }

    // 加载变量
    function loadVariables() {
        const stored = localStorage.getItem(STORAGE_VARS);
        if (stored) {
            try {
                const loaded = JSON.parse(stored);
                variables = loaded.map(v => ({
                    name: v.name,
                    market: v.market,
                    symbol: v.symbol,
                    priceType: v.priceType
                }));
                // 重新订阅每个变量
                variables.forEach(v => subscribeVariable(v));
                renderVariableList();
                return true;
            } catch(e) {}
        }
        return false;
    }

    // 加载表达式
    function loadExpression() {
        return localStorage.getItem(STORAGE_EXPR) || '';
    }

    function addVariable(name, market, symbol, priceType) {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            alert('变量名只能包含字母、数字、下划线，且不能以数字开头');
            return false;
        }
        if (variables.some(v => v.name === name)) {
            alert('变量名已存在');
            return false;
        }
        const newVar = { name, market, symbol: symbol.toUpperCase(), priceType };
        variables.push(newVar);
        subscribeVariable(newVar);
        renderVariableList();
        saveVariables();          // 保存变量
        updateResult();           // 重新计算结果（因为变量变了）
        return true;
    }

    function removeVariable(name) {
        variables = variables.filter(v => v.name !== name);
        if (wsConnections[name]) {
            wsConnections[name].close();
            delete wsConnections[name];
        }
        delete currentPrices[name];
        renderVariableList();
        saveVariables();          // 保存变量
        updateResult();
    }

    function renderVariableList() {
        const listContainer = document.querySelector('.var-list');
        if (!listContainer) return;
        if (variables.length === 0) {
            listContainer.innerHTML = '<div style="color:#9ca3af; text-align:center;">暂无变量，请添加</div>';
            return;
        }
        listContainer.innerHTML = variables.map(v => {
            let desc = `${v.symbol} (${v.market === 'spot' ? '现货' : '合约'}) `;
            if (v.priceType === 'latest') desc += '最新价';
            else if (v.priceType === 'bid1') desc += '买一价';
            else desc += '卖一价';
            const price = currentPrices[v.name] !== undefined ? currentPrices[v.name].toFixed(4) : '--';
            return `
                <div class="var-item">
                    <span class="var-name">${v.name}</span>
                    <span class="var-desc">${desc}</span>
                    <span class="var-price" style="color:#fbbf24;">${price}</span>
                    <button class="var-remove" data-name="${v.name}">✖</button>
                </div>
            `;
        }).join('');
        document.querySelectorAll('.var-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const name = btn.getAttribute('data-name');
                removeVariable(name);
            });
        });
    }

    function updateResult() {
        const exprInput = document.querySelector('#calc-expr');
        const resultSpan = document.querySelector('#calc-result');
        const errorSpan = document.querySelector('#calc-error');
        if (!exprInput || !resultSpan) return;

        const expr = exprInput.value.trim();
        // 每次输入都保存表达式（实时）
        saveExpression(expr);

        if (expr === '') {
            resultSpan.textContent = '等待输入';
            if (errorSpan) errorSpan.textContent = '';
            return;
        }

        const varValues = {};
        const undefinedVars = [];
        for (const v of variables) {
            if (currentPrices[v.name] !== undefined && !isNaN(currentPrices[v.name])) {
                varValues[v.name] = currentPrices[v.name];
            } else {
                undefinedVars.push(v.name);
            }
        }
        if (undefinedVars.length > 0) {
            resultSpan.textContent = '--';
            if (errorSpan) errorSpan.textContent = `变量 ${undefinedVars.join(', ')} 暂无价格数据`;
            return;
        }

        const resultObj = safeEval(expr, varValues);
        if (resultObj.error) {
            resultSpan.textContent = '--';
            if (errorSpan) errorSpan.textContent = resultObj.error;
        } else {
            resultSpan.textContent = resultObj.value.toFixed(8);
            if (errorSpan) errorSpan.textContent = '';
        }
    }

    function createCalculator() {
        const existing = document.getElementById('calc-panel');
        if (existing) existing.remove();

        const panel = document.createElement('div');
        panel.id = 'calc-panel';
        panel.innerHTML = `
            <div class="calc-header">
                <span>🔢 币安多合约计算器</span>
                <button class="calc-close">×</button>
            </div>
            <div class="calc-content">
                <div class="variables-section">
                    <div class="section-title">📌 变量定义</div>
                    <div class="var-list"></div>
                    <div class="add-var-form">
                        <input type="text" id="var-name" placeholder="变量名 (如 a)" maxlength="20" style="width:70px;">
                        <select id="var-market">
                            <option value="spot">现货</option>
                            <option value="futures">合约</option>
                        </select>
                        <input type="text" id="var-symbol" placeholder="交易对 (如 BTCUSDT)" class="symbol-input">
                        <select id="var-price-type">
                            <option value="latest">最新价</option>
                            <option value="bid1">买一价</option>
                            <option value="ask1">卖一价</option>
                        </select>
                        <button class="btn" id="add-var-btn">添加</button>
                    </div>
                </div>
                <div class="expression-section">
                    <div class="section-title">📝 表达式 (支持 + - * / 和括号)</div>
                    <input type="text" id="calc-expr" class="expr-input" placeholder="例: a/b - c" autocomplete="off">
                    <div class="result">
                        <span class="result-label">结果 = </span>
                        <span id="calc-result">等待输入</span>
                    </div>
                    <div id="calc-error" class="error-msg"></div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        // 拖拽功能
        const header = panel.querySelector('.calc-header');
        let isDragging = false, startX, startY, startLeft, startTop;
        header.addEventListener('mousedown', (e) => {
            if (e.target === header.querySelector('.calc-close')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            panel.style.transition = 'none';
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            let left = startLeft + (e.clientX - startX);
            let top = startTop + (e.clientY - startY);
            left = Math.max(0, Math.min(left, window.innerWidth - panel.offsetWidth));
            top = Math.max(0, Math.min(top, window.innerHeight - panel.offsetHeight));
            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        });
        document.addEventListener('mouseup', () => isDragging = false);
        document.addEventListener('mouseleave', () => isDragging = false);

        // 关闭按钮（不清除存储，下次打开依然恢复）
        panel.querySelector('.calc-close').addEventListener('click', () => {
            Object.values(wsConnections).forEach(ws => ws.close());
            panel.remove();
        });

        // 添加变量
        const addBtn = panel.querySelector('#add-var-btn');
        addBtn.addEventListener('click', () => {
            const name = panel.querySelector('#var-name').value.trim();
            const market = panel.querySelector('#var-market').value;
            const symbol = panel.querySelector('#var-symbol').value.trim();
            const priceType = panel.querySelector('#var-price-type').value;
            if (!name || !symbol) {
                alert('请填写变量名和交易对');
                return;
            }
            if (addVariable(name, market, symbol, priceType)) {
                panel.querySelector('#var-name').value = '';
                panel.querySelector('#var-symbol').value = '';
            }
        });

        // 表达式输入
        const exprInput = panel.querySelector('#calc-expr');
        exprInput.addEventListener('input', () => updateResult());

        // 先尝试加载存储
        const hasVars = loadVariables();        // 加载变量并订阅
        const savedExpr = loadExpression();
        exprInput.value = savedExpr;

        // 如果没有加载到变量，至少保证变量列表为空
        if (!hasVars) {
            renderVariableList();
        }

        // 初始化结果
        updateResult();
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createCalculator);
    } else {
        createCalculator();
    }
})();
