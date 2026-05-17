'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ToastProvider, useToast } from '@/components/Toast'

// Premium SVGs
const Icons = {
  Pause: () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" /></svg>,
  TrendUp: () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>,
  TrendDown: () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.51m-3.182 5.51l-5.511-3.181" /></svg>,
  Bell: () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>,
  Shield: () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>,
  Play: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653z" /></svg>,
  Pencil: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.89 1.113l-3.41.91.91-3.41a4.5 4.5 0 011.113-1.89l13.41-13.41z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L16.875 4.5" /></svg>,
  Trash: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>,
  CheckCircle: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Exclamation: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
  Plus: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>,
  ChevronDown: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>,
  X: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>,
  Sparkles: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09l2.846.813-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg>,
  Cog: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Flask: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>
}

// Rules engine UI: list automation rules, create new ones, see execution history.
export default function RulesPageWrapper() {
  return (
    <ToastProvider>
      <RulesPage />
    </ToastProvider>
  )
}

function RulesPage() {
  const toast = useToast()
  const [rules, setRules] = useState([])
  const [executions, setExecutions] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [dryRunReport, setDryRunReport] = useState(null)
  const [showRecommended, setShowRecommended] = useState(true)
  const [busy, setBusy] = useState({})

  const load = async () => {
    try {
      const [rRes, eRes, cRes] = await Promise.all([
        fetch('/api/launcher/rules', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/launcher/rules/executions?limit=30', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/launcher/rules/recommendations', { cache: 'no-store' }).then(r => r.json()),
      ])
      if (rRes.success) setRules(rRes.data)
      if (eRes.success) setExecutions(eRes.data)
      if (cRes.success) setCatalog(cRes.data)
    } catch (_) {}
    setLoading(false)
  }

  const runDryRun = async () => {
    setDryRunReport({ running: true })
    try {
      const res = await fetch('/api/launcher/rules/dry-run', { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setDryRunReport({ report: data.report, ranAt: data.ranAt })
    } catch (err) {
      setDryRunReport(null)
      toast.error(`Dry run failed: ${err.message}`)
    }
  }

  const installRecommended = async (rec) => {
    setBusy(b => ({ ...b, [`rec-${rec.id}`]: 'adding' }))
    try {
      const res = await fetch('/api/launcher/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rec.preset),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      await load()
      toast.success(`Added rule: ${rec.name}`)
    } catch (err) {
      toast.error(`Could not add: ${err.message}`)
    } finally {
      setBusy(b => ({ ...b, [`rec-${rec.id}`]: null }))
    }
  }

  const installAllRecommended = async () => {
    const toInstall = catalog.filter(r => !r.installed)
    if (toInstall.length === 0) return
    const ok = await toast.confirm(
      `Add all ${toInstall.length} recommended rules at once?\n\nYou can toggle, edit, or delete each one individually after they're added.`,
      { title: 'Install all recommended rules', confirmLabel: `Install ${toInstall.length} rules` }
    )
    if (!ok) return
    setBusy(b => ({ ...b, 'all-recs': 'adding' }))
    try {
      for (const rec of toInstall) {
        await fetch('/api/launcher/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rec.preset),
        })
      }
      await load()
      toast.success(`Added ${toInstall.length} rule${toInstall.length === 1 ? '' : 's'}`)
    } catch (err) {
      toast.error(`Couldn't install all rules: ${err.message}`)
    } finally {
      setBusy(b => ({ ...b, 'all-recs': null }))
    }
  }

  useEffect(() => { load() }, [])

  const toggleEnabled = async (rule) => {
    setBusy(b => ({ ...b, [rule.id]: 'toggling' }))
    const nextState = !rule.enabled
    
    // Optimistic update
    setRules(rules.map(r => r.id === rule.id ? { ...r, enabled: nextState } : r))
    
    try {
      await fetch(`/api/launcher/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      })
    } catch {
      // Revert on fail
      setRules(rules.map(r => r.id === rule.id ? { ...r, enabled: !nextState } : r))
    } finally {
      setBusy(b => ({ ...b, [rule.id]: null }))
    }
  }

  const runNow = async (rule) => {
    const ok = await toast.confirm(
      `Run "${rule.name}" right now against all matching campaigns?\n\nIf any campaign meets the condition, the action will execute (or an approval will be sent for rules that require it).`,
      { title: 'Run rule now', confirmLabel: 'Run' }
    )
    if (!ok) return
    setBusy(b => ({ ...b, [rule.id]: 'running' }))
    try {
      const res = await fetch(`/api/launcher/rules/${rule.id}/run`, { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      const triggered = data.results.filter(r => r.status === 'success' || r.status === 'pending_approval').length
      const evaluated = data.results.length
      if (triggered > 0) {
        toast.success(`Evaluated ${evaluated} campaign${evaluated === 1 ? '' : 's'} · ${triggered} triggered`)
      } else {
        toast.info(`Evaluated ${evaluated} campaign${evaluated === 1 ? '' : 's'} · no triggers`)
      }
      await load()
    } catch (err) {
      toast.error(`Run failed: ${err.message}`)
    } finally {
      setBusy(b => ({ ...b, [rule.id]: null }))
    }
  }

  const deleteRule = async (rule) => {
    const ok = await toast.confirm(
      `Delete rule "${rule.name}"?\n\nThis won't undo any past actions the rule already took.`,
      { title: 'Delete rule', confirmLabel: 'Delete', tone: 'danger' }
    )
    if (!ok) return
    setBusy(b => ({ ...b, [rule.id]: 'deleting' }))
    try {
      await fetch(`/api/launcher/rules/${rule.id}`, { method: 'DELETE' })
      await load()
      toast.success(`Deleted "${rule.name}"`)
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`)
    } finally {
      setBusy(b => ({ ...b, [rule.id]: null }))
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="bg-[#0a0a0a] border-b border-[#1f1f1f] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#4f46e5] to-[#818cf8] flex items-center justify-center text-white shadow-lg shadow-[#4f46e5]/20">
              <Icons.Cog />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Automation Rules</h1>
              <p className="text-xs text-[#9ca3af] mt-0.5">Auto-pause losers, auto-scale winners. Evaluated hourly.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/launcher" className="text-xs text-[#9ca3af] hover:text-white px-3 py-2 rounded-lg border border-[#1f1f1f] hover:border-[#333] transition-colors">
              ← Campaigns
            </Link>
            <button
              type="button"
              onClick={runDryRun}
              disabled={dryRunReport?.running}
              className="text-xs text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 px-3 py-2 rounded-lg border border-amber-500/30 hover:border-amber-500/50 disabled:opacity-50 transition-all flex items-center gap-1.5"
              title="Simulate all rules right now — see what each one sees, no changes made"
            >
              <Icons.Flask />
              {dryRunReport?.running ? 'Testing…' : 'Test all rules'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="bg-[#4f46e5] hover:bg-[#4338ca] text-white px-4 py-2 rounded-lg font-medium text-sm shadow-[0_0_15px_rgba(79,70,229,0.3)] transition-all flex items-center gap-1.5"
            >
              <Icons.Plus /> New Rule
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* Recommended Rules */}
        {catalog.length > 0 && (
          <RecommendedRulesSection
            catalog={catalog}
            collapsed={!showRecommended}
            onToggleCollapsed={() => setShowRecommended(s => !s)}
            onInstall={installRecommended}
            onInstallAll={installAllRecommended}
            busy={busy}
          />
        )}

        {/* Your Rules */}
        <section>
          {!loading && rules.length > 0 && (
            <h2 className="text-sm font-semibold text-[#e5e7eb] mb-3">Your Rules</h2>
          )}
          {loading ? (
            <p className="text-sm text-[#9ca3af] py-10 text-center">Loading…</p>
          ) : rules.length === 0 ? (
            <EmptyState onCreate={() => setShowCreate(true)} />
          ) : (
            <div className="space-y-3">
              {rules.map(r => (
                <RuleRow
                  key={r.id}
                  rule={r}
                  busy={busy[r.id]}
                  onToggle={() => toggleEnabled(r)}
                  onRun={() => runNow(r)}
                  onEdit={() => setEditingRule(r)}
                  onDelete={() => deleteRule(r)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Recent executions */}
        {executions.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-[#e5e7eb] mb-3">Recent Activity</h2>
            <div className="space-y-2">
              {executions.map(e => <ExecutionRow key={e.id} exec={e} />)}
            </div>
          </section>
        )}
      </div>

      {(showCreate || editingRule) && (
        <RuleModal
          editing={editingRule}
          onClose={() => { setShowCreate(false); setEditingRule(null) }}
          onSaved={async () => { setShowCreate(false); setEditingRule(null); await load() }}
        />
      )}

      {dryRunReport && !dryRunReport.running && (
        <DryRunReportModal
          report={dryRunReport.report}
          ranAt={dryRunReport.ranAt}
          onClose={() => setDryRunReport(null)}
        />
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function RecommendedRulesSection({ catalog, collapsed, onToggleCollapsed, onInstall, onInstallAll, busy }) {
  const remaining = catalog.filter(r => !r.installed).length
  const total = catalog.length

  const byCategory = catalog.reduce((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r)
    return acc
  }, {})

  return (
    <section className="bg-gradient-to-br from-[#4f46e5]/10 to-[#111111] border border-[#4f46e5]/20 rounded-xl overflow-hidden transition-all hover:border-[#4f46e5]/30 hover:shadow-[0_0_20px_rgba(79,70,229,0.05)]">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-white/[0.02] transition-colors group"
      >
        <div className="text-left">
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            <Icons.Sparkles /> Recommended Rules
            <span className="text-[10px] text-indigo-300 bg-indigo-900/40 border border-indigo-500/30 px-2 py-0.5 rounded font-medium">
              Sam Piliero playbook
            </span>
          </p>
          <p className="text-xs text-[#9ca3af] mt-0.5">
            {remaining > 0
              ? `${remaining} of ${total} not yet installed — one click each.`
              : 'All recommended rules installed.'}
          </p>
        </div>
        <span className={`text-[#9ca3af] transition-transform duration-200 group-hover:text-white ${collapsed ? '' : 'rotate-180'}`}>
          <Icons.ChevronDown />
        </span>
      </button>

      <div className={`transition-all duration-300 ease-in-out origin-top ${collapsed ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-[2000px] opacity-100'}`}>
        <div className="px-5 pb-5 space-y-6">
          {remaining > 1 && (
            <button
              type="button"
              onClick={onInstallAll}
              disabled={busy['all-recs'] === 'adding'}
              className="w-full text-sm font-medium text-white bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-50 rounded-lg py-2.5 transition-all flex items-center justify-center gap-2"
            >
              <Icons.Plus /> {busy['all-recs'] === 'adding' ? 'Installing all…' : `Install all ${remaining} remaining`}
            </button>
          )}
          {Object.entries(byCategory).map(([category, items]) => (
            <div key={category}>
              <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-3">{category}</p>
              <div className="space-y-3">
                {items.map(r => (
                  <RecommendedRuleCard
                    key={r.id}
                    rec={r}
                    busy={busy[`rec-${r.id}`]}
                    onAdd={() => onInstall(r)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function RecommendedRuleCard({ rec, busy, onAdd }) {
  const c = rec.preset.condition, a = rec.preset.action
  return (
    <div className={`bg-[#111111] border rounded-xl p-4 transition-all duration-200 ${rec.installed ? 'border-green-500/20 opacity-70' : 'border-[#1f1f1f] hover:border-[#333] hover:shadow-lg hover:shadow-black/50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{rec.name}</p>
          <p className="text-xs text-[#9ca3af] mt-1 leading-relaxed">{rec.description}</p>
          <p className="text-[11px] text-indigo-300/80 mt-2 italic leading-relaxed pl-2 border-l-2 border-indigo-500/30">{rec.rationale}</p>
          
          <div className="flex flex-wrap items-center gap-1.5 mt-3 bg-[#1a1a1a] p-2 rounded-lg border border-[#2a2a2a] w-fit">
            <span className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">IF</span>
            <span className="text-[11px] font-medium text-white">{c.metric.toUpperCase()}</span>
            <span className="text-[11px] font-medium text-white">{c.operator}</span>
            <span className="text-[11px] font-medium text-white">{formatVal(c.metric, c.value)}</span>
            <span className="text-[10px] text-[#6b7280]">({WINDOW_LABEL[c.window]}, min ${(c.min_spend_cents / 100).toFixed(2)})</span>
            <span className="text-[#6b7280] text-[10px] mx-1">→</span>
            {actionBadge(a)}
          </div>
        </div>
        {rec.installed ? (
          <span className="flex-shrink-0 text-[11px] text-green-400 bg-green-500/10 border border-green-500/30 px-2.5 py-1.5 rounded-full font-medium flex items-center gap-1">
            <Icons.CheckCircle /> Installed
          </span>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            disabled={busy === 'adding'}
            className="flex-shrink-0 text-[11px] font-medium text-white bg-[#4f46e5] hover:bg-[#4338ca] disabled:opacity-50 px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1 transition-colors"
          >
            {busy === 'adding' ? '⏳' : <><Icons.Plus /> Add</>}
          </button>
        )}
      </div>
    </div>
  )
}

function RuleRow({ rule, busy, onToggle, onRun, onEdit, onDelete }) {
  const c = rule.condition, a = rule.action
  return (
    <div className={`group bg-[#111111] rounded-xl border p-4 transition-all duration-200 ${rule.enabled ? 'border-[#1f1f1f] hover:border-[#333] hover:shadow-lg hover:shadow-black/50' : 'border-[#1f1f1f] opacity-60 hover:opacity-80'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-sm font-semibold text-white truncate tracking-tight">{rule.name}</p>
            {rule.requires_approval && (
              <span className="text-[10px] flex items-center gap-1 text-amber-300 bg-amber-900/20 border border-amber-500/20 px-1.5 py-0.5 rounded font-medium" title="Approval required">
                <Icons.Shield /> Approval required
              </span>
            )}
            {rule.trigger_count > 0 && (
              <span className="text-[10px] text-[#6b7280] bg-[#1a1a1a] px-1.5 py-0.5 rounded border border-[#333]">fired {rule.trigger_count}×</span>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5 mb-2 bg-[#1a1a1a] p-2 rounded-lg border border-[#2a2a2a] w-fit">
            <span className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">IF</span>
            <span className="text-[11px] font-medium text-white">{c.metric.toUpperCase()}</span>
            <span className="text-[11px] font-medium text-white">{c.operator}</span>
            <span className="text-[11px] font-medium text-white">{formatVal(c.metric, c.value)}</span>
            <span className="text-[10px] text-[#6b7280]">({WINDOW_LABEL[c.window]}, min ${(c.min_spend_cents / 100).toFixed(2)})</span>
            <span className="text-[#6b7280] text-[10px] mx-1">→</span>
            {actionBadge(a)}
          </div>
          
          <p className="text-[10px] text-[#6b7280] mt-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#333]"></span>
            Cool-down: {rule.cooldown_hours}h 
            <span className="w-1.5 h-1.5 rounded-full bg-[#333] ml-1"></span>
            Scope: {rule.scope === 'campaign' ? `campaign ${rule.campaign_id}` : rule.ad_account_id ? `account ${rule.ad_account_id}` : 'all campaigns (last 7d)'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ToggleSwitch enabled={rule.enabled} onChange={onToggle} disabled={busy === 'toggling'} />
        </div>
      </div>
      
      {/* Action Bar */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[#1f1f1f] text-xs transition-opacity duration-200">
        <button type="button" onClick={onRun} disabled={busy === 'running'} className="text-[#4f46e5] hover:text-[#818cf8] font-medium flex items-center gap-1 transition-colors">
          <Icons.Play /> {busy === 'running' ? 'Running…' : 'Run now'}
        </button>
        <div className="flex-1"></div>
        <button type="button" onClick={onEdit} className="text-[#9ca3af] hover:text-white flex items-center gap-1 transition-colors">
          <Icons.Pencil /> Edit
        </button>
        <button type="button" onClick={onDelete} disabled={busy === 'deleting'} className="text-[#9ca3af] hover:text-red-400 flex items-center gap-1 transition-colors">
          {busy === 'deleting' ? '⏳' : <><Icons.Trash /> Delete</>}
        </button>
      </div>
    </div>
  )
}

function ToggleSwitch({ enabled, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${enabled ? 'bg-[#4f46e5]' : 'bg-[#333]'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

function actionBadge(a) {
  if (a.type === 'pause') return <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-medium"><Icons.Pause /> Pause</span>
  if (a.type === 'increase_budget') return <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-medium"><Icons.TrendUp /> +{a.percent}% Budget</span>
  if (a.type === 'decrease_budget') return <span className="inline-flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded font-medium"><Icons.TrendDown /> -{a.percent}% Budget</span>
  if (a.type === 'notify') return <span className="inline-flex items-center gap-1 text-[10px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded font-medium"><Icons.Bell /> Notify</span>
  return <span className="text-[10px] text-[#9ca3af]">{a.type}</span>
}

function ExecutionRow({ exec }) {
  const ok = exec.status === 'success'
  return (
    <div className={`bg-[#111111] rounded-lg border ${ok ? 'border-green-500/20' : exec.status === 'failed' ? 'border-red-500/30' : 'border-[#1f1f1f]'} p-3 text-xs transition-colors hover:bg-[#151515]`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-white truncate flex items-center gap-1.5">
          {ok ? <span className="text-green-400"><Icons.CheckCircle /></span> : exec.status === 'failed' ? <span className="text-red-400"><Icons.Exclamation /></span> : <span className="text-[#6b7280]"><Icons.Pause /></span>}
          <span className="font-medium">{exec.rule_name}</span> on {exec.target_campaign_name || exec.target_campaign_id}
        </span>
        <span className="text-[10px] text-[#6b7280] flex-shrink-0">{timeAgo(exec.executed_at)}</span>
      </div>
      <p className="text-[#9ca3af] mt-1.5 pl-5">
        {exec.metric?.toUpperCase()} = {exec.metric_value != null ? formatVal(exec.metric, exec.metric_value) : '?'}
        {' '}· {exec.action_taken}
        {exec.action_detail ? ` (${exec.action_detail})` : ''}
        {exec.error_message ? <span className="text-red-400 ml-1">· {exec.error_message}</span> : ''}
      </p>
    </div>
  )
}

function EmptyState({ onCreate }) {
  return (
    <div className="text-center py-16 bg-gradient-to-b from-[#111111] to-[#0a0a0a] rounded-xl border border-[#1f1f1f]">
      <div className="w-12 h-12 bg-[#1a1a1a] border border-[#333] rounded-xl flex items-center justify-center mx-auto mb-4 text-[#9ca3af] shadow-inner">
        <Icons.Cog />
      </div>
      <p className="text-white font-medium text-lg">No automation rules yet</p>
      <p className="text-sm text-[#9ca3af] mt-2 max-w-md mx-auto leading-relaxed">
        Rules run hourly to pause losers and scale winners automatically.<br />
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-6 bg-[#4f46e5] hover:bg-[#4338ca] text-white px-5 py-2.5 rounded-lg font-medium text-sm shadow-[0_0_15px_rgba(79,70,229,0.2)] transition-all flex items-center gap-2 mx-auto"
      >
        <Icons.Plus /> Create your first rule
      </button>
    </div>
  )
}

function RuleModal({ editing, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!editing
  const [name, setName] = useState(editing?.name || '')
  const [metric, setMetric] = useState(editing?.condition?.metric || 'roas')
  const [operator, setOperator] = useState(editing?.condition?.operator || '<')
  const [value, setValue] = useState(editing ? String(editing.condition.value) : '1.0')
  const [windowPreset, setWindowPreset] = useState(editing?.condition?.window || 'today')
  const [minSpend, setMinSpend] = useState(editing ? String((editing.condition.min_spend_cents || 0) / 100) : '10')
  const [actionType, setActionType] = useState(editing?.action?.type || 'pause')
  const [percent, setPercent] = useState(editing?.action?.percent ? String(editing.action.percent) : '40')
  const [cooldown, setCooldown] = useState(editing ? String(editing.cooldown_hours) : '24')
  const [requiresApproval, setRequiresApproval] = useState(editing ? editing.requires_approval : true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (actionType === 'notify') setRequiresApproval(false)
  }, [actionType])

  const submit = async () => {
    if (!name.trim()) return toast.error('Give the rule a name.')
    setSubmitting(true)
    try {
      const body = {
        name: name.trim(),
        scope: 'all',
        condition: {
          metric, operator, value: parseFloat(value), window: windowPreset,
          min_spend_cents: Math.round(parseFloat(minSpend) * 100),
        },
        action: actionType === 'pause' || actionType === 'notify' ? { type: actionType } : { type: actionType, percent: parseFloat(percent) },
        cooldown_hours: parseInt(cooldown, 10),
        requires_approval: requiresApproval,
      }
      const url = isEdit ? `/api/launcher/rules/${editing.id}` : '/api/launcher/rules'
      const res = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      toast.success(isEdit ? `Updated "${body.name}"` : `Created "${body.name}"`)
      await onSaved()
    } catch (err) {
      toast.error(`Could not save rule: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = "w-full bg-[#0a0a0a] text-white border border-[#333] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4f46e5] focus:border-transparent transition-all shadow-inner"
  
  // Custom Select Wrapper
  const Select = ({ value, onChange, children }) => (
    <div className="relative">
      <select value={value} onChange={onChange} className={`${inputCls} appearance-none pr-8 cursor-pointer`}>
        {children}
      </select>
      <div className="absolute inset-y-0 right-0 flex items-center px-2.5 pointer-events-none text-[#9ca3af]">
        <Icons.ChevronDown />
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      {/* Glassmorphic Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"></div>
      
      <div className="relative bg-[#111111]/95 backdrop-blur-xl border border-white/10 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-2 border-b border-[#1f1f1f]">
          <h2 className="text-white font-bold text-lg tracking-tight">{isEdit ? 'Edit Rule' : 'New Automation Rule'}</h2>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-white transition-colors p-1 bg-white/5 rounded-md hover:bg-white/10">
            <Icons.X />
          </button>
        </div>

        <Field label="Rule name">
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Kill losers after $10" className={inputCls} />
        </Field>

        <div className="bg-gradient-to-b from-[#1a1a1a] to-[#151515] border border-[#2a2a2a] rounded-xl p-4 space-y-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#4f46e5]"></div>
          <p className="text-xs font-bold text-[#4f46e5] uppercase tracking-wider">IF Condition</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Metric">
              <Select value={metric} onChange={e => setMetric(e.target.value)}>
                <option value="roas">ROAS</option>
                <option value="spend">Spend ($)</option>
                <option value="ctr">CTR</option>
                <option value="frequency">Frequency</option>
                <option value="cpa">CPA ($)</option>
                <option value="cpr">CPR ($)</option>
              </Select>
            </Field>
            <Field label="Is">
              <Select value={operator} onChange={e => setOperator(e.target.value)}>
                <option value="<">&lt; Less than</option>
                <option value="<=">≤ Less or eq</option>
                <option value=">">&gt; Greater than</option>
                <option value=">=">≥ Greater or eq</option>
                <option value="==">= Equals</option>
              </Select>
            </Field>
            <Field label="Value">
              <input type="number" step="0.01" value={value} onChange={e => setValue(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Over time window">
              <Select value={windowPreset} onChange={e => setWindowPreset(e.target.value)}>
                <option value="today">Today so far</option>
                <option value="yesterday">Yesterday</option>
                <option value="last_3d">Last 3 days</option>
                <option value="last_7d">Last 7 days</option>
                <option value="last_14d">Last 14 days</option>
              </Select>
            </Field>
            <Field label="Min spend before trigger ($)">
              <input type="number" step="0.01" value={minSpend} onChange={e => setMinSpend(e.target.value)} className={inputCls} />
            </Field>
          </div>
        </div>

        <div className="bg-gradient-to-b from-[#1a1a1a] to-[#151515] border border-[#2a2a2a] rounded-xl p-4 space-y-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
          <p className="text-xs font-bold text-amber-500 uppercase tracking-wider">THEN Action</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Action">
              <Select value={actionType} onChange={e => setActionType(e.target.value)}>
                <option value="pause">Pause campaign</option>
                <option value="increase_budget">Increase budget (%)</option>
                <option value="decrease_budget">Decrease budget (%)</option>
                <option value="notify">Notify only</option>
              </Select>
            </Field>
            {(actionType === 'increase_budget' || actionType === 'decrease_budget') && (
              <Field label="By what %">
                <input type="number" step="1" value={percent} onChange={e => setPercent(e.target.value)} className={inputCls} />
              </Field>
            )}
          </div>
        </div>

        {/* Feature Card for Approval */}
        <div className={`relative rounded-xl border p-4 transition-all ${actionType === 'notify' ? 'opacity-50 border-[#2a2a2a] bg-[#1a1a1a]' : requiresApproval ? 'border-indigo-500/50 bg-indigo-500/5 shadow-[0_0_15px_rgba(79,70,229,0.1)]' : 'border-[#2a2a2a] bg-[#1a1a1a] hover:border-[#3a3a3a] cursor-pointer'}`} onClick={() => { if(actionType !== 'notify') setRequiresApproval(!requiresApproval) }}>
          <div className="flex items-start gap-3">
            <div className="pt-0.5">
              <ToggleSwitch enabled={requiresApproval} onChange={() => {}} disabled={actionType === 'notify'} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                <Icons.Shield /> Require Telegram Approval
              </p>
              <p className="text-xs text-[#9ca3af] mt-1 leading-relaxed">
                {actionType === 'notify'
                  ? 'Notifications don\'t require approval.'
                  : 'You\'ll get a Telegram message with Approve/Reject buttons before the action runs.'}
              </p>
            </div>
          </div>
        </div>

        <Field label="Cool-down (hours) — don't re-trigger within this window">
          <input type="number" step="1" value={cooldown} onChange={e => setCooldown(e.target.value)} className={inputCls} />
        </Field>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 text-[#9ca3af] hover:text-white bg-[#1a1a1a] hover:bg-[#2a2a2a] text-sm font-medium py-3 rounded-xl border border-[#333] transition-colors">Cancel</button>
          <button onClick={submit} disabled={submitting} className="flex-1 bg-[#4f46e5] hover:bg-[#4338ca] shadow-[0_0_15px_rgba(79,70,229,0.3)] disabled:opacity-50 text-white text-sm font-medium py-3 rounded-xl transition-all">
            {submitting ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Rule')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#9ca3af] mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function DryRunReportModal({ report, ranAt, onClose }) {
  const totals = report.reduce((acc, r) => {
    for (const res of (r.results || [])) {
      acc.total += 1
      if (res.status === 'would_trigger') acc.wouldTrigger += 1
      else if (res.status === 'no_trigger') acc.noTrigger += 1
      else if (res.status === 'failed') acc.failed += 1
      else acc.skipped += 1
    }
    return acc
  }, { total: 0, wouldTrigger: 0, noTrigger: 0, skipped: 0, failed: 0 })

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div className="bg-[#111111] border border-amber-500/30 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 border-b border-[#1f1f1f]">
          <div>
            <h2 className="text-white font-bold text-lg flex items-center gap-2 tracking-tight">
              <Icons.Flask /> Dry-Run Report
              <span className="text-[10px] text-amber-300 bg-amber-900/40 border border-amber-500/30 px-2 py-0.5 rounded font-medium">No changes made</span>
            </h2>
            <p className="text-xs text-[#9ca3af] mt-1">
              Ran {ranAt ? new Date(ranAt).toLocaleString() : 'just now'} · Tested {report.length} rules
            </p>
          </div>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-white p-1 bg-white/5 rounded-md hover:bg-white/10 transition-colors">
            <Icons.X />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <SummaryTile label="Would trigger" count={totals.wouldTrigger} tone="indigo" />
          <SummaryTile label="No trigger" count={totals.noTrigger} tone="green" />
          <SummaryTile label="Skipped" count={totals.skipped} tone="gray" />
          <SummaryTile label="Failed" count={totals.failed} tone="red" />
        </div>

        {totals.total === 0 && (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 text-sm text-[#9ca3af] text-center">
            No rule×campaign pairs were checked. Either you have no enabled rules, or no active campaigns.
          </div>
        )}

        {report.map(({ rule, results, error }) => (
          <div key={rule.id} className="bg-[#151515] border border-[#2a2a2a] rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate tracking-tight">{rule.name}</p>
              </div>
              {results.some(r => r.status === 'would_trigger') && (
                <span className="text-[10px] text-indigo-300 bg-[#4f46e5]/15 border border-[#4f46e5]/30 px-2 py-1 rounded-full font-semibold flex-shrink-0">
                  {results.filter(r => r.status === 'would_trigger').length} would trigger
                </span>
              )}
            </div>
            {error && <p className="text-xs text-red-400 p-2 bg-red-500/10 rounded-lg border border-red-500/20">⚠ {error}</p>}
            {!error && results.length === 0 && (
              <p className="text-xs text-[#6b7280] italic">No campaigns in scope.</p>
            )}
            {!error && results.length > 0 && (
              <div className="space-y-2">
                {results.map((r, i) => (
                  <DryRunResultLine key={i} result={r} metric={rule.condition?.metric} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SummaryTile({ label, count, tone }) {
  const cls = {
    indigo: 'text-indigo-300 border-[#4f46e5]/30 bg-[#4f46e5]/10',
    green: 'text-green-400 border-green-500/30 bg-green-500/10',
    gray: 'text-[#9ca3af] border-[#333] bg-[#1a1a1a]',
    red: 'text-red-400 border-red-500/30 bg-red-500/10',
  }[tone]
  return (
    <div className={`border rounded-xl p-3 ${cls} shadow-sm`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-[10px] uppercase tracking-wider font-semibold mt-0.5 opacity-80">{label}</p>
    </div>
  )
}

function DryRunResultLine({ result, metric }) {
  const STATUS = {
    would_trigger: { icon: <Icons.Play />, tone: 'text-indigo-300', label: 'WOULD TRIGGER' },
    no_trigger: { icon: <Icons.CheckCircle />, tone: 'text-[#9ca3af]', label: 'No trigger' },
    skipped_no_data: { icon: <Icons.Pause />, tone: 'text-[#6b7280]', label: 'Skipped: no result data' },
    skipped_below_min_spend: { icon: <Icons.Pause />, tone: 'text-[#6b7280]', label: 'Skipped: below min spend' },
    skipped_already_paused: { icon: <Icons.Pause />, tone: 'text-[#6b7280]', label: 'Skipped: already paused' },
    skipped_cooldown: { icon: <Icons.Pause />, tone: 'text-[#6b7280]', label: 'Skipped: cool-down active' },
    failed: { icon: <Icons.Exclamation />, tone: 'text-red-400', label: 'Failed' },
  }[result.status] || { icon: <Icons.Exclamation />, tone: 'text-[#9ca3af]', label: result.status }

  return (
    <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg px-3 py-2.5 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="text-white truncate font-medium">{result.campaignName || result.campaignId}</span>
        <span className={`${STATUS.tone} flex-shrink-0 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1`}>{STATUS.icon} {STATUS.label}</span>
      </div>
      <div className="text-[10px] text-[#6b7280] mt-1.5 flex items-center gap-2 flex-wrap">
        {result.metricValue != null && (
          <>
            <span className="text-[#9ca3af]">{(metric || result.metric || '').toUpperCase()}: <span className="text-white font-mono">{formatVal(metric || result.metric, result.metricValue)}</span></span>
            {result.threshold != null && <span className="opacity-75">(threshold: {formatVal(metric || result.metric, result.threshold)})</span>}
          </>
        )}
        {result.spend_cents != null && <span className="bg-[#1a1a1a] px-1.5 py-0.5 rounded border border-[#333]">Spend: ${(result.spend_cents / 100).toFixed(2)}</span>}
        {result.proposedAction && <span className="text-indigo-300 font-medium">→ {result.proposedAction}</span>}
        {result.wouldNeedApproval && <span className="text-amber-300 flex items-center gap-0.5"><Icons.Shield /> needs approval</span>}
        {result.error && <span className="text-red-400">{result.error}</span>}
      </div>
    </div>
  )
}

const WINDOW_LABEL = {
  today: 'today', yesterday: 'yesterday', last_3d: 'last 3d', last_7d: 'last 7d', last_14d: 'last 14d',
}

function formatVal(metric, v) {
  if (v == null || isNaN(v)) return '—'
  if (metric === 'roas') return v.toFixed(2)
  if (metric === 'spend' || metric === 'cpa' || metric === 'cpr') return `$${v.toFixed(2)}`
  if (metric === 'ctr' || metric === 'frequency') return v.toFixed(2)
  return String(v)
}

function actionLabel(a) {
  if (a.type === 'pause') return 'pause'
  if (a.type === 'increase_budget') return `+${a.percent}% budget`
  if (a.type === 'decrease_budget') return `-${a.percent}% budget`
  if (a.type === 'notify') return 'notify'
  return a.type
}

function timeAgo(iso) {
  if (!iso) return ''
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}
