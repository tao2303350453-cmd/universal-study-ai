import React, { useState, useEffect, useCallback } from 'react';

// ============================================================
// API 基础地址
// ============================================================
const API_BASE = '/api';

async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`API ${res.status}: ${text}`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return res.text();
}

// ============================================================
// 工具函数 - 构建分类树 / 面包屑
// ============================================================
function buildTree(flat) {
  const map = {};
  const roots = [];
  flat.forEach((c) => {
    map[c.id] = { ...c, children: [] };
  });
  flat.forEach((c) => {
    const node = map[c.id];
    if (c.parent_id && map[c.parent_id]) {
      map[c.parent_id].children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function findPath(tree, targetId, ancestors = []) {
  for (const node of tree) {
    if (node.id === targetId) {
      return [...ancestors, node];
    }
    const found = findPath(node.children, targetId, [...ancestors, node]);
    if (found) return found;
  }
  return null;
}

function isTopLevel(tree, id) {
  return tree.some((n) => n.id === id);
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============================================================
// 模态框子组件 (Create / Rename)
// ============================================================
function InputModal({ type, title, defaultValue, onConfirm, onCancel }) {
  const [value, setValue] = useState(defaultValue || '');
  const inputRef = React.useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (type === 'rename') inputRef.current.select();
    }
  }, [type]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const v = value.trim();
      if (v) onConfirm(v);
    }
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-white rounded-lg p-6 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <input
          ref={inputRef}
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={type === 'create' ? '输入名称' : '输入新名称'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 text-sm rounded bg-slate-100 hover:bg-slate-200"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={() => { const v = value.trim(); if (v) onConfirm(v); }}
            disabled={!value.trim()}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 确认删除模态框
// ============================================================
function DeleteModal({ name, onConfirm, onCancel }) {
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-white rounded-lg p-6 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">确认删除</h3>
        <p className="text-sm text-slate-600 mb-4">
          确定删除「{name}」及其所有子分类吗？
        </p>
        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 text-sm rounded bg-slate-100 hover:bg-slate-200"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700"
            onClick={onConfirm}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 分类树节点组件
// ============================================================
function TreeNode({ node, depth, selectedId, expandedIds, onSelect, onToggle, onAddChild, onRename, onDelete }) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={`flex items-center px-3 py-2 cursor-pointer hover:bg-slate-700 transition-colors group ${
          isSelected ? 'bg-blue-600 text-white' : 'text-slate-200'
        }`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => {
          onSelect(node.id);
          if (hasChildren) onToggle(node.id);
        }}
      >
        {hasChildren ? (
          <span className="w-4 text-center mr-1 text-xs">
            {isExpanded ? '▼' : '▶'}
          </span>
        ) : (
          <span className="w-4 mr-1" />
        )}
        <i className={`fas fa-folder mr-2 text-sm ${isSelected ? 'text-white' : 'text-slate-400'}`} />
        <span className="flex-1 truncate text-sm">{node.name}</span>
        <div className="hidden group-hover:flex items-center gap-1 ml-1">
          <button
            title="新建子分类"
            className="text-slate-400 hover:text-white text-xs px-1"
            onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
          >
            <i className="fas fa-plus" />
          </button>
          <button
            title="重命名"
            className="text-slate-400 hover:text-white text-xs px-1"
            onClick={(e) => { e.stopPropagation(); onRename(node); }}
          >
            <i className="fas fa-pen" />
          </button>
          <button
            title="删除"
            className="text-slate-400 hover:text-red-400 text-xs px-1"
            onClick={(e) => { e.stopPropagation(); onDelete(node); }}
          >
            <i className="fas fa-trash" />
          </button>
        </div>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================
export default function App() {
  // ---- 状态 ----
  const [categories, setCategories] = useState([]);
  const [tree, setTree] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [examData, setExamData] = useState(null);
  const [examLoading, setExamLoading] = useState(false);

  // 模态框状态：null | { type: 'create', parentId } | { type: 'rename', node } | { type: 'delete', node }
  const [modal, setModal] = useState(null);

  // ---- 初始化 ----
  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const data = await apiFetch('/categories');
      setCategories(data);
      setTree(buildTree(data));
    } catch (e) {
      console.error('Failed to load categories', e);
    }
  }, []);

  // 当选中的分类变化时，加载文件
  useEffect(() => {
    if (selectedId) {
      loadDocuments(selectedId);
      setExamData(null);
    } else {
      setDocuments([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const loadDocuments = async (catId) => {
    try {
      const data = await apiFetch(`/categories/${catId}/documents`);
      setDocuments(data);
    } catch (e) {
      console.error('Failed to load documents', e);
      setDocuments([]);
    }
  };

  // ---- 分类操作 ----
  const handleCreate = async (name, parentId) => {
    try {
      await apiFetch('/categories', {
        method: 'POST',
        body: JSON.stringify({ name, parent_id: parentId || null }),
      });
      await loadCategories();
      setModal(null);
    } catch (e) {
      alert('创建失败: ' + e.message);
    }
  };

  const handleRename = async (id, name) => {
    try {
      await apiFetch(`/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
      await loadCategories();
      setModal(null);
    } catch (e) {
      alert('重命名失败: ' + e.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiFetch(`/categories/${id}`, { method: 'DELETE' });
      if (selectedId === id) {
        setSelectedId(null);
        setMessages([]);
      }
      await loadCategories();
      setModal(null);
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  };

  // ---- 文件相关 ----
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedId) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category_id', selectedId);
    try {
      await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
      await loadDocuments(selectedId);
      alert('上传成功');
    } catch (e) {
      alert('上传失败: ' + e.message);
    }
    e.target.value = '';
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm('确定删除此文件吗？')) return;
    try {
      const res = await fetch(`${API_BASE}/documents/${docId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await loadDocuments(selectedId);
    } catch (e) {
      // Fallback: try using the move endpoint with DELETE
      try {
        await apiFetch(`/documents/${docId}/move`, { method: 'DELETE' });
        await loadDocuments(selectedId);
      } catch (e2) {
        alert('删除文件失败: ' + e.message);
      }
    }
  };

  // ---- 聊天 ----
  const handleChat = async () => {
    if (!chatInput.trim() || !selectedId) return;
    const userMsg = { role: 'user', content: chatInput };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setLoading(true);
    try {
      const data = await apiFetch('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: chatInput, category_id: selectedId }),
      });
      const assistantMsg = {
        role: 'assistant',
        content: data.reply || data.content || data.message || JSON.stringify(data),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: '请求失败: ' + e.message }]);
    }
    setLoading(false);
  };

  // ---- 综合测试 ----
  const handleGenerateExam = async () => {
    if (!selectedId) return;
    setExamLoading(true);
    setExamData(null);
    try {
      const data = await apiFetch('/exam/generate', {
        method: 'POST',
        body: JSON.stringify({ category_id: selectedId }),
      });
      setExamData(data);
    } catch (e) {
      alert('出卷失败: ' + e.message);
    }
    setExamLoading(false);
  };

  // ---- 展开 / 折叠 ----
  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---- 计算面包屑 ----
  const breadcrumb = selectedId ? findPath(tree, selectedId) : [];

  // ---- 判断选中是否是一级分类 ----
  const isTopSelected = selectedId && isTopLevel(tree, selectedId);

  // ---- 渲染试卷 ----
  const renderExam = () => {
    if (!examData) return null;
    const questions = examData.questions || examData.data || [];
    const title = examData.title || '综合测试';

    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-lg text-slate-800">
            <i className="fas fa-file-alt text-blue-600 mr-2" />
            {title}
          </h3>
          <button
            className="text-sm text-blue-600 hover:text-blue-800"
            onClick={() => setExamData(null)}
          >
            关闭 <i className="fas fa-times ml-1" />
          </button>
        </div>
        {Array.isArray(questions) && questions.length > 0 ? (
          <div className="space-y-3">
            {questions.map((q, idx) => (
              <div key={idx} className="p-3 bg-slate-50 rounded border border-slate-100">
                <p className="text-sm font-medium text-slate-700">
                  {idx + 1}. {q.question || q.title || q.content || ''}
                </p>
                {q.options && Array.isArray(q.options) && (
                  <div className="mt-1 ml-4 space-y-1">
                    {q.options.map((opt, oi) => (
                      <p key={oi} className="text-xs text-slate-600">
                        {String.fromCharCode(65 + oi)}. {opt}
                      </p>
                    ))}
                  </div>
                )}
                {q.answer && (
                  <p className="mt-1 text-xs text-green-600">
                    答案: {q.answer}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <pre className="text-xs text-slate-600 whitespace-pre-wrap">
            {JSON.stringify(examData, null, 2)}
          </pre>
        )}
      </div>
    );
  };

  // ---- 主渲染 ----
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* 左侧边栏 */}
      <aside className="w-64 bg-slate-900 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-700">
          <h1 className="text-white font-bold text-lg flex items-center gap-2">
            <i className="fas fa-brain text-blue-400" />
            AI 学科助手
          </h1>
          <p className="text-slate-400 text-xs mt-1">智能学习管理系统</p>
        </div>

        <div className="p-3 border-b border-slate-700">
          <button
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg px-3 py-2 transition-colors"
            onClick={() => setModal({ type: 'create', parentId: null })}
          >
            <i className="fas fa-plus" />
            新建学科
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {tree.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-8">
              暂无学科，点击上方按钮创建
            </p>
          ) : (
            tree.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                expandedIds={expandedIds}
                onSelect={(id) => { setSelectedId(id); setMessages([]); }}
                onToggle={toggleExpand}
                onAddChild={(parentId) => setModal({ type: 'create', parentId })}
                onRename={(node) => setModal({ type: 'rename', node })}
                onDelete={(node) => setModal({ type: 'delete', node })}
              />
            ))
          )}
        </div>
      </aside>

      {/* 右侧主区域 */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* 面包屑 */}
        <div className="bg-white border-b border-slate-200 px-6 py-3">
          {breadcrumb && breadcrumb.length > 0 ? (
            <nav className="flex items-center text-sm text-slate-500">
              <i className="fas fa-home text-slate-400 mr-2" />
              {breadcrumb.map((node, idx) => (
                <React.Fragment key={node.id}>
                  {idx > 0 && <span className="mx-2 text-slate-300">/</span>}
                  <button
                    className={`hover:text-blue-600 ${
                      idx === breadcrumb.length - 1 ? 'text-blue-600 font-medium' : ''
                    }`}
                    onClick={() => { setSelectedId(node.id); setMessages([]); }}
                  >
                    {node.name}
                  </button>
                </React.Fragment>
              ))}
            </nav>
          ) : (
            <p className="text-sm text-slate-400">
              <i className="fas fa-arrow-left mr-2" />
              请从左侧选择一个学科
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!selectedId ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center">
                <i className="fas fa-folder-open text-5xl mb-4 text-slate-300" />
                <p className="text-lg">请从左侧选择一个学科</p>
                <p className="text-sm mt-2">选择后可查看资料、上传文件或提问</p>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* 综合测试按钮（仅一级学科） */}
              {isTopSelected && (
                <div className="flex items-center gap-3">
                  <button
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                    onClick={handleGenerateExam}
                    disabled={examLoading}
                  >
                    <i className={`fas ${examLoading ? 'fa-spinner fa-spin' : 'fa-file-alt'}`} />
                    {examLoading ? '生成中...' : '综合测试'}
                  </button>
                </div>
              )}

              {/* 试卷显示 */}
              {renderExam()}

              {/* 文件列表 */}
              <div className="bg-white rounded-lg border border-slate-200">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                    <i className="fas fa-paperclip text-blue-600" />
                    资料文件
                    <span className="text-xs text-slate-400 font-normal">
                      ({documents.length} 个文件)
                    </span>
                  </h2>
                  <label className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
                    <i className="fas fa-upload" />
                    上传资料
                    <input type="file" className="hidden" onChange={handleUpload} />
                  </label>
                </div>
                {documents.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <i className="fas fa-file-upload text-3xl mb-2" />
                    <p className="text-sm">暂无资料，点击上方按钮上传</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center px-4 py-3 hover:bg-slate-50 group"
                      >
                        <i className="fas fa-file text-blue-400 mr-3" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 truncate">
                            {doc.filename || doc.name || '未命名文件'}
                          </p>
                          <p className="text-xs text-slate-400">
                            {doc.size ? formatFileSize(doc.size) : ''}
                            {doc.created_at && ` · ${new Date(doc.created_at).toLocaleString('zh-CN')}`}
                          </p>
                        </div>
                        <button
                          className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleDeleteDocument(doc.id)}
                          title="删除文件"
                        >
                          <i className="fas fa-trash-alt" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 聊天区域 */}
              <div className="bg-white rounded-lg border border-slate-200">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                    <i className="fas fa-comments text-blue-600" />
                    智能问答
                  </h2>
                </div>
                <div className="h-64 overflow-y-auto p-4 space-y-3" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                  {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400">
                      <p className="text-sm">输入问题，AI 将基于当前学科的资料回答</p>
                    </div>
                  ) : (
                    messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg px-4 py-2 text-sm ${
                            msg.role === 'user'
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))
                  )}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-slate-100 rounded-lg px-4 py-2 text-sm text-slate-500 flex items-center gap-2">
                        <i className="fas fa-circle-notch fa-spin" />
                        AI 思考中...
                      </div>
                    </div>
                  )}
                </div>
                <div className="border-t border-slate-100 p-3">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="输入你的问题..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleChat();
                        }
                      }}
                      disabled={loading}
                    />
                    <button
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                      onClick={handleChat}
                      disabled={loading || !chatInput.trim()}
                    >
                      <i className="fas fa-paper-plane" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 模态框 */}
      {modal && modal.type === 'create' && (
        <InputModal
          type="create"
          title={modal.parentId ? '新建子分类' : '新建一级学科'}
          defaultValue=""
          onConfirm={(name) => handleCreate(name, modal.parentId)}
          onCancel={() => setModal(null)}
        />
      )}
      {modal && modal.type === 'rename' && (
        <InputModal
          type="rename"
          title="重命名"
          defaultValue={modal.node.name}
          onConfirm={(name) => handleRename(modal.node.id, name)}
          onCancel={() => setModal(null)}
        />
      )}
      {modal && modal.type === 'delete' && (
        <DeleteModal
          name={modal.node.name}
          onConfirm={() => handleDelete(modal.node.id)}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}
