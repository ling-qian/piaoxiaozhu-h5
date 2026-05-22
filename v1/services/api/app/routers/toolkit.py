from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/toolkit", tags=["toolkit"])

MOCK_CONTENTS = [
    {
        "id": "cat-tax-knowledge",
        "title": "税收政策速查",
        "type": "reference",
        "items": [
            {"title": "2025年增值税税率表", "tag": "增值税"},
            {"title": "小微企业税收优惠政策", "tag": "优惠"},
            {"title": "研发费用加计扣除指引", "tag": "加计扣除"},
        ],
    },
    {
        "id": "cat-invoice-guide",
        "title": "发票操作指南",
        "type": "guide",
        "items": [
            {"title": "增值税专用发票开具流程", "tag": "专票"},
            {"title": "电子发票查验方法", "tag": "查验"},
            {"title": "发票冲红操作说明", "tag": "冲红"},
        ],
    },
]


@router.get("/contents")
async def get_toolkit_contents(current_user: User = Depends(get_current_user)):
    return {"items": MOCK_CONTENTS}
