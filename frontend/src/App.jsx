import React, { useState } from 'react'
import FileUpload from './components/FileUpload'
import Settings from './components/Settings'
import QuizCard from './components/QuizCard'
import SummaryView from './components/SummaryView'
import LoadingAnimation from './components/LoadingAnimation'

// In dev, Vite proxy handles /api -> localhost:8000
// In prod, set this to your backend URL
const API_BASE = ''

export default function App() {
  // ── Config state ──
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('deepseek_api_key') || '')
  const [model, setModel]   = useState(() => localStorage.getItem('deepseek_model') || 'deepseek-chat')
  const [showSettings, setShowSettings] = useState(false)

  // ── Upload state ──
  const [uploadedContent, setUploadedContent] = useState('')
  const [uploadedFilename, setUploadedFilename] = useState('')
  const [charCount, setCharCount] = useState(0)
  const [isUploading, setIsUploading]     = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // ── AI state ──
  const [mode, setMode]         = useState('quiz')
  const [isLoading, setIsLoading] = useState(false)
  const [quizData, setQuizData]   = useState(null)
  const [quizTitle, setQuizTitle] = useState('')
  const [summaryData, setSummaryData] = useState('')
  const [error, setError]         = useState('')

  // ── File upload handler ──
  const handleFileUpload = async (file) => {
    setIsUploading(true)
    setUploadProgress(0)
    setError('')
    setQuizData(null)
    setSummaryData('')
    setUploadedContent('')
    setUploadedFilename('')

    const progressTimer = setInterval(() => {
      setUploadProgress(p => Math.min(p + 8, 88))
    }, 150)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      })

      clearInterval(progressTimer)

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '文件上传失败')
      }

      const data = await res.json()
      setUploadProgress(100)
      setUploadedContent(data.content)
      setUploadedFilename(data.filename)
      setCharCount(data.char_count)

      setTimeout(() => {
        setIsUploading(false)
        setUploadProgress(0)
      }, 800)
    } catch (err) {
      clearInterval(progressTimer)
      setError(err.message)
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  // ── AI process handler ──
  const handleProcess = async () => {
    if (!apiKey) {
      setError('请先在设置（右上角齿轮）中填入 DeepSeek API Key。')
      setShowSettings(true)
      return
    }
    if (!uploadedContent) {
      setError('请先上传文件。')
      return
    }

    setIsLoading(true)
    setError('')
    setQuizData(null)
    setSummaryData('')

    try {
      const res = await fetch(`${API_BASE}/api/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: uploadedContent, mode, api_key: apiKey, model }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'AI 处理失败')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let buffer = ''

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete last line

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue

          const raw = trimmed.slice(6)
          if (raw === '[DONE]') break

          try {
            const parsed = JSON.parse(raw)
            if (parsed.error) throw new Error(parsed.error)
            if (parsed.content) {
              accumulated += parsed.content
              if (mode === 'summary') {
                setSummaryData(accumulated)
              }
            }
          } catch (e) {
            if (e.message && e.message.startsWith('AI 错误')) throw e
            // Ignore partial JSON parse errors
          }
        }
      }

      // After stream ends, parse quiz JSON
      if (mode === 'quiz') {
        // Try to extract JSON from code block or raw
        let jsonStr = accumulated
        const match = accumulated.match(/```json\s*([\s\S]*?)\s*```/)
        if (match) jsonStr = match[1]

        try {
          const parsed = JSON.parse(jsonStr)
          setQuizData(parsed.quiz || (Array.isArray(parsed) ? parsed : null))
          setQuizTitle(parsed.title || '')
        } catch {
          // Try to find any JSON object
          const objMatch = accumulated.match(/\{[\s\S]*\}/)
          if (objMatch) {
            try {
              const parsed = JSON.parse(objMatch[0])
              setQuizData(parsed.quiz || null)
              setQuizTitle(parsed.title || '')
            } catch {
              setError('题库解析失败，AI 返回格式有误，请重试。')
            }
          } else {
            setError('题库解析失败，请重试。')
          }
        }
      }

    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const hasResult = quizData || summaryData

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center shadow-sm">
              <span className="text-white text-sm font-bold">AI</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">全能复习助手</h1>
              <p className="text-xs text-slate-400">Powered by DeepSeek</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* API key status */}
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
              ${apiKey ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${apiKey ? 'bg-green-500' : 'bg-yellow-400'}`} />
              {apiKey ? 'API 已配置' : '未配置 API Key'}
            </div>

            <button
              onClick={() => setShowSettings(s => !s)}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500 hover:text-slate-700"
              title="设置"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5">

        {/* Settings panel */}
        {showSettings && (
          <Settings
            apiKey={apiKey}
            setApiKey={setApiKey}
            model={model}
            setModel={setModel}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 animate-fade-in">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* File upload */}
        <FileUpload
          onFileUpload={handleFileUpload}
          uploadedFilename={uploadedFilename}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          charCount={charCount}
        />

        {/* Mode selection + process */}
        {uploadedContent && !isUploading && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 animate-slide-up">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              选择 AI 处理模式
            </p>

            <div className="grid grid-cols-2 gap-3 mb-5">
              {/* Quiz mode */}
              <button
                onClick={() => setMode('quiz')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  mode === 'quiz'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="text-2xl mb-2">📝</div>
                <div className={`font-semibold text-sm ${mode === 'quiz' ? 'text-blue-700' : 'text-slate-700'}`}>
                  题库生成
                </div>
                <div className={`text-xs mt-1 ${mode === 'quiz' ? 'text-blue-500' : 'text-slate-400'}`}>
                  生成可交互测试题卡
                </div>
              </button>

              {/* Summary mode */}
              <button
                onClick={() => setMode('summary')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  mode === 'summary'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="text-2xl mb-2">🧠</div>
                <div className={`font-semibold text-sm ${mode === 'summary' ? 'text-purple-700' : 'text-slate-700'}`}>
                  知识点总结
                </div>
                <div className={`text-xs mt-1 ${mode === 'summary' ? 'text-purple-500' : 'text-slate-400'}`}>
                  生成结构化知识笔记
                </div>
              </button>
            </div>

            <button
              onClick={handleProcess}
              disabled={isLoading}
              className={`w-full py-3.5 rounded-xl font-semibold text-sm text-white transition-all
                flex items-center justify-center gap-2 shadow-sm
                ${isLoading
                  ? 'bg-slate-400 cursor-not-allowed'
                  : mode === 'quiz'
                    ? 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                    : 'bg-purple-600 hover:bg-purple-700 active:scale-95'
                }`}
            >
              {isLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  AI 正在处理，请稍候...
                </>
              ) : mode === 'quiz' ? (
                <>🚀 开始生成题库</>
              ) : (
                <>🧠 开始生成总结</>
              )}
            </button>
          </div>
        )}

        {/* Loading animation */}
        {isLoading && <LoadingAnimation mode={mode} />}

        {/* Results */}
        {!isLoading && quizData && mode === 'quiz' && (
          <QuizCard questions={quizData} title={quizTitle} />
        )}

        {summaryData && mode === 'summary' && (
          <SummaryView content={summaryData} isStreaming={isLoading} />
        )}

        {/* Empty state */}
        {!uploadedContent && !isUploading && !hasResult && (
          <div className="text-center py-12 text-slate-400">
            <div className="text-5xl mb-4">📂</div>
            <p className="font-medium">上传文件，开始 AI 复习</p>
            <p className="text-sm mt-1">支持 PDF、Word、Excel、CSV、TXT</p>
          </div>
        )}
      </main>
    </div>
  )
}
