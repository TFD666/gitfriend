import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  MessageSquare,
  FileText,
  Globe,
  Activity,
  GitBranch,
  GitPullRequest,
} from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { motion, useReducedMotion } from 'framer-motion'
import { GithubIcon, LinkedinIcon } from '../components/ui/BrandIcons'
import FixedCardBg from '../components/ui/FixedCardBg'
import logo from '../assets/logo.png'
import { getMe } from '../api/auth'
import { API_BASE } from '../api/client'

gsap.registerPlugin(ScrollTrigger, SplitText)

// ── Constants ─────────────────────────────────────────────────────────────────

const LINKS = {
  github:        'https://github.com/Sleeping-bear',
  linkedin:      'https://linkedin.com/in/placeholder',
  publicProject: null,
}

const FEATURES = [
  { icon: MessageSquare, name: 'Mentor Mode',          desc: 'Ask anything about your codebase in plain English. Gets cited answers from the actual source.' },
  { icon: FileText,      name: 'Career Mode',          desc: 'Generates portfolio summaries, resume bullets, and interview prep — straight from your indexed code.' },
  { icon: Globe,         name: 'Public Career Page',   desc: 'Share your work at a readable URL. No login required for visitors.' },
  { icon: Activity,      name: 'Repo Health',          desc: 'Surfaces complexity hotspots and stale files. Know where the risk lives before it becomes a bug.' },
  { icon: GitBranch,     name: 'Architecture Diagrams',desc: 'AI-generated system architecture and dependency graphs, rendered as Mermaid. Export-ready.' },
  { icon: GitPullRequest,name: 'PR Review',            desc: 'RAG-augmented code review with inline comments. Optionally posts back to GitHub as a real review.' },
]

const STEPS = [
  { num: '01', name: 'Connect', desc: 'Authenticate with GitHub and select a repo. DevKit only reads your code — no write access.' },
  { num: '02', name: 'Index',   desc: 'DevKit chunks your codebase, generates embeddings, and stores them in a vector DB. Takes about a minute.' },
  { num: '03', name: 'Use',     desc: 'Ask questions, generate portfolio content, analyze repo health, review PRs. Everything in one place.' },
]

// ── Isometric stack ───────────────────────────────────────────────────────────

const ISO_LAYERS = [
  { id: 'diagrams', label: 'Diagrams + PR', Icon: GitBranch,    c1: '#06B6D4', c2: '#0891B2' },
  { id: 'health',   label: 'Repo Health',   Icon: Activity,      c1: '#F59E0B', c2: '#D97706' },
  { id: 'career',   label: 'Career Mode',   Icon: FileText,      c1: '#3B82F6', c2: '#2563EB' },
  { id: 'mentor',   label: 'Mentor Mode',   Icon: MessageSquare, c1: '#7C6AF5', c2: '#6D5CE6' },
]

