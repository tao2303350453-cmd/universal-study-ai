import os
import io
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from openai import OpenAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
import pypdf

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 初始化
supabase: Client = create_client(os.environ.get("SUPABASE_URL", ""), os.environ.get("SUPABASE_KEY", ""))
ai_client = OpenAI(
    api_key=os.environ.get("DEEPSEEK_API_KEY"), 
    base_url="https://api.deepseek.com"
)

@app.get("/api/health")
async def health():
    return {"status": "ok", "supabase_connected": supabase is not None}

@app.get("/api/categories")
async def get_categories(parent_id: str = None):
    query = supabase.table("categories").select("*")
    if parent_id:
        query = query.eq("parent_id", parent_id)
    else:
        query = query.is_("parent_id", "null")
    res = query.execute()
    return res.data

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), category_id: str = Form(...)):
    file_bytes = await file.read()
    if file.filename.endswith(".pdf"):
        pdf_reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        content = " ".join([page.extract_text() for page in pdf_reader.pages])
    else:
        content = file_bytes.decode("utf-8", errors="ignore")

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)
    chunks = text_splitter.split_text(content)

    for chunk in chunks:
        try:
            supabase.table("documents").insert({
                "category_id": category_id,
                "filename": file.filename,
                "content": chunk
            }).execute()
        except Exception as e:
            print(f"Error: {e}")
        
    return {"status": "success", "chunks": len(chunks)}

@app.post("/api/chat")
async def chat(message: str, category_id: str):
    # 1. 跨文档记忆：通过我们刚才写的数据库函数获取所有子分类 ID
    try:
        rpc_res = supabase.rpc('get_all_sub_categories', {'root_id': category_id}).execute()
        all_ids = [item['id'] for item in rpc_res.data]
    except:
        # 如果 RPC 失败，降级为只查当前分类
        all_ids = [category_id]

    # 2. 提取这些分类下所有的文档片段
    docs_res = supabase.table("documents").select("content").in_("category_id", all_ids).execute()
    
    # 将资料拼接成背景知识
    context = "\n".join([d['content'] for d in docs_res.data])
    # 截取前 8000 字防止超过 AI 接收上限
    context_limited = context[:8000]

    # 3. 构造 Prompt 给 DeepSeek
    system_message = (
        "你是一个专业的学科复习助手。以下是用户上传的学科资料片段：\n"
        f"--- 资料开始 ---\n{context_limited}\n--- 资料结束 ---\n"
        "请根据上述资料回答用户问题。如果资料中未提及，请结合你的知识储备回答，并注明'补充知识'。"
    )

    response = ai_client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": system_message},
            {"role": "user", "content": message},
        ],
        stream=False
    )
    return {"answer": response.choices[0].message.content}
