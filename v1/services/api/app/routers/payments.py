import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.user import User

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.post("/wechat/prepay")
async def wechat_prepay(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan_code = body.get("plan_code", "pro")
    order_id = str(uuid.uuid4())
    return {
        "order_id": order_id,
        "prepay_id": f"mock_prepay_{uuid.uuid4().hex[:16]}",
        "nonce_str": uuid.uuid4().hex,
        "timestamp": 1700000000,
        "sign_type": "RSA",
        "pay_sign": "mock_pay_sign_value",
    }


@router.post("/wechat/notify")
async def wechat_notify(request: Request):
    body = await request.body()
    return {
        "code": "SUCCESS",
        "message": "OK",
    }
