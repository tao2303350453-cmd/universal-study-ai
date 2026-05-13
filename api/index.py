"""
AI 学科助手后端 - 升级版
支持向量检索、学科管理、综合出卷

环境变量:
  SUPABASE_URL       - Supabase project URL
  SUPABASE_KEY       - Supabase anon/public key (需具备 documents, categories 表的读写权限)
  DEEPSEEK_API_KEY   - DeepSeek API key
"""
import os
import io
import logging
import traceback
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from openai import OpenAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
import pypdf

# ---------------------------------------------------------------------------
# 日志
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("study-ai")

# ---------------------------------------------------------------------------
# FastAPI 应用
# ---------------------------------------------------------------------------
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ---------------------------------------------------------------------------
# 客户端初始化
# ---------------------------------------------------------------------------
supabase: Client = create_client(
    os.environ.get("SUPABASE_URL", ""),
    os.environ.get("SUPABASE_KEY", ""),
)

ai_client = OpenAI(
    api_key=os.environ.get("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com",
)

# ---------------------------------------------------------------------------
# 常量 & 配置
# ---------------------------------------------------------------------------
EMBEDDING_MODEL = "text-embedding-v2"          # DeepSeek embedding 模型
EMBEDDING_DIM = 1536                           # 向量维度
CHUNK_SIZE = 800
CHUNK_OVERLAP = 150
MAX_CONTEXT_LENGTH = 6000                      # 送到 LLM 的最大上下文长度
MAX_EXAM_CONTEXT = 15000                       # 出卷时最大上下文

# ---------------------------------------------------------------------------
# Embedding 工具
# ---------------------------------------------------------------------------

def get_embedding(text: str) -> Optional[list[float]]:
    """
    使用 DeepSeek text-embedding-v2 生成向量。
    失败时返回 None，上层自动降级为纯文本检索。
    """
    try:
        resp = ai_client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text,
        )
        return resp.data[0].embedding
    except Exception as exc:
        logger.warning("DeepSeek embedding 失败，降级为纯文本检索。原因: %s", exc)
        return None


def batch_embeddings(texts: list[str]) -> list[Optional[list[float]]]:
    """批量获取 embedding，失败项返回 None"""
    return [get_embedding(t) for t in texts]


# ---------------------------------------------------------------------------
# 数据库辅助函数
# ---------------------------------------------------------------------------

def get_all_sub_category_ids(root_id: str) -> list[str]:
    """
    递归获取所有子分类 ID（包含自身）。
    优先使用 Supabase RPC get_all_sub_categories，失败后降级为手动递归。
    """
    try:
        rpc_res = supabase.rpc("get_all_sub_categories", {"root_id": root_id}).execute()
        if rpc_res.data:
            return [item["id"] for item in rpc_res.data]
    except Exception:
        logger.info("RPC get_all_sub_categories 不可用，使用手动递归")

    # 手动递归降级
    ids = [root_id]
    queue = [root_id]
    visited = set()
    while queue:
        pid = queue.pop(0)
        if pid in visited:
            continue
        visited.add(pid)
        try:
            children = supabase.table("categories").select("id").eq("parent_id", pid).execute()
            for child in children.data:
                cid = child["id"]
                if cid not in visited:
                    ids.append(cid)
                    queue.append(cid)
        except Exception:
            break
    return ids


def get_documents_by_category_ids(category_ids: list[str], limit: int = 200) -> list[dict]:
    """根据分类 ID 列表获取文档 chunks，可设置 limit"""
    if not category_ids:
        return []
    query = supabase.table("documents").select("id, category_id, filename, content").in_(
        "category_id", category_ids
    ).limit(limit).execute()
    return query.data


def get_documents_text(category_ids: list[str], max_len: int = MAX_CONTEXT_LENGTH) -> str:
    """拼接文档文本，截断到 max_len"""
    docs = get_documents_by_category_ids(category_ids, limit=500)
    return "\n\n".join(d["content"] for d in docs)[:max_len]


