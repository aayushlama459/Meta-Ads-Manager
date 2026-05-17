'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

// ─── Markdown subset renderer ────────────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return null
  const lines = text.split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*\|.+\|\s*$/.test(line) && lines[i + 1] && /^\s*\|[-:\s|]+\|\s*$/.test(lines[i + 1])) {
      const header = line.trim().slice(1, -1).split('|').map((s) => s.trim())
      const rows = []
      i += 2
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
        rows.push(lines[i].trim().slice(1, -1).split('|').map((s) => s.trim()))
        i++
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      blocks.push({ type: 'list', items })
      continue
    }
    if (line.trim() === '') { blocks.push({ type: 'br' }); i++; continue }
    blocks.push({ type: 'p', text: line }); i++
  }
  return blocks.map((b, idx) => {
    if (b.type === 'br') return <div key={idx} className="h-2" />
    if (b.type === 'table') {
      return (
        <div key={idx} className="my-4 overflow-x-auto rounded-xl border border-[#2a2a2a] bg-[#111111]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                {b.header.map((h, hi) => (
                  <th key={hi} className="text-left py-3 px-4 text-[#9ca3af] font-medium tracking-wide text-xs uppercase">{renderInline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, ri) => (
                <tr key={ri} className="border-b border-[#1a1a1a] last:border-0 hover:bg-white/[0.02] transition-colors">
                  {row.map((cell, ci) => <td key={ci} className="py-3 px-4 text-[#e5e7eb]">{renderInline(cell)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    if (b.type === 'list') {
      return (
        <ul key={idx} className="list-disc pl-5 space-y-1.5 my-3 text-[#e5e7eb]">
          {b.items.map((it, ii) => <li key={ii}>{renderInline(it)}</li>)}
        </ul>
      )
    }
    return <p key={idx} className="leading-relaxed mb-3 last:mb-0 text-[#e5e7eb]">{renderInline(b.text)}</p>
  })
}

function renderInline(text) {
  const parts = []
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g
  let last = 0, m, key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={key++}>{text.slice(last, m.index)}</span>)
    const t = m[0]
    if (t.startsWith('`')) parts.push(<code key={key++} className="bg-[#1f2937] text-indigo-300 px-1.5 py-0.5 rounded text-[0.85em] font-mono">{t.slice(1, -1)}</code>)
    else if (t.startsWith('**')) parts.push(<strong key={key++} className="font-semibold text-white">{t.slice(2, -2)}</strong>)
    else if (t.startsWith('*')) parts.push(<em key={key++} className="text-gray-300 italic">{t.slice(1, -1)}</em>)
    else if (t.startsWith('[')) {
      const lm = t.match(/\[([^\]]+)\]\(([^)]+)\)/)
      parts.push(<a key={key++} href={lm[2]} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 hover:underline">{lm[1]}</a>)
    }
    last = m.index + t.length
  }
  if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>)
  return parts.length ? parts : text
}

// ─── Display rebuilder ───────────────────────────────────────────────────────
function rebuildDisplay(history) {
  const out = []
  for (const m of history || []) {
    if (m.role === 'user' && typeof m.content === 'string') {
      out.push({ kind: 'user', text: m.content })
    } else if (m.role === 'assistant') {
      if (m.content && m.content.trim()) out.push({ kind: 'assistant', text: m.content })
    }
  }
  return out
}

// ─── Voice helpers ───────────────────────────────────────────────────────────
function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function stripMarkdownForSpeech(text) {
  if (!text) return ''
  return text
    .replace(/```[\s\S]*?```/g, ' (code block) ')
    .replace(/^\s*\|.*\|\s*$/gm, '') 
    .replace(/^\s*[-*:|]+[-*:|\s]*$/gm, '') 
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function pickVoice(langPrefix) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  return voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix.toLowerCase())) || null
}

