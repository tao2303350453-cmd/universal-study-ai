/**
 * AI 学科助手 v2 - Vercel Serverless API
 * 使用 Vercel Node.js 运行时（比 Python 更稳定）
 * 
 * 依赖 Supabase REST API + 前端直接调用 DeepSeek
 */

// 前端的静态资源文件列表
export const config = {
  runtime: 'nodejs18.x',
};

// API 路由处理
export default async function handler(req, res) {
  const path = req.url.split('?')[0].replace(/^\/+/, '');
  const method = req.method;
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') return res.status(200).end();
  
  // ─── Routes ───
  try {
    // Health check
    if (path === 'api/health') {
      return res.json({ status: 'ok', version: '2.0.0' });
    }
    
    // Get nodes (tree or list)
    if (path === 'api/nodes' && method === 'GET') {
      const parentId = req.query.parent_id;
      const data = parentId
        ? await sbGet('nodes', { parent_id: `eq.${parentId}`, order: 'sort_order.asc' })
        : await sbGet('nodes', { parent_id: 'is.null', order: 'sort_order.asc' });
      return res.json({ nodes: Array.isArray(data) ? data : [] });
    }
    
    // Get full tree
    if (path === 'api/nodes/tree' && method === 'GET') {
      const allNodes = await sbGet('nodes', { order: 'sort_order.asc' });
      if (!Array.isArray(allNodes)) return res.json({ nodes: [] });
      
      const map = {};
      allNodes.forEach(n => { map[n.id] = { ...n, children: [] }; });
      const roots = [];
      allNodes.forEach(n => {
        if (!n.parent_id) roots.push(map[n.id]);
        else if (map[n.parent_id]) map[n.parent_id].children.push(map[n.id]);
      });
      return res.json({ nodes: roots });
    }
    
    // Create node
    if (path === 'api/nodes' && method === 'POST') {
      const body = await parseBody(req);
      const { name, node_type = 'category', parent_id, description } = body;
      if (!name) return res.status(400).json({ error: '名称不能为空' });
      
      const { v4: uuidv4 } = await import('uuid');
      const nodeId = uuidv4();
      const result = await sbPost('nodes', {
        id: nodeId, name, node_type, parent_id: parent_id || null,
        description: description || '', sort_order: 0,
        created_at: new Date().toISOString(),
      });
      return res.json({ id: nodeId, node: result });
    }
    
    // Delete node
    if (path.startsWith('api/nodes/') && method === 'DELETE') {
      const nodeId = path.replace('api/nodes/', '');
      // Collect all descendants
      const allNodes = await sbGet('nodes', { select: 'id,parent_id' });
      const toDelete = [nodeId];
      if (Array.isArray(allNodes)) {
        const map = {};
        allNodes.forEach(n => {
          if (n.parent_id) {
            (map[n.parent_id] = map[n.parent_id] || []).push(n.id);
          }
        });
        const queue = [nodeId];
        while (queue.length) {
          const pid = queue.pop();
          (map[pid] || []).forEach(cid => { toDelete.push(cid); queue.push(cid); });
        }
      }
      for (const nid of toDelete) {
        await sbDelete('nodes', `id=eq.${nid}`);
        await sbDelete('documents', `node_id=eq.${nid}`);
      }
      return res.json({ deleted: toDelete.length });
    }
    
    // Upload document
    if (path === 'api/documents/upload' && method === 'POST') {
      const form = await parseFormData(req);
      const nodeId = form.node_id;
      const file = form.file;
      
      if (!nodeId || !file) return res.status(400).json({ error: '缺少 node_id 或文件' });
      
      const text = Buffer.isBuffer(file.data) ? file.data.toString('utf-8') : file.data;
      if (!text.trim()) return res.json({ error: '文件内容为空' });
      
      // Chunk text
      const chunkSize = 500;
      const overlap = 100;
      const chunks = [];
      let start = 0;
      while (start < text.length) {
        let end = Math.min(start + chunkSize, text.length);
        if (end < text.length) {
          const segment = text.slice(start, end);
          const lastPeriod = Math.max(segment.lastIndexOf('。'), segment.lastIndexOf('.'), segment.lastIndexOf('\n'));
          if (lastPeriod > chunkSize / 2) end = start + lastPeriod + 1;
        }
        chunks.push(text.slice(start, end).trim());
        start = end - overlap;
      }
      
      const crypto = await import('crypto');
      const docId = crypto.createHash('md5').update(text.slice(0, 1024)).digest('hex').slice(0, 16);
      let stored = 0;
      
      for (let i = 0; i < chunks.length; i++) {
        if (!chunks[i]) continue;
        await sbPost('documents', {
          id: `${docId}_${i}`, node_id: nodeId, content: chunks[i],
          embedding: [], filename: file.filename || 'document.txt',
          chunk_index: i, created_at: new Date().toISOString(),
        }).catch(() => {});
        stored++;
      }
      
      return res.json({ doc_id: docId, chunks: chunks.length, stored, filename: file.filename || 'document', total_chars: text.length });
    }
    
    // List documents
    if (path === 'api/documents' && method === 'GET') {
      const nodeId = req.query.node_id;
      if (!nodeId) return res.json({ documents: [] });
      const data = await sbGet('documents', { node_id: `eq.${nodeId}`, select: 'distinct(filename,node_id,created_at)' });
      const seen = new Set();
      const result = [];
      (Array.isArray(data) ? data : []).forEach(d => {
        if (d.filename && !seen.has(d.filename)) { seen.add(d.filename); result.push(d); }
      });
      return res.json({ documents: result });
    }
    
    // Delete document
    if (path.startsWith('api/documents/') && method === 'DELETE') {
      const filename = path.replace('api/documents/', '');
      await sbDelete('documents', `filename=eq.${filename}`);
      return res.json({ ok: true });
    }
    
    // Chat
    if (path === 'api/chat' && method === 'POST') {
      const body = await parseBody(req);
      const { node_id: nodeId, question, include_subnodes = 'true' } = body;
      if (!nodeId || !question) return res.status(400).json({ error: '缺少参数' });
      
      // Collect all chunks from this node and sub-nodes
      const chunks = await collectChunks(nodeId, include_subnodes === 'true');
      
      if (!chunks.length) {
        return res.json({ answer: '该节点下还没有资料。请先上传 PDF 或文本文档。', sources: [] });
      }
      
      // Rerank
      const qWords = new Set(question.toLowerCase().split(/\s+/));
      const scored = chunks.map(c => {
        const cWords = new Set((c.content || '').toLowerCase().split(/\s+/));
        const overlap = [...qWords].filter(w => cWords.has(w)).length;
        return { score: overlap / Math.max(qWords.size, 1), chunk: c };
      });
      scored.sort((a, b) => b.score - a.score);
      const topChunks = scored.slice(0, 8).map(s => s.chunk);
      
      const context = topChunks.map(c => `[${c.filename} 第${c.chunk_index}段]:\n${c.content}`).join('\n\n---\n\n');
      const sources = topChunks.map(c => ({ filename: c.filename, content: (c.content || '').slice(0, 100) }));
      
      // Call DeepSeek
      const answer = await callDeepSeek(question, context);
      return res.json({ answer, sources, context_chunks: chunks.length });
    }
    
    return res.status(404).json({ error: 'Not Found' });
    
  } catch (e) {
    console.error('API Error:', e);
    return res.status(500).json({ error: e.message || 'Internal Error' });
  }
}

