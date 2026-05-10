'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'offline'

const SESSION_ID = 'derek-main'

export default function Jarvis() {
  const [orbState, setOrbState] = useState<OrbState>('idle')
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [statusText, setStatusText] = useState('Toque para falar')
  const [isOnline, setIsOnline] = useState(true)
  const [volume, setVolume] = useState(0)
  const [timeStr, setTimeStr] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [msgCount, setMsgCount] = useState(0)

  // Refs for animation loops (avoid re-creating on state change)
  const orbStateRef = useRef<OrbState>('idle')
  const volumeRef = useRef(0)
  const orbCanvasRef = useRef<HTMLCanvasElement>(null)
  const waveCanvasRef = useRef<HTMLCanvasElement>(null)
  const bgCanvasRef = useRef<HTMLCanvasElement>(null)
  const recognitionRef = useRef<any>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const transcriptRef = useRef('')

  // Keep refs in sync
  useEffect(() => { orbStateRef.current = orbState }, [orbState])
  useEffect(() => { volumeRef.current = volume }, [volume])

  // Clock
  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTimeStr(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
      setDateStr(now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  // Backend health check
  useEffect(() => {
    const BACKEND = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3131'
    const check = async () => {
      try {
        const res = await fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(3000) })
        setIsOnline(res.ok)
        setOrbState(prev => {
          if (prev === 'offline' && res.ok) return 'idle'
          if (!res.ok) return 'offline'
          return prev
        })
      } catch {
        setIsOnline(false)
        setOrbState('offline')
      }
    }
    check()
    const id = setInterval(check, 10000)
    return () => clearInterval(id)
  }, [])

  // Background canvas — particles + grid
  useEffect(() => {
    const canvas = bgCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let animId: number

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const pts = Array.from({ length: 55 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.2 + 0.3,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      a: Math.random() * 0.3 + 0.08,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Subtle grid
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.032)'
      ctx.lineWidth = 1
      for (let x = 0; x < canvas.width; x += 90) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke()
      }
      for (let y = 0; y < canvas.height; y += 90) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke()
      }

      // Particles
      pts.forEach(p => {
        p.x = (p.x + p.vx + canvas.width) % canvas.width
        p.y = (p.y + p.vy + canvas.height) % canvas.height
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(147, 197, 253, ${p.a})`
        ctx.fill()
      })

      // Connect nearby
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)
          if (d < 120) {
            ctx.beginPath()
            ctx.moveTo(pts[i].x, pts[i].y)
            ctx.lineTo(pts[j].x, pts[j].y)
            ctx.strokeStyle = `rgba(59, 130, 246, ${0.065 * (1 - d / 120)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])

  // Orb canvas — runs once, reads state from ref
  useEffect(() => {
    const canvas = orbCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let t = 0
    let animId: number

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      const state = orbStateRef.current
      const vol = volumeRef.current
      const w = canvas.offsetWidth, h = canvas.offsetHeight
      const cx = w / 2, cy = h / 2
      const baseR = Math.min(w, h) * 0.42

      ctx.clearRect(0, 0, w, h)

      let r = baseR
      let glowRGB = '59, 130, 246'
      let glowInt = 0.48
      let speed = 0.012

      switch (state) {
        case 'listening':
          r = baseR + Math.sin(t * 10) * baseR * 0.07 + vol * baseR * 0.28
          glowRGB = '6, 182, 212'; glowInt = 0.92; speed = 0.03; break
        case 'thinking':
          r = baseR + Math.sin(t * 4) * baseR * 0.035
          glowRGB = '139, 92, 246'; glowInt = 0.82; speed = 0.025; break
        case 'speaking':
          r = baseR + Math.sin(t * 7) * baseR * 0.05 + Math.sin(t * 13) * baseR * 0.018
          glowRGB = '16, 185, 129'; glowInt = 0.95; speed = 0.022; break
        case 'offline':
          r = baseR * 0.88; glowRGB = '71, 85, 105'; glowInt = 0.1; break
        default:
          r = baseR + Math.sin(t * 1.8) * baseR * 0.022; glowInt = 0.44
      }

      t += speed

      // Outer glow — 5 layers
      ;[5, 4, 3, 2, 1].forEach(i => {
        const ring = r + i * 17
        const a = (glowInt * 0.09) / i
        const g = ctx.createRadialGradient(cx, cy, ring * 0.55, cx, cy, ring)
        g.addColorStop(0, `rgba(${glowRGB}, ${a})`)
        g.addColorStop(1, `rgba(${glowRGB}, 0)`)
        ctx.beginPath(); ctx.arc(cx, cy, ring, 0, Math.PI * 2)
        ctx.fillStyle = g; ctx.fill()
      })

      // Orb body
      const grad = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.3, r * 0.04, cx, cy, r)
      const palettes: Record<OrbState, [string, string, string, string]> = {
        idle:      ['rgba(219,234,254,0.98)', 'rgba(147,197,253,0.92)', 'rgba(59,130,246,0.85)',  'rgba(23,37,84,0.6)'],
        listening: ['rgba(207,250,254,0.98)', 'rgba(103,232,249,0.92)', 'rgba(6,182,212,0.85)',   'rgba(8,51,68,0.6)'],
        thinking:  ['rgba(237,233,254,0.98)', 'rgba(196,181,253,0.92)', 'rgba(139,92,246,0.85)',  'rgba(46,16,101,0.6)'],
        speaking:  ['rgba(209,250,229,0.98)', 'rgba(110,231,183,0.92)', 'rgba(16,185,129,0.85)',  'rgba(2,44,34,0.6)'],
        offline:   ['rgba(148,163,184,0.45)', 'rgba(100,116,139,0.35)', 'rgba(71,85,105,0.25)',   'rgba(30,41,59,0.4)'],
      }
      const [c0, c1, c2, c3] = palettes[state]
      grad.addColorStop(0, c0); grad.addColorStop(0.3, c1)
      grad.addColorStop(0.72, c2); grad.addColorStop(1, c3)
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = grad; ctx.fill()

      // Thinking rings
      if (state === 'thinking') {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 2.5)
        ctx.beginPath(); ctx.arc(0, 0, r + 12, 0, Math.PI * 1.65)
        ctx.strokeStyle = 'rgba(167,139,250,0.78)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke()
        ctx.restore()
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(-t * 1.75)
        ctx.beginPath(); ctx.arc(0, 0, r + 21, 0, Math.PI * 0.9)
        ctx.strokeStyle = 'rgba(139,92,246,0.4)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.stroke()
        ctx.restore()
      }

      // Highlight top-left
      const hl1 = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.38, 0, cx - r * 0.18, cy - r * 0.2, r * 0.62)
      hl1.addColorStop(0, 'rgba(255,255,255,0.33)'); hl1.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = hl1; ctx.fill()

      // Highlight bottom-right (secondary)
      const hl2 = ctx.createRadialGradient(cx + r * 0.3, cy + r * 0.28, 0, cx + r * 0.18, cy + r * 0.15, r * 0.35)
      hl2.addColorStop(0, 'rgba(255,255,255,0.09)'); hl2.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = hl2; ctx.fill()

      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])

  // Waveform canvas — runs once, reads state from ref
  useEffect(() => {
    const canvas = waveCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let t = 0
    let animId: number

    const draw = () => {
      const state = orbStateRef.current
      const vol = volumeRef.current
      const w = canvas.offsetWidth, h = canvas.offsetHeight
      ctx.clearRect(0, 0, w, h)

      const bars = 32
      const barW = 3
      const totalGap = w - bars * barW
      const gap = totalGap / (bars + 1)

      const colorMap: Record<OrbState, string> = {
        idle: '59,130,246', listening: '6,182,212',
        thinking: '139,92,246', speaking: '16,185,129', offline: '71,85,105',
      }
      const color = colorMap[state]

      for (let i = 0; i < bars; i++) {
        const x = gap + i * (barW + gap)
        const mid = (bars - 1) / 2
        const shape = 1 - Math.abs(i - mid) / mid * 0.5 // center bars taller

        let barH: number
        switch (state) {
          case 'idle':
            barH = 3 + Math.sin(t * 1.4 + i * 0.55) * 2.5
            break
          case 'listening': {
            const react = vol * 80 + 6
            barH = react * shape * (0.75 + Math.random() * 0.25)
            barH = Math.max(3, Math.min(h * 0.88, barH))
            break
          }
          case 'thinking':
            barH = 5 + Math.abs(Math.sin(t * 2.8 + i * 0.42)) * 13 * shape
            break
          case 'speaking':
            barH = 5 + Math.abs(Math.sin(t * 4.5 + i * 0.65)) * 22 * shape + Math.random() * 4
            barH = Math.min(h * 0.9, barH)
            break
          default:
            barH = 2
        }

        const alpha = state === 'offline' ? 0.1 : state === 'idle' ? 0.2 : 0.68

        // Gradient fill per bar
        const grd = ctx.createLinearGradient(0, h / 2 - barH / 2, 0, h / 2 + barH / 2)
        grd.addColorStop(0, `rgba(${color},${alpha * 0.5})`)
        grd.addColorStop(0.5, `rgba(${color},${alpha})`)
        grd.addColorStop(1, `rgba(${color},${alpha * 0.5})`)
        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.roundRect(x, h / 2 - barH / 2, barW, barH, 1.5)
        ctx.fill()
      }

      t += 0.042
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animId)
  }, [])

  const stopMic = useCallback(() => {
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    micStreamRef.current = null
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
    analyserRef.current = null
    setVolume(0)
  }, [])

  const sendToJarvis = useCallback(async (text: string) => {
    const BACKEND = window.location.origin
    setOrbState('thinking')
    setStatusText('Processando...')

    try {
      const res = await fetch(`${BACKEND}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: SESSION_ID }),
      })
      if (!res.ok) throw new Error('Backend error')

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let full = ''

      setOrbState('speaking')
      setStatusText('Respondendo...')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setResponse(full)
      }

      setMsgCount(c => c + 1)

      if ('speechSynthesis' in window && full.trim()) {
        window.speechSynthesis.cancel()
        const utt = new SpeechSynthesisUtterance(full)
        utt.lang = 'pt-BR'; utt.rate = 1.05; utt.pitch = 0.88
        const voices = window.speechSynthesis.getVoices()
        const pt = voices.find(v => v.lang.startsWith('pt'))
        if (pt) utt.voice = pt
        utt.onend = () => { setOrbState('idle'); setStatusText('Toque para falar') }
        window.speechSynthesis.speak(utt)
      } else {
        setOrbState('idle'); setStatusText('Toque para falar')
      }
    } catch {
      setOrbState('offline'); setStatusText('PC offline — ligue o computador')
      setTimeout(() => { setOrbState('idle'); setStatusText('Toque para falar') }, 4000)
    }
  }, [])

  const startListening = useCallback(async () => {
    if (!isOnline || orbState !== 'idle') return
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRec) { alert('Use o Chrome para reconhecimento de voz.'); return }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      const actx = new AudioContext()
      const analyser = actx.createAnalyser()
      analyser.fftSize = 256
      actx.createMediaStreamSource(stream).connect(analyser)
      audioCtxRef.current = actx; analyserRef.current = analyser
      const tick = () => {
        if (!analyserRef.current) return
        const d = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(d)
        setVolume(d.reduce((a, b) => a + b, 0) / d.length / 255)
        requestAnimationFrame(tick)
      }
      tick()
    } catch {}

    transcriptRef.current = ''
    setTranscript(''); setResponse('')

    const rec = new SpeechRec()
    rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = false
    recognitionRef.current = rec

    rec.onstart = () => { setOrbState('listening'); setStatusText('Ouvindo...') }
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join('')
      transcriptRef.current = t; setTranscript(t)
    }
    rec.onend = () => {
      stopMic()
      const final = transcriptRef.current.trim()
      if (final) sendToJarvis(final)
      else { setOrbState('idle'); setStatusText('Toque para falar') }
    }
    rec.onerror = () => { stopMic(); setOrbState('idle'); setStatusText('Toque para falar') }
    rec.start()
  }, [isOnline, orbState, stopMic, sendToJarvis])

  const handleTap = () => {
    if (orbState === 'offline') return
    if (orbState === 'listening') { recognitionRef.current?.stop(); return }
    if (orbState === 'speaking') { window.speechSynthesis?.cancel(); setOrbState('idle'); setStatusText('Toque para falar'); return }
    if (orbState === 'idle') startListening()
  }

  const clearMemory = async () => {
    try {
      await fetch(`${window.location.origin}/memory/${SESSION_ID}`, { method: 'DELETE' })
      setResponse(''); setTranscript(''); setMsgCount(0)
      setStatusText('Memória limpa ✓')
      setTimeout(() => setStatusText('Toque para falar'), 2000)
    } catch {}
  }

  const COLOR: Record<OrbState, string> = {
    idle: '#3B82F6', listening: '#06B6D4', thinking: '#8B5CF6', speaking: '#10B981', offline: '#475569',
  }
  const LABEL: Record<OrbState, string> = {
    idle: 'ONLINE', listening: 'OUVINDO', thinking: 'PROCESSANDO', speaking: 'RESPONDENDO', offline: 'OFFLINE',
  }
  const c = COLOR[orbState]

  return (
    <div className="relative w-full h-screen overflow-hidden select-none flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 50% 25%, #0D1F3C 0%, #060D1A 68%)' }}>

      {/* Background particles */}
      <canvas ref={bgCanvasRef} className="absolute inset-0 pointer-events-none" style={{ opacity: 0.55 }} />

      {/* Edge glow — Siri-style border accent */}
      <div className="absolute inset-0 pointer-events-none" style={{
        boxShadow: `inset 0 0 60px ${c}18, inset 0 0 120px ${c}08`,
        transition: 'box-shadow 1s ease',
      }} />

      {/* HUD corner accents */}
      {(['tl', 'tr', 'bl', 'br'] as const).map(pos => (
        <div key={pos} className="absolute pointer-events-none" style={{
          top: pos.startsWith('t') ? 0 : 'auto',
          bottom: pos.startsWith('b') ? 0 : 'auto',
          left: pos.endsWith('l') ? 0 : 'auto',
          right: pos.endsWith('r') ? 0 : 'auto',
          width: 28, height: 28,
          borderTop: pos.startsWith('t') ? `1px solid ${c}50` : 'none',
          borderBottom: pos.startsWith('b') ? `1px solid ${c}50` : 'none',
          borderLeft: pos.endsWith('l') ? `1px solid ${c}50` : 'none',
          borderRight: pos.endsWith('r') ? `1px solid ${c}50` : 'none',
          transition: 'border-color 1s ease',
          margin: 12,
        }} />
      ))}

      {/* ─── TOP BAR ─── */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-5 pb-2">
        <span className="font-orbitron text-[11px] tracking-[0.4em] font-black" style={{ color: c, transition: 'color 0.8s' }}>
          J A R V I S
        </span>
        <span className="font-mono-custom text-2xl font-bold tabular-nums" style={{ color: c, opacity: 0.92, letterSpacing: '0.06em', transition: 'color 0.8s' }}>
          {timeStr}
        </span>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{
            background: c, boxShadow: `0 0 7px ${c}`,
            animation: orbState !== 'offline' ? 'pulse 2s infinite' : 'none',
            transition: 'background 0.8s',
          }} />
          <span className="font-mono-custom text-[9px] tracking-[0.25em]" style={{ color: c, opacity: 0.7, transition: 'color 0.8s' }}>
            {LABEL[orbState]}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="relative z-10 mx-5" style={{
        height: '1px',
        background: `linear-gradient(90deg, transparent, ${c}45, transparent)`,
        transition: 'background 0.8s',
      }} />

      {/* ─── CENTER ─── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-0">

        {/* Transcript */}
        {transcript && (
          <div className="absolute top-3 left-5 right-5 text-center" style={{ animation: 'fadeInUp 0.25s ease' }}>
            <p className="font-mono-custom text-[11px] text-slate-400 italic leading-relaxed">
              &ldquo;{transcript}&rdquo;
            </p>
          </div>
        )}

        {/* Orb */}
        <button
          onClick={handleTap}
          className="relative focus:outline-none"
          style={{
            width: 'min(56vw, 230px)',
            height: 'min(56vw, 230px)',
            cursor: orbState === 'offline' ? 'not-allowed' : 'pointer',
          }}
          aria-label="Falar com Jarvis"
        >
          <canvas ref={orbCanvasRef} className="w-full h-full" />
        </button>

        {/* Waveform */}
        <div style={{ width: 'min(78vw, 300px)', height: '42px', marginTop: '18px' }}>
          <canvas ref={waveCanvasRef} className="w-full h-full" />
        </div>

        {/* Status text */}
        <p className="font-mono-custom text-[10px] tracking-[0.22em] text-center mt-2"
          style={{ color: 'rgba(255,255,255,0.28)' }}>
          {statusText}
        </p>
      </div>

      {/* ─── RESPONSE CARD ─── */}
      {response && (
        <div
          className="relative z-10 mx-4 mb-3 max-h-40 overflow-y-auto rounded-2xl p-4"
          style={{
            background: 'rgba(10,18,38,0.88)',
            border: `1px solid ${c}28`,
            backdropFilter: 'blur(16px)',
            boxShadow: `0 0 30px ${c}12`,
            animation: 'fadeInUp 0.35s ease',
            transition: 'border-color 0.8s, box-shadow 0.8s',
          }}
        >
          <p className="font-mono-custom text-[12px] text-slate-200 leading-relaxed">{response}</p>
        </div>
      )}

      {/* ─── BOTTOM BAR ─── */}
      <div className="relative z-10 flex items-center justify-between px-5 pb-5">
        <span className="font-mono-custom text-[9px] tracking-widest capitalize"
          style={{ color: 'rgba(255,255,255,0.16)' }}>
          {dateStr}
        </span>
        <button
          onClick={clearMemory}
          className="font-mono-custom text-[9px] tracking-widest transition-all duration-200"
          style={{ color: 'rgba(255,255,255,0.16)' }}
          onMouseEnter={e => ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.42)')}
          onMouseLeave={e => ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.16)')}
        >
          LIMPAR MEMÓRIA
        </button>
        <span className="font-mono-custom text-[9px] tracking-widest"
          style={{ color: 'rgba(255,255,255,0.16)' }}>
          {msgCount > 0 ? `${msgCount} msg` : 'v1.0'}
        </span>
      </div>
    </div>
  )
}
