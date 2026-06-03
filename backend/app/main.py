import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import engine
from .models import Base
from .routers import auth, budgets, cost_centers, invoices, users

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="SIGVARIS Cost Center Manager", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(cost_centers.router)
app.include_router(budgets.router)
app.include_router(invoices.router)


@app.get("/health")
def health():
    return {"status": "ok"}
