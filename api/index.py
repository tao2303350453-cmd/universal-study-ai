import os
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
import httpx

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 获取环境变量
URL = os.environ.get("SUPABASE_URL", "")
KEY = os.environ.get("SUPABASE_KEY", "")

# 安全初始化
supabase = None
if URL and KEY:
    try:
        supabase = create_client(URL, KEY)
    except:
        pass

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "supabase_connected": supabase is not None
    }

@app.get("/api/subjects")
async def get_subjects():
    if not supabase: return {"error": "no_supabase"}
    res = supabase.table("subjects").select("*").execute()
    return res.data

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), subject_id: str = Form(...)):
    if not supabase: return {"error": "no_supabase"}
    content = (await file.read()).decode("utf-8", errors="ignore")
    data = {"subject_id": subject_id, "filename": file.filename, "content": content}
    res = supabase.table("documents").insert(data).execute()
    return {"status": "success"}

@app.post("/api/chat")
async def chat(message: str, subject_id: str):
    return {"answer": "Connection successful"}