// ─── Time formatter ──────────────────────────────────────────────────────────
function relativeTime(sqliteTs) {
  if (!sqliteTs) return ''
  const utc = sqliteTs.replace(' ', 'T') + 'Z'
  const d = new Date(utc)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return d.toLocaleDateString()
}

const SUGGESTIONS = [
  "How are my ads doing today?",
  "Show me all my active campaigns",
  "Which campaign has the worst ROAS this week?",
  "What product is the Lipoma Cream campaign selling?",
  "Pause the Lipoma Cream $50 campaign",
]

const Icons = {
  User: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>,
  AI: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09l2.846.813-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" /></svg>,
  Send: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" /></svg>,
}

export default function ChatPage() {
  const [display, setDisplay] = useState([])
  const [history, setHistory] = useState([])
  const [threadId, setThreadId] = useState(null)
  const [threads, setThreads] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)

  // Voice input state
  const [listening, setListening] = useState(false)
  const [voiceLang, setVoiceLang] = useState('en-US') // 'en-US' | 'ne-NP'
  const [voiceSupported, setVoiceSupported] = useState(true)
  const recognitionRef = useRef(null)
  const inputRef = useRef(input)
  
  useEffect(() => { inputRef.current = input }, [input])

  // TTS state
  const [speakingIdx, setSpeakingIdx] = useState(null)
  const [ttsSupported, setTtsSupported] = useState(true)

  useEffect(() => {
    const Ctor = getSpeechRecognitionCtor()
    setVoiceSupported(!!Ctor)
    if (typeof window !== 'undefined') {
      setTtsSupported(!!window.speechSynthesis)
      if (window.speechSynthesis) window.speechSynthesis.getVoices()
    }
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch (_) {}
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  // Adjust textarea height
  const handleInput = (e) => {
    setInput(e.target.value)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'inherit'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 250)}px`
    }
  }

  // Reset textarea height when input clears
  useEffect(() => {
    if (!input && textareaRef.current) {
      textareaRef.current.style.height = 'inherit'
    }
  }, [input])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  function startListening() {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (_) {}
    }
    const r = new Ctor()
    r.lang = voiceLang
    r.continuous = false
    r.interimResults = true
    r.maxAlternatives = 1

    const baseText = inputRef.current ? inputRef.current.trim() + ' ' : ''
    let finalChunk = ''

    r.onresult = (evt) => {
      let interim = ''
      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        const res = evt.results[i]
        if (res.isFinal) finalChunk += res[0].transcript
        else interim += res[0].transcript
      }
      setInput(baseText + finalChunk + interim)
      // trigger height resize
      if (textareaRef.current) {
        textareaRef.current.style.height = 'inherit'
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 250)}px`
      }
    }
    r.onerror = (evt) => {
      console.warn('[voice] error:', evt.error)
      setListening(false)
    }
    r.onend = () => {
      setListening(false)
      if (finalChunk) {
        setInput((baseText + finalChunk).trim())
        if (textareaRef.current) {
          textareaRef.current.style.height = 'inherit'
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 250)}px`
        }
      }
    }
    recognitionRef.current = r
    setListening(true)
    try { r.start() } catch (e) {
      console.warn('[voice] start failed:', e.message)
      setListening(false)
    }
  }

  function stopListening() {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (_) {}
    }
    setListening(false)
  }

  function speakMessage(idx, text) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (speakingIdx === idx) {
      window.speechSynthesis.cancel()
      setSpeakingIdx(null)
      return
    }
    window.speechSynthesis.cancel()
    const cleaned = stripMarkdownForSpeech(text)
    if (!cleaned) return
    const utter = new SpeechSynthesisUtterance(cleaned)
    const langPrefix = voiceLang.startsWith('ne') ? 'ne' : 'en'
    const v = pickVoice(langPrefix)
    if (v) utter.voice = v
    utter.lang = v?.lang || (langPrefix === 'ne' ? 'ne-NP' : 'en-US')
    utter.rate = 1.0
    utter.pitch = 1.0
    utter.onend = () => setSpeakingIdx((cur) => (cur === idx ? null : cur))
    utter.onerror = () => setSpeakingIdx((cur) => (cur === idx ? null : cur))
    setSpeakingIdx(idx)
    window.speechSynthesis.speak(utter)
  }

  const loadThreadList = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/threads')
      const data = await res.json()
      if (data.threads) setThreads(data.threads)
    } catch (_) {}
  }, [])
  
  useEffect(() => { loadThreadList() }, [loadThreadList])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [display, loading, pendingConfirm])

  async function send(text) {
    if (!text.trim() || loading) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'inherit'
    setDisplay((d) => [...d, { kind: 'user', text }])
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, userMessage: text, threadId }),
      })
      const data = await res.json()
      handleApiResponse(data)
    } catch (e) {
      setDisplay((d) => [...d, { kind: 'assistant', text: `Error: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  async function respondToConfirmation(approved) {
    if (!pendingConfirm) return
    const { toolName, toolArgs, toolCallId, preview } = pendingConfirm
    setPendingConfirm(null)
    setDisplay((d) => [...d, {
      kind: 'tool-info',
      text: approved
        ? `${toolName === 'pause_campaign' ? 'Pausing' : 'Resuming'} "${preview.campaign.name}"…`
        : `Cancelled.`,
    }])
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, threadId, confirmation: { approved, toolName, toolArgs, toolCallId } }),
      })
      const data = await res.json()
      handleApiResponse(data)
    } catch (e) {
      setDisplay((d) => [...d, { kind: 'assistant', text: `Error: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  function handleApiResponse(data) {
    if (data.type === 'error') {
      setDisplay((d) => [...d, { kind: 'assistant', text: `Error: ${data.error}` }])
      return
    }
    if (data.history) setHistory(data.history)
    if (data.threadId) {
      setThreadId(data.threadId)
      loadThreadList()
    }
    if (data.type === 'message') {
      setDisplay((d) => [...d, { kind: 'assistant', text: data.text }])
    } else if (data.type === 'confirm') {
      setPendingConfirm({
        toolName: data.toolName,
        toolArgs: data.toolArgs,
        toolCallId: data.toolCallId,
        preview: data.preview,
      })
      setDisplay((d) => [...d, { kind: 'confirm', toolName: data.toolName, preview: data.preview }])
    }
  }

  function newChat() {
    setDisplay([])
    setHistory([])
    setThreadId(null)
    setPendingConfirm(null)
    setHistoryOpen(false)
  }

  async function loadThread(id) {
    setHistoryOpen(false)
    if (id === threadId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/chat/threads/${id}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setThreadId(data.id)
      setHistory(data.history || [])
      setDisplay(rebuildDisplay(data.history))
      setPendingConfirm(null)
    } catch (e) {
      setDisplay([{ kind: 'assistant', text: `Couldn't load thread: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  async function deleteThread(id, e) {
    e.stopPropagation()
    if (!confirm('Delete this chat?')) return
    try {
      await fetch(`/api/chat/threads/${id}`, { method: 'DELETE' })
      if (id === threadId) newChat()
      loadThreadList()
    } catch (_) {}
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] bg-[#0a0a0a]">
      {/* History sidebar — desktop */}
      <HistoryPanel
        className="hidden lg:flex"
        threads={threads}
        currentId={threadId}
        onSelect={loadThread}
        onDelete={deleteThread}
        onNew={newChat}
      />

      {/* Mobile drawer */}
      {historyOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-md" onClick={() => setHistoryOpen(false)}>
          <div className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-[#0a0a0a] border-r border-[#1f1f1f] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <HistoryPanel
              className="flex w-full h-full !border-0 !rounded-none"
              threads={threads}
              currentId={threadId}
              onSelect={loadThread}
              onDelete={deleteThread}
              onNew={newChat}
            />
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 md:px-8 md:py-6 border-b border-[#1f1f1f] bg-[#0a0a0a]/90 backdrop-blur-xl z-20 absolute top-0 w-full">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setHistoryOpen(true)}
              className="lg:hidden text-[#9ca3af] hover:text-white p-2 -ml-2 rounded-lg hover:bg-white/5 transition-colors"
              aria-label="Open history"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <div className="min-w-0 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                <Icons.AI />
              </div>
              <div>
                <h1 className="text-white text-lg md:text-xl font-bold flex items-center gap-2 truncate tracking-tight">
                  Ad Chat
                  <span className="text-[9px] uppercase tracking-widest bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-bold flex-shrink-0">Gemini 2.5</span>
                </h1>
              </div>
            </div>
          </div>
          {display.length > 0 && (
            <button onClick={newChat} className="text-[#9ca3af] hover:text-white hover:bg-white/5 text-sm transition-colors flex-shrink-0 px-3 py-1.5 rounded-lg border border-[#2a2a2a]">
              New Chat
            </button>
          )}
        </div>

        {/* Scrollable Thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto pt-24 pb-32 px-4 md:px-8 scroll-smooth">
          <div className="max-w-3xl mx-auto space-y-6 md:space-y-8">
            
            {display.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center min-h-[50vh] mt-10">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 mx-auto bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/30 rounded-2xl flex items-center justify-center mb-5 shadow-inner">
                    <div className="text-indigo-400">
                      <Icons.AI />
                    </div>
                  </div>
                  <h2 className="text-white text-xl md:text-2xl font-bold mb-2 tracking-tight">How can I help you today?</h2>
                  <p className="text-[#9ca3af] text-sm max-w-sm mx-auto leading-relaxed">Ask questions about your ads, request performance reports, or pause/resume campaigns using natural language.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="text-left text-sm text-[#d1d5db] bg-[#111111] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#4a4a4a] rounded-xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {display.map((m, idx) => {
              if (m.kind === 'user') {
                return (
                  <div key={idx} className="flex justify-end gap-4 w-full group/msg">
                    <div className="bg-[#2a2a2a] text-white rounded-3xl rounded-tr-sm px-5 py-3.5 max-w-[85%] text-sm shadow-sm border border-[#333]">
                      <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-[#333] flex items-center justify-center text-[#9ca3af] flex-shrink-0 mt-1 border border-[#444]">
                      <Icons.User />
                    </div>
                  </div>
                )
              }
              if (m.kind === 'tool-info') {
                return (
                  <div key={idx} className="flex justify-center my-2">
                    <span className="text-[11px] font-medium text-[#9ca3af] bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-1.5 rounded-full shadow-inner">{m.text}</span>
                  </div>
                )
              }
              if (m.kind === 'confirm') {
                return (
                  <div key={idx} className="flex justify-start gap-4 w-full">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white flex-shrink-0 mt-1 shadow-lg shadow-amber-500/20">
                      <Icons.AI />
                    </div>
                    <ConfirmCard toolName={m.toolName} preview={m.preview} />
                  </div>
                )
              }
              return (
                <div key={idx} className="flex justify-start gap-4 w-full group/msg">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white flex-shrink-0 mt-1 shadow-lg shadow-indigo-500/20">
                    <Icons.AI />
                  </div>
                  <div className="text-[#e5e7eb] rounded-3xl rounded-tl-sm px-5 py-3.5 max-w-[85%] text-sm bg-transparent relative">
                    {renderMarkdown(m.text)}
                    {ttsSupported && (
                      <button
                        onClick={() => speakMessage(idx, m.text)}
                        className={`absolute -top-3 -right-3 p-2 rounded-full border shadow-sm ${speakingIdx === idx ? 'bg-indigo-600 border-indigo-500 text-white shadow-indigo-500/30' : 'bg-[#1a1a1a] border-[#2a2a2a] text-[#9ca3af] opacity-0 group-hover/msg:opacity-100'} hover:text-white hover:bg-[#2a2a2a] transition-all`}
                        title={speakingIdx === idx ? 'Stop' : 'Read aloud'}
                        aria-label={speakingIdx === idx ? 'Stop reading' : 'Read message aloud'}
                      >
                        {speakingIdx === idx ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {loading && (
              <div className="flex justify-start gap-4 w-full">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white flex-shrink-0 mt-1 shadow-lg shadow-indigo-500/20">
                  <Icons.AI />
                </div>
                <div className="bg-transparent px-4 py-4 max-w-[85%]">
                  <div className="flex gap-1.5 items-center h-full">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            
            {/* Invisible div to push scrolling past the sticky input area */}
            <div className="h-6"></div>
          </div>
        </div>

        {/* Sticky Input Area */}
        <div className="absolute bottom-0 left-0 right-0 z-30 pt-10 pb-4 px-4 md:px-8 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent pointer-events-none">
          <div className="max-w-3xl mx-auto pointer-events-auto">
            {/* Confirm bar */}
            {pendingConfirm && (
              <div className="mb-3 flex flex-col sm:flex-row gap-3 items-center bg-[#111111]/90 backdrop-blur-xl border border-amber-500/40 shadow-xl shadow-amber-900/10 rounded-2xl p-4">
                <span className="text-amber-400 text-sm flex-1 font-medium truncate w-full text-center sm:text-left">
                  Confirm: {pendingConfirm.toolName === 'pause_campaign' ? 'Pause' : 'Resume'} "{pendingConfirm.preview.campaign.name}"?
                </span>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button onClick={() => respondToConfirmation(false)} className="flex-1 sm:flex-none text-sm px-4 py-2 rounded-xl bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[#e5e7eb] border border-[#2a2a2a] transition-colors">Cancel</button>
                  <button onClick={() => respondToConfirmation(true)} className="flex-1 sm:flex-none text-sm px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold transition-colors">Confirm</button>
                </div>
              </div>
            )}

            {/* Input Form */}
            <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="relative bg-[#1a1a1a]/90 backdrop-blur-xl border border-[#2a2a2a] hover:border-[#3a3a3a] focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 rounded-2xl shadow-xl shadow-black/50 transition-all">
              <div className="flex items-end gap-2 p-2">
                {voiceSupported && (
                  <div className="flex flex-col gap-1 pb-1 pl-1">
                    <button
                      type="button"
                      onClick={() => setVoiceLang((l) => l === 'en-US' ? 'ne-NP' : 'en-US')}
                      disabled={listening}
                      className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded text-[#9ca3af] hover:text-white hover:bg-[#2a2a2a] disabled:opacity-40 transition-colors uppercase"
                      title="Toggle voice input language"
                    >
                      {voiceLang === 'en-US' ? 'EN' : 'NE'}
                    </button>
                    <button
                      type="button"
                      onClick={listening ? stopListening : startListening}
                      disabled={loading || !!pendingConfirm}
                      className={`p-2 rounded-xl transition-colors ${listening ? 'bg-red-500/20 text-red-400' : 'text-[#9ca3af] hover:text-white hover:bg-[#2a2a2a]'} disabled:opacity-40`}
                      title={listening ? 'Stop listening' : `Voice input (${voiceLang === 'en-US' ? 'English' : 'Nepali'})`}
                    >
                      {listening ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="animate-pulse">
                          <rect x="6" y="6" width="12" height="12" rx="2"/>
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                          <line x1="12" y1="19" x2="12" y2="23"/>
                          <line x1="8" y1="23" x2="16" y2="23"/>
                        </svg>
                      )}
                    </button>
                  </div>
                )}
                
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    listening ? `Listening in ${voiceLang === 'en-US' ? 'English' : 'Nepali'}…` :
                    pendingConfirm ? 'Confirm or cancel the action above first…' :
                    'Message Ad Chat...'
                  }
                  disabled={loading || !!pendingConfirm}
                  rows={1}
                  className="flex-1 max-h-[250px] min-h-[44px] bg-transparent outline-none py-3 px-2 text-[15px] text-white placeholder-[#6b7280] disabled:opacity-60 resize-none overflow-y-auto leading-relaxed"
                  style={{ height: 'inherit' }}
                />

                <div className="pb-1.5 pr-1.5">
                  <button 
                    type="submit" 
                    disabled={loading || !!pendingConfirm || !input.trim()} 
                    className="bg-indigo-500 hover:bg-indigo-400 disabled:bg-[#2a2a2a] disabled:text-[#6b7280] disabled:cursor-not-allowed text-white p-2.5 rounded-xl transition-all shadow-sm"
                  >
                    <Icons.Send />
                  </button>
                </div>
              </div>
            </form>
            <div className="text-center mt-2">
              <span className="text-[10px] text-[#6b7280]">Ad Chat can make mistakes. Verify important campaign changes.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── History panel ───────────────────────────────────────────────────────────
function HistoryPanel({ className = '', threads, currentId, onSelect, onDelete, onNew }) {
  return (
    <aside className={`${className} flex-col w-64 md:w-[280px] flex-shrink-0 bg-[#0a0a0a] border-r border-[#1f1f1f] overflow-hidden`}>
      <div className="px-4 py-5 border-b border-[#1f1f1f] flex items-center justify-between sticky top-0 bg-[#0a0a0a] z-10">
        <span className="text-white font-bold text-sm tracking-wide">Chat History</span>
        <button onClick={onNew} className="text-[#9ca3af] hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5" title="New Chat">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
        {(!threads || threads.length === 0) && (
          <p className="text-[#6b7280] text-xs px-3 py-4 text-center mt-4">No past chats yet. Start one and it'll be saved here.</p>
        )}
        {threads?.map((t) => {
          const active = t.id === currentId
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={`w-full text-left px-3 py-3 rounded-xl group flex flex-col gap-1 transition-all ${active ? 'bg-[#1a1a1a] shadow-sm' : 'hover:bg-[#111111]'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`text-sm font-medium line-clamp-2 leading-snug ${active ? 'text-white' : 'text-[#d1d5db] group-hover:text-white'}`}>{t.title}</span>
                <button
                  onClick={(e) => onDelete(t.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-[#6b7280] hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded-md flex-shrink-0 transition-all -mt-1 -mr-1"
                  aria-label="Delete"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6"/>
                    <path d="M14 11v6"/>
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[#6b7280] font-medium">
                <span>{relativeTime(t.updated_at)}</span>
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function ConfirmCard({ toolName, preview }) {
  const verb = toolName === 'pause_campaign' ? 'Pause' : 'Resume'
  const c = preview.campaign
  return (
    <div className="w-full max-w-[90%] bg-gradient-to-br from-[#1a1a1a] to-[#111111] border border-[#2a2a2a] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span className="text-amber-400 font-bold text-sm tracking-wide uppercase">{verb} campaign?</span>
      </div>
      <div className="text-white text-base font-medium mb-4 break-words leading-snug">{c.name}</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 text-xs bg-[#0a0a0a] rounded-xl p-3 border border-[#1f1f1f]">
        <Field label="Account" value={c.account} />
        <Field label="Status" value={c.status} />
        <Field label="Objective" value={c.objective?.replace('OUTCOME_', '') || '—'} />
        {c.dailyBudgetUsd != null && <Field label="Daily budget" value={`$${c.dailyBudgetUsd}`} />}
        {c.spendTodayUsd != null && <Field label="Spend today" value={`$${c.spendTodayUsd}`} />}
        {c.purchasesToday != null && <Field label="Purchases today" value={String(c.purchasesToday)} />}
      </div>
      <div className="text-[11px] text-[#9ca3af] mt-4 font-medium italic">Use the confirmation bar below to proceed.</div>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[#6b7280] text-[9px] uppercase tracking-wider font-bold mb-0.5">{label}</div>
      <div className="text-[#e5e7eb] font-medium">{value || '—'}</div>
    </div>
  )
}
