import asyncio

from sqlalchemy import select

from app.models.database import AsyncSessionLocal, Base, engine
from app.models.plan import Plan


SEED_PLANS = [
    Plan(code="free", name="免费版", quota=10, price_cents=0, features="每月10张发票,基础报表,基础分类", is_active=True),
    Plan(code="basic", name="基础版", quota=500, price_cents=2900, features="每月500张发票,高级报表,智能分类", is_active=True),
    Plan(code="pro", name="专业版", quota=3000, price_cents=9900, features="每月3000张发票,高级报表,智能分类,异常检测,导出PDF", is_active=True),
    Plan(code="toolkit", name="工具包", quota=0, price_cents=4900, features="税收政策速查,发票操作指南,财税计算工具", is_active=True),
]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        for plan_data in SEED_PLANS:
            result = await db.execute(select(Plan).where(Plan.code == plan_data.code))
            existing = result.scalar_one_or_none()
            if existing is None:
                db.add(plan_data)
            else:
                existing.name = plan_data.name
                existing.quota = plan_data.quota
                existing.price_cents = plan_data.price_cents
                existing.features = plan_data.features
                existing.is_active = plan_data.is_active

        await db.commit()
        print("Seed data inserted/updated successfully.")


if __name__ == "__main__":
    asyncio.run(seed())
