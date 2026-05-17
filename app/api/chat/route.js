// Chat endpoint backed by Gemini 2.5 Flash via Kie.ai's OpenAI-compatible
// endpoint (with a direct Google Gemini fallback). Uses OpenAI-format function
// calling.
//
// Flow:
//   1. Client sends { history, userMessage } (first call) OR
//      { history, confirmation: { approved, toolCallId, toolName, toolArgs } } (after card)
//   2. Server appends to conversation and starts a tool-use loop:
//        - Send to LLM
//        - If LLM returns text → final assistant message
//        - If LLM returns a destructive tool call → return "confirm" type,
//          loop pauses until client resubmits with a confirmation result
//        - If LLM returns read-only tool calls → execute, append tool messages,
//          continue loop
//   3. Hard cap at 10 loop iterations
//
// History format (OpenAI-style, round-tripped to the client):
//   { role: 'user' | 'assistant' | 'tool', content?, tool_calls?, tool_call_id?, name? }

import { NextResponse } from 'next/server'

const {
  TOOL_DEFINITIONS,
  isDestructive,
  executeReadTool,
  executeDestructiveTool,
  buildActionPreview,
} = require('../../../lib/ai-tools')
const db = require('../../../lib/db')

const KIE_API_KEY = process.env.KIE_AI_KEY || ''
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const MAX_LOOPS = 10

const SYSTEM_INSTRUCTION = `You are an ad-ops assistant for the user's Meta (Facebook/Instagram) Ads accounts.

YOUR ONLY SCOPE: Meta ads — campaigns, ad sets, ads, performance, products, creative, recommendations. If the user asks about anything else (weather, coding, general questions), politely decline and steer them back to ads.

USER CONTEXT:
- Runs e-commerce / dropshipping in Nepal
- Products live on hamrobazar.shop and hamrostore.shop (Shopify)
- Has 7 Meta ad accounts (Naxyatra, Aayush x2, Flytech, Jenisha, Jenu/Shyam, 10 BD)
- Strategic playbook: Sam Piliero's M3 Method, Swim Lanes, Home Runs + Iterations, Profit > ROAS
- All amounts are in USD as returned by Meta API. The user thinks in Rs. (NPR ≈ 133/USD)

HOW TO BEHAVE:
- Be terse. The user is busy and on mobile. Short paragraphs, markdown tables for data.
- Always use tools to answer factual questions. Don't guess campaign data — call get_campaign_insights or list_active_campaigns.
- When the user says "pause X" or "stop X", call pause_campaign. The system will show a confirmation card automatically; you don't need to ask for confirmation in text.
- When you recommend pausing something, explain the reason (e.g. "spent $5 in 2 days, 0 purchases"). Don't pause without good reason.
- For ROAS analysis, remember the user values PROFIT over ROAS — a 1.5x ROAS on a high-margin product can beat 3x on a low-margin one. Ask about margin if it matters.
- When showing money, format like "$12.34" or "Rs.1,640" — don't dump raw numbers.

Today's date: ${new Date().toISOString().slice(0, 10)}.`

// Convert Gemini-style tool definitions to OpenAI format
const OPENAI_TOOLS = TOOL_DEFINITIONS.map((t) => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}))

// ─── LLM transport ────────────────────────────────────────────────────────────
// Tries Kie.ai first (cheap, primary), then direct Gemini as fallback.
async function callLLM(messages) {
  const body = {
    model: 'gemini-2.5-flash',
    messages: [{ role: 'system', content: SYSTEM_INSTRUCTION }, ...messages],
    tools: OPENAI_TOOLS,
    temperature: 0.3,
  }

  // Primary: Kie.ai
  if (KIE_API_KEY) {
    try {
      const res = await fetch('https://api.kie.ai/gemini-2.5-flash/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${KIE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
      })
      const data = await res.json()
      if (data.code && data.code !== 200) throw new Error(`Kie.ai: ${data.msg || data.message || 'error'}`)
      const msg = data.choices?.[0]?.message
      if (msg) return msg
      throw new Error('Kie.ai returned no message')
    } catch (e) {
      console.warn('[chat] Kie.ai failed, trying direct Gemini:', e.message)
    }
  }

  // Fallback: direct Google Gemini (native function calling format)
  if (GEMINI_API_KEY) {
    const native = await callGeminiNative(messages)
    return openaiShapeFromNative(native)
  }

  throw new Error('No LLM provider available (KIE_AI_KEY and GEMINI_API_KEY both missing)')
}

// Convert OpenAI messages to Gemini-native, call, then shim back to OpenAI shape
async function callGeminiNative(messages) {
  const contents = []
  for (const m of messages) {
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.content }] })
    } else if (m.role === 'assistant') {
      const parts = []
      if (m.content) parts.push({ text: m.content })
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          parts.push({
            functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments || '{}') },
          })
        }
      }
      if (parts.length) contents.push({ role: 'model', parts })
    } else if (m.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: m.name, response: tryParseJson(m.content) } }],
      })
    }
  }

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents,
    tools: [{ functionDeclarations: TOOL_DEFINITIONS }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    }
  )
  const data = await res.json()
  if (data.error) throw new Error(`Gemini: ${data.error.message}`)
  return data.candidates?.[0]?.content || null
}

