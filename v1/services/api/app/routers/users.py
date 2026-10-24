import logging
import shutil
import uuid
from typing import Dict

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.invoice import InvoiceFile
from app.models.user import User
from app.services.storage import (
    UPLOAD_DIR,
    delete_object,
    is_remote_configured,
    local_public_url,
    upload_object,
)
from app.schemas.auth import UserBrief, UserUpdate
from app.services.subscription import effective_plan_code
from app.services.wx_security import check_image, check_text

router = APIRouter(prefix="/api", tags=["users"])

logger = logging.getLogger(__name__)

AVATAR_DIR = "avatars"
MAX_AVATAR_BYTES = 2 * 1024 * 1024
# 微信 chooseAvatar 返回的是临时文件，必须落到自有存储才能长期引用
ALLOWED_AVATAR_TYPES: Dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


@router.get("/me", response_model=UserBrief)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserBrief(
        id=str(current_user.id),
        openid=current_user.openid,
        nickname=current_user.nickname,
        avatar_url=current_user.avatar_url,
        phone=current_user.phone,
        plan_code=effective_plan_code(current_user.plan_code, current_user.plan_expires_at),
    )


@router.post("/me/avatar")
async def upload_my_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """上传当前用户头像。

    微信 chooseAvatar 给的是客户端临时路径，直接存下来会失效，因此这里接收
    文件本体并落到自有存储（OSS 或本地 uploads），只把可长期访问的 URL 写库。
    """
    ext = ALLOWED_AVATAR_TYPES.get(file.content_type or "")
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="头像仅支持 JPG / PNG / WebP 格式",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="头像文件为空")
    if len(content) > MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"头像不得超过 {MAX_AVATAR_BYTES // 1024 // 1024}MB",
        )

    # 头像属对外展示的 UGC，需过内容安全检测
    check = await check_image(content)
    if check.rejected:
        logger.warning("头像未通过内容安全检测: user=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="头像包含违规内容，请更换后重试",
        )

    filename = f"{uuid.uuid4().hex}{ext}"
    file_key = f"{AVATAR_DIR}/{current_user.id}/{filename}"
    local_dir = UPLOAD_DIR / AVATAR_DIR / str(current_user.id)
    local_dir.mkdir(parents=True, exist_ok=True)
    (local_dir / filename).write_bytes(content)

    if is_remote_configured():
        try:
            avatar_url = upload_object(file_key, content)
        except Exception as e:
            logger.warning("头像上传对象存储失败，回退本地存储: %s", e)
            avatar_url = local_public_url(file_key)
    else:
        avatar_url = local_public_url(file_key)

    current_user.avatar_url = avatar_url
    await db.commit()
    await db.refresh(current_user)

    return {"avatar_url": avatar_url}


def _purge_user_storage(user_id: uuid.UUID, file_keys: list) -> None:
    """清理用户在文件存储上的残留。

    数据库外键虽为 CASCADE，但对象存储与本地磁盘不在事务里，必须单独删，
    否则注销后票据图片仍可被访问。单条失败只记日志，不阻断注销流程。
    """
    if is_remote_configured():
        for key in file_keys:
            delete_object(key)

    for path in (UPLOAD_DIR / str(user_id), UPLOAD_DIR / AVATAR_DIR / str(user_id)):
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """注销账号，删除该用户的全部数据。

    users 的外键均为 ON DELETE CASCADE，删除用户行会连带清掉项目、票据文件、
    流水记录、订单、配额日志与客户。文件本体不在库里，删完库再按 key 清理存储。
    """
    user_id = current_user.id

    # 必须先收集文件 key，删库之后就查不到了
    file_keys = [
        row[0]
        for row in (
            await db.execute(
                select(InvoiceFile.file_key).where(InvoiceFile.user_id == user_id)
            )
        ).all()
    ]

    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()

    _purge_user_storage(user_id, file_keys)
    logger.info("用户 %s 已注销，清理文件 %d 个", user_id, len(file_keys))


@router.patch("/me")
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    updated = []
    payload = body.model_dump(exclude_unset=True)

    # 昵称是用户手填且会展示给他人的 UGC，需过内容安全检测
    nickname = payload.get("nickname")
    if nickname is not None:
        check = await check_text(nickname, openid=current_user.openid)
        if check.rejected:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="昵称包含违规内容，请修改后重试",
            )

    for field, value in payload.items():
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
        "plan_code": effective_plan_code(
            current_user.plan_code, current_user.plan_expires_at
        ),
        "updated_fields": updated,
    }
