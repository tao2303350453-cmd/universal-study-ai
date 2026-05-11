import os
import io
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from openai import OpenAI # DeepSeek 使用 OpenAI 的 SDK 即可
from langchain_text_splitters import RecursiveCharacterTextSplitter
import pypdf

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 初始化 Supabase
supabase: Client = create_client(os.environ.get("SUPABASE_URL", ""), os.environ.get("SUPABASE_KEY", ""))

# 初始化 DeepSeek 客户端 (兼容 OpenAI 格式)
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
        # 注意：DeepSeek 目前主要强在对话，如果使用它的向量模型，请确保余额充足
        # 如果 DeepSeek 暂不支持特定向量模型，此处逻辑可能需要根据其文档调整
        # 这里默认使用 deepseek-chat 来辅助处理或报错提示
        try:
            # 暂时存储纯文本，后续接入专门的向量服务
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
    # 调用 DeepSeek 对话模型
    response = ai_client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": "你是一个专业的学科助手。"},
            {"role": "user", "content": message},
        ],
        stream=False
    )
    return {"answer": response.choices[0].message.content}
