import { useRef, useEffect } from 'react'
import './ParticleField.css'

// Lightweight, dependency-free drifting-dots background (with faint links between
// nearby dots). Sits behind the auth card; pointer-events none so the form stays
// interactive. Honours prefers-reduced-motion by rendering a single static frame.
export default function ParticleField() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const LINK_DIST = 130
    let width = 0
    let height = 0
    let particles = []
    let raf = 0

    function resize() {
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(96, Math.max(36, Math.round((width * height) / 22000)))
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.5 + 0.6,
        accent: Math.random() < 0.16,
      }))
    }

    function draw(animate) {
      ctx.clearRect(0, 0, width, height)

      // Faint links between nearby dots (the "constellation" effect).
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < LINK_DIST * LINK_DIST) {
            const alpha = (1 - Math.sqrt(d2) / LINK_DIST) * 0.11
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      // Dots
      for (const p of particles) {
        if (animate) {
          p.x += p.vx
          p.y += p.vy
          if (p.x < 0) p.x += width
          else if (p.x > width) p.x -= width
          if (p.y < 0) p.y += height
          else if (p.y > height) p.y -= height
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = p.accent ? 'rgba(74, 158, 255, 0.55)' : 'rgba(220, 225, 235, 0.5)'
        ctx.fill()
      }
    }

    function loop() {
      draw(true)
      raf = requestAnimationFrame(loop)
    }

    resize()
    if (reduce) draw(false)
    else loop()

    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="particle-field" aria-hidden="true" />
}
