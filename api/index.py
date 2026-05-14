"""
AI 学科助手 - 知识库分层管理系统

核心功能:
1. 分层学科管理：学科 → 子分类 → 课程（树形结构）
2. PDF/文本导入：自动切片存入数据库
3. 智能问答：基于 DeepSeek 递归检索子层级知识库
"""

import os
import io
import json
import hashlib
import logging
from typing import Optional, List
from datetime import datetime

from fastapi import FastAPI, UploadFile, File, Form, Request, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pypdf
from openai import OpenAI

logger = logging.getLogger("study-ai")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="AI 学科助手", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Supabase via REST (no supabase-py dependency) ──
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")

supabase_headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

def sb_get(path: str, params: dict = None):
    """Supabase REST GET"""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        url += f"?{qs}"
    r = requests.get(url, headers=supabase_headers)
    return r.json() if r.status_code < 300 else {"error": r.text, "status": r.status_code}

def sb_post(path: str, body: dict):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    r = requests.post(url, headers=supabase_headers, json=body)
    return r.json() if r.status_code < 300 else {"error": r.text, "status": r.status_code}

def sb_delete(path: str, query: str):
    url = f"{SUPABASE_URL}/rest/v1/{path}?{query}"
    headers = {**supabase_headers, "Prefer": "return=minimal"}
    r = requests.delete(url, headers=headers)
    return {"ok": r.status_code < 300, "status": r.status_code}


# ═══════════════════════════════════════════════════
# 节点管理（学科/子分类/课程 树形结构）
# ═══════════════════════════════════════════════════

@app.get("/api/nodes")
def get_nodes(parent_id: Optional[str] = Query(None)):
    """获取节点树 / 子节点列表"""
    try:
        import requests
        if parent_id:
            data = sb_get("nodes", {"parent_id": f"eq.{parent_id}", "order": "sort_order.asc"})
        else:
            data = sb_get("nodes", {"parent_id": "is.null", "order": "sort_order.asc"})
        return {"nodes": data if isinstance(data, list) else []}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/nodes/tree")
def get_full_tree():
    """获取完整树结构"""
    try:
        import requests
        all_nodes = sb_get("nodes", {"order": "sort_order.asc"})
        if not isinstance(all_nodes, list):
            return {"nodes": []}
        
        node_map = {n["id"]: {**n, "children": []} for n in all_nodes}
        roots = []
        for n in node_map.values():
            if n["parent_id"] is None:
                roots.append(n)
            elif n["parent_id"] in node_map:
                node_map[n["parent_id"]]["children"].append(n)
        
        return {"nodes": roots}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/nodes")
async def create_node(
    name: str = Form(...),
    node_type: str = Form("category"),
    parent_id: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
):
    """创建节点（学科/子分类/课程）"""
    try:
        import requests
        import uuid
        node_id = str(uuid.uuid4())
        body = {
            "id": node_id,
            "name": name,
            "node_type": node_type,
            "parent_id": parent_id,
            "description": description or "",
            "sort_order": 0,
            "created_at": datetime.utcnow().isoformat(),
        }
        result = sb_post("nodes", body)
        return {"id": node_id, "node": result}
    except Exception as e:
        return {"error": str(e)}

@app.delete("/api/nodes/{node_id}")
def delete_node(node_id: str):
    """删除节点及其所有子节点"""
    try:
        import requests
        # Collect all descendant IDs
        to_delete = [node_id]
        all_nodes = sb_get("nodes", {"select": "id,parent_id"})
        if isinstance(all_nodes, list):
            parent_map = {}
            for n in all_nodes:
                pid = n.get("parent_id")
                if pid:
                    parent_map.setdefault(pid, []).append(n["id"])
            queue = [node_id]
            while queue:
                pid = queue.pop()
                children = parent_map.get(pid, [])
                to_delete.extend(children)
                queue.extend(children)
        
        for nid in to_delete:
            sb_delete("nodes", f"id=eq.{nid}")
            sb_delete("documents", f"node_id=eq.{nid}")
        return {"deleted": len(to_delete)}
    except Exception as e:
        return {"error": str(e)}

