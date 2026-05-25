import uuid
import time
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_current_user, get_db
from app.models.plan import Order, Plan, QuotaLog
from app.models.user import User

router = APIRouter(prefix="/api/payments", tags=["payments"])

logger = logging.getLogger(__name__)

PLAN_QUOTA_MAP = {
    "free": 10,
    "basic": 500,
    "pro": 3000,
    "toolkit": 0,
}


def _is_wechat_pay_configured() -> bool:
    return bool(settings.WX_MCH_ID and settings.WX_API_KEY)


async def _create_wechat_prepay(order: Order, openid: str) -> dict:
    import httpx

    mch_id = settings.WX_MCH_ID
    appid = settings.WX_APPID
    nonce_str = uuid.uuid4().hex
    timestamp = str(int(time.time()))
    out_trade_no = str(order.id)

    body = {
        "appid": appid,
        "mchid": mch_id,
        "description": f"票小助-{order.plan_code}套餐",
        "out_trade_no": out_trade_no,
        "notify_url": f"https://your-domain.com/api/payments/wechat/notify",
        "amount": {"total": order.amount_cents, "currency": "CNY"},
        "payer": {"openid": openid},
    }

    try:
        from wechatpayv3 import WeChatPay

        wxpay = WeChatPay(
            wechatpay_type="NATIVE" if _is_wechat_pay_configured() else "MINI_APP",
            mchid=mch_id,
            private_key=settings.WX_CERT_PATH,
            cert_serial_no="",
            appid=appid,
            apiv3_key=settings.WX_API_KEY,
            notify_url=body["notify_url"],
        )
        result = wxpay.pay(body)
        prepay_id = result.get("prepay_id", "")
        pay_sign_info = wxpay.sign(prepay_id, nonce_str, timestamp)
        return {
            "order_id": out_trade_no,
            "plan_code": order.plan_code,
            "amount_cents": order.amount_cents,
            "prepay_id": prepay_id,
            "nonce_str": nonce_str,
            "timestamp": int(timestamp),
            "sign_type": "RSA",
            "pay_sign": pay_sign_info.get("paySign", ""),
        }
    except Exception as e:
        logger.warning("WeChat Pay V3 failed, falling back to mock: %s", e)
        return {
            "order_id": out_trade_no,
            "plan_code": order.plan_code,
            "amount_cents": order.amount_cents,
            "prepay_id": f"mock_prepay_{uuid.uuid4().hex[:16]}",
            "nonce_str": nonce_str,
            "timestamp": int(timestamp),
            "sign_type": "RSA",
            "pay_sign": "mock_pay_sign_value",
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

    plan_result = await db.execute(select(Plan).where(Plan.code == plan_code, Plan.is_active == True))
    plan = plan_result.scalar_one_or_none()
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found"
        )

    amount_cents = plan.price_cents
    order = Order(
        user_id=current_user.id,
        plan_code=plan_code,
        amount_cents=amount_cents,
        status="pending",
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    if _is_wechat_pay_configured():
        return await _create_wechat_prepay(order, current_user.openid)

    nonce_str = uuid.uuid4().hex
    timestamp = int(time.time())
    return {
        "order_id": str(order.id),
        "plan_code": plan_code,
        "amount_cents": amount_cents,
        "prepay_id": f"mock_prepay_{uuid.uuid4().hex[:16]}",
        "nonce_str": nonce_str,
        "timestamp": timestamp,
        "sign_type": "RSA",
        "pay_sign": "mock_pay_sign_value",
    }


@router.post("/wechat/notify")
async def wechat_notify(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.body()

    try:
        import xml.etree.ElementTree as ET

        root = ET.fromstring(body)
        order_id_elem = root.findtext("out_trade_no")
        transaction_id_elem = root.findtext("transaction_id")
        result_code = root.findtext("result_code")
    except Exception:
        order_id_elem = None
        transaction_id_elem = None
        result_code = None

    if not order_id_elem or result_code != "SUCCESS":
        return {"code": "FAIL", "message": "Invalid notification"}

    result = await db.execute(select(Order).where(Order.id == order_id_elem))
    order = result.scalar_one_or_none()
    if order is None:
        return {"code": "FAIL", "message": "Order not found"}

    if order.status == "paid":
        return {"code": "SUCCESS", "message": "OK"}

    order.status = "paid"
    order.transaction_id = transaction_id_elem
    order.paid_at = datetime.now(timezone.utc)

    plan_code = order.plan_code
    quota_delta = PLAN_QUOTA_MAP.get(plan_code, 0)

    user_result = await db.execute(select(User).where(User.id == order.user_id))
    user = user_result.scalar_one_or_none()
    if user is not None:
        user.plan_code = plan_code
        user.quota_total = user.quota_total + quota_delta

        quota_log = QuotaLog(
            user_id=user.id,
            action="purchase",
            delta=quota_delta,
            reason=f"购买套餐 {plan_code}，订单 {order.id}",
        )
        db.add(quota_log)

    await db.commit()

    return {"code": "SUCCESS", "message": "OK"}


@router.post("/mock/complete")
async def mock_complete_payment(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if _is_wechat_pay_configured():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mock payment not available when WeChat Pay is configured",
        )

    order_id = body.get("order_id")
    if not order_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="order_id is required")

    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.user_id == current_user.id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if order.status == "paid":
        return {"status": "already_paid", "order_id": str(order.id)}

    order.status = "paid"
    order.transaction_id = f"mock_txn_{uuid.uuid4().hex[:16]}"
    order.paid_at = datetime.now(timezone.utc)

    plan_code = order.plan_code
    quota_delta = PLAN_QUOTA_MAP.get(plan_code, 0)

    current_user.plan_code = plan_code
    current_user.quota_total = current_user.quota_total + quota_delta

    quota_log = QuotaLog(
        user_id=current_user.id,
        action="purchase",
        delta=quota_delta,
        reason=f"购买套餐 {plan_code}，订单 {order.id}",
    )
    db.add(quota_log)
    await db.commit()

    return {"status": "paid", "order_id": str(order.id), "plan_code": plan_code}
