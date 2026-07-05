'use client'

import { useEffect } from 'react'

// Drop this once into a (server) page and give blocks the `reveal` class; they
// fade and rise into view on scroll, matching the landing. Renders nothing.
export default function RevealOnScroll() {
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible')
            obs.unobserve(e.target)
          }
        }),
      { threshold: 0.12 },
    )
    document.querySelectorAll('.reveal').forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])
  return null
}
