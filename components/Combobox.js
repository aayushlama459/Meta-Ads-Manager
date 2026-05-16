'use client'

import { useState, useRef, useEffect, useMemo } from 'react'

export default function Combobox({
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  emptyText = 'No matches',
  disabled = false,
  getLabel = (o) => o.name,
  getValue = (o) => o.id,
  getSubtitle,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)

  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const selected = useMemo(
    () => options.find((o) => getValue(o) === value) || null,
    [options, value, getValue]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => {
      const label = String(getLabel(o) || '').toLowerCase()
      const id = String(getValue(o) || '').toLowerCase()
      const sub = getSubtitle ? String(getSubtitle(o) || '').toLowerCase() : ''
      return label.includes(q) || id.includes(q) || sub.includes(q)
    })
  }, [options, query, getLabel, getValue, getSubtitle])

  useEffect(() => {
    function onDocClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    if (open) {
      setHighlight(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${highlight}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  const choose = (opt) => {
    onChange(getValue(opt))
    setOpen(false)
    setQuery('')
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlight]) choose(filtered[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {!open ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen(true)}
          className={`w-full flex items-center justify-between gap-2 bg-[#1a1a1a] text-left border border-[#333333] rounded-lg pl-3.5 pr-3 py-2.5 text-sm shadow-sm transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#555555] cursor-pointer'}`}
        >
          <span className={`truncate ${selected ? 'text-white' : 'text-[#9ca3af]'}`}>
            {selected ? getLabel(selected) : placeholder}
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      ) : (
        <div className="w-full flex items-center gap-2 bg-[#1a1a1a] border-2 border-[#4f46e5] rounded-lg pl-3.5 pr-3 py-2 text-sm shadow-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlight(0) }}
            onKeyDown={onKeyDown}
            placeholder="Type to search..."
            className="flex-1 bg-transparent text-white placeholder-[#9ca3af] text-sm focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="text-[#9ca3af] hover:text-white text-xs">
              ✕
            </button>
          )}
        </div>
      )}

      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1.5 w-full bg-[#111111] border border-[#1f1f1f] rounded-lg shadow-lg max-h-64 overflow-y-auto py-1"
        >
          {filtered.length === 0 ? (
            <div className="px-3.5 py-3 text-sm text-[#9ca3af] text-center">{emptyText}</div>
          ) : (
            filtered.map((opt, idx) => {
              const v = getValue(opt)
              const isSelected = v === value
              const isHighlighted = idx === highlight
              return (
                <button
                  key={v}
                  data-idx={idx}
                  type="button"
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => choose(opt)}
                  className={`w-full text-left px-3.5 py-2 flex items-center justify-between gap-2 transition-colors ${isHighlighted ? 'bg-[#1f1f1f]' : 'bg-transparent'}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm truncate ${isSelected ? 'font-semibold text-[#4f46e5]' : 'text-[#e5e7eb]'}`}>
                      {getLabel(opt)}
                    </div>
                    {getSubtitle && (
                      <div className="text-[11px] text-[#6b7280] truncate font-mono">{getSubtitle(opt)}</div>
                    )}
                  </div>
                  {isSelected && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
