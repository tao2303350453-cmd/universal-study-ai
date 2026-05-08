import React from 'react'

const steps = {
  quiz: [
    '正在理解文档结构...',
    '分析知识点分布...',
    '生成题目与选项...',
    '编写详细解析...',
    '整理题库格式...',
  ],
  summary: [
    '正在深度阅读文档...',
    '梳理核心概念...',
    '构建知识框架...',
    '生成对比分析...',
    '提炼考点与记忆口诀...',
  ],
}

export default function LoadingAnimation({ mode = 'quiz' }) {
  const [stepIndex, setStepIndex] = React.useState(0)
  const msgs = steps[mode] || steps.quiz

  React.useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex(prev => (prev + 1) % msgs.length)
    }, 2200)
    return () => clearInterval(timer)
  }, [msgs.length])

  return (
    <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
      {/* Orbiting dots */}
      <div className="relative w-20 h-20 mb-8">
        <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
        <div
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 border-r-blue-300"
          style={{ animation: 'spin 1.2s linear infinite' }}
        />
        <div
          className="absolute inset-2 rounded-full border-4 border-transparent border-b-purple-500 border-l-purple-300"
          style={{ animation: 'spin 1.8s linear infinite reverse' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl">
            {mode === 'quiz' ? '📝' : '🧠'}
          </span>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-slate-700 mb-2">
        AI 正在处理中
      </h3>

      {/* Animated step message */}
      <div className="h-6 flex items-center">
        <p
          key={stepIndex}
          className="text-sm text-slate-500 animate-fade-in"
        >
          {msgs[stepIndex]}
        </p>
      </div>

      {/* Thinking dots */}
      <div className="flex gap-2 mt-6">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="thinking-dot w-2 h-2 rounded-full bg-blue-400 inline-block"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>

      <p className="text-xs text-slate-400 mt-4">
        请稍候，通常需要 15~30 秒...
      </p>
    </div>
  )
}
