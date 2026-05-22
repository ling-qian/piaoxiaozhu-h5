from fastapi import APIRouter, Depends

from app.deps import get_current_user
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
