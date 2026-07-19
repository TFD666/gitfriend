import { useEffect, useRef } from 'react'
import animationWebm from '../assets/animation1.webm'

export default function GithubNavbarAnimation() {
  const videoRef = useRef(null)
  const timeoutRef = useRef(null)

  // Detect accessibility setting for reduced motion
  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // If reduced motion is preferred, we stay static on the 1.0 second frame
    if (prefersReducedMotion) {
      if (video.readyState >= 1) {
        video.currentTime = 1.0
      }
      return
    }

    const handleEnded = () => {
      if (videoRef.current) {
        videoRef.current.currentTime = 1.0
        videoRef.current.pause()
      }

      // Wait 10 seconds before restarting the animation
      timeoutRef.current = setTimeout(() => {
        const currentVideo = videoRef.current
        if (currentVideo) {
          currentVideo.currentTime = 0
          currentVideo.play().catch(err => {
            console.warn('Playback prevented by browser autoplay policy', err)
          })
        }
      }, 10000)
    }

    video.addEventListener('ended', handleEnded)

    // Trigger initial play explicitly if autoplay didn't start automatically
    video.play().catch(err => {
      console.warn('Initial autoplay prevented', err)
    })

    return () => {
      video.removeEventListener('ended', handleEnded)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [prefersReducedMotion])

  // Handle metadata load to set currentTime to 1.0 safely
  const handleLoadedMetadata = () => {
    const video = videoRef.current
    if (video) {
      if (prefersReducedMotion) {
        video.currentTime = 1.0
      }
    }
  }

  return (
    <div className="shrink-0 flex items-center justify-center" style={{ width: '30.6px', height: '30.6px' }}>
      <video
        ref={videoRef}
        src={animationWebm}
        autoPlay={!prefersReducedMotion}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        className="w-full h-full object-contain"
        style={{ opacity: 1 }}
      />
    </div>
  )
}