@app.put("/api/nodes/{node_id}")
async def update_node(node_id: str, name: str = Form(...), description: Optional[str] = Form(None)):
    """更新节点"""
    try:
        import requests
        url = f"{SUPABASE_URL}/rest/v1/nodes?id=eq.{node_id}"
        body = {"name": name}
        if description is not None:
            body["description"] = description
        r = requests.patch(url, headers=supabase_headers, json=body)
        return {"ok": r.status_code < 300}
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════
# 文档上传 & 处理
# ═══════════════════════════════════════════════════

@app.post("/api/documents/upload")
async def upload_document(
    node_id: str = Form(...),
    file: UploadFile = File(...),
):
    """上传 PDF/文本，AI 自动切片并存入知识库"""
    try:
        import requests
        content_bytes = await file.read()
        
        # Parse PDF or text
        if file.filename.lower().endswith(".pdf"):
            pdf_reader = pypdf.PdfReader(io.BytesIO(content_bytes))
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
        else:
            text = content_bytes.decode("utf-8", errors="replace")
        
        if not text.strip():
            return {"error": "Empty content"}
        
        # Simple chunking: split into ~500-char chunks with overlap
        chunk_size = 500
        overlap = 100
        chunks = []
        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            if end < len(text):
                # Try to break at sentence boundary
                segment = text[start:end]
                last_period = max(segment.rfind("。"), segment.rfind("."), segment.rfind("\n"))
                if last_period > chunk_size // 2:
                    end = start + last_period + 1
            chunks.append(text[start:end].strip())
            start = end - overlap if end - overlap > start else end
        
        # Generate embeddings via DeepSeek and store
        doc_id = hashlib.md5(content_bytes[:1024]).hexdigest()[:16]
        stored = 0
        
        for i, chunk_text in enumerate(chunks):
            if not chunk_text:
                continue
            
            # Generate embedding (use DeepSeek text-embedding or simple approach)
            embedding = await generate_embedding(chunk_text)
            
            body = {
                "id": f"{doc_id}_{i}",
                "node_id": node_id,
                "content": chunk_text,
                "embedding": embedding,
                "filename": file.filename,
                "chunk_index": i,
                "created_at": datetime.utcnow().isoformat(),
            }
            try:
                sb_post("documents", body)
                stored += 1
            except:
                pass
        
        return {
            "doc_id": doc_id,
            "chunks": len(chunks),
            "stored": stored,
            "filename": file.filename,
            "total_chars": len(text),
        }
    except Exception as e:
        logger.error(f"Upload error: {e}", exc_info=True)
        return {"error": str(e)}

async def generate_embedding(text: str) -> list:
    """Generate embedding vector. Uses DeepSeek if key available, else fallback."""
    if DEEPSEEK_API_KEY:
        try:
            client = OpenAI(
                api_key=DEEPSEEK_API_KEY,
                base_url="https://api.deepseek.com",
            )
            resp = client.embeddings.create(
                model="text-embedding-v2",  # DeepSeek embedding model
                input=text[:2048],
            )
            return resp.data[0].embedding
        except Exception as e:
            logger.warning(f"DeepSeek embedding failed: {e}")
    
    # Fallback: return empty embedding (will use text search instead)
    return []


@app.get("/api/documents")
def list_documents(node_id: Optional[str] = Query(None)):
    """获取指定节点下的文档列表"""
    try:
        import requests
        if node_id:
            data = sb_get("documents", {"node_id": f"eq.{node_id}", "select": "distinct(filename,node_id,created_at)"})
            # Deduplicate by filename
            seen = set()
            result = []
            for d in data if isinstance(data, list) else []:
                fn = d.get("filename", "")
                if fn not in seen:
                    seen.add(fn)
                    result.append(d)
            return {"documents": result}
        return {"documents": []}
    except Exception as e:
        return {"error": str(e)}

