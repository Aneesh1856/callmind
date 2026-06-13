import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Demo Script ──────────────────────────────────────────────────────────────
// Each step has: delay (ms from prev step), type, and payload
const DEMO_SCRIPT = [
  // ── Phase 0: Incoming call (t=0) ─────────────────────────────────────────
  { delay: 0,    type: 'INCOMING_CALL' },
  { delay: 2200, type: 'CALL_ANSWER' },
  { delay: 400,  type: 'STATUS', text: 'On a call', icon: '📞' },

  // ── Phase 1: Conversation ─────────────────────────────────────────────────
  { delay: 500,  type: 'TRANSCRIPT', speaker: 'ARIA',
    text: 'Hello, you\'ve reached Aneesh\'s AI assistant. How can I help you today?' },
  { delay: 1800, type: 'TRANSCRIPT', speaker: 'CALLER',
    text: 'Hi, I\'m Priya from ABC Corp. I urgently need the project proposal document. Can you send it over?' },
  { delay: 2000, type: 'TRANSCRIPT', speaker: 'ARIA',
    text: 'Of course! I can help with that. Could I get your email address to send it across?' },
  { delay: 1800, type: 'TRANSCRIPT', speaker: 'CALLER',
    text: 'Sure, it\'s priya@abccorp.com' },
  { delay: 1600, type: 'TRANSCRIPT', speaker: 'ARIA',
    text: 'Perfect. Let me locate that file on the system right now — one moment please.' },

  // ── Phase 2: PC Control begins ────────────────────────────────────────────
  { delay: 800,  type: 'STATUS', text: 'Accessing PC', icon: '🖥️' },
  { delay: 200,  type: 'PC_START' },
  { delay: 600,  type: 'PC_SCAN', folder: '📁 Documents' },
  { delay: 700,  type: 'PC_SCAN', folder: '📁 Projects' },
  { delay: 700,  type: 'PC_SCAN', folder: '📁 Clients / ABC Corp' },
  { delay: 800,  type: 'STATUS', text: 'Locating file', icon: '🔍' },
  { delay: 300,  type: 'PC_SCAN', folder: '📁 Proposals' },
  { delay: 900,  type: 'PC_FOUND' },

  // ── Phase 3: Email ────────────────────────────────────────────────────────
  { delay: 600,  type: 'STATUS', text: 'Sending email', icon: '📧' },
  { delay: 200,  type: 'EMAIL_COMPOSE' },
  { delay: 1200, type: 'EMAIL_SEND' },

  // ── Phase 4: Wrap-up ──────────────────────────────────────────────────────
  { delay: 800,  type: 'TRANSCRIPT', speaker: 'ARIA',
    text: 'Done! I\'ve found the document and sent it to priya@abccorp.com. Is there anything else you need?' },
  { delay: 1800, type: 'TRANSCRIPT', speaker: 'CALLER',
    text: 'That\'s great, thank you so much!' },
  { delay: 1600, type: 'TRANSCRIPT', speaker: 'ARIA',
    text: 'My pleasure. Have a great day, Priya! Goodbye.' },
  { delay: 1400, type: 'STATUS', text: 'Call complete', icon: '✅' },
  { delay: 600,  type: 'CALL_END' },
  { delay: 800,  type: 'SUMMARY' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(res => setTimeout(res, ms))
}

// ─── Word-by-word text reveal ─────────────────────────────────────────────────
function RevealText({ text, isNew, speed = 55 }) {
  const [shown, setShown] = useState(isNew ? '' : text)
  const words = text.split(' ')
  const idx = useRef(isNew ? 0 : words.length)

  useEffect(() => {
    if (!isNew) { setShown(text); return }
    idx.current = 0
    setShown('')
    const id = setInterval(() => {
      idx.current += 1
      setShown(words.slice(0, idx.current).join(' '))
      if (idx.current >= words.length) clearInterval(id)
    }, speed)
    return () => clearInterval(id)
  }, [text, isNew]) // eslint-disable-line

  return <span>{shown}</span>
}

// ─── File browser row ─────────────────────────────────────────────────────────
function FolderRow({ label, state }) {
  // state: 'idle' | 'scanning' | 'skipped' | 'found'
  const color = state === 'found' ? '#4ade80' : state === 'scanning' ? '#fb923c' : state === 'skipped' ? '#475569' : '#334155'
  const icon = state === 'found' ? '✅' : state === 'scanning' ? '🔍' : state === 'skipped' ? '⏭' : '·'
  return (
    <div className="flex items-center gap-3 py-1.5 px-3 rounded-lg transition-all duration-300"
      style={{ background: state === 'scanning' ? 'rgba(251,146,60,0.07)' : state === 'found' ? 'rgba(74,222,128,0.07)' : 'transparent' }}>
      <span className="text-xs w-4 text-center">{icon}</span>
      <span className="text-sm font-mono" style={{ color }}>{label}</span>
      {state === 'scanning' && (
        <span className="ml-auto flex gap-1">
          {[0,1,2].map(i => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-orange-400"
              style={{ animation: `bounce 0.9s ease-in-out ${i * 0.15}s infinite` }} />
          ))}
        </span>
      )}
      {state === 'found' && <span className="ml-auto text-[10px] font-bold text-green-400 uppercase tracking-wider">Found</span>}
    </div>
  )
}