// ─── Supabase REST helpers ───
const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_KEY || '';
const SB_HEADERS = () => ({
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
});

async function sbGet(path, params = {}) {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const res = await fetch(`${SB_URL}/rest/v1/${path}${qs ? '?' + qs : ''}`, { headers: SB_HEADERS() });
  return res.ok ? res.json() : { error: await res.text() };
}

async function sbPost(path, body) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'POST', headers: SB_HEADERS(), body: JSON.stringify(body)
  });
  return res.ok ? res.json() : { error: await res.text() };
}

async function sbDelete(path, query) {
  await fetch(`${SB_URL}/rest/v1/${path}?${query}`, {
    method: 'DELETE', headers: { ...SB_HEADERS(), Prefer: 'return=minimal' }
  });
}

// ─── Recursive chunk collection ───
async function collectChunks(nodeId, recursive) {
  const chunks = [];
  const docs = await sbGet('documents', { node_id: `eq.${nodeId}`, select: 'content,filename,chunk_index' });
  if (Array.isArray(docs)) docs.forEach(d => { if (d.content) chunks.push(d); });
  
  if (recursive) {
    const children = await sbGet('nodes', { parent_id: `eq.${nodeId}` });
    if (Array.isArray(children)) {
      for (const child of children) {
        const childChunks = await collectChunks(child.id, true);
        chunks.push(...childChunks);
      }
    }
  }
  return chunks;
}

// ─── DeepSeek ───
async function callDeepSeek(question, context) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return 'DeepSeek API 未配置。请设置 DEEPSEEK_API_KEY 环境变量。';
  
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一个专业的学习助手。请基于提供的资料回答问题。只使用提供的资料来回答。用中文回答。' },
          { role: 'user', content: `背景资料：\n${context}\n\n问题：${question}` }
        ],
        temperature: 0.3,
        max_tokens: 2048,
      })
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || 'AI 暂时无法回答';
  } catch (e) {
    console.error('DeepSeek error:', e);
    return `AI 服务暂时不可用：${e.message}`;
  }
}

// ─── Body parsers ───
async function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { 
        // Parse form data
        const params = new URLSearchParams(body);
        const obj = {};
        for (const [k, v] of params) obj[k] = v;
        resolve(obj);
      }
    });
  });
}

async function parseFormData(req) {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    const busboy = await import('busboy');
    return new Promise((resolve) => {
      const bb = busboy({ headers: req.headers });
      const result = {};
      bb.on('file', (name, file, info) => {
        const chunks = [];
        file.on('data', d => chunks.push(d));
        file.on('end', () => {
          result[name] = { data: Buffer.concat(chunks), filename: info.filename };
        });
      });
      bb.on('field', (name, val) => { result[name] = val; });
      bb.on('close', () => resolve(result));
      req.pipe(bb);
    });
  }
  return parseBody(req);
}
