import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function SummaryView({ content, isStreaming }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `知识总结_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <h2 className="font-semibold text-slate-700">知识点总结</h2>
          {isStreaming && (
            <span className="flex items-center gap-1.5 text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
              AI 生成中
            </span>
          )}
        </div>
        {!isStreaming && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 bg-white
                         border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              {copied ? (
                <><svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg> 已复制</>
              ) : (
                <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg> 复制</>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-blue-600
                         rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              下载 MD
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        <div className={`prose-custom ${isStreaming ? 'streaming-cursor' : ''}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Custom table styling
              table: ({ children }) => (
                <div className="overflow-x-auto my-4">
                  <table className="min-w-full">{children}</table>
                </div>
              ),
              // Custom code block
              code: ({ inline, children }) =>
                inline
                  ? <code className="bg-slate-100 text-blue-700 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                  : <code>{children}</code>,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