// ─── Panel wrapper ────────────────────────────────────────────────────────────
function Panel({ title, icon, accent = '#E23E45', children, glow = false }) {
  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden flex-1 min-w-0"
      style={{
        background: 'rgba(14,13,20,0.85)',
        border: glow ? `1px solid ${accent}45` : '1px solid rgba(255,255,255,0.06)',
        boxShadow: glow
          ? `0 0 30px ${accent}18, 0 8px 32px rgba(0,0,0,0.55)`
          : '0 4px 24px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(20px)',
        transition: 'border-color 0.4s, box-shadow 0.4s',
      }}
    >
      {/* Panel header */}
      <div className="px-5 py-3.5 flex items-center gap-2.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(7,7,10,0.5)' }}>
        <span className="text-base">{icon}</span>
        <span className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>{title}</span>
      </div>
      <div className="flex-1 p-4 overflow-hidden">{children}</div>
    </div>
  )
}

// ─── Status step indicator ────────────────────────────────────────────────────
function StatusStep({ icon, text, active, done }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all duration-400"
      style={{
        background: active ? 'rgba(226,62,69,0.1)' : done ? 'rgba(74,222,128,0.06)' : 'transparent',
        border: active ? '1px solid rgba(226,62,69,0.25)' : done ? '1px solid rgba(74,222,128,0.2)' : '1px solid transparent',
      }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
        style={{
          background: active ? 'rgba(226,62,69,0.15)' : done ? 'rgba(74,222,128,0.12)' : 'rgba(30,27,39,0.5)',
        }}>
        {done && !active ? '✅' : icon}
      </div>
      <span className="text-sm font-semibold" style={{
        color: active ? '#f87171' : done ? '#4ade80' : '#334155',
      }}>{text}</span>
      {active && (
        <span className="ml-auto flex gap-1">
          {[0,1,2].map(i => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-red-400"
              style={{ animation: `bounce 0.9s ease-in-out ${i * 0.15}s infinite` }} />
          ))}
        </span>
      )}
    </div>
  )
}