# ---------------------------------------------------------------------------
# API - 健康检查
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "supabase_connected": supabase is not None}


# ---------------------------------------------------------------------------
# API - 分类管理（原有 + 新增端点）
# ---------------------------------------------------------------------------

@app.get("/categories")
async def get_categories():
    """获取所有分类"""
    res = supabase.table("categories").select("*").order("name").execute()
    return res.data


@app.post("/categories")
async def add_category(request: Request):
    """新增分类"""
    data = await request.json()
    name = data.get("name")
    parent_id = data.get("parent_id")
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="分类名称不能为空")
    res = supabase.table("categories").insert({
        "name": name.strip(),
        "parent_id": parent_id,
    }).execute()
    return {"status": "success", "data": res.data}


@app.put("/categories/{category_id}")
async def rename_category(category_id: str, request: Request):
    """重命名分类"""
    data = await request.json()
    new_name = data.get("name")
    if not new_name or not new_name.strip():
        raise HTTPException(status_code=400, detail="分类名称不能为空")
    res = supabase.table("categories").update({"name": new_name.strip()}).eq(
        "id", category_id
    ).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="分类未找到")
    return {"status": "success", "data": res.data}


@app.delete("/categories/{category_id}")
async def delete_category(category_id: str):
    """
    删除分类（级联删除子分类和文档）
    流程：
      1. 递归获取该分类下所有子分类 ID
      2. 删除所有子分类下的文档
      3. 删除所有子分类
      4. 删除当前分类及其文档
    """
    try:
        all_ids = get_all_sub_category_ids(category_id)
    except Exception:
        all_ids = [category_id]

    # 删除文档（所有子分类 + 自身）
    for cid in all_ids:
        supabase.table("documents").delete().eq("category_id", cid).execute()

    # 删除子分类（从深层到根部的顺序无法保证，批量删除即可）
    for cid in all_ids:
        if cid != category_id:
            supabase.table("categories").delete().eq("id", cid).execute()

    # 删除自身
    res = supabase.table("categories").delete().eq("id", category_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="分类未找到")
    return {"status": "success", "deleted": {"category": category_id, "sub_categories": len(all_ids) - 1}}


# ---------------------------------------------------------------------------
# API - 文档管理
# ---------------------------------------------------------------------------

@app.get("/categories/{category_id}/documents")
async def list_documents(category_id: str):
    """
    列出指定分类下的文档（按文件名去重，返回元信息）
    """
    docs = (
        supabase.table("documents")
        .select("id, filename, category_id, created_at, content")
        .eq("category_id", category_id)
        .order("created_at", desc=True)
        .execute()
    )
    # 按文件名去重取最新的
    seen = {}
    for d in docs.data:
        fn = d["filename"]
        if fn not in seen:
            seen[fn] = {
                "id": d["id"],
                "filename": d["filename"],
                "category_id": d["category_id"],
                "created_at": d.get("created_at", ""),
                "size": len(d.get("content", "")),
                "chunks": 1,
            }
        else:
            seen[fn]["chunks"] += 1
            seen[fn]["size"] += len(d.get("content", ""))
    return list(seen.values())


@app.put("/documents/{doc_id}/move")
async def move_document(doc_id: str, request: Request):
    """移动文档到其他分类（同一文件名下的所有 chunk 一起移动）"""
    data = await request.json()
    new_category_id = data.get("category_id")
    if not new_category_id:
        raise HTTPException(status_code=400, detail="缺少 category_id")

    # 获取该文档信息，找到文件名
    doc = supabase.table("documents").select("filename").eq("id", doc_id).execute()
    if not doc.data:
        raise HTTPException(status_code=404, detail="文档未找到")
    filename = doc.data[0]["filename"]

    # 移动同文件名的所有 chunk
    res = (
        supabase.table("documents")
        .update({"category_id": new_category_id})
        .eq("filename", filename)
        .execute()
    )
    return {"status": "success", "moved": len(res.data)}


