import json
import time
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_current_user, get_db
from app.models.plan import Order, Plan, QuotaLog
from app.models.user import User
from app.services.plan_config import PLANS, period_points, period_price_cents
from app.services.subscription import renewal_expiry
from app.services.wechat_pay import (
    WeChatPayError,
    build_pay_params,
    create_jsapi_prepay,
    decrypt_resource,
    validate_credentials,
    verify_notify,
)

router = APIRouter(prefix="/api/payments", tags=["payments"])

logger = logging.getLogger(__name__)

# 微信支付回调只处理该事件类型
TRANSACTION_SUCCESS_EVENT = "TRANSACTION.SUCCESS"


def _granted_points(plan_code: str, months: int) -> int:
    """该订单应发放的积分（按周期倍数）。

    ⚠️ 历史坑：这里原先写的是 `invoice_limit`，而 enterprise 的 invoice_limit 是
    UNLIMITED(-1)，在积分账本里 delta=-1 等于「扣 1 积分」。改用积分配置避免这种语义错位。
    """
    plan = PLANS.get(plan_code)
    if plan is None:
        return 0
    return period_points(plan, months)


# 真实支付必须齐备的参数。缺任意一项都无法完成「下单 → 付款 → 回调开通」的闭环，
# 其中 WX_PLATFORM_CERT_PATH 只用于回调验签，漏配的后果是钱扣了但回调处理不了。
REQUIRED_WECHAT_PAY_SETTINGS = (
    "WX_APPID",
    "WX_MCH_ID",
    "WX_API_KEY",
    "WX_CERT_SERIAL_NO",
    "WX_PRIVATE_KEY_PATH",
    "WX_PLATFORM_CERT_PATH",
    "WX_NOTIFY_URL",
)


def wechat_pay_ready() -> bool:
    """真实支付所需的参数是否齐全且可用。

    只判断非空是不够的：私钥路径写错、平台证书缺失、APIv3 密钥长度不对，
    都要等用户真正付款后才暴露，而那时钱已经扣了。这里直接加载一次凭证，
    把问题提前到下单之前；不通过的原因写入日志便于部署时排查。
    """
    missing = [
        name for name in REQUIRED_WECHAT_PAY_SETTINGS if not getattr(settings, name)
    ]
    if missing:
        logger.warning("微信支付参数未配置: %s", ", ".join(missing))
        return False

    if not settings.WX_NOTIFY_URL.startswith("https://"):
        logger.error("WX_NOTIFY_URL 必须是公网 HTTPS 地址: %s", settings.WX_NOTIFY_URL)
        return False
    if "?" in settings.WX_NOTIFY_URL:
        logger.error("WX_NOTIFY_URL 不能携带查询参数: %s", settings.WX_NOTIFY_URL)
        return False

    try:
        validate_credentials(
            private_key_value=settings.WX_PRIVATE_KEY_PATH,
            platform_cert_value=settings.WX_PLATFORM_CERT_PATH,
            apiv3_key=settings.WX_API_KEY,
        )
    except WeChatPayError as e:
        logger.error("微信支付凭证校验未通过: %s", e)
        return False

    return True


def _build_pay_response(
    *,
    order_id: str,
    plan_code: str,
    amount_cents: int,
    pay_params: dict,
    is_mock: bool,
) -> dict:
    """统一真实支付与 mock 的返回结构，字段名对齐小程序 requestPayment 的要求"""
    return {
        "order_id": order_id,
        "plan_code": plan_code,
        "amount_cents": amount_cents,
        "is_mock": is_mock,
        **pay_params,
    }


def _activate_subscription(db: AsyncSession, user: User, order: Order) -> object:
    """把订单对应的权益写入用户，返回新的到期时间。

    两类商品走同一个结算入口：
    - **套餐**：续费顺延（未到期在原到期时间上叠加），并按周期发积分；
    - **积分包**：只发积分，**不改变套餐与到期时间**。
    真实支付回调与联调 mock 共用这段逻辑，否则两条开通路径会各写各的。
    """
    from app.services import points as points_svc

    package = points_svc.POINT_PACKAGES.get(order.plan_code)
    if package is not None:
        db.add(
            QuotaLog(
                user_id=user.id,
                action=points_svc.ACTION_PURCHASE,
                delta=package.points,
                reason=f"购买积分包 {package.label}，订单 {order.id}",
            )
        )
        return user.plan_expires_at  # 积分包不影响订阅有效期

    new_expiry = renewal_expiry(user.plan_expires_at, order.period_months)

    user.plan_code = order.plan_code
    user.plan_expires_at = new_expiry

    db.add(
        QuotaLog(
            user_id=user.id,
            action="purchase_grant",
            delta=_granted_points(order.plan_code, order.period_months),
            reason=(
                f"购买套餐 {order.plan_code}（{order.period_months} 个月），订单 {order.id}，"
                f"有效期至 {new_expiry:%Y-%m-%d %H:%M} UTC"
            ),
        )
    )
    return new_expiry


