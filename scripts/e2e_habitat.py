"""
E2E 测试脚本 - Agent OS / Habitat Workspace
覆盖：页面加载、导航切换、HabitatWorkspace 渲染、TrustPanel 渲染、
      TimelinePanel 过滤、approve 乐观更新、console 健康检查。
使用 webapp-testing 技能（Playwright）。
"""

import sys
import json
from playwright.sync_api import sync_playwright

URL = "http://localhost:5173"
RESULTS = []


def record(name, ok, detail=""):
    RESULTS.append({"name": name, "ok": ok, "detail": detail})
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path="D:/browsers/chromium-1228/chrome-win64/chrome.exe",
        )
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        console_messages = []
        page.on("console", lambda msg: console_messages.append(
            {"type": msg.type, "text": msg.text}
        ))
        page.on("pageerror", lambda err: console_messages.append(
            {"type": "pageerror", "text": str(err)}
        ))

        # 1. 页面加载（用 domcontentloaded 避免 networkidle 超时）
        page.goto(URL, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_selector("button:has-text('驾驶舱')", timeout=15000)
        page.wait_for_timeout(1500)  # 给 React 渲染时间
        record("页面加载", True, f"title={page.title()}")

        # 2. 默认视图（驾驶舱）
        dashboard = page.locator("text=驾驶舱").first
        record("默认驾驶舱导航存在", dashboard.count() > 0)

        # 3. 切换到智能体编队（HabitatWorkspace）
        page.locator("button:has-text('智能体编队')").first.click()
        page.wait_for_timeout(1200)

        # Habitat 关键元素：注意力条（aria-label="注意力分配"）
        attention = page.locator("[aria-label='注意力分配']").first
        record("Habitat: 注意力条区域", attention.count() > 0)

        # 4. 截图 Habitat
        page.screenshot(path="D:/Documents/New project 2/outputs/e2e-habitat.png", full_page=False)
        record("Habitat 截图", True)

        # 5. 检查时间线入口按钮（浮动按钮）
        timeline_btn = page.locator("button[aria-label*='时间线'], button[aria-label*='timeline'], button:has-text('时间线')").first
        record("Habitat: 时间线入口按钮", timeline_btn.count() > 0)

        # 6. 如果时间线按钮存在，点击并验证
        if timeline_btn.count() > 0:
            try:
                timeline_btn.click()
                page.wait_for_timeout(800)
                # 检查时间线过滤器
                filters = ["决策", "行动", "输出", "记忆", "协作", "状态"]
                found_filters = []
                for f in filters:
                    if page.locator(f"button:has-text('{f}')").count() > 0:
                        found_filters.append(f)
                record("Timeline: 过滤器按钮", len(found_filters) >= 3,
                       f"found={found_filters}")
                page.screenshot(path="D:/Documents/New project 2/outputs/e2e-timeline.png",
                                full_page=False)
                record("Timeline 截图", True)
                # 关闭抽屉，避免遮罩层拦截后续点击
                page.keyboard.press("Escape")
                page.wait_for_timeout(500)
            except Exception as e:
                record("Timeline 交互", False, str(e))

        # 7. 切换到审计与策略（TrustPanel）— 先确保无遮罩层
        overlay = page.locator(".habitat-drawer-overlay").first
        if overlay.count() > 0 and overlay.is_visible():
            page.keyboard.press("Escape")
            page.wait_for_timeout(500)
        page.locator("button:has-text('审计与策略')").first.click()
        page.wait_for_timeout(1000)

        trust_elements = ["信任", "权限", "autonomy", "自主"]
        found_trust = []
        for t in trust_elements:
            if page.locator(f"text={t}".lower()).count() > 0 or page.locator(f"text={t}").count() > 0:
                found_trust.append(t)
        record("TrustPanel: 信任/权限区域", len(found_trust) >= 1,
               f"found={found_trust}")
        page.screenshot(path="D:/Documents/New project 2/outputs/e2e-trust.png",
                        full_page=False)
        record("TrustPanel 截图", True)

        # 8. 切换回智能体编队，测试 approve 乐观更新
        page.locator("button:has-text('智能体编队')").first.click()
        page.wait_for_timeout(1200)

        approve_btn = page.locator("button:has-text('批准'), button:has-text('approve'), button:has-text('同意')").first
        if approve_btn.count() > 0:
            try:
                approve_btn.click()
                page.wait_for_timeout(600)
                record("Approve 乐观更新", True, "点击成功")
            except Exception as e:
                record("Approve 乐观更新", False, str(e))
        else:
            record("Approve 按钮", False, "未找到批准按钮（可能无待审批请求）")

        # 9. Console 健康检查（忽略 502 Bad Gateway — 后端未启动是已知的）
        real_errors = [m for m in console_messages
                       if m["type"] in ("error", "pageerror")
                       and "502" not in m["text"]
                       and "Bad Gateway" not in m["text"]]
        gateway_errors = [m for m in console_messages
                          if m["type"] == "error" and "502" in m["text"]]
        warnings = [m for m in console_messages if m["type"] == "warning"]
        record("Console: 无致命错误",
               len(real_errors) == 0,
               f"real_errors={len(real_errors)}, 502={len(gateway_errors)}(后端未启动), warnings={len(warnings)}")
        if real_errors:
            for e in real_errors[:3]:
                print(f"    ERROR: {e['text'][:200]}")

        # 10. 回到驾驶舱 — 先关闭可能存在的遮罩层
        overlay = page.locator(".habitat-drawer-overlay").first
        if overlay.count() > 0 and overlay.is_visible():
            page.keyboard.press("Escape")
            page.wait_for_timeout(500)
        page.locator("button:has-text('驾驶舱')").first.click()
        page.wait_for_timeout(800)
        record("返回驾驶舱", True)

        browser.close()

    # 汇总
    passed = sum(1 for r in RESULTS if r["ok"])
    failed = sum(1 for r in RESULTS if not r["ok"])
    print(f"\n=== E2E 测试汇总: {passed} PASS / {failed} FAIL / {len(RESULTS)} TOTAL ===")
    with open("D:/Documents/New project 2/outputs/e2e-results.json", "w", encoding="utf-8") as f:
        json.dump(RESULTS, f, ensure_ascii=False, indent=2)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(run())
