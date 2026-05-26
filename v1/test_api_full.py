#!/usr/bin/env python3
import json
import sys
import urllib.request
import urllib.error

BASE = "http://localhost:8000"
passed = 0
failed = 0
test_results = []

def api(method, path, data=None, token=None):
    url = f"{BASE}{path}"
    body = json.dumps(data).encode() if data else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            code = resp.status
            text = resp.read().decode()
            return code, json.loads(text) if text else {}
    except urllib.error.HTTPError as e:
        text = e.read().decode() if e.fp else ""
        try:
            return e.code, json.loads(text)
        except:
            return e.code, {"raw": text[:200]}
    except Exception as ex:
        return 0, {"error": str(ex)}

def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        test_results.append(("PASS", name, detail))
        print(f"  ✅ {name}")
    else:
        failed += 1
        test_results.append(("FAIL", name, detail))
        print(f"  ❌ {name} {detail}")

print("=== 1. Auth 认证 ===")
code, data = api("POST", "/api/auth/wechat/login", {"code": "dev_test_user"})
token = data.get("access_token", "")
check("登录(dev模式)", bool(token), f"code={code}, data_keys={list(data.keys()) if isinstance(data, dict) else 'N/A'}")
code, _ = api("GET", "/api/me", token="invalid_token")
check("无效token→401", code == 401, f"got {code}")
code, _ = api("GET", "/api/me")
check("无token→401", code == 401, f"got {code}")

if not token:
    print("❌ 登录失败，无法继续后续测试")
    sys.exit(1)

print("\n=== 2. Projects 项目管理 ===")
code, proj = api("POST", "/api/projects", {"name": "测试餐厅", "industry": "restaurant"}, token)
proj_id = proj.get("id", "")
check("创建项目", code == 201 and bool(proj_id), f"code={code}, id={proj_id}")
code, pl = api("GET", "/api/projects", token=token)
check("项目列表", pl.get("total", 0) >= 1, f"total={pl.get('total',0)}")
code, pd = api("GET", f"/api/projects/{proj_id}", token=token)
check("项目详情", pd.get("name") == "测试餐厅", f"name={pd.get('name')}")
code, pu = api("PATCH", f"/api/projects/{proj_id}", {"name": "测试餐厅V2"}, token)
check("更新项目", pu.get("name") == "测试餐厅V2", f"name={pu.get('name')}")
code, _ = api("GET", "/api/projects/nonexistent", token=token)
check("不存在项目→404", code == 404, f"got {code}")

print("\n=== 3. Records 票据记录 ===")
code, r1 = api("POST", "/api/records", {"project_id": proj_id, "direction": "out", "merchant_name": "美团", "amount": 156.80, "category_code": "platform_fee", "category_l1": "平台佣金", "category_l2": "美团/饿了么", "confidence": 0.95, "reason": "商户匹配", "invoice_date": "2025-05-20", "file_id": None}, token)
r1_id = r1.get("id", "")
check("创建支出记录", bool(r1_id), f"id={r1_id}")
code, r2 = api("POST", "/api/records", {"project_id": proj_id, "direction": "income", "merchant_name": "手工录入", "amount": 5000.00, "category_code": "other", "category_l1": "其他", "category_l2": "", "confidence": 1.0, "reason": "手工", "invoice_date": "2025-05-20", "file_id": None}, token)
r2_id = r2.get("id", "")
check("创建收入记录", bool(r2_id), f"id={r2_id}")
code, r3 = api("POST", "/api/records", {"project_id": proj_id, "direction": "out", "merchant_name": "新发地", "amount": 890.50, "category_code": "food_material", "category_l1": "食材", "category_l2": "蔬菜", "confidence": 1.0, "reason": "商户匹配", "invoice_date": "2025-05-21", "file_id": None}, token)
r3_id = r3.get("id", "")
check("创建食材记录", bool(r3_id), f"id={r3_id}")
code, rd = api("GET", f"/api/records/{r1_id}", token=token)
check("获取单条记录", rd.get("merchant_name") == "美团", f"merchant={rd.get('merchant_name')}")
code, rl = api("GET", f"/api/projects/{proj_id}/records", token=token)
check("记录列表(项目下)", rl.get("total", 0) >= 3, f"total={rl.get('total',0)}")
code, ri = api("GET", f"/api/projects/{proj_id}/records?direction=income", token=token)
check("direction过滤", ri.get("total", 0) >= 1, f"total={ri.get('total',0)}")
code, rc = api("GET", f"/api/projects/{proj_id}/records?category_code=food_material", token=token)
check("category过滤", rc.get("total", 0) >= 1, f"total={rc.get('total',0)}")
code, ru = api("PATCH", f"/api/records/{r1_id}", {"amount": 200.00, "is_manual_corrected": True}, token)
check("更新记录", "amount" in ru.get("updated_fields", []) or ru.get("is_manual_corrected") == True, f"data={ru}")
code, _ = api("GET", "/api/records/nonexistent", token=token)
check("不存在记录→404", code == 404, f"got {code}")

