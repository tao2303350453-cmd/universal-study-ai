import os
import io
from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from openai import OpenAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
import pypdf

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

supabase: Client = create_client(os.environ.get("SUPABASE_URL", ""), os.environ.get("SUPABASE_KEY", ""))
ai_client = OpenAI(api_key=os.environ.get("DEEPSEEK_API_KEY"), base_url="https://api.deepseek.com")

@app.get("/api/health")
async def health():
    return {"status": "ok", "supabase_connected": supabase is not None}

# 1. 获取学科（包含父子逻辑）
@app.get("/api/categories")
async def get_categories():
    res = supabase.table("categories").select("*").execute()
    return res.data

# 2. 【核心修复】新增学科接口
@app.post("/api/categories")
async def add_category(request: Request):
    data = await request.json()
    name = data.get("name")
    parent_id = data.get("parent_id") # 如果是 NULL 就是一级学科
    
    res = supabase.table("categories").insert({
        "name": name,
        "parent_id": parent_id
    }).execute()
    return {"status": "success", "data": res.data}

# 3. 上传文件
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), category_id: str = Form(...)):
    file_bytes = await file.read()
    content = ""
    if file.filename.endswith(".pdf"):
        pdf_reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        content = " ".join([page.extract_text() for page in pdf_reader.pages])
    else:
        content = file_bytes.decode("utf-8", errors="ignore")

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)
    chunks = text_splitter.split_text(content)

    for chunk in chunks:
        supabase.table("documents").insert({
            "category_id": category_id,
            "filename": file.filename,
            "content": chunk
        }).execute()
        
    return {"status": "success", "chunks": len(chunks)}

# 4. 对话接口
@app.post("/api/chat")
async def chat(request: Request):
    data = await request.json()
    message = data.get("message")
    cat_id = data.get("category_id")

    # 递归拿到子分类
    try:
        rpc_res = supabase.rpc('get_all_sub_categories', {'root_id': cat_id}).execute()
        ids = [item['id'] for item in rpc_res.data]
    except:
        ids = [cat_id]

    docs = supabase.table("documents").select("content").in_("category_id", ids).execute()
    context = "\n".join([d['content'] for d in docs.data])[:6000]

    response = ai_client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": f"你是一个学科助手。资料：\n{context}"},
            {"role": "user", "content": message},
        ]
    )
    return {"answer": response.choices[0].message.content}
