import uuid
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.plan import Order, Plan, QuotaLog
from app.models.user import User

router = APIRouter(prefix="/api/payments", tags=["payments"])

PLAN_PRICE_MAP = {
    "free": 0,
    "basic": 2900,
    "pro": 9900,
    "toolkit": 4900,
}

PLAN_QUOTA_MAP = {
    "free": 10,
    "basic": 500,
    "pro": 3000,
    "toolkit": 0,
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
    order.paid_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)

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
