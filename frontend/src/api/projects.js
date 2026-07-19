import client from './client'

export async function getProjects() {
  const { data } = await client.get('/api/v1/projects')
  return data
}

export async function getProject(project_id) {
  const { data } = await client.get(`/api/v1/projects/${project_id}`)
  return data
}

export async function connectRepo(github_repo_full_name) {
  const { data } = await client.post('/api/v1/projects', { github_repo_full_name })
  return data
}

export async function triggerIndex(project_id) {
  const { data } = await client.post(`/api/v1/projects/${project_id}/index`)
  return data
}

export async function publishProject(project_id, is_public) {
  const { data } = await client.patch(`/api/v1/projects/${project_id}/publish`, { is_public })
  return data
}

export async function triggerHealthAnalysis(project_id) {
  const { data } = await client.post(`/api/v1/projects/${project_id}/health/analyze`)
  return data
}

export async function getHealth(project_id) {
  const { data } = await client.get(`/api/v1/projects/${project_id}/health`)
  return data
}

// ── Icon / color API ──────────────────────────────────────────────────────────

export async function getProjectIcon(project_id) {
  const { data } = await client.get(`/api/v1/projects/${project_id}/icon`)
  return data  // { icon, color, icon_override, color_override }
}

/**
 * Set or clear icon/color overrides for a project.
 * Pass null for either field to reset it to auto-resolution.
 *
 * @param {string} project_id
 * @param {string|null} icon_override  - icon key or null
 * @param {string|null} color_override - color key or null
 */
export async function setProjectIconOverride(project_id, icon_override, color_override) {
  const { data } = await client.patch(`/api/v1/projects/${project_id}/icon`, {
    icon_override,
    color_override,
  })
  return data  // { icon, color, icon_override, color_override }
}

// ── Canonical registries (mirrors backend icon_resolver.py) ──────────────────
// These are used by the Settings picker; keep in sync with the backend.

export const ICON_META = {
  'code-brackets': { label: 'Code',      lucide: 'Code2' },
  'terminal':      { label: 'Terminal',  lucide: 'Terminal' },
  'server':        { label: 'Server',    lucide: 'Server' },
  'chart':         { label: 'Chart',     lucide: 'BarChart2' },
  'folder':        { label: 'Folder',    lucide: 'Folder' },
  'box':           { label: 'Box',       lucide: 'Box' },
  'layers':        { label: 'Layers',    lucide: 'Layers' },
  'puzzle-piece':  { label: 'Puzzle',    lucide: 'Puzzle' },
  'clipboard':     { label: 'Clipboard', lucide: 'ClipboardList' },
  'pulse':         { label: 'Pulse',     lucide: 'Activity' },
}

export const COLOR_HEX = {
  'purple':     '#818CF8',
  'blue':       '#60A5FA',
  'teal':       '#2DD4BF',
  'green':      '#34D399',
  'orange':     '#FB923C',
  'blue-white': '#93C5FD',   // keyword-only; shown in picker but not in random pool
}

