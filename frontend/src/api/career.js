import client from './client'

export async function listArtifacts(projectId) {
  const { data } = await client.get(`/api/v1/career/${projectId}`)
  return data
}

export async function getArtifact(projectId, artifactType) {
  const { data } = await client.get(`/api/v1/career/${projectId}/${artifactType}`)
  return data
}

export async function generateArtifact(projectId, artifactType) {
  const { data } = await client.post(`/api/v1/career/${projectId}/${artifactType}`)
  return data
}