function IsoStack({ stackRef }) {
  return (
    // Container pushed to flex-end so layers extend upward without clipping
    <div style={{
      flex: '0 0 auto',
      width: '420px',
      minHeight: '460px',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: '80px',
    }}>
      {/* perspective() in transform = "local perspective", avoids inheritance issues */}
      <div
        ref={stackRef}
        style={{
          transform: 'perspective(1000px) rotateX(55deg) rotateZ(-35deg)',
          transformStyle: 'preserve-3d',
          position: 'relative',
          width: '280px',
          height: '60px',
        }}
      >
        {ISO_LAYERS.map((layer, i) => {
          const { Icon, c1, c2, label, id } = layer
          return (
            // No inline translateZ — GSAP owns z-position for scroll animation
            <div
              key={id}
              className="iso-layer"
              style={{
                position: 'absolute',
                inset: 0,
                transformStyle: 'preserve-3d',
                willChange: 'transform',
              }}
            >
              {/* Top face */}
              <div style={{
                width: '280px',
                height: '60px',
                background: '#111113',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 2px 20px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06)',
              }}>
                {/* Colored gradient stripe */}
                <div style={{
                  position: 'absolute',
                  left: 0, top: 0,
                  width: '56px',
                  height: '100%',
                  background: `linear-gradient(150deg, ${c1}, ${c2})`,
                  borderRadius: '12px 0 0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={18} color="rgba(255,255,255,0.92)" />
                </div>

                {/* Layer label */}
                <span style={{
                  paddingLeft: '72px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#FAFAFA',
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                }}>
                  {label}
                </span>
              </div>

              {/* Front face — bottom edge visible in isometric view */}
              <div style={{
                position: 'absolute',
                bottom: '-1px',
                left: '12px',
                right: '12px',
                height: '90px',
                background: `linear-gradient(180deg, ${c1}28, ${c2}0a)`,
                transform: 'rotateX(90deg)',
                transformOrigin: 'top center',
                borderRadius: '0 0 4px 4px',
                pointerEvents: 'none',
              }} />
            </div>
          )
        })}
      </div>

      {/* Callouts — normal-space HTML positioned over the stack, animated by GSAP */}
      {ISO_LAYERS.map((layer, i) => (
        <div
          key={`callout-${layer.id}`}
          className="iso-callout"
          style={{
            position: 'absolute',
            right: '12px',
            top: `${72 + (3 - i) * 64}px`,
            opacity: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px 4px 8px',
            borderRadius: '6px',
            background: 'rgba(17,17,19,0.85)',
            border: `1px solid ${layer.c1}35`,
            backdropFilter: 'blur(4px)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: layer.c1, flexShrink: 0 }} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: layer.c1, whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
            {layer.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── ShimmerCTA ────────────────────────────────────────────────────────────────

function ShimmerCTA({ href, children, className, style }) {
  const [hovered, setHovered] = useState(false)
  const prefersReduced = useReducedMotion()

  return (
    <motion.a
      href={href}
      className={className || 'btn-primary'}
      style={{ position: 'relative', overflow: 'hidden', textDecoration: 'none', ...style }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
    >
      {children}
      {!prefersReduced && (
        <motion.span
          initial={{ x: '-150%' }}
          animate={{ x: hovered ? '250%' : '-150%' }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            top: '-50%',
            left: 0,
            width: '35%',
            height: '200%',
            background: 'linear-gradient(105deg, transparent, rgba(255,255,255,0.22), transparent)',
            transform: 'skewX(-20deg)',
            pointerEvents: 'none',
          }}
        />
      )}
    </motion.a>
  )
}

// ── FeatureCard ───────────────────────────────────────────────────────────────

function FeatureCard({ icon: Icon, name, desc }) {
  const prefersReduced = useReducedMotion()

  return (
    <motion.div
      variants={{
        hidden: { y: 40, opacity: 0 },
        visible: { y: 0, opacity: 1, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
        hover:   !prefersReduced
          ? { y: -6, boxShadow: 'inset 0 0 0 1px var(--border-focus)', transition: { type: 'spring', stiffness: 300, damping: 20 } }
          : {},
      }}
      whileHover={prefersReduced ? undefined : 'hover'}
      style={{ background: 'var(--bg-base)', padding: '24px', position: 'relative', overflow: 'hidden', cursor: 'default' }}
    >
      <motion.div
        variants={{
          hidden:   { opacity: 0 },
          visible:  { opacity: 0 },
          hover:    { opacity: 1, transition: { duration: 0.2 } },
        }}
        style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 30% 30%, var(--accent-subtle), transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      <motion.div
        variants={{
          hidden:  { scale: 1 },
          visible: { scale: 1 },
          hover:   { scale: 1.15, transition: { type: 'spring', stiffness: 400, damping: 15 } },
        }}
        style={{ display: 'inline-block', position: 'relative' }}
      >
        <Icon size={20} style={{ color: 'var(--accent)' }} />
      </motion.div>

      <div style={{ fontSize: '14px', fontWeight: 600, margin: '10px 0 6px', color: 'var(--text-primary)', position: 'relative' }}>
        {name}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, position: 'relative' }}>
        {desc}
      </div>
    </motion.div>
  )
}

// ── LandingPage ───────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate      = useNavigate()
  const [params]      = useSearchParams()
  const error         = params.get('error')
  const prefersReduced = useReducedMotion()

  const containerRef  = useRef(null)
  const heroRef       = useRef(null)
  const dotGridRef    = useRef(null)
  const line1Ref      = useRef(null)
  const line2Ref      = useRef(null)
  const step1NumRef   = useRef(null)
  const step2NumRef   = useRef(null)
  const step3NumRef   = useRef(null)
  const isoStackRef   = useRef(null)  // for future ScrollTrigger pin

  const { data: me, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    retry: false,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (me && !isLoading) navigate('/dashboard', { replace: true })
  }, [me, isLoading, navigate])

  // ── GSAP animations ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isLoading || me || !line1Ref.current || !dotGridRef.current) return

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()

      // Reduced motion: show layers fully separated (no animation)
      mm.add('(prefers-reduced-motion: reduce)', () => {
        const layers = gsap.utils.toArray('.iso-layer')
        layers.forEach((el, i) => gsap.set(el, { z: i * 90 }))
        gsap.utils.toArray('.iso-callout').forEach(el => gsap.set(el, { opacity: 1 }))
      })

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // ── Iso stack: start collapsed, separate on scroll ─────────────────
        const layers = gsap.utils.toArray('.iso-layer')
        const callouts = gsap.utils.toArray('.iso-callout')
        const GAP = 90

        // GPU-init: force3D primes the compositor layer before any scroll
        gsap.set(layers, { z: 0, force3D: true })
        gsap.set(callouts, { opacity: 0, x: 12 })

        // quickSetters write directly to the element style — no GSAP tick overhead
        const setZ       = layers.map(el => gsap.quickSetter(el, 'z', 'px'))
        const setOpacity = callouts.map(el => gsap.quickSetter(el, 'opacity'))
        const setX       = callouts.map(el => gsap.quickSetter(el, 'x', 'px'))

        const ease = gsap.parseEase('power2.inOut')
        // Normalized progress at which each callout fades in — matches layer visual order:
        // diagrams(0,base)=early, health(1)=25%, career(2)=50%, mentor(3)=72%
        const calloutThresholds = [0.05, 0.25, 0.5, 0.72]

        ScrollTrigger.create({
          trigger: heroRef.current,
          pin: true,
          start: 'top top',
          end: '+=1200',
          anticipatePin: 1,
          onUpdate(self) {
            const p = ease(self.progress)

            // All 3 moving layers update simultaneously at ease-mapped progress
            setZ[1](GAP * p)
            setZ[2](GAP * 2 * p)
            setZ[3](GAP * 3 * p)

            // Each callout fades over a 15% progress window past its threshold
            callouts.forEach((_, i) => {
              const localP = Math.min(1, Math.max(0, (self.progress - calloutThresholds[i]) / 0.15))
              setOpacity[i](localP)
              setX[i](12 * (1 - localP))
            })
          },
        })

        // Headline: word-by-word reveal — translateY 30→0, opacity 0→1, stagger 80ms
        const split1 = SplitText.create(line1Ref.current, { type: 'words' })
        const split2 = SplitText.create(line2Ref.current, { type: 'words' })

        const headlineTl = gsap.timeline({ delay: 0.2 })
        headlineTl
          .from(split1.words, { y: 30, opacity: 0, stagger: 0.08, duration: 0.6, ease: 'power3.out' })
          .from(split2.words, { y: 30, opacity: 0, stagger: 0.08, duration: 0.6, ease: 'power3.out' }, '+=0.05')

        // Dot grid: fade only during pin duration (no yPercent — hero is pinned)
        gsap.to(dotGridRef.current, {
          opacity: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: heroRef.current,
            start: 'top top',
            end: '+=1200',
            scrub: true,
          },
        })

        // Section headings slide in from left
        gsap.utils.toArray('.section-heading').forEach(el => {
          gsap.from(el, {
            x: -40,
            opacity: 0,
            duration: 0.7,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: el,
              start: 'top 88%',
              once: true,
            },
          })
        })

        // Step number count-up
        ;[
          { ref: step1NumRef, target: 1 },
          { ref: step2NumRef, target: 2 },
          { ref: step3NumRef, target: 3 },
        ].forEach(({ ref, target }) => {
          const obj = { v: 0 }
          gsap.to(obj, {
            v: target,
            duration: 0.8,
            ease: 'power2.out',
            scrollTrigger: { trigger: ref.current, start: 'top 85%', once: true },
            onUpdate() {
              if (ref.current) {
                ref.current.textContent = String(Math.round(obj.v)).padStart(2, '0')
              }
            },
          })
        })

        document.fonts.ready.then(() => ScrollTrigger.refresh())
      })
    })

    return () => ctx.revert()
  }, [isLoading, me])

  if (isLoading) return <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }} />
  if (me) return null

  const oauthUrl = `${API_BASE}/api/v1/auth/github/authorize`

  const gridV = {
    hidden:  {},
    visible: { transition: { staggerChildren: 0.07 } },
  }

  return (
    <div
      ref={containerRef}
      style={{
        background: `
          radial-gradient(ellipse at 30% 40%, #2d1060 0%, #1a0f3c 35%, #09090B 75%),
          radial-gradient(ellipse at 80% 60%, #0f1a3c 0%, transparent 60%)
        `,
        minHeight: '100vh',
        color: 'var(--text-primary)',
        scrollBehavior: 'smooth',
        position: 'relative',
      }}
    >
      <FixedCardBg />
      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '52px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(9,9,11,0.85)', backdropFilter: 'blur(8px)',
        zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src={logo} alt="DevKit AI" style={{ height: '36px', width: '36px', borderRadius: '10px', mixBlendMode: 'screen' }} />
          <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>DevKit AI</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <a href={LINKS.github} target="_blank" rel="noopener noreferrer"
            className="btn-ghost" style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>
            <GithubIcon size={16} />
          </a>
          <a href={LINKS.linkedin} target="_blank" rel="noopener noreferrer"
            className="btn-ghost" style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>
            <LinkedinIcon size={16} />
          </a>
          <motion.a
            href={oauthUrl}
            className="btn-primary"
            style={{ padding: '5px 12px', fontSize: '13px', textDecoration: 'none' }}
            animate={prefersReduced ? undefined : {
              boxShadow: [
                '0 0 0px 0px rgba(124,106,245,0)',
                '0 0 10px 3px rgba(124,106,245,0.45)',
                '0 0 0px 0px rgba(124,106,245,0)',
              ],
            }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.5 }}
          >
            Sign in →
          </motion.a>
        </div>
      </nav>

      {/* ── Content wrapper ─────────────────────────────────── */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px' }}>

        {/* ── Hero ──────────────────────────────────────────── */}
        <section
          ref={heroRef}
          style={{
            minHeight: 'calc(100vh - 52px)', marginTop: '52px',
            display: 'flex', alignItems: 'center',
            padding: '80px 0 64px', position: 'relative', overflow: 'hidden',
          }}
        >
          {/* Dot grid — GSAP parallax target */}
          <div
            ref={dotGridRef}
            style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
              opacity: 0.4, pointerEvents: 'none',
            }}
          />

          {/* Two-column layout: text left, 3D stack right */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '48px', width: '100%' }}>

            {/* Left: copy */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Eyebrow */}
              <div style={{
                fontFamily: "'Geist Mono', monospace", fontSize: '12px', fontWeight: 500,
                color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: '24px',
              }}>
                ✦ RAG-powered codebase intelligence
              </div>

              {/* Headline */}
              <h1 style={{ fontSize: 'clamp(28px, 4.5vw, 44px)', fontWeight: 700, lineHeight: 1.1, margin: 0, color: 'var(--text-primary)' }}>
                <span ref={line1Ref} style={{ display: 'block' }}>Understand your codebase.</span>
                <span ref={line2Ref} style={{ display: 'block' }}>Build your portfolio.</span>
              </h1>

              {/* Subheadline */}
              <p style={{
                fontSize: '15px', color: 'var(--text-secondary)', maxWidth: '460px',
                lineHeight: 1.65, marginTop: '20px',
              }}>
                DevKit AI indexes your GitHub repos, powers natural-language Q&amp;A
                over your code, and turns your work into shareable portfolio content —
                resume bullets, architecture diagrams, and AI code reviews included.
              </p>

              {/* CTA row */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '32px', flexWrap: 'wrap' }}>
                <ShimmerCTA href={oauthUrl}>
                  <GithubIcon size={15} style={{ marginRight: '6px' }} />
                  Connect GitHub
                </ShimmerCTA>
                {LINKS.publicProject && (
                  <a href={LINKS.publicProject} className="btn-secondary" style={{ textDecoration: 'none' }}>
                    See an example ↗
                  </a>
                )}
              </div>
            </div>

            {/* Right: isometric 3D layer stack */}
            <IsoStack stackRef={isoStackRef} />
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────── */}
        <section style={{ padding: '80px 0', borderTop: '1px solid var(--border-subtle)' }}>
          <div
            className="section-heading"
            style={{
              fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500,
              textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.08em',
              marginBottom: '32px',
            }}
          >
            Everything your dev workflow needs
          </div>

          <motion.div
            variants={gridV}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '1px', background: 'var(--border-subtle)',
            }}
          >
            {FEATURES.map(({ icon, name, desc }) => (
              <FeatureCard key={name} icon={icon} name={name} desc={desc} />
            ))}
          </motion.div>
        </section>

        {/* ── How it works ─────────────────────────────────── */}
        <section style={{ padding: '80px 0', borderTop: '1px solid var(--border-subtle)' }}>
          <h2
            className="section-heading"
            style={{
              fontSize: '24px', fontWeight: 700, textAlign: 'center',
              marginBottom: '48px', color: 'var(--text-primary)',
            }}
          >
            Up and running in minutes
          </h2>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1px', background: 'var(--border-subtle)',
          }}>
            {STEPS.map(({ num, name, desc }, i) => {
              const numRef = [step1NumRef, step2NumRef, step3NumRef][i]
              return (
                <div key={num} style={{ background: 'var(--bg-base)', padding: '24px' }}>
                  <div
                    ref={numRef}
                    style={{
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: '28px', fontWeight: 500,
                      color: 'var(--accent)', marginBottom: '12px',
                    }}
                  >
                    {num}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '6px' }}>{desc}</div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Built by ─────────────────────────────────────── */}
        <section style={{ padding: '64px 0', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
          <h3
            className="section-heading"
            style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}
          >
            Built by{' '}
            <span className="mono" style={{ fontSize: '18px', color: 'var(--accent)' }}>Sleeping_bear</span>
          </h3>
          <p style={{
            fontSize: '14px', color: 'var(--text-secondary)',
            maxWidth: '480px', margin: '0 auto', lineHeight: 1.6,
          }}>
            Final-year CSE student at Lovely Professional University.
            DevKit AI is a production-grade full-stack project —{' '}
            <span className="mono">FastAPI</span>,{' '}
            <span className="mono">React</span>,{' '}
            <span className="mono">pgvector</span>,{' '}
            <span className="mono">Gemini</span>,{' '}
            <span className="mono">Redis</span>,{' '}
            <span className="mono">GitHub OAuth</span>{' '}
            — built as proof of engineering depth, not just as a portfolio item.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '24px' }}>
            <a href={LINKS.github} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ textDecoration: 'none' }}>
              <GithubIcon size={15} style={{ marginRight: '4px' }} /> GitHub ↗
            </a>
            <a href={LINKS.linkedin} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ textDecoration: 'none' }}>
              <LinkedinIcon size={15} style={{ marginRight: '4px' }} /> LinkedIn ↗
            </a>
          </div>
        </section>
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid var(--border-subtle)', padding: '24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        maxWidth: '900px', margin: '0 auto',
      }}>
        <img src={logo} alt="DevKit AI" style={{ height: '28px', width: '28px', borderRadius: '8px', mixBlendMode: 'screen' }} />
        <a
          href={oauthUrl}
          style={{ fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'none' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          Sign in with GitHub →
        </a>
      </footer>

      {/* Auth error overlay */}
      {error && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)', padding: '32px',
            maxWidth: '360px', width: '100%', textAlign: 'center',
          }}>
            <p style={{ fontWeight: 600, marginBottom: '8px' }}>Authentication failed</p>
            <p className="mono" style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>{error}</p>
            <ShimmerCTA href={oauthUrl}>
              <GithubIcon size={15} style={{ marginRight: '6px' }} /> Try again with GitHub
            </ShimmerCTA>
          </div>
        </div>
      )}
    </div>
  )
}
