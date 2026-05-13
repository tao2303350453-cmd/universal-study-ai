-- ============================================================
-- AI 学科助手 - Supabase 数据库升级脚本
-- 需要在 Supabase SQL Editor 中执行
-- ============================================================

-- 1. 启用 pgvector 扩展
create extension if not exists vector;

-- 2. 为 documents 表添加 embedding 列（如果还没有）
alter table documents add column if not exists embedding vector(1536);

-- 3. 创建向量索引（IVFFlat，余弦相似度）
--    lists = 100 适合中小规模数据（<100万行）
create index if not exists documents_embedding_idx
  on documents
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 4. 创建向量匹配函数（用于 RPC 调用）
create or replace function match_documents(
  query_embedding vector(1536),
  match_threshold float default 0.5,
  match_count int default 10,
  filter_category_ids text[] default null
)
returns table (
  id bigint,
  category_id text,
  filename text,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.category_id,
    documents.filename,
    documents.content,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where
    documents.embedding is not null
    and (filter_category_ids is null or documents.category_id = any(filter_category_ids))
    and (1 - (documents.embedding <=> query_embedding)) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 5. 递归获取所有子分类函数（如果你还没有）
create or replace function get_all_sub_categories(root_id text)
returns table (id text, name text, parent_id text, level int)
language plpgsql
as $$
begin
  return query
  with recursive sub_cats as (
    -- 根节点
    select c.id, c.name, c.parent_id, 0 as level
    from categories c
    where c.id = root_id
    union all
    -- 递归子节点
    select c.id, c.name, c.parent_id, sc.level + 1
    from categories c
    inner join sub_cats sc on c.parent_id = sc.id
  )
  select * from sub_cats;
end;
$$;

-- 可选：查看当前文档表中有没有 embedding
-- select count(*) as total_docs, count(embedding) as with_embedding from documents;
