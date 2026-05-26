from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/toolkit", tags=["toolkit"])

MOCK_CONTENTS = [
    {
        "id": "tax-1",
        "title": "增值税税率",
        "content": "一般纳税人：13%（货物销售、修理修配等）、9%（交通运输、建筑、不动产租赁等）、6%（现代服务、生活服务等）\n小规模纳税人：3%（征收率），阶段性减按1%征收",
        "category": "税收政策速查",
    },
    {
        "id": "tax-2",
        "title": "企业所得税税率",
        "content": "法定税率：25%\n小型微利企业：实际税负5%（年应纳税所得额不超过300万元）\n高新技术企业：15%\n技术先进型服务企业：15%",
        "category": "税收政策速查",
    },
    {
        "id": "tax-3",
        "title": "小微企业优惠",
        "content": "小型微利企业条件：年度应纳税所得额不超过300万元、从业人数不超过300人、资产总额不超过5000万元\n增值税：月销售额10万元以下免征增值税\n附加税：增值税小规模纳税人减半征收六税两费",
        "category": "税收政策速查",
    },
    {
        "id": "invoice-1",
        "title": "开票流程",
        "content": "1. 登录增值税发票开票软件\n2. 选择发票类型（增值税专用发票/普通发票）\n3. 填写购买方信息（名称、税号、地址电话、开户行及账号）\n4. 填写商品或服务信息（名称、规格型号、数量、单价、税率）\n5. 核对金额和税额\n6. 点击开具并打印",
        "category": "发票操作指南",
    },
    {
        "id": "invoice-2",
        "title": "红字发票",
        "content": "适用情形：销货退回、开票有误、应税服务中止等\n操作流程：\n1. 购买方已认证：由购买方填开《开具红字增值税专用发票信息表》\n2. 购买方未认证：由销售方填开信息表\n3. 主管税务机关审核通过后，销售方开具红字专用发票",
        "category": "发票操作指南",
    },
    {
        "id": "invoice-3",
        "title": "发票查验",
        "content": "查验渠道：\n1. 全国增值税发票查验平台（https://inv-veri.chinatax.gov.cn）\n2. 当地税务局官方APP\n3. 12366纳税服务热线\n查验要素：发票代码、发票号码、开票日期、开具金额（不含税）\n注意事项：当日开具的发票最快可于次日查验",
        "category": "发票操作指南",
    },
]


@router.get("/contents")
async def get_toolkit_contents(current_user: User = Depends(get_current_user)):
    return {"items": MOCK_CONTENTS}
