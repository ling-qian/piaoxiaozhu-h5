"""小票明细对账的回归测试。

这些用例锁的是「不误报」的边界——对账报警一旦变多，用户就不会再信它。
"""

from piaoxiaozhu_core.receipt_lines import cross_check, extract_items


def test_normal_receipt_passes():
    text = "盒马鲜生\n鸡蛋 12.80\n青菜 6.50\n合计 19.30\n实收 20.00\n找零 0.70"
    r = cross_check(text, 19.30)
    assert r.checked
    assert r.ok


def test_misread_total_is_caught():
    """合计被读成 193.00（真实 19.30）必须抓到。"""
    text = "盒马鲜生\n鸡蛋 12.80\n青菜 6.50\n合计 193.00"
    r = cross_check(text, 193.00)
    assert not r.ok
    assert "相差" in r.message


def test_qty_times_price_uses_line_total():
    """「15 x 12.00 180.00」应取 180.00，而不是把 15 或 12.00 当金额。"""
    text = "老王烧烤\n烤串 15 x 12.00 180.00\n啤酒 4 x 8.00 32.00\n合计 212.00"
    assert extract_items(text) == [180.0, 32.0]
    assert cross_check(text, 212.00).ok


def test_discount_receipt_is_skipped():
    """有优惠/折扣时口径不同，不做判断。"""
    text = "便利店\n牛奶 25.00\n面包 12.00\n优惠 -5.00\n合计 32.00"
    r = cross_check(text, 32.00)
    assert not r.checked
    assert r.ok


def test_single_line_is_skipped():
    """只认出 1 行时不做判断：金额仍是对的，报警只会制造噪音。"""
    text = "小卖部\n矿泉水 3.00\n合计 3.00"
    r = cross_check(text, 3.00)
    assert not r.checked
    assert r.ok


def test_non_item_lines_are_excluded():
    """合计/实收/找零/税额这些行不能算进明细。"""
    text = "店名\n商品A 10.00\n商品B 20.00\n合计 30.00\n实收 50.00\n找零 20.00\n税额 3.45"
    assert extract_items(text) == [10.0, 20.0]


def test_small_rounding_difference_tolerated():
    """抹零/四舍五入造成的小差异不应报警。"""
    text = "食堂\n米饭 3.00\n菜 9.60\n合计 12.50"
    r = cross_check(text, 12.50)
    assert r.checked
    assert r.ok   # 差 0.10，在容差内
