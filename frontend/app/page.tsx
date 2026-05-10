'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'offline'

const BACKEND_URL = typeof window !== 'undefined'
  ? window.location.origin
  : 'http://localhost:3131'
const SESSION_ID = 'derek-main'

export default function Jarvis() {
  const [orbState, setOrbState] = useState<OrbState>('idle')
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [statusText, setStatusText] = useState('Toque para falar')
  const [isOnline, setIsOnline] = useState(true)
  const [volume, setVolume] = useState(0)

  const recognitionRef = useRef<any>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const transcriptRef = useRef('')
  const animFrameRef = useRef<number>(0)

  // Check backend health
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(3000) })
        setIsOnline(res.ok)
        setOrbState(prev => prev === 'offline' && res.ok ? 'idle' : prev === 'offline' ? 'offline' : prev)
      } catch {
        setIsOnline(false)
        setOrbState('offline')
      }
    }
    check()
    const id = setInterval(check, 10000)
    return () => clearInterval(id)
  }, [])

  // Canvas orb animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let time = 0
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
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      const cx = w / 2
      const cy = h / 2
      const baseR = Math.min(w, h) * 0.42

      ctx.clearRect(0, 0, w, h)

      let r = baseR
      let glowColor = '59, 130, 246'
      let glowInt = 0.5
      let speed = 0.012

      if (orbState === 'listening') {
        r = baseR + Math.sin(time * 10) * baseR * 0.06 + volume * baseR * 0.18
        glowColor = '6, 182, 212'
        glowInt = 0.85
        speed = 0.03
      } else if (orbState === 'thinking') {
        r = baseR + Math.sin(time * 4) * baseR * 0.035
        glowColor = '139, 92, 246'
        glowInt = 0.75
        speed = 0.025
      } else if (orbState === 'speaking') {
        r = baseR + Math.sin(time * 7) * baseR * 0.045 + volume * baseR * 0.1
        glowColor = '16, 185, 129'
        glowInt = 0.9
        speed = 0.022
      } else if (orbState === 'offline') {
        r = baseR * 0.92
        glowColor = '71, 85, 105'
        glowInt = 0.15
      } else {
        r = baseR + Math.sin(time * 1.8) * baseR * 0.022
        glowInt = 0.38
      }

      time += speed

      // Outer glow rings
      ;[3, 2, 1].forEach(i => {
        const ring = r + i * 22
        const alpha = (glowInt * 0.12) / i
        const g = ctx.createRadialGradient(cx, cy, ring * 0.5, cx, cy, ring)
        g.addColorStop(0, `rgba(${glowColor}, ${alpha})`)
        g.addColorStop(1, `rgba(${glowColor}, 0)`)
        ctx.beginPath()
        ctx.arc(cx, cy, ring, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.fill()
      })

      // Main orb
      const grad = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.3, r * 0.04, cx, cy, r)
      if (orbState === 'listening') {
        grad.addColorStop(0, 'rgba(165, 243, 252, 0.95)')
        grad.addColorStop(0.45, 'rgba(6, 182, 212, 0.88)')
        grad.addColorStop(1, 'rgba(8, 51, 68, 0.65)')
      } else if (orbState === 'thinking') {
        grad.addColorStop(0, 'rgba(221, 214, 254, 0.95)')
        grad.addColorStop(0.45, 'rgba(139, 92, 246, 0.88)')
        grad.addColorStop(1, 'rgba(46, 16, 101, 0.65)')
      } else if (orbState === 'speaking') {
        grad.addColorStop(0, 'rgba(187, 247, 208, 0.95)')
        grad.addColorStop(0.45, 'rgba(16, 185, 129, 0.88)')
        grad.addColorStop(1, 'rgba(2, 44, 34, 0.65)')
      } else if (orbState === 'offline') {
        grad.addColorStop(0, 'rgba(148, 163, 184, 0.45)')
        grad.addColorStop(1, 'rgba(30, 41, 59, 0.4)')
      } else {
        grad.addColorStop(0, 'rgba(186, 230, 253, 0.92)')
        grad.addColorStop(0.45, 'rgba(59, 130, 246, 0.85)')
        grad.addColorStop(1, 'rgba(23, 37, 84, 0.65)')
      }
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()

      // Thinking spinner ring
      if (orbState === 'thinking') {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(time * 2.5)
        ctx.beginPath()
        ctx.arc(0, 0, r + 8, 0, Math.PI * 1.6)
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.7)'
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.stroke()
        ctx.restore()
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(-time * 1.8)
        ctx.beginPath()
        ctx.arc(0, 0, r + 14, 0, Math.PI * 0.8)
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)'
        ctx.lineWidth = 1.5
        ctx.lineCap = 'round'
        ctx.stroke()
        ctx.restore()
      }

      // Highlight
      const hl = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.38, 0, cx - r * 0.18, cy - r * 0.2, r * 0.6)
      hl.addColorStop(0, 'rgba(255,255,255,0.28)')
      hl.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = hl
      ctx.fill()

      animId = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [orbState, volume])

  const stopMic = useCallback(() => {
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    micStreamRef.current = null
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    analyserRef.current = null
    setVolume(0)
  }, [])

  const sendToJarvis = useCallback(async (text: string) => {
    setOrbState('thinking')
    setStatusText('Processando...')

    try {
      const res = await fetch(`${BACKEND_URL}/chat`, {
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

      // TTS
      if ('speechSynthesis' in window && full.trim()) {
        window.speechSynthesis.cancel()
        const utt = new SpeechSynthesisUtterance(full)
        utt.lang = 'pt-BR'
        utt.rate = 1.05
        utt.pitch = 0.88
        const voices = window.speechSynthesis.getVoices()
        const pt = voices.find(v => v.lang.startsWith('pt'))
        if (pt) utt.voice = pt
        utt.onend = () => { setOrbState('idle'); setStatusText('Toque para falar') }
        window.speechSynthesis.speak(utt)
      } else {
        setOrbState('idle')
        setStatusText('Toque para falar')
      }
    } catch {
      setOrbState('offline')
      setStatusText('PC offline — ligue o computador')
      setTimeout(() => { setOrbState('idle'); setStatusText('Toque para falar') }, 4000)
    }
  }, [])

  const startListening = useCallback(async () => {
    if (!isOnline || orbState !== 'idle') return

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRec) { alert('Use o Chrome para reconhecimento de voz.'); return }

    // Mic volume
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      const actx = new AudioContext()
      const analyser = actx.createAnalyser()
      analyser.fftSize = 256
      actx.createMediaStreamSource(stream).connect(analyser)
      audioCtxRef.current = actx
      analyserRef.current = analyser
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
    setTranscript('')
    setResponse('')

    const rec = new SpeechRec()
    rec.lang = 'pt-BR'
    rec.interimResults = true
    rec.continuous = false
    recognitionRef.current = rec

    rec.onstart = () => { setOrbState('listening'); setStatusText('Ouvindo...') }

    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join('')
      transcriptRef.current = t
      setTranscript(t)
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
      await fetch(`${BACKEND_URL}/memory/${SESSION_ID}`, { method: 'DELETE' })
      setResponse(''); setTranscript('')
      setStatusText('Memória limpa ✓')
      setTimeout(() => setStatusText('Toque para falar'), 2000)
    } catch {}
  }

  const colors: Record<OrbState, string> = {
    idle: '#3B82F6', listening: '#06B6D4',
    thinking: '#8B5CF6', speaking: '#10B981', offline: '#475569'
  }
  const labels: Record<OrbState, string> = {
    idle: 'ONLINE', listening: 'OUVINDO',
    thinking: 'PROCESSANDO', speaking: 'RESPONDENDO', offline: 'OFFLINE'
  }

  return (
    <div className="relative w-full h-screen flex flex-col items-center justify-center select-none"
      style={{ background: 'radial-gradient(ellipse at 50% 40%, #0D1F3C 0%, #0F172A 65%)' }}>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 pt-safe pt-5">
        <span className="font-orbitron text-xs tracking-[0.35em] font-black"
          style={{ color: colors[orbState], letterSpacing: '0.35em' }}>
          J A R V I S
        </span>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: colors[orbState],
            boxShadow: `0 0 6px ${colors[orbState]}`, animation: 'pulse 2s infinite' }} />
          <span className="font-mono-custom text-[10px] tracking-widest"
            style={{ color: colors[orbState], opacity: 0.75 }}>
            {labels[orbState]}
          </span>
        </div>
      </div>

      {/* Transcript */}
      {transcript && (
        <div className="absolute top-16 left-6 right-6 text-center" style={{ animation: 'fadeInUp 0.25s ease' }}>
          <p className="font-mono-custom text-xs text-slate-400 italic leading-relaxed">"{transcript}"</p>
        </div>
      )}

      {/* Orb */}
      <button
        onClick={handleTap}
        className="relative focus:outline-none"
        style={{ width: 'min(65vw, 280px)', height: 'min(65vw, 280px)', cursor: orbState === 'offline' ? 'not-allowed' : 'pointer' }}
        aria-label="Falar com Jarvis"
      >
        <canvas ref={canvasRef} className="w-full h-full" />
      </button>

      {/* Status */}
      <p className="mt-7 font-mono-custom text-xs tracking-[0.2em] text-center"
        style={{ color: 'rgba(255,255,255,0.32)' }}>
        {statusText}
      </p>

      {/* Response box */}
      {response && (
        <div className="absolute bottom-20 left-5 right-5 max-h-44 overflow-y-auto rounded-2xl p-4"
          style={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(12px)', animation: 'fadeInUp 0.35s ease' }}>
          <p className="font-mono-custom text-[13px] text-slate-200 leading-relaxed">{response}</p>
        </div>
      )}

      {/* Clear memory */}
      <button onClick={clearMemory}
        className="absolute bottom-7 font-mono-custom text-[10px] tracking-widest transition-all duration-200"
        style={{ color: 'rgba(255,255,255,0.18)' }}
        onMouseEnter={e => ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.45)')}
        onMouseLeave={e => ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.18)')}>
        LIMPAR MEMÓRIA
      </button>
    </div>
  )
}
