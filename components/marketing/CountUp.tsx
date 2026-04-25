'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  to: number
  decimals?: number
  duration?: number
  suffix?: string
  prefix?: string
  className?: string
}

export function CountUp({ to, decimals = 0, duration = 1400, suffix = '', prefix = '', className }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const [val, setVal] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !started.current) {
            started.current = true
            const start = performance.now()
            const tick = (t: number) => {
              const p = Math.min(1, (t - start) / duration)
              const eased = 1 - Math.pow(1 - p, 3)
              setVal(eased * to)
              if (p < 1) requestAnimationFrame(tick)
              else setVal(to)
            }
            requestAnimationFrame(tick)
            obs.disconnect()
          }
        }
      },
      { threshold: 0.4 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [to, duration])

  return (
    <span ref={ref} className={className}>
      {prefix}
      {val.toFixed(decimals)}
      {suffix}
    </span>
  )
}
