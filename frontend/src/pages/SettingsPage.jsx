import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings,
  Check,
  RotateCcw,
  Folder,
  Code2,
  Terminal,
  Server,
  BarChart2,
  Box,
  Layers,
  Puzzle,
  ClipboardList,
  Activity,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  getProjects,
  setProjectIconOverride,
  ICON_META,
  COLOR_HEX,
} from '../api/projects'

// ── Canonical icon component map ─────────────────────────────────────────────

const ICON_COMPONENTS = {
  'code-brackets': Code2,
  'terminal':      Terminal,
  'server':        Server,
  'chart':         BarChart2,
  'folder':        Folder,
  'box':           Box,
  'layers':        Layers,
  'puzzle-piece':  Puzzle,
  'clipboard':     ClipboardList,
  'pulse':         Activity,
}

const ICON_KEYS   = Object.keys(ICON_META)
const COLOR_KEYS  = Object.keys(COLOR_HEX)

// ── Single project icon picker card ──────────────────────────────────────────

function ProjectIconCard({ project }) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  // Local picker state (mirrors current override or null)
  const [pickedIcon,  setPickedIcon]  = useState(project.icon_override  ?? null)
  const [pickedColor, setPickedColor] = useState(project.color_override ?? null)
  const [saved, setSaved] = useState(false)

  const repoName = project.github_repo_full_name?.split('/')[1] ?? project.github_repo_full_name

  const mutation = useMutation({
    mutationFn: ({ icon, color }) =>
      setProjectIconOverride(project.id, icon, color),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    },
  })

  function handleSave() {
    mutation.mutate({ icon: pickedIcon, color: pickedColor })
  }

  function handleReset() {
    setPickedIcon(null)
    setPickedColor(null)
    mutation.mutate({ icon: null, color: null })
  }

  const hasOverride = project.icon_override || project.color_override
  const isDirty =
    pickedIcon  !== (project.icon_override  ?? null) ||
    pickedColor !== (project.color_override ?? null)

  // Preview: show picked values or fall back to server-resolved
  const previewIcon  = pickedIcon  ?? project.resolved_icon  ?? 'folder'
  const previewColor = pickedColor ?? project.resolved_color ?? 'purple'
  const PreviewIconComponent = ICON_COMPONENTS[previewIcon] ?? Folder
  const previewHex = COLOR_HEX[previewColor] ?? '#818CF8'

  return (
    <div className="bg-[#0D0D0F] border border-white/[0.07] rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 text-left hover:bg-white/[0.02] transition-colors"
        style={{ padding: '14px 18px' }}
      >
        {/* Current badge preview */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${previewHex}18`,
            border: `1px solid ${previewHex}30`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: previewHex,
            transition: 'background 200ms, border-color 200ms, color 200ms',
          }}
        >
          <PreviewIconComponent size={16} />
        </div>

        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{repoName}</div>
          <div className="font-mono truncate" style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
            {project.github_repo_full_name}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {hasOverride && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 999,
                background: `${previewHex}20`,
                color: previewHex,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Custom
            </span>
          )}
          {expanded
            ? <ChevronUp size={13} className="text-white/30" />
            : <ChevronDown size={13} className="text-white/30" />
          }
        </div>
      </button>

      {/* Expanded picker */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="picker"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="border-t border-white/[0.05]"
              style={{ padding: '16px 18px 18px' }}
            >
              {/* Icon grid */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Icon
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {/* Auto option */}
                  <button
                    onClick={() => setPickedIcon(null)}
                    title="Auto-detect"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 9,
                      border: pickedIcon === null
                        ? '2px solid rgba(255,255,255,0.5)'
                        : '1px solid rgba(255,255,255,0.08)',
                      background: pickedIcon === null ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.4)',
                      fontWeight: 700,
                      transition: 'all 150ms',
                    }}
                  >
                    Auto
                  </button>

                  {ICON_KEYS.map(key => {
                    const IconComp = ICON_COMPONENTS[key] ?? Folder
                    const isSelected = pickedIcon === key
                    const activeHex = COLOR_HEX[pickedColor ?? project.resolved_color ?? 'purple']
                    return (
                      <button
                        key={key}
                        onClick={() => setPickedIcon(key)}
                        title={ICON_META[key]?.label ?? key}
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 9,
                          border: isSelected
                            ? `2px solid ${activeHex}`
                            : '1px solid rgba(255,255,255,0.08)',
                          background: isSelected
                            ? `${activeHex}20`
                            : 'rgba(255,255,255,0.03)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: isSelected ? activeHex : 'rgba(255,255,255,0.4)',
                          transition: 'all 150ms',
                        }}
                      >
                        <IconComp size={15} />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Color swatches */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Color
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {/* Auto option */}
                  <button
                    onClick={() => setPickedColor(null)}
                    title="Auto-detect"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: pickedColor === null
                        ? '2.5px solid rgba(255,255,255,0.6)'
                        : '1.5px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: 9,
                      color: 'rgba(255,255,255,0.4)',
                      fontWeight: 700,
                      transition: 'all 150ms',
                    }}
                  >
                    A
                  </button>

                  {COLOR_KEYS.map(key => {
                    const hex = COLOR_HEX[key]
                    const isSelected = pickedColor === key
                    return (
                      <button
                        key={key}
                        onClick={() => setPickedColor(key)}
                        title={key}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: hex,
                          border: isSelected
                            ? `3px solid #fff`
                            : `2px solid ${hex}60`,
                          boxShadow: isSelected ? `0 0 0 1px ${hex}` : 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 150ms',
                        }}
                      >
                        {isSelected && <Check size={11} color="#000" strokeWidth={3} />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={!isDirty || mutation.isPending}
                  style={{
                    height: 32,
                    padding: '0 14px',
                    borderRadius: 8,
                    background: isDirty && !mutation.isPending ? previewHex : 'rgba(255,255,255,0.06)',
                    color: isDirty && !mutation.isPending ? '#000' : 'rgba(255,255,255,0.3)',
                    fontSize: 12,
                    fontWeight: 600,
                    border: 'none',
                    cursor: isDirty && !mutation.isPending ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 150ms',
                  }}
                >
                  {saved ? (
                    <><Check size={12} /> Saved</>
                  ) : mutation.isPending ? (
                    'Saving…'
                  ) : (
                    'Apply'
                  )}
                </button>

                {hasOverride && (
                  <button
                    onClick={handleReset}
                    disabled={mutation.isPending}
                    style={{
                      height: 32,
                      padding: '0 12px',
                      borderRadius: 8,
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.35)',
                      fontSize: 12,
                      border: '1px solid rgba(255,255,255,0.08)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      transition: 'all 150ms',
                    }}
                    className="hover:text-white hover:border-white/20"
                  >
                    <RotateCcw size={11} />
                    Reset to auto
                  </button>
                )}

                {mutation.error && (
                  <span style={{ fontSize: 11, color: '#F43F5E' }}>
                    {mutation.error.response?.data?.detail ?? mutation.error.message}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Settings Page ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  })

  // Only show projects the user owns (has icon_override capability on)
  const myProjects = projects.filter(p => p.index_status === 'ready' || p.icon_override || p.color_override)

  return (
    <div className="h-full text-white overflow-y-auto" style={{ padding: '32px 32px 48px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div className="flex items-center gap-2.5" style={{ marginBottom: 6 }}>
          <Settings size={17} className="text-white/50" />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Settings</h1>
        </div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
          Customise how your projects appear in the dashboard.
        </p>
      </div>

      {/* Icon & Color section */}
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.3)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            marginBottom: 12,
          }}
        >
          Project Icons &amp; Colors
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-[#0D0D0F] border border-white/[0.07] rounded-xl animate-pulse" style={{ height: 64 }} />
            ))}
          </div>
        ) : myProjects.length === 0 ? (
          <div
            className="border border-dashed border-white/[0.07] rounded-xl flex flex-col items-center gap-2"
            style={{ padding: '48px 24px', textAlign: 'center' }}
          >
            <Folder size={22} className="text-white/20" />
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
              No indexed projects yet. Connect and index a repository first.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3" style={{ maxWidth: 600 }}>
            {myProjects.map(project => (
              <ProjectIconCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
