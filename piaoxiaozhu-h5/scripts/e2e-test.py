from playwright.sync_api import sync_playwright
import time, sys

BASE = "http://localhost:3000"
passed = 0
failed = 0

def check(name, condition, detail=""):
    global passed, failed
    if condition:
        print(f"  ✅ {name}")
        passed += 1
    else:
        print(f"  ❌ {name}" + (f" — {detail}" if detail else ""))
        failed += 1

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})

    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))

    # ========== 1. Register ==========
    print("\n🔐 Register")
    page.goto(f"{BASE}/auth/register", wait_until="networkidle", timeout=15000)
    time.sleep(1)

    # Use precise selectors matching controlled inputs
    page.locator('input[placeholder="昵称 (可选)"]').fill("测试用户")
    page.locator('input[placeholder="邮箱"]').fill("e2e@test.com")
    page.locator('input[placeholder="密码 (至少6位)"]').fill("Test1234")
    page.locator('input[placeholder="确认密码"]').fill("Test1234")
    page.screenshot(path="/tmp/piaoxiaozhu-register-filled.png", full_page=True)

    page.locator('button[type="submit"]').click()
    # Wait for navigation to login page
    try:
        page.wait_for_url("**/auth/login**", timeout=5000)
        check("Register → login page", True)
    except:
        check("Register → login page", False, f"got {page.url}")
    page.screenshot(path="/tmp/piaoxiaozhu-register-result.png", full_page=True)

    # ========== 2. Login ==========
    print("\n🔑 Login")
    # We should be on login page now
    page.locator('input[placeholder="邮箱"]').fill("e2e@test.com")
    page.locator('input[placeholder="密码"]').fill("Test1234")
    page.screenshot(path="/tmp/piaoxiaozhu-login-filled.png", full_page=True)

    page.locator('button[type="submit"]').click()
    # Wait for redirect to home
    try:
        page.wait_for_url(BASE + "/", timeout=8000)
        check("Login → home page", True)
    except:
        check("Login → home page", False, f"got {page.url}")
    time.sleep(1)
    page.screenshot(path="/tmp/piaoxiaozhu-login-result.png", full_page=True)

    # ========== 3. Home Page ==========
    print("\n🏠 Home Page")
    page.goto(BASE, wait_until="networkidle", timeout=10000)
    time.sleep(1)
    check("Page title contains 票小助", "票小助" in page.title(), f"got '{page.title()}'")
    check("Empty state shown", page.locator("text=暂无项目").count() > 0)
    check("New project button exists", page.locator('button:has-text("新建")').count() > 0)
    check("TabBar visible (5 tabs)", page.locator("nav a").count() >= 5)
    page.screenshot(path="/tmp/piaoxiaozhu-home.png", full_page=True)

    # ========== 4. Create Project ==========
    print("\n📁 Create Project")
    page.locator('button:has-text("新建")').first.click()
    time.sleep(1)
    check("Modal appeared", page.locator('text=新建项目').count() > 0)

    page.locator('input[placeholder*="项目"]').fill("老王餐饮店")
    page.screenshot(path="/tmp/piaoxiaozhu-create-filled.png", full_page=True)

    page.locator('button:has-text("确定")').first.click()
    # Wait for project page
    try:
        page.wait_for_url("**/project/**", timeout=5000)
        check("Project created → project page", True)
        project_id = page.url.split("/project/")[1].split("?")[0]
    except:
        check("Project created → project page", False, f"got {page.url}")
        project_id = None
    time.sleep(1)
    page.screenshot(path="/tmp/piaoxiaozhu-project.png", full_page=True)

    # ========== 5. Project Detail ==========
    print("\n📊 Project Detail")
    if project_id:
        check("Project name shown", page.locator("text=老王餐饮店").count() > 0)
        check("TabBar has upload tab", page.locator('a:has-text("上传")').count() > 0)
        check("TabBar has report tab", page.locator('a:has-text("报表")').count() > 0)
    else:
        check("Project detail loaded", False, "not on project page")

    # ========== 6. Upload Page ==========
    print("\n📤 Upload Page")
    if project_id:
        page.goto(f"{BASE}/upload?project={project_id}", wait_until="networkidle", timeout=10000)
    else:
        page.goto(f"{BASE}/upload", wait_until="networkidle", timeout=10000)
    time.sleep(1)
    check("Upload page loaded", "/upload" in page.url)
    check("Camera/album button exists",
          page.locator("text=拍照").count() > 0 or
          page.locator("text=相册").count() > 0 or
          page.locator("text=上传票据").count() > 0)
    page.screenshot(path="/tmp/piaoxiaozhu-upload.png", full_page=True)

    # ========== 7. Report Page ==========
    print("\n📈 Report Page")
    if project_id:
        page.goto(f"{BASE}/report?project={project_id}", wait_until="networkidle", timeout=10000)
    else:
        page.goto(f"{BASE}/report", wait_until="networkidle", timeout=10000)
    time.sleep(2)
    check("Report page loaded", "/report" in page.url, f"got {page.url}")
    page.screenshot(path="/tmp/piaoxiaozhu-report.png", full_page=True)

    # ========== 8. Mine Page ==========
    print("\n👤 Mine Page")
    page.goto(f"{BASE}/mine", wait_until="networkidle", timeout=10000)
    time.sleep(1)
    check("Mine page loaded", page.url == f"{BASE}/mine")
    check("User name displayed", page.locator("text=测试用户").count() > 0)
    check("Logout button exists", page.locator('text=退出登录').count() > 0)
    page.screenshot(path="/tmp/piaoxiaozhu-mine.png", full_page=True)

    # ========== 9. Member Page ==========
    print("\n💎 Member Page")
    page.goto(f"{BASE}/member", wait_until="networkidle", timeout=10000)
    time.sleep(1)
    check("Member page loaded", page.url == f"{BASE}/member")
    check("Plan cards shown", page.locator("text=免费").count() > 0 or page.locator("text=会员").count() > 0)
    page.screenshot(path="/tmp/piaoxiaozhu-member.png", full_page=True)

    # ========== 10. Toolkit Page ==========
    print("\n🧰 Toolkit Page")
    page.goto(f"{BASE}/toolkit", wait_until="networkidle", timeout=10000)
    time.sleep(1)
    check("Toolkit page loaded", page.url == f"{BASE}/toolkit")
    page.screenshot(path="/tmp/piaoxiaozhu-toolkit.png", full_page=True)

    # ========== 11. Auth Guard ==========
    print("\n🔒 Auth Guard")
    ctx2 = browser.new_context(viewport={"width": 390, "height": 844})
    page2 = ctx2.new_page()
    page2.goto(f"{BASE}/mine", wait_until="networkidle", timeout=10000)
    time.sleep(1)
    check("Unauthenticated → login redirect", "/auth/login" in page2.url, f"got {page2.url}")
    ctx2.close()

    # ========== 12. Back to project - test record creation via OCR text ==========
    print("\n🧾 OCR Record Creation")
    if project_id:
        page.goto(f"{BASE}/project/{project_id}", wait_until="networkidle", timeout=10000)
        time.sleep(1)
        check("Back to project page", "/project/" in page.url)
        page.screenshot(path="/tmp/piaoxiaozhu-project-back.png", full_page=True)

    # ========== Summary ==========
    print("\n" + "=" * 60)
    print(f"📊 Results: {passed} passed, {failed} failed, {passed + failed} total")
    if errors:
        print(f"\n⚠️ Page errors ({len(errors)}):")
        for e in errors[:5]:
            print(f"  {e[:200]}")
    else:
        print("\n✅ No page errors")
    print("=" * 60)

    browser.close()
    sys.exit(1 if failed > 0 else 0)
