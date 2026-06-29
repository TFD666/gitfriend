import { useEffect, useRef } from 'react'

// All class names prefixed fcard- to avoid collision with page styles.
const STYLES = `
.fcard-scene {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  perspective: 900px;
}
.fcard-wrap {
  position: relative;
  width: 260px; height: 260px;
  animation: fcard-float 5s ease-in-out infinite;
  transform-style: preserve-3d;
}
@keyframes fcard-float {
  0%   { transform: rotateX(18deg) rotateY(-22deg) translateY(0px); }
  50%  { transform: rotateX(14deg) rotateY(-18deg) translateY(-18px); }
  100% { transform: rotateX(18deg) rotateY(-22deg) translateY(0px); }
}
.fcard-glow {
  position: absolute; inset: -28px; border-radius: 80px;
  background: radial-gradient(ellipse at 50% 50%,
    rgba(180,140,255,0.8) 0%, rgba(140,100,255,0.5) 35%,
    rgba(100,70,220,0.25) 60%, transparent 80%);
  animation: fcard-outer-glow 5s ease-in-out infinite;
  pointer-events: none; z-index: 0;
}
.fcard-glow-wide {
  position: absolute; inset: -60px; border-radius: 120px;
  background: radial-gradient(ellipse at 50% 50%,
    rgba(255,255,255,0.22) 0%, rgba(200,190,255,0.12) 40%, transparent 70%);
  animation: fcard-outer-glow 5s ease-in-out infinite;
  animation-delay: 0.3s; pointer-events: none; z-index: 0;
}
@keyframes fcard-outer-glow {
  0%, 100% { opacity: 0.85; transform: scale(1); }
  50%       { opacity: 1;    transform: scale(1.08); }
}
.fcard-card {
  width: 260px; height: 260px; border-radius: 52px;
  background: linear-gradient(145deg, #1e1040 0%, #150d30 60%, #0f0820 100%);
  border: 1.5px solid rgba(124,106,245,0.4);
  box-shadow:
    inset 0 2px 0 rgba(255,255,255,1),
    inset 0 -1px 0 rgba(180,180,210,0.4),
    0 0 0 8px rgba(255,255,255,0.18),
    0 0 0 20px rgba(255,255,255,0.09),
    0 0 0 40px rgba(220,210,255,0.06),
    0 8px 32px rgba(255,255,255,0.5),
    0 20px 60px rgba(200,190,255,0.45),
    0 40px 90px rgba(160,140,230,0.3),
    0 70px 120px rgba(120,100,200,0.2);
  display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
  transform-style: preserve-3d; z-index: 1;
}
.fcard-card::before {
  content: ''; position: absolute;
  top: 0; left: 0; right: 0; height: 55%;
  border-radius: 52px 52px 80% 80%;
  background: linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.1) 100%);
  pointer-events: none;
}
.fcard-card::after {
  content: ''; position: absolute; inset: 0; border-radius: 52px;
  background: linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 40%, rgba(180,170,255,0.08) 100%);
  pointer-events: none;
}
.fcard-icon-wrap {
  position: relative; width: 148px; height: 148px;
  display: flex; align-items: center; justify-content: center;
}
.fcard-ring-outer {
  position: absolute; inset: 0; border-radius: 50%;
  border: 1.5px solid rgba(180,160,255,0.35);
  animation: fcard-spin-slow 12s linear infinite;
}
.fcard-ring-inner {
  position: absolute; inset: 16px; border-radius: 50%;
  border: 1px dashed rgba(160,140,240,0.25);
  animation: fcard-spin-slow 8s linear infinite reverse;
}
@keyframes fcard-spin-slow { to { transform: rotate(360deg); } }
.fcard-nodes { position: absolute; inset: 0; }
.fcard-node-dot {
  position: absolute; width: 6px; height: 6px; border-radius: 50%;
  background: rgba(140,100,255,0.5); box-shadow: 0 0 6px rgba(140,100,255,0.4);
}
.fcard-n1 { top: 2px; left: 50%; transform: translateX(-50%); }
.fcard-n2 { bottom: 2px; left: 50%; transform: translateX(-50%); }
.fcard-n3 { left: 2px; top: 50%; transform: translateY(-50%); }
.fcard-n4 { right: 2px; top: 50%; transform: translateY(-50%); }
.fcard-gh-logo {
  width: 72px; height: 72px; position: relative; z-index: 2;
  filter: drop-shadow(0 4px 12px rgba(100,80,200,0.3));
  animation: fcard-pulse-glow 3s ease-in-out infinite;
}
@keyframes fcard-pulse-glow {
  0%, 100% { filter: drop-shadow(0 4px 12px rgba(100,80,200,0.25)); }
  50%       { filter: drop-shadow(0 6px 20px rgba(120,90,230,0.45)); }
}
.fcard-glow-orb {
  position: absolute; width: 110px; height: 110px; border-radius: 50%;
  background: radial-gradient(circle, rgba(160,130,255,0.12) 0%, transparent 70%);
  top: 50%; left: 50%; transform: translate(-50%, -50%);
  animation: fcard-orb-pulse 4s ease-in-out infinite; pointer-events: none;
}
@keyframes fcard-orb-pulse {
  0%, 100% { opacity: 0.7; transform: translate(-50%,-50%) scale(1); }
  50%       { opacity: 1;   transform: translate(-50%,-50%) scale(1.15); }
}
.fcard-shadow-floor {
  position: absolute; bottom: -52px; left: 50%;
  transform: translateX(-50%); width: 200px; height: 32px; border-radius: 50%;
  background: radial-gradient(ellipse, rgba(200,190,255,0.45) 0%, rgba(160,140,230,0.2) 40%, transparent 70%);
  animation: fcard-shadow-anim 5s ease-in-out infinite; filter: blur(6px);
}
@keyframes fcard-shadow-anim {
  0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
  50%       { opacity: 0.6; transform: translateX(-50%) scale(0.82); }
}
.fcard-particles { position: absolute; inset: -40px; pointer-events: none; }
.fcard-p {
  position: absolute; border-radius: 50%;
  background: rgba(200,180,255,0.6);
  animation: fcard-particle-float linear infinite;
}
@keyframes fcard-particle-float {
  0%   { transform: translateY(0) scale(1); opacity: 0.6; }
  100% { transform: translateY(-80px) scale(0.2); opacity: 0; }
}
.fcard-badge {
  position: absolute; bottom: 22px; left: 50%; transform: translateX(-50%);
  background: rgba(255,255,255,0.6); border: 1px solid rgba(180,160,255,0.45);
  border-radius: 20px; padding: 4px 14px; font-size: 11px;
  color: rgba(100,80,180,0.85); letter-spacing: 0.08em;
  white-space: nowrap; font-family: 'SF Mono', monospace;
}
.fcard-corner-dot {
  position: absolute; width: 5px; height: 5px; border-radius: 50%;
  background: rgba(140,110,255,0.5); box-shadow: 0 0 6px rgba(140,110,255,0.4);
}
.fcard-cd1 { top: 28px; right: 28px; }
.fcard-cd2 { bottom: 28px; left: 28px; }
.fcard-edge-shine {
  position: absolute; top: 12px; left: 12px; width: 40px; height: 40px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,0.9) 0%, transparent 70%);
  pointer-events: none;
}
`

