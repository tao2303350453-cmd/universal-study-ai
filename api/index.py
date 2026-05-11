import os
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
import httpx

# 如果你有 parsers.py，即使现在没用到，也建议加上这行
# import parsers 

app = FastAPI()

# 允许跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 关键修改区：安全初始化 Supabase ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://your-placeholder-url.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "your-placeholder-key")

# 只有当 URL 不是占位符时才创建客户端，防止部署直接挂掉
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"Supabase connection error: {e}")
    supabase = None
# ---------------------------------------

@app.get("/api/health")
async def health():
    return {
        "status": "ok", 
        "version": "2.0-multi-subject",
        "supabase_connected": supabase is not None
    }

@app.get("/api/subjects")
async def get_subjects():
    if not supabase:
        return {"error": "Supabase not configured"}
    response = supabase.table("subjects").select("*").execute()
    return response.data

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...), 
    subject_id: str = Form(...)
):
    if not supabase:
        return {"error": "Supabase not configured"}
    
    # 注意：这里如果读取 PDF/Word 建议后续调用 parsers.py 里的逻辑
    content = (await file.read()).decode("utf-8", errors="ignore")
    
    data = {
        "subject_id": subject_id,
        "filename": file.filename,
        "content": content
    }
    response = supabase.table("documents").insert(data).execute()
    return {"status": "success", "id": response.data[0]['id']}

@app.post("/api/chat")
async def chat(message: str, subject_id: str):
    if not supabase:
        return {"error": "Supabase not configured"}
        
    docs = supabase.table("documents").select("content").eq("subject_id", subject_id).execute()
    context = "\n".join([d['content'] for d in docs.data])
    
    return {"answer": "后端已连接，环境正常。"}
