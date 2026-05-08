import React, { useState } from 'react'

const MODELS = [
  { value: 'deepseek-chat', label: 'DeepSeek-V3 (推荐)' },
  { value: 'deepseek-reasoner', label: 'DeepSeek-R1 (深度推理)' },
]

export default function Settings({ apiKey, setApiKey, model, setModel, onClose }) {
  const [localKey, setLocalKey] = useState(apiKey)
  const [localModel, setLocalModel] = useState(model)
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setApiKey(localKey.trim())
    setModel(localModel)
    localStorage.setItem('deepseek_api_key', localKey.trim())
    localStorage.setItem('deepseek_model', localModel)
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 800)
  }

  return (
    <div className="mb-6 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h2 className="font-semibold text-slate-700">DeepSeek API 设置</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-200 rounded-lg transition-colors text-slate-500"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            DeepSeek API Key
            <a
              href="https://platform.deepseek.com/api_keys"
              target="_blank"
              rel="noreferrer"
              className="ml-2 text-xs text-blue-500 hover:text-blue-700 font-normal"
            >
              获取 API Key →
            </a>
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={localKey}
              onChange={e => setLocalKey(e.target.value)}
              placeholder="sk-xxxxxxxxxxxxxxxx"
              className="w-full pr-12 pl-4 py-3 border border-slate-200 rounded-xl text-sm font-mono
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         bg-slate-50 text-slate-700 placeholder-slate-300"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showKey ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            API Key 仅保存在浏览器本地，不会上传到任何服务器。
          </p>
        </div>

        {/* Model Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">选择模型</label>
          <div className="grid grid-cols-2 gap-3">
            {MODELS.map(m => (
              <button
                key={m.value}
                onClick={() => setLocalModel(m.value)}
                className={`p-3 rounded-xl border-2 text-sm text-left transition-all ${
                  localModel === m.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="font-medium">{m.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* API Endpoint info */}
        <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500">
          <span className="font-medium">请求地址：</span>
          <code className="ml-1 text-blue-600">https://api.deepseek.com/v1/chat/completions</code>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {saved ? '✓ 已保存' : '保存设置'}
        </button>
      </div>
    </div>
  )
}