function openaiShapeFromNative(geminiContent) {
  if (!geminiContent) return { role: 'assistant', content: '' }
  const text = (geminiContent.parts || []).filter((p) => p.text).map((p) => p.text).join('\n').trim()
  const fcs = (geminiContent.parts || []).filter((p) => p.functionCall)
  if (fcs.length === 0) return { role: 'assistant', content: text }
  return {
    role: 'assistant',
    content: text || null,
    tool_calls: fcs.map((fc, i) => ({
      id: `call_${Date.now()}_${i}`,
      type: 'function',
      function: { name: fc.functionCall.name, arguments: JSON.stringify(fc.functionCall.args || {}) },
    })),
  }
}

function tryParseJson(s) {
  try { return JSON.parse(s) } catch { return { raw: s } }
}

// ─── Persistence ──────────────────────────────────────────────────────────────
// We auto-generate a title from the first user message. Short and good enough;
// we can swap in an LLM-generated title later if needed.
function deriveTitle(history) {
  const firstUser = (history || []).find((m) => m.role === 'user' && typeof m.content === 'string')
  if (!firstUser) return 'New chat'
  const t = firstUser.content.trim().replace(/\s+/g, ' ')
  return t.length > 60 ? t.slice(0, 57) + '…' : t
}

// Count "visible" messages — user prompts + final assistant texts. Tool calls
// and tool responses are noise for the UI, so the count reflects real turns.
function countVisible(history) {
  return (history || []).filter((m) =>
    (m.role === 'user' && typeof m.content === 'string') ||
    (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim())
  ).length
}

function upsertThread(threadId, history) {
  const title = deriveTitle(history)
  const count = countVisible(history)
  const json = JSON.stringify(history)
  if (threadId) {
    db.prepare(`
      UPDATE chat_threads
      SET history_json = ?, title = ?, message_count = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(json, title, count, threadId)
    return threadId
  }
  const r = db.prepare(`
    INSERT INTO chat_threads (title, history_json, message_count)
    VALUES (?, ?, ?)
  `).run(title, json, count)
  return r.lastInsertRowid
}

// ─── Main loop ────────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const { history = [], userMessage, confirmation, threadId: rawThreadId } = await request.json()
    let threadId = rawThreadId || null
    let conversation = Array.isArray(history) ? [...history] : []

    if (confirmation && confirmation.toolName && confirmation.toolCallId) {
      let toolResult
      if (confirmation.approved) {
        toolResult = await executeDestructiveTool(confirmation.toolName, confirmation.toolArgs || {})
      } else {
        toolResult = { cancelled: true, message: 'User declined to execute this action.' }
      }
      conversation.push({
        role: 'tool',
        tool_call_id: confirmation.toolCallId,
        name: confirmation.toolName,
        content: JSON.stringify(toolResult),
      })
    } else if (userMessage) {
      conversation.push({ role: 'user', content: String(userMessage) })
    } else {
      return NextResponse.json({ error: 'Provide either userMessage or confirmation.' }, { status: 400 })
    }

    for (let i = 0; i < MAX_LOOPS; i++) {
      const assistantMsg = await callLLM(conversation)
      conversation.push(assistantMsg)

      const toolCalls = assistantMsg.tool_calls || []
      if (toolCalls.length === 0) {
        threadId = upsertThread(threadId, conversation)
        return NextResponse.json({
          type: 'message',
          text: assistantMsg.content || '(no response)',
          history: conversation,
          threadId,
        })
      }

      // Any destructive calls in this turn?
      const destructive = toolCalls.find((tc) => isDestructive(tc.function.name))
      if (destructive) {
        const args = tryParseJson(destructive.function.arguments || '{}')
        let preview
        try {
          preview = await buildActionPreview(destructive.function.name, args)
        } catch (e) {
          preview = { ok: false, error: e.message }
        }
        if (!preview.ok) {
          // Couldn't resolve target — feed error back so the model can ask the user
          conversation.push({
            role: 'tool',
            tool_call_id: destructive.id,
            name: destructive.function.name,
            content: JSON.stringify(preview),
          })
          // Also satisfy any other tool calls in same turn so the protocol stays consistent
          for (const tc of toolCalls) {
            if (tc.id === destructive.id) continue
            const result = isDestructive(tc.function.name)
              ? { ok: false, error: 'Skipped due to prior destructive-tool resolution failure.' }
              : await executeReadTool(tc.function.name, tryParseJson(tc.function.arguments || '{}'))
            conversation.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: JSON.stringify(result),
            })
          }
          continue
        }
        threadId = upsertThread(threadId, conversation)
        return NextResponse.json({
          type: 'confirm',
          toolName: destructive.function.name,
          toolArgs: args,
          toolCallId: destructive.id,
          preview,
          history: conversation,
          threadId,
        })
      }

      // All read-only — execute in parallel
      const results = await Promise.all(toolCalls.map(async (tc) => ({
        id: tc.id,
        name: tc.function.name,
        result: await executeReadTool(tc.function.name, tryParseJson(tc.function.arguments || '{}')),
      })))
      for (const r of results) {
        conversation.push({
          role: 'tool',
          tool_call_id: r.id,
          name: r.name,
          content: JSON.stringify(r.result),
        })
      }
    }

    threadId = upsertThread(threadId, conversation)
    return NextResponse.json({
      type: 'message',
      text: '(loop budget exceeded — please retry)',
      history: conversation,
      threadId,
    })
  } catch (err) {
    console.error('[chat] error:', err)
    return NextResponse.json(
      { type: 'error', error: err.message || 'unknown error' },
      { status: 500 }
    )
  }
}
