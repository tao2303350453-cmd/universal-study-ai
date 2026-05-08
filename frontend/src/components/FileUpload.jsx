import React, { useCallback, useRef, useState } from 'react'

const ACCEPTED = '.pdf,.docx,.xlsx,.xls,.csv,.txt'
const FILE_ICONS = {
  pdf: '📄',
  docx: '📝',
  doc: '📝',
  xlsx: '📊',
  xls: '📊',
  csv: '📋',
  txt: '📃',
}
const MAX_MB = 20

function getIcon(filename) {
  const ext = filename?.split('.').pop()?.toLowerCase() || ''
  return FILE_ICONS[ext] || '📁'
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function FileUpload({
  onFileUpload,
  uploadedFilename,
  isUploading,
  uploadProgress,
  charCount,
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [localFile, setLocalFile] = useState(null)
  const [sizeError, setSizeError] = useState('')
  const inputRef = useRef(null)

  const handleFile = useCallback(
    file => {
      if (!file) return
      setSizeError('')

      const ext = file.name.split('.').pop().toLowerCase()
      const allowed = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'txt']
      if (!allowed.includes(ext)) {
        setSizeError(`不支持 .${ext} 格式，请上传 PDF / Word / Excel / CSV / TXT`)
        return
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setSizeError(`文件过大（${formatSize(file.size)}），最大支持 ${MAX_MB} MB`)
        return
      }
      setLocalFile(file)
      onFileUpload(file)
    },
    [onFileUpload],
  )

  const onDrop = useCallback(
    e => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      handleFile(file)
    },
    [handleFile],
  )

  const onInputChange = e => handleFile(e.target.files[0])

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => !isUploading && inputRef.current?.click()}
        className={`relative cursor-pointer transition-all p-10 flex flex-col items-center gap-4
          ${isDragOver
            ? 'bg-blue-50 border-2 border-dashed border-blue-400'
            : 'border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-slate-50'
          }
          ${isUploading ? 'pointer-events-none opacity-75' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={onInputChange}
        />

        {/* Icon */}
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors
          ${isDragOver ? 'bg-blue-100' : 'bg-slate-100'}`}>
          {localFile ? (
            <span className="text-3xl">{getIcon(localFile.name)}</span>
          ) : (
            <svg
              className={`w-8 h-8 ${isDragOver ? 'text-blue-500' : 'text-slate-400'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          )}
        </div>

        {/* Text */}
        {!localFile ? (
          <>
            <div className="text-center">
              <p className="font-semibold text-slate-700">
                {isDragOver ? '松开以上传文件' : '拖拽文件到此处，或点击选择'}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                支持 PDF、Word、Excel、CSV、TXT，最大 {MAX_MB} MB
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {['PDF', 'DOCX', 'XLSX', 'CSV', 'TXT'].map(t => (
                <span key={t} className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium">
                  {t}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center">
            <p className="font-semibold text-slate-700">{localFile.name}</p>
            <p className="text-sm text-slate-400 mt-1">{formatSize(localFile.size)}</p>
            {!isUploading && uploadedFilename && (
              <p className="text-xs text-slate-400 mt-1">点击可更换文件</p>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {sizeError && (
        <div className="px-6 py-3 bg-red-50 border-t border-red-100 text-sm text-red-600">
          {sizeError}
        </div>
      )}

      {/* Upload Progress */}
      {isUploading && (
        <div className="px-6 py-4 border-t border-slate-100">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-600 font-medium">正在解析文件...</span>
            <span className="text-blue-600 font-semibold">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-2 bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Success state */}
      {!isUploading && uploadedFilename && (
        <div className="px-6 py-3 bg-green-50 border-t border-green-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd" />
          </svg>
          <span className="text-sm text-green-700 font-medium">
            解析成功
          </span>
          {charCount && (
            <span className="text-xs text-green-600 ml-1">
              · 共 {charCount.toLocaleString()} 字符
            </span>
          )}
        </div>
      )}
    </div>
  )
}