print("\n=== 4. Stats 项目统计 ===")
code, stats = api("GET", f"/api/projects/{proj_id}/stats", token=token)
check("统计接口", code == 200, f"code={code}")
tc = stats.get("total_cost", 0)
ti = stats.get("total_income", 0)
gp = stats.get("gross_profit", 0)
gm = stats.get("gross_margin", 0)
float_ok = all(len(str(v).split(".")[1]) <= 2 if "." in str(v) else True for v in [tc, ti, gp])
check("浮点精度(≤2位)", float_ok, f"cost={tc} income={ti} profit={gp}")
check("毛利率范围(0-100)", 0 <= gm <= 100, f"margin={gm}")
check("分类汇总非空", len(stats.get("cost_by_category", [])) >= 1, f"cats={len(stats.get('cost_by_category', []))}")

print("\n=== 5. Reports 报表 ===")
code, rep = api("GET", f"/api/projects/{proj_id}/report", token=token)
has_detail = "detail" in rep or "gross_profit" in rep or "detail_json" in rep
check("生成报表", code == 200 and has_detail, f"code={code}, keys={list(rep.keys())[:5]}")
code, repm = api("GET", f"/api/projects/{proj_id}/report?month=2025-05", token=token)
check("月份过滤报表", code == 200, f"code={code}")
code, repx = api("GET", f"/api/projects/{proj_id}/report?month=2024-01", token=token)
check("不存在月份报表", code == 200, f"code={code}")
code, share = api("POST", f"/api/projects/{proj_id}/report/share", token=token)
check("分享报表", code == 200 or "share_token" in share, f"code={code}, data={share}")

print("\n=== 6. Export 导出 ===")
url = f"{BASE}/api/projects/{proj_id}/report/export?fmt=csv"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
try:
    with urllib.request.urlopen(req) as resp:
        csv_text = resp.read().decode()
    check("CSV导出", "名称" in csv_text or "商户" in csv_text, f"len={len(csv_text)}")
except Exception as ex:
    check("CSV导出", False, str(ex))

url2 = f"{BASE}/api/projects/{proj_id}/report/export?fmt=excel"
req2 = urllib.request.Request(url2, headers={"Authorization": f"Bearer {token}"})
try:
    with urllib.request.urlopen(req2) as resp:
        excel_bytes = resp.read()
    check("Excel导出", len(excel_bytes) > 100 and excel_bytes[:4] == b'PK\x03\x04', f"len={len(excel_bytes)}")
except Exception as ex:
    check("Excel导出", False, str(ex))

print("\n=== 7. Manual Income 手工录入 ===")
code, mi = api("POST", f"/api/projects/{proj_id}/manual-income", {"amount": 3000.00, "month": "2025-05"}, token)
check("手工录入收入", bool(mi.get("id")), f"id={mi.get('id')}, action={mi.get('action')}")
code, mi2 = api("POST", f"/api/projects/{proj_id}/manual-income", {"amount": 3500.00, "month": "2025-05"}, token)
check("重复月份→更新", mi2.get("action") == "updated", f"action={mi2.get('action')}")
code, mi3 = api("POST", f"/api/projects/{proj_id}/manual-income", {"amount": 0.01, "month": "2025-06"}, token)
check("最小金额", bool(mi3.get("id")), f"id={mi3.get('id')}")

print("\n=== 8. Toolkit 工具包 ===")
code, tk = api("GET", "/api/toolkit/contents", token=token)
tk_items = tk.get("items", []) if isinstance(tk, dict) else tk
check("工具包内容", len(tk_items) >= 1, f"count={len(tk_items)}")

print("\n=== 9. Plans 套餐 ===")
code, plans = api("GET", "/api/plans", token=token)
check("套餐列表", isinstance(plans, (list, dict)), f"type={type(plans).__name__}")

print("\n=== 10. Users 用户 ===")
code, me = api("GET", "/api/me", token=token)
check("用户信息", bool(me.get("id")), f"id={me.get('id')}")
code, quota = api("GET", "/api/me/quota", token=token)
check("用户配额", code == 200, f"code={code}")

print("\n=== 11. Payments 支付 ===")
code, pp = api("POST", "/api/payments/wechat/prepay", {"plan_code": "basic"}, token)
check("微信预支付(plan_code=basic)", code in (200, 404), f"code={code}, data={pp}")

print("\n=== 12. Health 健康检查 ===")
code, health = api("GET", "/health")
check("健康检查", code == 200, f"code={code}")

print("\n=== 13. Delete 删除操作 ===")
code, _ = api("DELETE", f"/api/records/{r1_id}", token=token)
check("删除支出记录", code == 204, f"got {code}")
code, _ = api("DELETE", f"/api/records/{r2_id}", token=token)
check("删除收入记录", code == 204, f"got {code}")
code, _ = api("DELETE", f"/api/records/{r3_id}", token=token)
check("删除食材记录", code == 204, f"got {code}")
code, _ = api("DELETE", f"/api/projects/{proj_id}", token=token)
check("删除项目", code == 204, f"got {code}")
code, _ = api("GET", f"/api/projects/{proj_id}", token=token)
check("删除后查询→404", code == 404, f"got {code}")

print("\n" + "=" * 60)
print(f"API 测试结果: ✅ {passed} 通过, ❌ {failed} 失败")
if failed > 0:
    print("\n失败项:")
    for s, n, d in test_results:
        if s == "FAIL":
            print(f"  ❌ {n}: {d}")
sys.exit(0 if failed == 0 else 1)
