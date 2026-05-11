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

# Vercel 会自动把 api/index.py 映射到 /api 路径
# 所以这里的装饰器路径不需要再加 /api

@app.get("/health")  # 最终路径: /api/health
async def health():
    return {"status": "ok", "supabase_connected": supabase is not None}

@app.get("/categories")  # 最终路径: /api/categories
async def get_categories():
    res = supabase.table("categories").select("*").execute()
    return res.data

@app.post("/categories")  # 最终路径: /api/categories
async def add_category(request: Request):
    data = await request.json()
    name = data.get("name")
    parent_id = data.get("parent_id")
    
    res = supabase.table("categories").insert({
        "name": name,
        "parent_id": parent_id
    }).execute()
    return {"status": "success", "data": res.data}

@app.post("/upload")  # 最终路径: /api/upload
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

@app.post("/chat")  # 最终路径: /api/chat
async def chat(request: Request):
    data = await request.json()
    message = data.get("message")
    cat_id = data.get("category_id")

    try:
        # 这里确保你已经在 Supabase 运行了那个 get_all_sub_categories 的 SQL
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
