import requests
import matplotlib.pyplot as plt
import json

# ===================== 配置项 =====================
# API接口地址
API_SYMBOL_LIST = "https://capi.coinglass.com/api/support/symbol"
API_COIN_INFO = "https://fapi.coinglass.com/api/coin/v2/info"
# 请求头（必须添加，否则API会拒绝访问）
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}
# 目标币种
TARGET_SYMBOL = "BTC"
# ==================================================

def get_support_symbols():
    """获取CoinGlass支持的交易对列表"""
    try:
        response = requests.get(API_SYMBOL_LIST, headers=HEADERS, timeout=10)
        response.raise_for_status()  # 抛出HTTP异常
        data = response.json()
        if data.get("code") == "0" and data.get("success"):
            print(f"✅ 成功获取交易对列表，共 {len(data['data'])} 个币种")
            return data["data"]
        else:
            print(f"❌ API返回错误：{data.get('msg')}")
            return []
    except Exception as e:
        print(f"❌ 获取交易对失败：{str(e)}")
        return []

def get_coin_detail(symbol):
    """获取指定币种的详细数据"""
    try:
        params = {"symbol": symbol}
        response = requests.get(API_COIN_INFO, headers=HEADERS, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        if data.get("code") == "0" and data.get("success"):
            print(f"✅ 成功获取 {symbol} 行情数据")
            return data["data"]
        else:
            print(f"❌ 获取币种数据失败：{data.get('msg')}")
            return None
    except Exception as e:
        print(f"❌ 请求币种数据失败：{str(e)}")
        return None

def calculate_volume_diff(coin_data):
    """计算成交量差值：期货成交量 - 现货成交量"""
    spot_vol = coin_data["volUsd"]          # 现货成交量(USD)
    futures_vol = coin_data["futuresVolUsd"]# 期货成交量(USD)
    vol_diff = futures_vol - spot_vol      # 成交量差值
    return spot_vol, futures_vol, vol_diff

def create_chart(coin_data, spot_vol, futures_vol, vol_diff):
    """生成可视化图表"""
    # 单位转换：转为亿美元（数值更易读）
    unit = 10**8
    spot_vol_m = spot_vol / unit
    futures_vol_m = futures_vol / unit
    vol_diff_m = vol_diff / unit
    oi_m = coin_data["openInterest"] / unit  # 持仓量

    # 设置中文字体（解决中文乱码）
    plt.rcParams["font.family"] = ["SimHei", "WenQuanYi Micro Hei", "Heiti TC"]
    plt.rcParams["axes.unicode_minus"] = False

    # 创建画布（2行1列子图）
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8))
    fig.suptitle(f'{coin_data["name"]}({TARGET_SYMBOL}) 行情数据分析', fontsize=16, fontweight="bold")

    # 子图1：价格与涨跌幅指标
    labels1 = ["当前价格(USD)", "24h涨跌幅(%)", "7日涨跌幅(%)"]
    values1 = [
        coin_data["price"],
        coin_data["priceChangePercent24h"],
        coin_data["priceChangePercent7d"]
    ]
    colors1 = ["#FF6B6B", "#4ECDC4", "#45B7D1"]
    ax1.bar(labels1, values1, color=colors1, alpha=0.8)
    ax1.set_title("价格与涨跌幅", fontsize=12)
    ax1.grid(axis="y", linestyle="--", alpha=0.5)
    # 添加数值标签
    for i, v in enumerate(values1):
        ax1.text(i, v + max(values1)*0.02, f"{v:.2f}", ha="center", fontweight="bold")

    # 子图2：成交量与持仓量（核心：成交量差值）
    labels2 = ["现货成交量", "期货成交量", "成交量差值", "持仓量"]
    values2 = [spot_vol_m, futures_vol_m, vol_diff_m, oi_m]
    colors2 = ["#96CEB4", "#FFEAA7", "#DDA0DD", "#FFAB91"]
    ax2.bar(labels2, values2, color=colors2, alpha=0.8)
    ax2.set_title("成交量 & 持仓量 (单位：亿美元)", fontsize=12)
    ax2.grid(axis="y", linestyle="--", alpha=0.5)
    # 添加数值标签
    for i, v in enumerate(values2):
        ax2.text(i, v + max(values2)*0.02, f"{v:.2f}", ha="center", fontweight="bold")

    # 调整布局并显示图表
    plt.tight_layout()
    plt.show()

def main():
    """主函数"""
    # 1. 获取支持的交易对
    symbols = get_support_symbols()
    if not symbols:
        return

    # 2. 获取目标币种数据
    coin_data = get_coin_detail(TARGET_SYMBOL)
    if not coin_data:
        return

    # 3. 计算成交量差值
    spot_vol, futures_vol, vol_diff = calculate_volume_diff(coin_data)
    print("\n📊 成交量数据：")
    print(f"现货成交量：{spot_vol:,.2f} USD")
    print(f"期货成交量：{futures_vol:,.2f} USD")
    print(f"成交量差值：{vol_diff:,.2f} USD")

    # 4. 生成图表
    create_chart(coin_data, spot_vol, futures_vol, vol_diff)

if __name__ == "__main__":
    main()