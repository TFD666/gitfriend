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