# ---------------------------------------------------------------------------
# API - 上传文档（升级版：生成 embedding）
# ---------------------------------------------------------------------------

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), category_id: str = Form(...)):
    """
    上传文件（PDF/文本），切分 chunk 并生成向量 embedding。
    如果 DeepSeek embedding 不可用，只保存文本，不阻塞流程。
    """
    file_bytes = await file.read()
    content = ""

    if file.filename.endswith(".pdf"):
        try:
            pdf_reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            content = " ".join(
                page.extract_text() for page in pdf_reader.pages if page.extract_text()
            )
        except Exception as exc:
            logger.error("PDF 解析失败: %s", exc)
            raise HTTPException(status_code=400, detail=f"PDF 解析失败: {exc}")
    else:
        content = file_bytes.decode("utf-8", errors="ignore")

    if not content.strip():
        raise HTTPException(status_code=400, detail="文件内容为空，无法处理")

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP
    )
    chunks = text_splitter.split_text(content)

    if not chunks:
        raise HTTPException(status_code=400, detail="切分后无有效内容")

    # 批量生成 embedding（允许失败降级）
    embeddings = batch_embeddings(chunks)
    has_embeddings = any(e is not None for e in embeddings)

    inserted = 0
    for i, chunk in enumerate(chunks):
        record = {
            "category_id": category_id,
            "filename": file.filename,
            "content": chunk,
        }
        if has_embeddings and embeddings[i] is not None:
            record["embedding"] = embeddings[i]

        supabase.table("documents").insert(record).execute()
        inserted += 1

    return {
        "status": "success",
        "chunks": inserted,
        "has_embedding": has_embeddings,
        "embedding_model": EMBEDDING_MODEL if has_embeddings else None,
    }


# ---------------------------------------------------------------------------
# API - 聊天（升级版：向量检索 + 关键词混合检索）
# ---------------------------------------------------------------------------

@app.post("/chat")
async def chat(request: Request):
    """
    聊天接口：
    - 可指定 category_id 限定检索范围（含子分类）
    - 使用向量检索 + 关键词检索（混合检索）
    - 如果向量不可用，降级为关键词检索
    """
    data = await request.json()
    message = data.get("message", "")
    cat_id = data.get("category_id")
    history = data.get("history", [])  # 可选：历史消息列表

    if not message.strip():
        raise HTTPException(status_code=400, detail="消息不能为空")

    # 1. 确定检索范围
    if cat_id:
        try:
            all_ids = get_all_sub_category_ids(cat_id)
        except Exception:
            all_ids = [cat_id]
    else:
        # 没有指定分类，检索全部文档（最多取 500 条）
        docs_all = supabase.table("documents").select("id, content").limit(500).execute()
        all_ids = None  # 标记为「全部文档」

    # 2. 混合检索
    #    先尝试向量检索，再补关键词检索
    retrieved_chunks = []

    # 2a. 向量检索（如果 embedding 可用）
    try:
        query_emb = get_embedding(message)
        if query_emb:
            rpc_params = {
                "query_embedding": query_emb,
                "match_threshold": 0.5,
                "match_count": 10,
            }
            if cat_id and all_ids:
                rpc_params["filter_category_ids"] = all_ids

            vec_res = supabase.rpc("match_documents", rpc_params).execute()
            if vec_res.data:
                retrieved_chunks.extend(vec_res.data)
    except Exception as exc:
        logger.info("向量检索不可用，跳过: %s", exc)

    # 2b. 关键词检索（兜底 / 补充）
    try:
        if all_ids is not None:
            kw_query = supabase.table("documents").select("id, content").in_(
                "category_id", all_ids
            )
        else:
            kw_query = supabase.table("documents").select("id, content")

        # 对消息做简单分词，用 textsearch 或 ilike
        keywords = [w for w in message.split() if len(w) > 1]
        for kw in keywords:
            kw_query = kw_query.textsearch("content", kw)

        kw_res = kw_query.limit(10).execute()
        if kw_res.data:
            retrieved_chunks.extend(kw_res.data)
    except Exception as exc:
        logger.info("关键词检索降级失败: %s", exc)

    # 2c. 如果什么都没检索到，回退到普通文本检索
    if not retrieved_chunks:
        logger.info("向量+关键词检索均空，使用普通文本检索")
        context = get_documents_text(all_ids if all_ids else [], MAX_CONTEXT_LENGTH)
    else:
        # 去重
        seen_ids = set()
        unique = []
        for c in retrieved_chunks:
            if c["id"] not in seen_ids:
                seen_ids.add(c["id"])
                unique.append(c)
        context = "\n\n".join(c["content"] for c in unique)[:MAX_CONTEXT_LENGTH]

    # 3. 构建消息
    system_prompt = f"你是一个AI学科助手。请根据以下参考资料回答用户的问题。如果资料不足以回答问题，请如实告知。\n\n参考资料：\n{context}"

    messages = [{"role": "system", "content": system_prompt}]

    # 注入历史（最多保留最近 6 条）
    if history:
        for h in history[-6:]:
            role = h.get("role", "user")
            msg = h.get("content", "")
            if role in ("user", "assistant") and msg:
                messages.append({"role": role, "content": msg})

    messages.append({"role": "user", "content": message})

    # 4. 调用 DeepSeek
    try:
        response = ai_client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            temperature=0.7,
            max_tokens=2048,
        )
        answer = response.choices[0].message.content
    except Exception as exc:
        logger.error("DeepSeek 调用失败: %s", exc)
        raise HTTPException(status_code=502, detail=f"AI 服务暂时不可用: {exc}")

    return {"answer": answer}


