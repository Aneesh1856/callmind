import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

// ─── API client ────────────────────────────────────────────────────────────────
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const api = axios.create({ baseURL: API_BASE_URL })

// ─── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '—'
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function formatTime(isoString) {
  if (!isoString) return '—'
  const validIso = isoString.endsWith('Z') ? isoString : isoString + 'Z'
  const d = new Date(validIso)
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function timeAgo(isoString) {
  if (!isoString) return ''
  const validIso = isoString.endsWith('Z') ? isoString : isoString + 'Z'
  const diff = Date.now() - new Date(validIso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Tag style maps ───────────────────────────────────────────────────────────
const TAG_STYLES = {
  'Urgent':    { bg: 'rgba(239,68,68,0.12)',   text: '#f87171', border: 'rgba(239,68,68,0.25)',   dot: '#f87171' },
  'New Lead':  { bg: 'rgba(168,85,247,0.12)',  text: '#c084fc', border: 'rgba(168,85,247,0.25)',  dot: '#c084fc' },
  'Follow-up': { bg: 'rgba(251,146,60,0.12)',  text: '#fb923c', border: 'rgba(251,146,60,0.25)',  dot: '#fb923c' },
  'Personal':  { bg: 'rgba(34,197,94,0.12)',   text: '#4ade80', border: 'rgba(34,197,94,0.25)',   dot: '#4ade80' },
  'Spam':      { bg: 'rgba(100,116,139,0.12)', text: '#94a3b8', border: 'rgba(100,116,139,0.25)', dot: '#94a3b8' },
  'Complaint': { bg: 'rgba(239,68,68,0.12)',   text: '#f87171', border: 'rgba(239,68,68,0.25)',   dot: '#f87171' },
  'Payment':   { bg: 'rgba(234,179,8,0.12)',   text: '#facc15', border: 'rgba(234,179,8,0.25)',   dot: '#facc15' },
  'Info':      { bg: 'rgba(6,182,212,0.12)',   text: '#22d3ee', border: 'rgba(6,182,212,0.25)',   dot: '#22d3ee' },
}

const COLOR_STYLES = {
  red:    TAG_STYLES['Urgent'],
  orange: TAG_STYLES['Follow-up'],
  green:  TAG_STYLES['Personal'],
  blue:   TAG_STYLES['Info'],
  gray:   TAG_STYLES['Spam'],
}

function getTagStyle(primary_tag, tag_color) {
  if (primary_tag && TAG_STYLES[primary_tag]) return TAG_STYLES[primary_tag]
  if (tag_color && COLOR_STYLES[tag_color]) return COLOR_STYLES[tag_color]
  return TAG_STYLES['Spam']
}

const TAG_EMOJIS = {
  'Urgent': '🚨', 'New Lead': '🤝', 'Follow-up': '💬',
  'Personal': '🏡', 'Spam': '🚫', 'Complaint': '⚠️',
  'Payment': '💳', 'Info': 'ℹ️',
}

const URGENCY_CONFIG = {
  CRITICAL: { color: '#f87171', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)' },
  HIGH:     { color: '#fb923c', bg: 'rgba(251,146,60,0.12)', border: 'rgba(251,146,60,0.25)' },
  MEDIUM:   { color: '#facc15', bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.25)' },
  LOW:      { color: '#64748b', bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.20)' },
}

const SENTIMENT_MAP = {
  positive:   { icon: '😊', color: '#4ade80' },
  neutral:    { icon: '😐', color: '#94a3b8' },
  frustrated: { icon: '😤', color: '#fb923c' },
  angry:      { icon: '😠', color: '#f87171' },
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const PhoneIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 014.69 9.37a19.79 19.79 0 01-3.07-8.67A2 2 0 013.6 2.52h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.91 9.1a16 16 0 006 6l.93-.93a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.5z"/>
  </svg>
)

const MicIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
    <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
  </svg>
)

const ShieldIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
)

const AlertIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)

const ClockIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
  </svg>
)

const BrainIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 017 4.5v0A2.5 2.5 0 014.5 7v0A2.5 2.5 0 012 9.5v0c0 1.38 1.12 2.5 2.5 2.5v0A2.5 2.5 0 017 14.5v0A2.5 2.5 0 019.5 17v0A2.5 2.5 0 0012 19.5v0A2.5 2.5 0 0014.5 17v0A2.5 2.5 0 0117 14.5v0A2.5 2.5 0 0119.5 12v0A2.5 2.5 0 0022 9.5v0A2.5 2.5 0 0019.5 7v0A2.5 2.5 0 0017 4.5v0A2.5 2.5 0 0014.5 2v0A2.5 2.5 0 0012 4.5v0"/>
  </svg>
)

const ChevronIcon = ({ className = 'w-4 h-4', down = false }) => (
  <svg className={`${className} transition-transform duration-300 ${down ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M6 9l6 6 6-6"/>
  </svg>
)

// ─── Sound Wave ───────────────────────────────────────────────────────────────
function SoundWave() {
  return (
    <div className="flex items-end gap-[3px] h-5">
      <div className="w-[3px] h-2 bg-rose-400 rounded-full animate-wave-1 origin-bottom" />
      <div className="w-[3px] h-4 bg-rose-400 rounded-full animate-wave-2 origin-bottom" />
      <div className="w-[3px] h-2.5 bg-rose-500 rounded-full animate-wave-3 origin-bottom" />
      <div className="w-[3px] h-5 bg-red-500 rounded-full animate-wave-4 origin-bottom" />
      <div className="w-[3px] h-2 bg-rose-400 rounded-full animate-wave-5 origin-bottom" />
      <div className="w-[3px] h-4 bg-rose-400 rounded-full animate-wave-6 origin-bottom" />
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header({ ariaEnabled, toggling, onToggle }) {
  return (
    <header
      style={{
        background: ariaEnabled
          ? 'linear-gradient(180deg, rgba(15,8,8,0.95) 0%, rgba(10,9,18,0.92) 100%)'
          : 'linear-gradient(180deg, rgba(10,9,18,0.97) 0%, rgba(7,7,10,0.95) 100%)',
        borderBottom: ariaEnabled
          ? '1px solid rgba(226,62,69,0.18)'
          : '1px solid rgba(255,255,255,0.04)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        boxShadow: ariaEnabled
          ? '0 1px 0 rgba(226,62,69,0.08), 0 4px 30px rgba(0,0,0,0.5)'
          : '0 1px 0 rgba(255,255,255,0.03), 0 4px 30px rgba(0,0,0,0.5)',
      }}
      className="sticky top-0 z-50 transition-all duration-700"
    >
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8 py-3.5">
        <div className="flex items-center justify-between gap-4">

          {/* Logo area */}
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <img
                src="/logo.png"
                alt="CallMinds"
                className="h-12 w-auto object-contain rounded-xl"
                style={{
                  filter: ariaEnabled ? 'drop-shadow(0 0 12px rgba(226,62,69,0.5))' : 'none',
                  transition: 'filter 0.5s ease',
                }}
              />
              {ariaEnabled && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-[#07070A]"
                  style={{ boxShadow: '0 0 8px #4ade80' }}
                />
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-slate-600 leading-none">CallMinds</p>
              <h1 className="text-lg font-black text-white mt-1 leading-none tracking-tight">AI Call Assistant</h1>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-4">
            {/* Demo button */}
            <Link
              to="/demo"
              id="goto-demo-btn"
              className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200"
              style={{
                background: 'rgba(168,85,247,0.1)',
                border: '1px solid rgba(168,85,247,0.3)',
                color: '#c084fc',
                boxShadow: '0 0 12px rgba(168,85,247,0.15)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(168,85,247,0.18)'
                e.currentTarget.style.boxShadow = '0 0 20px rgba(168,85,247,0.3)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(168,85,247,0.1)'
                e.currentTarget.style.boxShadow = '0 0 12px rgba(168,85,247,0.15)'
              }}
            >
              <span>✨</span>
              <span>Try Demo</span>
              <span style={{ opacity: 0.7 }}>→</span>
            </Link>

            {/* Live indicator */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{
                background: ariaEnabled ? 'rgba(34,197,94,0.08)' : 'rgba(100,116,139,0.08)',
                border: ariaEnabled ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(100,116,139,0.15)',
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: ariaEnabled ? '#4ade80' : '#475569',
                  boxShadow: ariaEnabled ? '0 0 8px #4ade80' : 'none',
                  animation: ariaEnabled ? 'pulse 2s ease-in-out infinite' : 'none',
                }}
              />
              <span
                className="text-xs font-bold tracking-wide"
                style={{ color: ariaEnabled ? '#4ade80' : '#64748b' }}
              >
                {ariaEnabled ? 'Active' : 'Inactive'}
              </span>
            </div>

            {/* Toggle */}
            <button
              id="aria-toggle"
              onClick={onToggle}
              disabled={toggling}
              aria-label={ariaEnabled ? 'Disable CallMinds' : 'Enable CallMinds'}
              className="relative w-14 h-7 rounded-full cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none transition-all duration-500"
              style={{
                background: ariaEnabled
                  ? 'linear-gradient(135deg, #dc2626, #e23e45)'
                  : 'rgba(30,27,39,0.9)',
                boxShadow: ariaEnabled
                  ? '0 0 20px rgba(226,62,69,0.45), inset 0 1px 0 rgba(255,255,255,0.15)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.4)',
                border: ariaEnabled ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <span
                className="absolute top-0.5 w-6 h-6 rounded-full flex items-center justify-center shadow-md transition-all duration-500"
                style={{
                  transform: ariaEnabled ? 'translateX(28px)' : 'translateX(2px)',
                  background: ariaEnabled ? '#fff' : '#475569',
                  boxShadow: ariaEnabled ? '0 2px 8px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.4)',
                }}
              >
                {toggling ? (
                  <svg className="animate-spin w-3 h-3 text-slate-600" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <span className="text-[8px] font-black" style={{ color: ariaEnabled ? '#dc2626' : '#94a3b8' }}>
                    {ariaEnabled ? 'ON' : 'OFF'}
                  </span>
                )}
              </span>
            </button>
          </div>

        </div>
      </div>
    </header>
  )
}

// ─── Live Status Banner ───────────────────────────────────────────────────────
function LiveStatusBar({ status, error }) {
  const isOnCall = status && status.active_calls > 0
  const ariaEnabled = status?.aria_enabled ?? false
  const totalToday = status?.total_calls_today ?? 0

  return (
    <div
      className="rounded-2xl p-5 transition-all duration-500 glass-panel"
      style={{
        border: isOnCall
          ? '1px solid rgba(34,197,94,0.3)'
          : ariaEnabled
            ? '1px solid rgba(226,62,69,0.18)'
            : '1px solid rgba(255,255,255,0.05)',
        boxShadow: isOnCall
          ? '0 0 30px rgba(34,197,94,0.12), 0 4px 24px rgba(0,0,0,0.4)'
          : ariaEnabled
            ? '0 0 20px rgba(226,62,69,0.08), 0 4px 24px rgba(0,0,0,0.4)'
            : '0 4px 24px rgba(0,0,0,0.35)',
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-4">

        {/* Left */}
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-500"
              style={{
                background: isOnCall
                  ? 'rgba(34,197,94,0.1)'
                  : ariaEnabled
                    ? 'rgba(226,62,69,0.1)'
                    : 'rgba(30,27,39,0.5)',
                border: isOnCall
                  ? '1px solid rgba(34,197,94,0.25)'
                  : ariaEnabled
                    ? '1px solid rgba(226,62,69,0.22)'
                    : '1px solid rgba(255,255,255,0.06)',
                color: isOnCall ? '#4ade80' : ariaEnabled ? '#f87171' : '#475569',
              }}
            >
              {isOnCall ? <PhoneIcon /> : <MicIcon />}
            </div>
            <span
              className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[#07070A] transition-all duration-500"
              style={{
                background: isOnCall ? '#4ade80' : ariaEnabled ? '#E23E45' : '#334155',
                boxShadow: isOnCall ? '0 0 8px #4ade80' : ariaEnabled ? '0 0 8px #E23E45' : 'none',
                animation: (isOnCall || ariaEnabled) ? 'pulse 2s ease-in-out infinite' : 'none',
              }}
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">Live Status</span>
              {isOnCall && (
                <span className="px-2 py-0.5 text-[9px] font-black text-green-400 uppercase tracking-widest rounded-md"
                  style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', animation: 'pulse 2s ease-in-out infinite' }}>
                  Live
                </span>
              )}
            </div>
            {error ? (
              <p className="text-sm font-bold text-red-400 mt-1">Could not reach CallMinds server</p>
            ) : isOnCall ? (
              <p className="text-sm font-bold text-green-400 mt-1">Handling a live call now</p>
            ) : ariaEnabled ? (
              <div className="flex items-center gap-2.5 mt-1">
                <p className="text-sm font-semibold text-slate-200">Active &amp; waiting for calls</p>
                <SoundWave />
              </div>
            ) : (
              <p className="text-sm font-semibold text-slate-600 mt-1">Offline — enable the toggle to go live</p>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] text-slate-600 uppercase tracking-[0.18em] font-bold">Calls Today</p>
            <p className="text-2xl font-black text-white mt-0.5">{totalToday}</p>
          </div>
          {!error && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{ background: 'rgba(30,27,39,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" style={{ animation: 'ping 1.5s ease-in-out infinite' }} />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Synced</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Context Editor ────────────────────────────────────────────────────────────
function ContextEditor({ contextText, isSaving, onSave, onContextChange }) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="rounded-2xl glass-panel overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
      {/* Header */}
      <button
        className="w-full px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
        style={{ borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(226,62,69,0.1)', border: '1px solid rgba(226,62,69,0.2)', color: '#f87171' }}>
            <BrainIcon className="w-4 h-4" />
          </div>
          <div className="text-left">
            <h3 className="text-xs font-bold text-white uppercase tracking-[0.15em]">Knowledge Base</h3>
            <p className="text-[10px] text-slate-600 mt-0.5 font-medium">Context, schedules &amp; workflows</p>
          </div>
        </div>
        <ChevronIcon className="w-4 h-4 text-slate-600" down={isExpanded} />
      </button>

      {isExpanded && (
        <div className="p-4 animate-fadeIn">
          <textarea
            value={contextText}
            onChange={(e) => onContextChange(e.target.value)}
            placeholder="Tell CallMinds about your status: e.g. 'I am in a meeting until 3pm. If anyone calls, take a message and tell them I'll call back...'"
            className="w-full h-28 rounded-xl p-3.5 text-[13px] leading-relaxed placeholder-slate-700 focus:outline-none transition-all resize-none font-sans"
            style={{
              background: 'rgba(7,7,10,0.7)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: '#c8c4d4',
            }}
            onFocus={e => { e.target.style.borderColor = 'rgba(226,62,69,0.35)'; e.target.style.boxShadow = '0 0 0 3px rgba(226,62,69,0.08)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; e.target.style.boxShadow = 'none' }}
          />
          <div className="flex justify-end mt-3">
            <button
              onClick={onSave}
              disabled={isSaving}
              className="px-4 py-2 text-white text-xs font-bold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #dc2626, #e23e45)',
                boxShadow: '0 4px 15px rgba(226,62,69,0.35)',
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(226,62,69,0.5)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 15px rgba(226,62,69,0.35)'}
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Syncing…
                </>
              ) : 'Save Context'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Stats Panel ───────────────────────────────────────────────────────────────
function StatsPanel({ calls, total }) {
  const spamCount = calls.filter(c => c.primary_tag === 'Spam' || c.intent === 'SPAM').length
  const urgentCount = calls.filter(c => c.urgency === 'HIGH' || c.urgency === 'CRITICAL').length
  const totalDuration = calls.reduce((acc, c) => acc + (c.duration_seconds || 0), 0)
  const avgDuration = calls.length ? Math.round(totalDuration / calls.length) : 0

  const stats = [
    {
      id: 'total',
      label: 'Total Calls',
      value: total,
      sub: 'Processed by CM',
      icon: <PhoneIcon className="w-4 h-4" />,
      accent: '#E23E45',
      glow: 'rgba(226,62,69,0.15)',
    },
    {
      id: 'spam',
      label: 'Spam Blocked',
      value: spamCount,
      sub: 'Auto-filtered',
      icon: <ShieldIcon className="w-4 h-4" />,
      accent: '#94a3b8',
      glow: 'rgba(100,116,139,0.12)',
    },
    {
      id: 'urgent',
      label: 'Urgent Alerts',
      value: urgentCount,
      sub: 'Need attention',
      icon: <AlertIcon className="w-4 h-4" />,
      accent: '#fb923c',
      glow: 'rgba(251,146,60,0.15)',
    },
    {
      id: 'avg',
      label: 'Avg Duration',
      value: formatDuration(avgDuration),
      sub: 'Per conversation',
      icon: <ClockIcon className="w-4 h-4" />,
      accent: '#4ade80',
      glow: 'rgba(74,222,128,0.12)',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map(s => (
        <div
          key={s.id}
          className="rounded-2xl p-4 relative overflow-hidden glass-panel"
          style={{ border: '1px solid rgba(255,255,255,0.05)' }}
        >
          {/* Background glow */}
          <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full blur-xl pointer-events-none"
            style={{ background: s.glow }} />

          {/* Icon */}
          <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-3"
            style={{ background: `${s.accent}18`, border: `1px solid ${s.accent}30`, color: s.accent }}>
            {s.icon}
          </div>

          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600">{s.label}</p>
          <p className="text-2xl font-black mt-1 leading-none" style={{ color: s.accent }}>{s.value}</p>
          <p className="text-[10px] font-semibold mt-1.5" style={{ color: `${s.accent}90` }}>{s.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Tag Badge ────────────────────────────────────────────────────────────────
function TagBadge({ primary_tag, tag_color }) {
  if (!primary_tag && !tag_color) return null
  const style = getTagStyle(primary_tag, tag_color)
  const emoji = TAG_EMOJIS[primary_tag] || '🏷️'
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide"
      style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}
    >
      <span className="text-[11px]">{emoji}</span>
      <span>{primary_tag || tag_color}</span>
    </span>
  )
}

// ─── Urgency Badge ────────────────────────────────────────────────────────────
function UrgencyBadge({ urgency }) {
  if (!urgency) return null
  const cfg = URGENCY_CONFIG[urgency] || URGENCY_CONFIG.LOW
  return (
    <span
      className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      {urgency}
    </span>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function CallerAvatar({ name, isSpam }) {
  const letter = (name || '?').charAt(0).toUpperCase()
  return (
    <div
      className="w-11 h-11 flex-shrink-0 rounded-xl flex items-center justify-center text-base font-black transition-all duration-300"
      style={{
        background: isSpam ? 'rgba(30,27,39,0.6)' : 'rgba(226,62,69,0.1)',
        border: isSpam ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(226,62,69,0.2)',
        color: isSpam ? '#475569' : '#f87171',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {letter}
    </div>
  )
}

// ─── Meta Cell ────────────────────────────────────────────────────────────────
function MetaCell({ label, value }) {
  return (
    <div>
      <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.15em]">{label}</p>
      <p className="text-sm text-slate-200 font-semibold mt-1">{value || '—'}</p>
    </div>
  )
}

// ─── Call Card ─────────────────────────────────────────────────────────────────
function CallCard({ call, isExpanded, onToggle }) {
  const displayName = call.caller_name || call.caller_number || 'Unknown'
  const isSpam = call.primary_tag === 'Spam' || call.status === 'SPAM'

  const summaryLines = call.summary
    ? call.summary.split('\n').filter(l => l.trim())
    : []

  const keyPoints = summaryLines
    .filter(l => l.trim().startsWith('•'))
    .map(l => l.replace(/^•\s*/, '').trim())

  const purposeLine = (() => {
    const found = summaryLines.find(l => l.toLowerCase().startsWith('purpose:'))
    if (found) return found.replace(/^purpose:\s*/i, '').trim()
    const fallback = summaryLines.find(l => l.toLowerCase().includes('purpose'))
    if (fallback) return fallback.replace(/^[^\s:]*:\s*/, '').trim()
    return null
  })()

  const transcriptLines = call.transcript
    ? call.transcript.split('\n').filter(l => l.trim())
    : []

  const parsedTranscript = transcriptLines.map(line => {
    const isAria = line.startsWith('ARIA:') || line.startsWith('CALLMINDS:')
    const isCaller = line.startsWith('CALLER:')
    if (isAria) return { speaker: 'ARIA', text: line.replace(/^(ARIA|CALLMINDS):\s*/i, '').trim() }
    if (isCaller) return { speaker: 'CALLER', text: line.replace(/^CALLER:\s*/i, '').trim() }
    return { speaker: 'CALLER', text: line.trim() }
  })

  const sentimentInfo = SENTIMENT_MAP[call.sentiment]

  return (
    <div
      className="relative rounded-2xl overflow-hidden card-shadow glass-panel transition-all duration-300"
      style={{
        border: isExpanded
          ? '1px solid rgba(226,62,69,0.3)'
          : '1px solid rgba(255,255,255,0.05)',
        boxShadow: isExpanded
          ? '0 0 30px rgba(226,62,69,0.12), 0 8px 32px rgba(0,0,0,0.5)'
          : '0 4px 24px rgba(0,0,0,0.45)',
        cursor: 'pointer',
      }}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      id={`call-card-${call.id}`}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onToggle()}
      aria-expanded={isExpanded}
    >
      {/* Collapsed row */}
      <div
        className="px-5 py-4 transition-all duration-200"
        style={{ background: isExpanded ? 'rgba(20,18,28,0.95)' : 'transparent' }}
      >
        <div className="flex items-center gap-4">

          <CallerAvatar name={displayName} isSpam={isSpam} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-white text-sm leading-tight">{displayName}</p>
              {call.organization && (
                <span className="text-[10px] text-slate-500 font-semibold px-2 py-0.5 rounded-md"
                  style={{ background: 'rgba(30,27,39,0.7)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  {call.organization}
                </span>
              )}
            </div>
            {call.caller_number !== displayName && (
              <p className="text-xs text-slate-600 mt-0.5 font-mono">{call.caller_number}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <TagBadge primary_tag={call.primary_tag} tag_color={call.tag_color} />
              {call.secondary_tag && (
                <span className="text-[10px] text-slate-500 font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(30,27,39,0.6)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  {call.secondary_tag}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{timeAgo(call.created_at)}</p>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono text-slate-500 px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(20,18,28,0.8)', border: '1px solid rgba(255,255,255,0.05)' }}>
                {formatDuration(call.duration_seconds)}
              </span>
              <UrgencyBadge urgency={call.urgency} />
            </div>
            <ChevronIcon className="w-3.5 h-3.5 text-slate-600" down={isExpanded} />
          </div>

        </div>
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <div
          className="animate-fadeIn"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 p-5">

            {/* LEFT: Summary info */}
            <div className="flex flex-col gap-4">

              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-3 p-4 rounded-xl"
                style={{ background: 'rgba(7,7,10,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <MetaCell label="Call Time" value={formatTime(call.started_at)} />
                <MetaCell label="Duration" value={formatDuration(call.duration_seconds)} />
                <MetaCell label="Language" value={call.language ? call.language.charAt(0).toUpperCase() + call.language.slice(1) : null} />
                <MetaCell label="Sentiment" value={
                  sentimentInfo
                    ? `${sentimentInfo.icon} ${call.sentiment.charAt(0).toUpperCase() + call.sentiment.slice(1)}`
                    : call.sentiment || null
                } />
              </div>

              {/* Purpose */}
              {purposeLine && (
                <div className="p-4 rounded-xl" style={{ background: 'rgba(7,7,10,0.4)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
                    <span>🎯</span> Purpose
                  </p>
                  <p className="text-sm text-slate-300 leading-relaxed font-medium">{purposeLine}</p>
                </div>
              )}

              {/* Action Required */}
              {call.action_required && (
                <div className="p-4 rounded-xl"
                  style={{ background: 'rgba(226,62,69,0.07)', border: '1px solid rgba(226,62,69,0.2)' }}>
                  <p className="text-[10px] font-black text-red-400 uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
                    <span>⚡</span> Action Required
                  </p>
                  <p className="text-sm text-slate-200 font-semibold leading-relaxed">{call.action_required}</p>
                  {call.deadline && (
                    <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-yellow-400 font-bold px-2.5 py-1 rounded-lg"
                      style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.2)' }}>
                      <ClockIcon className="w-3.5 h-3.5" />
                      Deadline: {call.deadline}
                    </div>
                  )}
                </div>
              )}

              {/* Highlights */}
              {keyPoints.length > 0 && (
                <div className="p-4 rounded-xl" style={{ background: 'rgba(7,7,10,0.4)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5">
                    <span>📝</span> Highlights
                  </p>
                  <ul className="space-y-2">
                    {keyPoints.map((pt, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300">
                        <span className="mt-2 w-1 h-1 rounded-full flex-shrink-0" style={{ background: '#E23E45' }} />
                        <span className="leading-relaxed font-medium">{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Fallback summary */}
              {keyPoints.length === 0 && !purposeLine && call.summary && (
                <div className="p-4 rounded-xl" style={{ background: 'rgba(7,7,10,0.4)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.15em] mb-2">Summary</p>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed font-medium">{call.summary}</p>
                </div>
              )}
            </div>

            {/* RIGHT: Transcript */}
            <div className="flex flex-col">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5">
                <span>💬</span> Call Transcript
              </p>
              {parsedTranscript.length > 0 ? (
                <div
                  className="flex flex-col gap-3 max-h-[360px] overflow-y-auto p-4 rounded-xl"
                  style={{ background: 'rgba(7,7,10,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  {parsedTranscript.map((msg, i) => {
                    const isAria = msg.speaker === 'ARIA'
                    return (
                      <div key={i} className={`flex flex-col max-w-[88%] ${isAria ? 'self-start items-start' : 'self-end items-end'}`}>
                        <span className="text-[9px] font-black uppercase tracking-wider mb-1 px-1"
                          style={{ color: isAria ? '#f87171' : '#64748b' }}>
                          {isAria ? '🤖 CallMinds' : '👤 Caller'}
                        </span>
                        <div
                          className="px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed font-medium"
                          style={isAria ? {
                            background: 'rgba(226,62,69,0.08)',
                            border: '1px solid rgba(226,62,69,0.18)',
                            color: '#fca5a5',
                            borderTopLeftRadius: '4px',
                          } : {
                            background: 'rgba(30,27,39,0.6)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            color: '#cbd5e1',
                            borderTopRightRadius: '4px',
                          }}
                        >
                          {msg.text}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center rounded-xl text-slate-700 text-sm italic"
                  style={{ background: 'rgba(7,7,10,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  No transcript available
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

// ─── Call History Feed ─────────────────────────────────────────────────────────
function CallHistoryFeed({ calls, loading, error, total }) {
  const [expandedId, setExpandedId] = useState(null)

  function handleToggle(id) {
    setExpandedId(prev => prev === id ? null : id)
  }

  if (loading && calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-red-600 border-t-transparent animate-spin" />
        <p className="text-slate-600 text-sm font-semibold">Loading call history…</p>
      </div>
    )
  }

  if (error && calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(226,62,69,0.1)', border: '1px solid rgba(226,62,69,0.2)' }}>
          <AlertIcon className="w-6 h-6 text-red-400" />
        </div>
        <p className="text-red-400 font-bold text-sm">Failed to load calls</p>
        <p className="text-slate-600 text-xs font-mono">{error}</p>
      </div>
    )
  }

  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-14 h-14 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(20,18,28,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <PhoneIcon className="w-7 h-7 text-slate-700" />
        </div>
        <div className="text-center">
          <p className="text-slate-500 font-semibold text-sm">No calls recorded yet</p>
          <p className="text-slate-700 text-xs font-medium mt-1">Calls will appear here once processed</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between px-0.5 mb-1">
        <div>
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Call History</h2>
          <p className="text-[11px] text-slate-700 mt-0.5 font-medium">{total} logs stored</p>
        </div>
        {loading && (
          <div className="w-3.5 h-3.5 rounded-full border-2 border-red-600 border-t-transparent animate-spin" />
        )}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {calls.map(call => (
          <CallCard
            key={call.id}
            call={call}
            isExpanded={expandedId === call.id}
            onToggle={() => handleToggle(call.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, type, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3200)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl flex items-center gap-3 text-sm font-semibold"
      style={{
        background: 'rgba(14,13,20,0.95)',
        border: type === 'success' ? '1px solid rgba(74,222,128,0.25)' : '1px solid rgba(226,62,69,0.25)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        color: type === 'success' ? '#4ade80' : '#f87171',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      {type === 'success'
        ? <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
        : <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
      }
      {message}
    </div>
  )
}

// ─── App Root ──────────────────────────────────────────────────────────────────
export default function App() {
  const [status, setStatus]               = useState(null)
  const [statusError, setStatusError]     = useState(null)
  const [callsData, setCallsData]         = useState({ total: 0, page: 1, page_size: 20, calls: [] })
  const [callsLoading, setCallsLoading]   = useState(true)
  const [callsError, setCallsError]       = useState(null)
  const [toggling, setToggling]           = useState(false)
  const [contextText, setContextText]     = useState('')
  const [isSavingContext, setIsSavingContext] = useState(false)
  const [toast, setToast]                 = useState(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/status')
      setStatus(res.data)
      setStatusError(null)
    } catch (err) {
      setStatusError(err.message || 'Failed to fetch status')
    }
  }, [])

  const fetchContext = useCallback(async () => {
    try {
      const res = await api.get('/context')
      setContextText(res.data.context || '')
    } catch (err) {
      console.error('Failed to fetch context', err)
    }
  }, [])

  const fetchCalls = useCallback(async () => {
    try {
      const res = await api.get('/calls')
      setCallsData(res.data)
      setCallsError(null)
    } catch (err) {
      setCallsError(err.message || 'Failed to fetch calls')
    } finally {
      setCallsLoading(false)
    }
  }, [])

  async function handleToggle() {
    if (toggling || !status) return
    const newEnabled = !status.aria_enabled
    setToggling(true)
    try {
      const res = await api.post('/toggle', { enabled: newEnabled })
      setStatus(prev => ({ ...prev, aria_enabled: res.data.aria_enabled }))
      setToast({ message: res.data.message.replace(/aria/i, 'CallMinds'), type: 'success' })
    } catch (err) {
      setToast({ message: err.response?.data?.detail || 'Failed to toggle CallMinds', type: 'error' })
    } finally {
      setToggling(false)
    }
  }

  async function handleSaveContext() {
    setIsSavingContext(true)
    try {
      const res = await api.post('/context', { context: contextText })
      setToast({ message: res.data.message || 'Context saved', type: 'success' })
    } catch (err) {
      setToast({ message: err.response?.data?.detail || 'Failed to save context', type: 'error' })
    } finally {
      setIsSavingContext(false)
    }
  }

  useEffect(() => {
    fetchStatus(); fetchCalls(); fetchContext()
    const s = setInterval(fetchStatus, 3000)
    const c = setInterval(fetchCalls, 8000)
    return () => { clearInterval(s); clearInterval(c) }
  }, [fetchStatus, fetchCalls, fetchContext])

  const ariaEnabled = status?.aria_enabled ?? false

  return (
    <div className="min-h-screen pb-16" style={{ background: '#07070A', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute -top-48 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full blur-[140px] transition-all duration-1000"
          style={{ background: ariaEnabled ? 'rgba(226,62,69,0.07)' : 'rgba(30,27,39,0.04)' }}
        />
        <div
          className="absolute bottom-0 -right-40 w-96 h-96 rounded-full blur-[120px]"
          style={{ background: 'rgba(168,85,247,0.03)' }}
        />
      </div>

      {/* Header */}
      <Header ariaEnabled={ariaEnabled} toggling={toggling} onToggle={handleToggle} />

      {/* Main content */}
      <main className="relative z-10 max-w-[1280px] mx-auto px-5 sm:px-8 py-7">

        {/* Status banner */}
        <div className="mb-7">
          <LiveStatusBar status={status} error={statusError} />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* Sidebar */}
          <div className="lg:col-span-4 flex flex-col gap-5 lg:sticky lg:top-24">
            <ContextEditor
              contextText={contextText}
              isSaving={isSavingContext}
              onSave={handleSaveContext}
              onContextChange={setContextText}
            />
            <StatsPanel calls={callsData.calls} total={callsData.total} />
          </div>

          {/* Call history */}
          <div className="lg:col-span-8">
            <CallHistoryFeed
              calls={callsData.calls}
              loading={callsLoading}
              error={callsError}
              total={callsData.total}
            />
          </div>

        </div>
      </main>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes ping {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}