export default function FixedCardBg() {
  const particlesRef = useRef(null)

  useEffect(() => {
    const container = particlesRef.current
    if (!container) return
    for (let i = 0; i < 10; i++) {
      const p = document.createElement('div')
      p.className = 'fcard-p'
      const size = Math.random() * 4 + 2
      p.style.cssText = `width:${size}px;height:${size}px;left:${20 + Math.random() * 60}%;bottom:${10 + Math.random() * 40}%;animation-duration:${2.5 + Math.random() * 3}s;animation-delay:${Math.random() * 3}s;opacity:${0.3 + Math.random() * 0.4};`
      container.appendChild(p)
    }
    return () => { container.innerHTML = '' }
  }, [])

  return (
    <>
      <style>{STYLES}</style>
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '15%',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '320px',
          height: '320px',
          zIndex: 0,
          opacity: 0.45,
          pointerEvents: 'none',
        }}
      >
        <div className="fcard-scene">
          <div className="fcard-wrap">
            <div className="fcard-glow-wide" />
            <div className="fcard-glow" />
            <div className="fcard-card">
              <div className="fcard-edge-shine" />
              <div className="fcard-glow-orb" />
              <div className="fcard-icon-wrap">
                <div className="fcard-ring-outer">
                  <div className="fcard-nodes">
                    <div className="fcard-node-dot fcard-n1" />
                    <div className="fcard-node-dot fcard-n2" />
                    <div className="fcard-node-dot fcard-n3" />
                    <div className="fcard-node-dot fcard-n4" />
                  </div>
                </div>
                <div className="fcard-ring-inner" />
                <svg className="fcard-gh-logo" viewBox="0 0 98 96" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="fcard-ggrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#9333ea" />
                      <stop offset="100%" stopColor="#6366f1" />
                    </linearGradient>
                  </defs>
                  <path
                    fillRule="evenodd" clipRule="evenodd" fill="url(#fcard-ggrad)"
                    d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69
                       2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127
                       -13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17
                       -4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052
                       4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6
                       -10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2
                       -.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052
                       a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63
                       9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038
                       3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283
                       1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526
                       0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691
                       C97.707 22 75.788 0 48.854 0z"
                  />
                </svg>
              </div>
              <div className="fcard-badge">RAG · codebase · AI</div>
              <div className="fcard-corner-dot fcard-cd1" />
              <div className="fcard-corner-dot fcard-cd2" />
              <div className="fcard-particles" ref={particlesRef} />
            </div>
            <div className="fcard-shadow-floor" />
          </div>
        </div>
      </div>
    </>
  )
}