# ---------------------------------------------------------------------------
# API - 综合出卷（新增）
# ---------------------------------------------------------------------------

@app.post("/exam/generate")
async def generate_exam(request: Request):
    """
    生成综合试卷：
    - 接收 category_id（一级学科 ID）
    - 递归获取该学科下所有子分类的文档
    - 调用 DeepSeek 生成综合试卷
    """
    data = await request.json()
    root_category_id = data.get("category_id")
    subject_name = data.get("subject_name", "该学科")
    num_questions = data.get("num_questions", 10)

    if not root_category_id:
        raise HTTPException(status_code=400, detail="缺少 category_id")

    # 1. 递归获取所有子分类 ID
    try:
        all_ids = get_all_sub_category_ids(root_category_id)
    except Exception as exc:
        logger.error("获取子分类失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"获取子分类失败: {exc}")

    if not all_ids:
        raise HTTPException(status_code=404, detail="该分类下没有子分类或文档")

    # 2. 获取所有文档文本
    context = get_documents_text(all_ids, MAX_EXAM_CONTEXT)
    if not context.strip():
        raise HTTPException(status_code=404, detail="该分类下没有文档内容，无法出卷")

    # 3. 构建出卷 prompt
    prompt = f"""你是一位专业的{subject_name}教师。请根据以下学习资料，生成一份综合试卷。

要求：
- 试卷包含 {num_questions} 道题目
- 题型应多样化（选择题、填空题、简答题、论述题等）
- 题目难度适中，覆盖资料中的核心知识点
- 每道题需附上参考答案和简要解析
- 请用中文输出

学习资料：
{context}

请按以下格式输出试卷（Markdown格式）：
---
# {subject_name} 综合试卷

## 一、选择题（每题X分）
...

## 二、填空题（每题X分）
...

## 三、简答题（每题X分）
...

## 参考答案与解析
...
"""

    # 4. 调用 DeepSeek
    try:
        response = ai_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.8,
            max_tokens=4096,
        )
        exam_content = response.choices[0].message.content
    except Exception as exc:
        logger.error("出卷调用失败: %s", exc)
        raise HTTPException(status_code=502, detail=f"出卷服务暂时不可用: {exc}")

    return {
        "exam": exam_content,
        "subject": subject_name,
        "category_id": root_category_id,
        "num_questions": num_questions,
        "source_chunks": len(context),
    }


# ---------------------------------------------------------------------------
# 可选：本地运行入口
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("index:app", host="0.0.0.0", port=8000, reload=True)
