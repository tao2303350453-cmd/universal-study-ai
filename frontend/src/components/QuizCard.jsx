import React, { useState } from 'react'

const DIFFICULTY_MAP = {
  easy:   { label: '简单', color: 'bg-green-100 text-green-700' },
  medium: { label: '中等', color: 'bg-yellow-100 text-yellow-700' },
  hard:   { label: '困难', color: 'bg-red-100 text-red-700' },
}

function SingleQuestion({ q, index, onAnswer }) {
  const [selected, setSelected] = useState(null)
  const [showExplanation, setShowExplanation] = useState(false)

  const handleSelect = (opt) => {
    if (selected) return
    setSelected(opt)
    onAnswer(opt === q.answer)
    setTimeout(() => setShowExplanation(true), 300)
  }

  const isCorrect = selected === q.answer
  const diff = DIFFICULTY_MAP[q.difficulty] || DIFFICULTY_MAP.medium

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-slide-up">
      {/* Question header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-start gap-3">
        <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-50 text-blue-600 font-bold text-sm flex items-center justify-center">
          {index + 1}
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${diff.color}`}>
              {diff.label}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
              {q.type === 'multiple' ? '多选题' : '单选题'}
            </span>
          </div>
          <p className="text-slate-800 font-medium leading-relaxed">{q.question}</p>
        </div>
      </div>

      {/* Options */}
      <div className="p-4 space-y-2.5">
        {Object.entries(q.options).map(([key, val]) => {
          let style = 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
          if (selected) {
            if (key === q.answer) {
              style = 'border-green-400 bg-green-50 text-green-800'
            } else if (key === selected && key !== q.answer) {
              style = 'border-red-400 bg-red-50 text-red-700'
            } else {
              style = 'border-slate-100 bg-slate-50 text-slate-400'
            }
          }

          return (
            <button
              key={key}
              onClick={() => handleSelect(key)}
              disabled={!!selected}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all text-sm
                flex items-start gap-3 ${style}
                ${!selected ? 'cursor-pointer' : 'cursor-default'}
              `}
            >
              <span className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-current flex items-center justify-center font-bold text-xs">
                {key}
              </span>
              <span className="leading-relaxed">{val}</span>
              {selected && key === q.answer && (
                <svg className="w-4 h-4 text-green-500 flex-shrink-0 ml-auto mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
              {selected && key === selected && key !== q.answer && (
                <svg className="w-4 h-4 text-red-500 flex-shrink-0 ml-auto mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          )
        })}
      </div>

      {/* Explanation */}
      {showExplanation && (
        <div className={`mx-4 mb-4 p-4 rounded-xl text-sm animate-fade-in
          ${isCorrect ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}
        >
          <p className={`font-semibold mb-1 ${isCorrect ? 'text-green-700' : 'text-orange-700'}`}>
            {isCorrect ? '✓ 回答正确！' : `✗ 正确答案是 ${q.answer}`}
          </p>
          <p className="text-slate-600 leading-relaxed">{q.explanation}</p>
        </div>
      )}
    </div>
  )
}

function MultipleQuestion({ q, index, onAnswer }) {
  const [selected, setSelected] = useState([])
  const [submitted, setSubmitted] = useState(false)

  const correctAnswers = Array.isArray(q.answer) ? q.answer.sort() : [q.answer]

  const toggle = (key) => {
    if (submitted) return
    setSelected(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const handleSubmit = () => {
    if (selected.length === 0) return
    setSubmitted(true)
    const isCorrect = JSON.stringify(selected.sort()) === JSON.stringify(correctAnswers)
    onAnswer(isCorrect)
  }

  const diff = DIFFICULTY_MAP[q.difficulty] || DIFFICULTY_MAP.medium

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-slide-up">
      <div className="px-6 py-4 border-b border-slate-100 flex items-start gap-3">
        <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-50 text-purple-600 font-bold text-sm flex items-center justify-center">
          {index + 1}
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${diff.color}`}>{diff.label}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-600 font-medium">多选题</span>
          </div>
          <p className="text-slate-800 font-medium leading-relaxed">{q.question}</p>
        </div>
      </div>

      <div className="p-4 space-y-2.5">
        {Object.entries(q.options).map(([key, val]) => {
          const isSelected = selected.includes(key)
          const isCorrectOpt = correctAnswers.includes(key)
          let style = ''

          if (!submitted) {
            style = isSelected
              ? 'border-purple-400 bg-purple-50 text-purple-800'
              : 'border-slate-200 bg-white text-slate-700 hover:border-purple-300 hover:bg-purple-50'
          } else {
            if (isCorrectOpt) {
              style = 'border-green-400 bg-green-50 text-green-800'
            } else if (isSelected && !isCorrectOpt) {
              style = 'border-red-400 bg-red-50 text-red-700'
            } else {
              style = 'border-slate-100 bg-slate-50 text-slate-400'
            }
          }

          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              disabled={submitted}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all text-sm
                flex items-start gap-3 ${style} ${!submitted ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center font-bold text-xs border-2 border-current
                ${isSelected && !submitted ? 'bg-purple-500 border-purple-500 text-white' : ''}`}>
                {key}
              </span>
              <span className="leading-relaxed">{val}</span>
            </button>
          )
        })}
      </div>

      {!submitted ? (
        <div className="px-4 pb-4">
          <button
            onClick={handleSubmit}
            disabled={selected.length === 0}
            className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300
                       text-white font-semibold text-sm transition-all"
          >
            提交答案 {selected.length > 0 ? `（已选 ${selected.length} 项）` : ''}
          </button>
        </div>
      ) : (
        <div className="mx-4 mb-4 p-4 rounded-xl bg-orange-50 border border-orange-200 text-sm animate-fade-in">
          <p className="font-semibold text-orange-700 mb-1">
            正确答案：{correctAnswers.join('、')}
          </p>
          <p className="text-slate-600 leading-relaxed">{q.explanation}</p>
        </div>
      )}
    </div>
  )
}