// ─── Main Demo Page ───────────────────────────────────────────────────────────
export default function Demo() {
  // ── Simulation state ────────────────────────────────────────────────────────
  const [phase, setPhase] = useState('idle') // idle | ringing | running | done
  const [transcript, setTranscript]   = useState([])
  const [newMsgIdx, setNewMsgIdx]     = useState(-1)
  const [callState, setCallState]     = useState('ringing') // ringing | active | ended
  const [statusHistory, setStatusHistory]  = useState([])
  const [currentStatus, setCurrentStatus]  = useState(null)

  // PC panel
  const [pcActive, setPcActive]       = useState(false)
  const [folders, setFolders]         = useState([])   // [{label, state}]
  const [fileFound, setFileFound]     = useState(false)

  // Email panel
  const [emailState, setEmailState]   = useState('none') // none | composing | sent
  const [emailSent, setEmailSent]     = useState(false)

  // Summary
  const [showSummary, setShowSummary] = useState(false)

  const runRef = useRef(false)
  const transcriptRef = useRef(null)

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript])

  // ── Reset everything ─────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    runRef.current = false
    setPhase('idle')
    setTranscript([])
    setNewMsgIdx(-1)
    setCallState('ringing')
    setStatusHistory([])
    setCurrentStatus(null)
    setPcActive(false)
    setFolders([])
    setFileFound(false)
    setEmailState('none')
    setEmailSent(false)
    setShowSummary(false)
  }, [])

  // ── Folder scan sequence ──────────────────────────────────────────────────────
  const folderSequence = [
    '📁 Documents',
    '📁 Projects',
    '📁 Clients / ABC Corp',
    '📁 Proposals',
  ]

  // ── Run the simulation ────────────────────────────────────────────────────────
  const runDemo = useCallback(async () => {
    runRef.current = true
    setPhase('ringing')
    setCallState('ringing')

    let transcriptList = []
    let folderList = folderSequence.map(f => ({ label: f, state: 'idle' }))
    let statusList = []

    const addTranscript = (speaker, text) => {
      const entry = { speaker, text, id: Date.now() + Math.random() }
      transcriptList = [...transcriptList, entry]
      setTranscript([...transcriptList])
      setNewMsgIdx(transcriptList.length - 1)
    }

    const pushStatus = (text, icon) => {
      const entry = { text, icon, id: Date.now() }
      statusList = [...statusList, entry]
      setStatusHistory([...statusList])
      setCurrentStatus(entry.id)
    }

    // Process each step
    for (const step of DEMO_SCRIPT) {
      if (!runRef.current) return
      await sleep(step.delay)
      if (!runRef.current) return

      switch (step.type) {
        case 'INCOMING_CALL':
          pushStatus('Incoming call', '📲')
          break

        case 'CALL_ANSWER':
          setPhase('running')
          setCallState('active')
          break

        case 'STATUS':
          pushStatus(step.text, step.icon)
          break

        case 'TRANSCRIPT':
          addTranscript(step.speaker, step.text)
          break

        case 'PC_START':
          setPcActive(true)
          setFolders(folderSequence.map(f => ({ label: f, state: 'idle' })))
          break

        case 'PC_SCAN': {
          const idx = folderSequence.indexOf(step.folder)
          if (idx === -1) break
          // Mark previous as skipped
          folderList = folderList.map((f, i) => ({
            ...f,
            state: i < idx ? 'skipped' : i === idx ? 'scanning' : 'idle',
          }))
          setFolders([...folderList])
          break
        }

        case 'PC_FOUND':
          folderList = folderList.map(f => ({ ...f, state: 'skipped' }))
          setFolders([...folderList])
          setFileFound(true)
          break

        case 'EMAIL_COMPOSE':
          setEmailState('composing')
          break

        case 'EMAIL_SEND':
          setEmailState('sent')
          setEmailSent(true)
          break

        case 'CALL_END':
          setCallState('ended')
          break

        case 'SUMMARY':
          setShowSummary(true)
          setPhase('done')
          break

        default:
          break
      }
    }
  }, []) // eslint-disable-line

  const handleStart = () => {
    reset()
    // Small delay so reset clears before running
    setTimeout(() => runDemo(), 80)
  }

  const handleReplay = () => {
    reset()
    setTimeout(() => runDemo(), 80)
  }

  // ── Status steps config ───────────────────────────────────────────────────────
  const STATUS_STEPS = [
    { icon: '📲', text: 'Incoming call' },
    { icon: '📞', text: 'On a call' },
    { icon: '🖥️', text: 'Accessing PC' },
    { icon: '🔍', text: 'Locating file' },
    { icon: '📧', text: 'Sending email' },
    { icon: '✅', text: 'Call complete' },
  ]

  // When demo is fully done, mark ALL statuses as done and nothing as active.
  // Otherwise, everything before the last status is done, and the last one is active.
  const doneIds = new Set(
    phase === 'done'
      ? statusHistory.map(s => s.text)
      : statusHistory.slice(0, -1).map(s => s.text)
  )
  const activeText = phase === 'done'
    ? null
    : (currentStatus ? statusHistory.find(s => s.id === currentStatus)?.text : null)

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'radial-gradient(ellipse at 20% 0%, rgba(226,62,69,0.06) 0%, transparent 60%), #07070A',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* ── Top bar ── */}
      <header
        className="flex items-center justify-between px-8 py-4 flex-shrink-0"
        style={{
          background: 'rgba(10,9,18,0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="CallMinds" className="h-9 w-auto rounded-xl object-contain"
            style={{ filter: 'drop-shadow(0 0 8px rgba(226,62,69,0.4))' }} />
          <div>
            <p className="text-[9px] font-bold tracking-[0.3em] uppercase text-slate-600">CallMinds</p>
            <p className="text-sm font-black text-white leading-tight">ARIA Live Demo</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
            style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', color: '#c084fc' }}>
            ✨ Simulation Mode
          </span>
          <a href="/"
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-300 transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            ← Dashboard
          </a>
        </div>
      </header>

      {/* ── Hero ── */}
      <div className="text-center px-8 pt-10 pb-6 flex-shrink-0">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
          style={{ background: 'rgba(226,62,69,0.08)', border: '1px solid rgba(226,62,69,0.2)' }}>
          <span className="w-2 h-2 rounded-full bg-red-400" style={{ boxShadow: '0 0 6px #f87171', animation: 'pulse 2s ease-in-out infinite' }} />
          <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider">Interactive Demo</span>
        </div>
        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">
          Watch ARIA Handle a Real Call
        </h1>
        <p className="text-slate-500 text-sm max-w-lg mx-auto leading-relaxed">
          Priya from ABC Corp urgently needs a document. See how ARIA picks up, finds the file, and emails it — completely autonomously.
        </p>
      </div>

      {/* ── START button ── */}
      {phase === 'idle' && (
        <div className="flex justify-center pb-8 flex-shrink-0">
          <button
            id="demo-start-btn"
            onClick={handleStart}
            className="group relative px-10 py-4 rounded-2xl text-white font-black text-base tracking-wide overflow-hidden transition-all duration-300"
            style={{
              background: 'linear-gradient(135deg, #dc2626, #e23e45)',
              boxShadow: '0 0 40px rgba(226,62,69,0.5), 0 8px 32px rgba(0,0,0,0.4)',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 60px rgba(226,62,69,0.7), 0 8px 32px rgba(0,0,0,0.4)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 40px rgba(226,62,69,0.5), 0 8px 32px rgba(0,0,0,0.4)'}
          >
            <span className="relative z-10 flex items-center gap-3">
              <span className="text-xl">▶</span>
              Start Demo
            </span>
          </button>
        </div>
      )}

      {/* ── Three-panel simulation area ── */}
      {phase !== 'idle' && (
        <div className="flex-1 px-6 pb-8 flex flex-col gap-6 min-h-0">

          {/* Three panels */}
          <div className="flex gap-4 flex-1 min-h-0" style={{ maxHeight: '520px' }}>

            {/* ─ LEFT: Phone Call Panel ─────────────────────────────── */}
            <Panel
              title="Phone Call"
              icon="📞"
              accent="#E23E45"
              glow={callState === 'active'}
            >
              <div className="flex flex-col h-full gap-4">
                {/* Caller info */}
                <div className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'rgba(7,7,10,0.7)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-black flex-shrink-0"
                    style={{ background: 'rgba(226,62,69,0.12)', border: '1px solid rgba(226,62,69,0.2)', color: '#f87171' }}>
                    P
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Priya</p>
                    <p className="text-[11px] text-slate-600 font-medium">ABC Corp · priya@abccorp.com</p>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-full"
                    style={{
                      background: callState === 'active' ? 'rgba(34,197,94,0.1)' :
                        callState === 'ended' ? 'rgba(100,116,139,0.1)' : 'rgba(251,146,60,0.1)',
                      border: callState === 'active' ? '1px solid rgba(34,197,94,0.25)' :
                        callState === 'ended' ? '1px solid rgba(100,116,139,0.2)' : '1px solid rgba(251,146,60,0.25)',
                    }}>
                    <span className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: callState === 'active' ? '#4ade80' : callState === 'ended' ? '#64748b' : '#fb923c',
                        animation: callState === 'ringing' ? 'pulse 0.8s ease-in-out infinite' : callState === 'active' ? 'pulse 2s ease-in-out infinite' : 'none',
                        boxShadow: callState === 'active' ? '0 0 6px #4ade80' : callState === 'ringing' ? '0 0 6px #fb923c' : 'none',
                      }} />
                    <span className="text-[10px] font-bold"
                      style={{ color: callState === 'active' ? '#4ade80' : callState === 'ended' ? '#64748b' : '#fb923c' }}>
                      {callState === 'ringing' ? 'Ringing…' : callState === 'active' ? 'Live' : 'Ended'}
                    </span>
                  </div>
                </div>

                {/* Ringing animation */}
                {callState === 'ringing' && (
                  <div className="flex flex-col items-center justify-center flex-1 gap-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
                        style={{ background: 'rgba(226,62,69,0.12)', border: '1px solid rgba(226,62,69,0.3)', animation: 'ringPulse 1.4s ease-out infinite' }}>
                        📲
                      </div>
                      <div className="absolute inset-0 rounded-full"
                        style={{ border: '2px solid rgba(226,62,69,0.3)', animation: 'ringSpread 1.4s ease-out infinite 0.3s' }} />
                      <div className="absolute inset-0 rounded-full"
                        style={{ border: '2px solid rgba(226,62,69,0.15)', animation: 'ringSpread 1.4s ease-out infinite 0.6s' }} />
                    </div>
                    <p className="text-sm font-semibold text-slate-500">Incoming call from Priya…</p>
                  </div>
                )}

                {/* Transcript */}
                {callState !== 'ringing' && (
                  <div
                    ref={transcriptRef}
                    className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1"
                    style={{ scrollBehavior: 'smooth' }}
                  >
                    {transcript.map((msg, i) => {
                      const isAria = msg.speaker === 'ARIA'
                      return (
                        <div key={msg.id} className={`flex flex-col max-w-[90%] ${isAria ? 'self-start items-start' : 'self-end items-end'}`}>
                          <span className="text-[9px] font-black uppercase tracking-wider mb-1 px-1"
                            style={{ color: isAria ? '#f87171' : '#64748b' }}>
                            {isAria ? '🤖 ARIA' : '👤 Priya'}
                          </span>
                          <div className="px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed font-medium"
                            style={isAria ? {
                              background: 'rgba(226,62,69,0.08)', border: '1px solid rgba(226,62,69,0.18)',
                              color: '#fca5a5', borderTopLeftRadius: '4px',
                            } : {
                              background: 'rgba(30,27,39,0.7)', border: '1px solid rgba(255,255,255,0.07)',
                              color: '#cbd5e1', borderTopRightRadius: '4px',
                            }}>
                            <RevealText text={msg.text} isNew={i === newMsgIdx} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Panel>

            {/* ─ MIDDLE: PC Control Panel ───────────────────────────── */}
            <Panel title="PC Control" icon="🖥️" accent="#c084fc" glow={pcActive && !emailSent}>
              <div className="flex flex-col h-full gap-3">
                {!pcActive && (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                      style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}>
                      🖥️
                    </div>
                    <p className="text-sm text-slate-700 font-medium text-center">Waiting for ARIA to<br/>take PC control…</p>
                  </div>
                )}

                {pcActive && (
                  <>
                    {/* File browser */}
                    <div className="rounded-xl overflow-hidden flex-shrink-0"
                      style={{ background: 'rgba(7,7,10,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      {/* Browser title bar */}
                      <div className="flex items-center gap-2 px-3 py-2.5"
                        style={{ background: 'rgba(20,18,28,0.8)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div className="flex gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-red-500/60" />
                          <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                          <div className="w-3 h-3 rounded-full bg-green-500/60" />
                        </div>
                        <span className="text-[10px] font-mono text-slate-600 ml-2">📂 File Explorer — Aneesh's Mac</span>
                      </div>

                      {/* Folder tree */}
                      <div className="p-2">
                        {folders.map((f, i) => (
                          <FolderRow key={i} label={f.label} state={f.state} />
                        ))}
                      </div>

                      {/* Found file */}
                      {fileFound && (
                        <div className="mx-2 mb-2 mt-1 px-3 py-2.5 rounded-xl flex items-center gap-3"
                          style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)' }}>
                          <span className="text-xl">📄</span>
                          <div>
                            <p className="text-sm font-bold text-green-400">Project_Proposal_ABC.pdf</p>
                            <p className="text-[10px] text-slate-600 font-mono mt-0.5">2.4 MB · Modified 2 days ago</p>
                          </div>
                          <span className="ml-auto text-[10px] font-black text-green-400 uppercase tracking-wider">Ready</span>
                        </div>
                      )}
                    </div>

                    {/* Email compose */}
                    {emailState !== 'none' && (
                      <div className="rounded-xl overflow-hidden flex-shrink-0 animate-fadeIn"
                        style={{ background: 'rgba(7,7,10,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        {/* Email title bar */}
                        <div className="flex items-center gap-2 px-3 py-2.5"
                          style={{ background: 'rgba(20,18,28,0.8)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <span className="text-base">✉️</span>
                          <span className="text-[10px] font-mono text-slate-600">New Message — Mail</span>
                          {emailState === 'sent' && (
                            <span className="ml-auto text-[10px] font-black text-green-400 uppercase tracking-wider">✅ Sent</span>
                          )}
                        </div>
                        <div className="p-3 space-y-2">
                          <div className="flex gap-2 items-center">
                            <span className="text-[10px] font-bold text-slate-600 w-8 text-right">To:</span>
                            <span className="text-[12px] font-mono text-blue-400 px-2 py-0.5 rounded"
                              style={{ background: 'rgba(59,130,246,0.1)' }}>priya@abccorp.com</span>
                          </div>
                          <div className="flex gap-2 items-center">
                            <span className="text-[10px] font-bold text-slate-600 w-8 text-right">Sub:</span>
                            <span className="text-[12px] text-slate-300 font-medium">Project Proposal — as requested</span>
                          </div>
                          <div className="px-2 py-2 rounded-lg mt-1"
                            style={{ background: 'rgba(20,18,28,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <p className="text-[11px] text-slate-500 leading-relaxed">Hi Priya,<br/>Please find the requested document attached.<br/><span className="italic">— ARIA (on behalf of Aneesh)</span></p>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                              style={{ background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.18)' }}>
                              <span className="text-sm">📎</span>
                              <span className="text-[11px] font-mono text-green-400">Project_Proposal_ABC.pdf</span>
                            </div>
                            {emailState === 'composing' && (
                              <button className="ml-auto px-3 py-1.5 rounded-lg text-[11px] font-bold text-white"
                                style={{ background: 'rgba(59,130,246,0.5)', cursor: 'default' }}>
                                Sending…
                              </button>
                            )}
                            {emailState === 'sent' && (
                              <div className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-green-400">
                                ✅ Delivered
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Idle fill */}
                    {!fileFound && <div className="flex-1" />}
                  </>
                )}
              </div>
            </Panel>

            {/* ─ RIGHT: ARIA Status Panel ───────────────────────────── */}
            <Panel title="ARIA Status" icon="🤖" accent="#4ade80" glow={phase === 'running'}>
              <div className="flex flex-col h-full gap-2">
                <p className="text-[10px] font-bold text-slate-700 uppercase tracking-[0.15em] mb-1">Live Progress</p>

                <div className="flex flex-col gap-1.5 flex-1">
                  {STATUS_STEPS.map((step) => {
                    const active = activeText === step.text
                    const done = doneIds.has(step.text) && !active
                    return (
                      <StatusStep key={step.text} icon={step.icon} text={step.text} active={active} done={done} />
                    )
                  })}
                </div>

                {/* Summary card */}
                {showSummary && (
                  <div className="rounded-xl overflow-hidden animate-fadeIn mt-2"
                    style={{ background: 'rgba(7,7,10,0.7)', border: '1px solid rgba(74,222,128,0.2)' }}>
                    <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(74,222,128,0.05)' }}>
                      <p className="text-[10px] font-black text-green-400 uppercase tracking-wider">📋 Call Summary</p>
                    </div>
                    <div className="p-4 space-y-2.5">
                      {[
                        { label: 'Caller', value: 'Priya · ABC Corp' },
                        { label: 'Email', value: 'priya@abccorp.com' },
                        { label: 'Purpose', value: 'Project proposal document request' },
                        { label: 'Action', value: 'File located & emailed ✅' },
                        { label: 'Tag', value: '🚨 URGENT' },
                        { label: 'Duration', value: '~45 seconds' },
                      ].map(r => (
                        <div key={r.label} className="flex gap-2">
                          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider w-14 flex-shrink-0 pt-0.5">{r.label}</span>
                          <span className="text-[12px] text-slate-300 font-medium leading-relaxed">{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Panel>

          </div>

          {/* ── Replay button ── */}
          {phase === 'done' && (
            <div className="flex justify-center flex-shrink-0 animate-fadeIn">
              <button
                id="demo-replay-btn"
                onClick={handleReplay}
                className="px-8 py-3 rounded-xl font-bold text-sm tracking-wide transition-all duration-200"
                style={{
                  background: 'rgba(30,27,39,0.8)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#94a3b8',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(226,62,69,0.35)'
                  e.currentTarget.style.color = '#f87171'
                  e.currentTarget.style.background = 'rgba(226,62,69,0.08)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.color = '#94a3b8'
                  e.currentTarget.style.background = 'rgba(30,27,39,0.8)'
                }}
              >
                🔁 Replay Demo
              </button>
            </div>
          )}

        </div>
      )}

      {/* Global keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
        @keyframes ringPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(226,62,69,0.5); transform: scale(1); }
          50% { box-shadow: 0 0 0 12px rgba(226,62,69,0); transform: scale(1.05); }
        }
        @keyframes ringSpread {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
      `}</style>
    </div>
  )
}