@router.get("/orders/{order_id}")
async def get_order_status(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """查询单笔订单状态。

    前端支付回调**不可信**（requestPayment 的返回不代表真实扣款，真机调试
    模式下更会直接被限制），所以支付完成与否以本接口返回的 status 为准：
    paid = 微信回调已确认；pending = 还没收到回调（可能延迟几秒）。
    """
    try:
        order_uuid = uuid.UUID(order_id)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在"
        )

    result = await db.execute(
        select(Order).where(Order.id == order_uuid, Order.user_id == current_user.id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在"
        )

    return {
        "order_id": str(order.id),
        "status": order.status,          # pending / paid
        "plan_code": order.plan_code,
        "amount_cents": order.amount_cents,
        "paid_at": order.paid_at.isoformat() if order.paid_at else None,
    }


@router.post("/wechat/prepay")
async def wechat_prepay(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan_code = body.get("plan_code")
    if not plan_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="plan_code is required"
        )

    # 计费周期：默认 1 个月。支持 1/3/12（包月/包季/包年），
    # 价格按周期折扣算，积分按整月倍数发（折扣不克扣额度）。
    try:
        period_months = int(body.get("period_months", 1))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="period_months 必须是整数"
        )
    if period_months not in (1, 3, 12):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="period_months 只支持 1 / 3 / 12（包月 / 包季 / 包年）",
        )

    plan_result = await db.execute(
        select(Plan).where(Plan.code == plan_code, Plan.is_active == True)
    )
    plan = plan_result.scalar_one_or_none()

    from app.services import points as points_svc
    from app.services.plan_config import PLANS as _PLANS

    package = points_svc.POINT_PACKAGES.get(plan_code)
    if package is not None:
        # 积分包：价格固定、与周期无关（不改变套餐，所以不含到期时间概念）
        amount_cents = package.price_cents
        period_months = 1
    elif plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found"
        )
    elif plan.price_cents <= 0:
        # 免费套餐不该能下单：否则会生成 0 元订单，走到支付网关必然失败，
        # 还会在 orders 表里留下无法结算的垃圾记录。
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="免费套餐无需购买，可直接使用",
        )
    else:
        plan_cfg = _PLANS.get(plan_code)
        amount_cents = (
            period_price_cents(plan_cfg, period_months)
            if plan_cfg
            else plan.price_cents * period_months
        )

    order = Order(
        user_id=current_user.id,
        plan_code=plan_code,
        amount_cents=amount_cents,
        period_months=period_months,
        status="pending",
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    # 微信要求 out_trade_no 为 string(32)，而 str(uuid) 是 36 字符会被拒单；
    # uuid.hex 恰好 32 字符，回调侧 uuid.UUID(hex) 同样能还原。
    out_trade_no = order.id.hex

    if wechat_pay_ready():
        try:
            prepay_id = await create_jsapi_prepay(
                appid=settings.WX_APPID,
                mchid=settings.WX_MCH_ID,
                serial_no=settings.WX_CERT_SERIAL_NO,
                private_key_pem=settings.WX_PRIVATE_KEY_PATH,
                notify_url=settings.WX_NOTIFY_URL,
                description=f"票小助 Pro-{plan.name}",
                out_trade_no=out_trade_no,
                amount_cents=plan.price_cents,
                openid=current_user.openid,
            )
        except WeChatPayError as e:
            logger.warning("微信支付下单失败: %s", e)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY, detail="发起支付失败，请稍后重试"
            ) from e

        return _build_pay_response(
            order_id=out_trade_no,
            plan_code=plan_code,
            amount_cents=plan.price_cents,
            pay_params=build_pay_params(
                appid=settings.WX_APPID,
                prepay_id=prepay_id,
                private_key_pem=settings.WX_PRIVATE_KEY_PATH,
            ),
            is_mock=False,
        )

    # 未配置微信支付参数：只有显式开启联调开关时才返回 mock 参数，
    # 否则必须报错——否则用户可以不付款直接拿到付费套餐。
    if not settings.PAYMENT_MOCK_ENABLED:
        logger.error("微信支付参数未配置且未开启联调开关，拒绝下单")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="支付功能暂未开放，请稍后再试",
        )

    logger.warning("微信支付参数未配置完整，返回 mock 支付参数（联调模式）")
    return _build_pay_response(
        order_id=out_trade_no,
        plan_code=plan_code,
        amount_cents=plan.price_cents,
        pay_params={
            "timeStamp": str(int(time.time())),
            "nonceStr": uuid.uuid4().hex,
            "package": f"prepay_id=mock_{uuid.uuid4().hex[:16]}",
            "signType": "RSA",
            "paySign": "mock_pay_sign_value",
        },
        is_mock=True,
    )