export default function QuizCard({ questions, title }) {
  const [answers, setAnswers] = useState({})
  const [finished, setFinished] = useState(false)

  const handleAnswer = (id, isCorrect) => {
    setAnswers(prev => {
      const next = { ...prev, [id]: isCorrect }
      if (Object.keys(next).length === questions.length) {
        setTimeout(() => setFinished(true), 600)
      }
      return next
    })
  }

  const correctCount = Object.values(answers).filter(Boolean).length
  const total = questions.length
  const score = total > 0 ? Math.round((correctCount / total) * 100) : 0

  let scoreColor = 'text-red-600'
  if (score >= 90) scoreColor = 'text-green-600'
  else if (score >= 70) scoreColor = 'text-blue-600'
  else if (score >= 50) scoreColor = 'text-yellow-600'

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            {title || '📝 题库测试'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">共 {total} 道题 · 已作答 {Object.keys(answers).length} 道</p>
        </div>
        {finished && (
          <div className="text-center animate-fade-in">
            <div className={`text-3xl font-bold ${scoreColor}`}>{score}分</div>
            <div className="text-xs text-slate-500">{correctCount}/{total} 正确</div>
          </div>
        )}
      </div>

      {/* Score bar */}
      {Object.keys(answers).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex justify-between text-xs text-slate-500 mb-2">
            <span>答题进度</span>
            <span>{Object.keys(answers).length}/{total}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div
              className="h-2 bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500"
              style={{ width: `${(Object.keys(answers).length / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Questions */}
      {questions.map((q, i) => (
        q.type === 'multiple'
          ? <MultipleQuestion key={q.id} q={q} index={i} onAnswer={c => handleAnswer(q.id, c)} />
          : <SingleQuestion  key={q.id} q={q} index={i} onAnswer={c => handleAnswer(q.id, c)} />
      ))}

      {/* Final result */}
      {finished && (
        <div className={`p-6 rounded-2xl text-center border-2 animate-slide-up
          ${score >= 70 ? 'bg-green-50 border-green-300' : 'bg-orange-50 border-orange-300'}`}
        >
          <div className="text-5xl mb-3">
            {score >= 90 ? '🏆' : score >= 70 ? '🎉' : score >= 50 ? '📚' : '💪'}
          </div>
          <div className={`text-4xl font-bold mb-2 ${scoreColor}`}>{score} 分</div>
          <p className="text-slate-700 font-medium">
            {score >= 90 ? '太棒了！掌握非常扎实！'
              : score >= 70 ? '良好！还有一些知识点可以加强。'
              : score >= 50 ? '继续努力，再复习一遍吧！'
              : '需要重点复习，加油！'}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            答对 {correctCount} 题，答错 {total - correctCount} 题
          </p>
        </div>
      )}
    </div>
  )
}