@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: str):
    """删除文档"""
    try:
        sb_delete("documents", f"filename=eq.{doc_id}")
        return {"ok": True}
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════
# 智能问答
# ═══════════════════════════════════════════════════

@app.post("/api/chat")
async def chat(
    node_id: str = Form(...),
    question: str = Form(...),
    include_subnodes: bool = Form(True),
):
    """基于知识库的智能问答 - 递归检索子层级"""
    try:
        import requests
        
        # 1. Collect all relevant content from this node and sub-nodes
        context_chunks = collect_node_knowledge(node_id, include_subnodes)
        
        if not context_chunks:
            return {
                "answer": "该节点下还没有资料。请先上传 PDF 或文本文档。",
                "sources": [],
            }
        
        # 2. Rerank: find most relevant chunks
        relevant = rerank_chunks(context_chunks, question, top_k=8)
        
        # 3. Build context
        context = "\n\n---\n\n".join(
            f"[{r['filename']} 第{r['chunk_index']}段]:\n{r['content']}"
            for r in relevant
        )
        
        # 4. Call DeepSeek
        answer = await call_deepseek(question, context)
        
        return {
            "answer": answer,
            "sources": [{"filename": r["filename"], "content": r["content"][:100]} for r in relevant],
            "context_chunks": len(context_chunks),
        }
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        return {"error": str(e), "answer": "抱歉，出了点问题，请稍后再试。"}

def collect_node_knowledge(node_id: str, recursive: bool = True) -> list:
    """递归收集节点及子节点的所有知识库内容"""
    import requests
    
    chunks = []
    
    # Get documents for this node
    docs = sb_get("documents", {"node_id": f"eq.{node_id}", "select": "content,filename,chunk_index"})
    if isinstance(docs, list):
        for d in docs:
            if d.get("content"):
                chunks.append(d)
    
    # Recursively collect from children
    if recursive:
        children = sb_get("nodes", {"parent_id": f"eq.{node_id}"})
        if isinstance(children, list):
            for child in children:
                child_chunks = collect_node_knowledge(child["id"], True)
                chunks.extend(child_chunks)
    
    return chunks

def rerank_chunks(chunks: list, question: str, top_k: int = 8) -> list:
    """Rerank chunks by relevance to question"""
    scored = []
    q_words = set(question.lower().split())
    for c in chunks:
        content = c.get("content", "")
        words = set(content.lower().split())
        # Simple overlap scoring
        overlap = len(q_words & words)
        score = overlap / max(len(q_words), 1)
        scored.append((score, c))
    
    scored.sort(key=lambda x: -x[0])
    return [c for _, c in scored[:top_k]]

async def call_deepseek(question: str, context: str) -> str:
    """Call DeepSeek API"""
    if not DEEPSEEK_API_KEY:
        return "DeepSeek API 未配置。请设置 DEEPSEEK_API_KEY 环境变量。"
    
    try:
        client = OpenAI(
            api_key=DEEPSEEK_API_KEY,
            base_url="https://api.deepseek.com",
        )
        
        system_prompt = """你是一个专业的学习助手。请基于提供的资料回答问题。
要求：
1. 只使用提供的资料来回答
2. 如果资料不足以回答问题，请明确说明
3. 引用具体的资料片段来支撑你的回答
4. 用中文回答"""

        resp = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"背景资料：\n{context}\n\n问题：{question}"},
            ],
            temperature=0.3,
            max_tokens=2048,
        )
        
        return resp.choices[0].message.content
    except Exception as e:
        logger.error(f"DeepSeek call failed: {e}")
        return f"AI 回答服务暂时不可用：{str(e)}"


# ── Health ──
@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


# Vercel ASGI handler
handler = app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("index:app", host="0.0.0.0", port=8000, reload=True)
