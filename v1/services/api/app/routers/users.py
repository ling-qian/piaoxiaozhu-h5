from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.auth import UserBrief

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/me", response_model=UserBrief)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserBrief(
        id=str(current_user.id),
        openid=current_user.openid,
        nickname=current_user.nickname,
        avatar_url=current_user.avatar_url,
        phone=current_user.phone,
        plan_code=current_user.plan_code,
    )


@router.patch("/me")
async def update_me(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    allowed_fields = {"nickname", "avatar_url"}
    updated = []
    for field, value in body.items():
        if field in allowed_fields:
            setattr(current_user, field, value)
            updated.append(field)

    if updated:
        await db.commit()
        await db.refresh(current_user)

    return {
        "id": str(current_user.id),
        "nickname": current_user.nickname,
        "avatar_url": current_user.avatar_url,
        "phone": current_user.phone,
        "plan_code": current_user.plan_code,
        "updated_fields": updated,
    }
