import os
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
import httpx

app = FastAPI()

# 允许跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化 Supabase
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0-multi-subject"}

@app.get("/api/subjects")
async def get_subjects():
    # 获取所有学科分类
    response = supabase.table("subjects").select("*").execute()
    return response.data

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...), 
    subject_id: str = Form(...)
):
    # 1. 读取文件内容
    content = (await file.read()).decode("utf-8")
    
    # 2. 存入 Supabase
    data = {
        "subject_id": subject_id,
        "filename": file.filename,
        "content": content
    }
    response = supabase.table("documents").insert(data).execute()
    return {"status": "success", "id": response.data[0]['id']}

@app.post("/api/chat")
async def chat(message: str, subject_id: str):
    # 3. 跨文档检索：获取该学科下所有文档
    docs = supabase.table("documents").select("content").eq("subject_id", subject_id).execute()
    context = "\n".join([d['content'] for d in docs.data])
    
    # 这里调用 DeepSeek 逻辑（略，保持之前配置即可）
    return {"answer": f"基于该学科知识库的内容，我的回答是..."}
