import asyncio

from sqlalchemy import select

from app.models.database import AsyncSessionLocal, Base, engine
from app.models.plan import Plan
from app.services.plan_config import PLANS


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        for code, config in PLANS.items():
            result = await db.execute(select(Plan).where(Plan.code == code))
            existing = result.scalar_one_or_none()
            # features 在库里以逗号分隔的字符串存储
            features = ",".join(config.features)
            if existing is None:
                db.add(
                    Plan(
                        code=config.code,
                        name=config.name,
                        quota=config.invoice_limit,
                        project_limit=config.project_limit,
                        price_cents=config.price_cents,
                        features=features,
                        is_active=True,
                    )
                )
            else:
                existing.name = config.name
                existing.quota = config.invoice_limit
                existing.project_limit = config.project_limit
                existing.price_cents = config.price_cents
                existing.features = features
                existing.is_active = True

        # 下架已废弃的套餐编码（如历史遗留的 basic / toolkit）
        stale_result = await db.execute(select(Plan).where(Plan.code.notin_(list(PLANS.keys()))))
        for stale in stale_result.scalars().all():
            stale.is_active = False

        await db.commit()
        print("Seed data inserted/updated successfully.")


if __name__ == "__main__":
    asyncio.run(seed())
