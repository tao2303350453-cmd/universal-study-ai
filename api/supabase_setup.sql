-- ============================================================
-- AI 学科助手 - Supabase 数据库初始化
-- ============================================================

-- 1. 节点表（分层知识库树形结构）
CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  node_type TEXT NOT NULL CHECK (node_type IN ('category', 'subcategory', 'course')),
  parent_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
  description TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id);

-- 2. 文档/知识块表
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  node_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(1536),        -- DeepSeek embedding vector
  filename TEXT NOT NULL,
  chunk_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_node_id ON documents(node_id);
CREATE INDEX IF NOT EXISTS idx_documents_filename ON documents(filename);

-- 3. 向量搜索支持（文本搜索 + 向量搜索混合）
-- 先启用 pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 知识匹配查询函数
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5,
  filter_node_id UUID DEFAULT NULL
)
RETURNS TABLE(
  id TEXT,
  content TEXT,
  filename TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.filename,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE
    (filter_node_id IS NULL OR documents.node_id = filter_node_id)
    AND documents.embedding IS NOT NULL
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 4. 添加示例数据（可选）
-- INSERT INTO nodes (name, node_type) VALUES ('人工智能', 'category');
