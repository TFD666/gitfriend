import client from './client'

export async function getDiagrams(projectId) {
  const { data } = await client.get(`/api/v1/projects/${projectId}/diagrams`)
  return data
}

export async function generateDiagram(projectId, diagramType) {
  const { data } = await client.post(
    `/api/v1/projects/${projectId}/diagrams/${diagramType}/generate`
  )
  return data
}
