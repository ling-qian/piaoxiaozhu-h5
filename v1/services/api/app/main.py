from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.routers import auth, files, records, projects, reports, payments, plans, toolkit, users, manual_income

app = FastAPI(title="PiaoXiaoZhu API", version="1.0.0", docs_url="/docs", redoc_url="/redoc")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(files.router)
app.include_router(records.router)
app.include_router(projects.router)
app.include_router(reports.router)
app.include_router(payments.router)
app.include_router(plans.router)
app.include_router(toolkit.router)
app.include_router(users.router)
app.include_router(manual_income.router)

upload_dir = Path("uploads")
upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/files/static", StaticFiles(directory="uploads"), name="static_uploads")


@app.on_event("startup")
async def startup():
    from app.seed import seed
    await seed()


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "piaoxiaozhu-api", "version": "1.0.0"}
