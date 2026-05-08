"""
Review Assistant - FastAPI Backend
Supports: file upload/parsing + DeepSeek streaming AI
"""

import json
import logging
import os
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from parsers import parse_file

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─────────────────────────── App Setup ───────────────────────────

app = FastAPI(
    title="Review Assistant API",
    description="Full-stack AI review tool powered by DeepSeek",
    version="1.0.0",
)

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_SIZE_MB = 20
MAX_CONTENT_CHARS = 10_000  # Trim to avoid token overflow

# ─────────────────────────── Prompts ───────────────────────────

QUIZ_SYSTEM_PROMPT = """你是一位资深教育内容专家，擅长根据学习材料出题。
请严格按照 JSON 格式输出，不要包含任何 JSON 之外的文字、标题或说明。"""

QUIZ_USER_PROMPT = """请基于以下文档内容，生成一套高质量的测试题库。

要求：
1. 共生成 10-12 道题，混合单选题（type: "single"）和多选题（type: "multiple"）
2. 难度合理分布：简单 30%，中等 50%，困难 20%
3. 严格输出以下 JSON 格式，不要有任何额外说明：

{{
  "title": "根据文档主题生成的标题",
  "total": 10,
  "quiz": [
    {{
      "id": 1,
      "type": "single",
      "difficulty": "easy|medium|hard",
      "question": "题目内容",
      "options": {{
        "A": "选项A内容",
        "B": "选项B内容",
        "C": "选项C内容",
        "D": "选项D内容"
      }},
      "answer": "A",
      "explanation": "详细解析，说明为什么选这个答案"
    }},
    {{
      "id": 2,
      "type": "multiple",
      "difficulty": "medium",
      "question": "以下哪些说法正确？",
      "options": {{
        "A": "选项A",
        "B": "选项B",
        "C": "选项C",
        "D": "选项D"
      }},
      "answer": ["A", "C"],
      "explanation": "多选题解析"
    }}
  ]
}}

文档内容：
{content}"""

SUMMARY_SYSTEM_PROMPT = """你是一位专业的知识梳理专家，擅长将复杂文档整理成清晰的学习笔记。
请使用规范的 Markdown 格式输出，语言简洁精准。"""

SUMMARY_USER_PROMPT = """请对以下文档内容进行深度分析，生成一份结构完整的知识总结文档。

请严格按照以下 Markdown 结构输出：

# 📚 知识点总结

## 🎯 文档概览
[一段话概括文档的主题、目的和主要内容]

## 💡 核心概念
[逐条列出文档中最重要的概念，每个概念配以定义和说明]

## 🗂️ 知识框架
[用多级列表展示知识的层级结构和逻辑关系]

## 📊 对比分析
[用 Markdown 表格对比文档中的关键概念、方法、特点或数据]

| 维度 | 概念A | 概念B |
|------|-------|-------|
| ...  | ...   | ...   |

## 🔑 重要考点
[列出最重要的考试/学习重点，标注难度等级 ⭐/⭐⭐/⭐⭐⭐]

## 📝 快速记忆
[给出便于记忆的口诀、总结规律，或关键数字/公式]

---
文档内容：
{content}"""


# ─────────────────────────── Models ───────────────────────────

class AIRequest(BaseModel):
    content: str
    mode: Literal["quiz", "summary"]
    api_key: str
    model: str = "deepseek-chat"


# ─────────────────────────── Routes ───────────────────────────

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Upload a document file and return extracted text content.
    Supported: .pdf .docx .xlsx .xls .csv .txt
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="未收到文件名")

    # Check size
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"文件过大（{size_mb:.1f} MB），请上传 {MAX_FILE_SIZE_MB} MB 以内的文件。",
        )

    logger.info(f"Parsing file: {file.filename} ({size_mb:.2f} MB)")

    try:
        text = parse_file(content, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    char_count = len(text)
    preview = text[:300].replace("\n", " ") + ("..." if char_count > 300 else "")

    return {
        "status": "success",
        "filename": file.filename,
        "char_count": char_count,
        "preview": preview,
        "content": text,
    }


@app.post("/api/process")
async def process_with_ai(request: AIRequest):
    """
    Stream DeepSeek AI response for quiz generation or knowledge summary.
    Returns Server-Sent Events (SSE).
    """
    if not request.api_key or len(request.api_key) < 10:
        raise HTTPException(status_code=401, detail="API Key 无效，请在设置中填写正确的 DeepSeek API Key。")

    trimmed = request.content[:MAX_CONTENT_CHARS]

    if request.mode == "quiz":
        system_prompt = QUIZ_SYSTEM_PROMPT
        user_prompt = QUIZ_USER_PROMPT.format(content=trimmed)
    else:
        system_prompt = SUMMARY_SYSTEM_PROMPT
        user_prompt = SUMMARY_USER_PROMPT.format(content=trimmed)

    headers = {
        "Authorization": f"Bearer {request.api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": request.model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": True,
        "temperature": 0.6,
        "max_tokens": 4096,
    }

    async def sse_generator():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    "https://api.deepseek.com/v1/chat/completions",
                    headers=headers,
                    json=payload,
                ) as response:
                    if response.status_code != 200:
                        error_body = await response.aread()
                        err_msg = error_body.decode(errors="replace")
                        logger.error(f"DeepSeek API error {response.status_code}: {err_msg}")
                        yield f"data: {json.dumps({'error': f'API 错误 {response.status_code}: {err_msg}'})}\n\n"
                        return

                    async for line in response.aiter_lines():
                        line = line.strip()
                        if not line or not line.startswith("data: "):
                            continue

                        raw = line[6:]
                        if raw == "[DONE]":
                            yield "data: [DONE]\n\n"
                            return

                        try:
                            chunk = json.loads(raw)
                            delta_content = chunk["choices"][0]["delta"].get("content", "")
                            if delta_content:
                                yield f"data: {json.dumps({'content': delta_content}, ensure_ascii=False)}\n\n"
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue

        except httpx.TimeoutException:
            yield f"data: {json.dumps({'error': '请求超时，请稍后重试。'})}\n\n"
        except Exception as e:
            logger.error(f"Streaming error: {e}")
            yield f"data: {json.dumps({'error': f'服务器错误：{str(e)}'})}\n\n"

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