@router.post("/wechat/notify")
async def wechat_notify(request: Request, db: AsyncSession = Depends(get_db)):
    """微信支付结果回调。

    V3 回调体是 JSON，且必须验签 + 解密 resource，否则任何请求都能伪造开通套餐。
    返回 200 + code=SUCCESS 表示受理成功，微信不再重试；返回其他状态码微信会重试。
    """
    if not wechat_pay_ready():
        logger.error("收到支付回调但微信支付参数未配置或不可用，拒绝处理")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"code": "FAIL", "message": "微信支付未配置"},
        )

    raw_body = await request.body()

    try:
        verify_notify(request.headers, raw_body, settings.WX_PLATFORM_CERT_PATH)
        payload = json.loads(raw_body)
        transaction = decrypt_resource(payload.get("resource") or {}, settings.WX_API_KEY)
    except WeChatPayError as e:
        logger.warning("微信支付回调研验失败: %s", e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"code": "FAIL", "message": "签名校验失败"},
        )
    except json.JSONDecodeError as e:
        logger.warning("微信支付回调体不是合法 JSON: %s", e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"code": "FAIL", "message": "回调体格式错误"},
        )

    if payload.get("event_type") != TRANSACTION_SUCCESS_EVENT:
        logger.info("忽略非支付成功事件: %s", payload.get("event_type"))
        return {"code": "SUCCESS", "message": "OK"}

    out_trade_no = transaction.get("out_trade_no")
    trade_state = transaction.get("trade_state")
    if not out_trade_no or trade_state != "SUCCESS":
        logger.warning("回调交易状态异常: out_trade_no=%s trade_state=%s", out_trade_no, trade_state)
        return {"code": "SUCCESS", "message": "OK"}

    try:
        order_uuid = uuid.UUID(out_trade_no)
    except (ValueError, AttributeError):
        logger.warning("回调中的商户订单号非法: %s", out_trade_no)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"code": "FAIL", "message": "订单号非法"},
        )

    result = await db.execute(select(Order).where(Order.id == order_uuid))
    order = result.scalar_one_or_none()
    if order is None:
        logger.warning("回调对应的订单不存在: %s", out_trade_no)
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"code": "FAIL", "message": "订单不存在"},
        )

    # 幂等：微信会重复推送，已处理过的订单直接返回成功
    if order.status == "paid":
        return {"code": "SUCCESS", "message": "OK"}

    # 金额必须与下单金额一致。验签已证明报文来自微信，但金额一致性是标准
    # 校验项，用来兜住「实付与应付不符却开通套餐」这类异常。
    paid_total = (transaction.get("amount") or {}).get("total")
    if paid_total != order.amount_cents:
        logger.error(
            "回调金额与订单不一致，拒绝开通: order=%s 应付=%s 实付=%s",
            order.id,
            order.amount_cents,
            paid_total,
        )
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"code": "FAIL", "message": "订单金额不一致"},
        )

    order.status = "paid"
    order.transaction_id = transaction.get("transaction_id")
    order.paid_at = datetime.now(timezone.utc)

    user_result = await db.execute(select(User).where(User.id == order.user_id))
    user = user_result.scalar_one_or_none()
    new_expiry = None
    if user is not None:
        new_expiry = _activate_subscription(db, user, order)

    await db.commit()
    logger.info(
        "订单 %s 支付成功，已开通套餐 %s，有效期至 %s",
        order.id,
        order.plan_code,
        new_expiry,
    )

    return {"code": "SUCCESS", "message": "OK"}


@router.post("/mock/complete")
async def mock_complete_payment(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not settings.PAYMENT_MOCK_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found",
        )

    order_id: Optional[str] = body.get("order_id")
    if not order_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="order_id is required")

    try:
        order_uuid = uuid.UUID(order_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="order_id is invalid")

    result = await db.execute(
        select(Order).where(Order.id == order_uuid, Order.user_id == current_user.id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if order.status == "paid":
        return {"status": "already_paid", "order_id": str(order.id)}

    order.status = "paid"
    order.transaction_id = f"mock_txn_{uuid.uuid4().hex[:16]}"
    order.paid_at = datetime.now(timezone.utc)

    new_expiry = _activate_subscription(db, current_user, order)
    await db.commit()

    return {
        "status": "paid",
        "order_id": str(order.id),
        "plan_code": order.plan_code,
        "plan_expires_at": new_expiry,
    }
