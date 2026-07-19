import client from './client'

export async function getTeamRoster(projectId) {
  const { data } = await client.get(`/api/v1/projects/${projectId}/team`)
  return data
}

export async function inviteMember(projectId, github_username, role) {
  const { data } = await client.post(`/api/v1/projects/${projectId}/team/invite`, { github_username, role })
  return data
}

export async function removeMember(projectId, memberId) {
  await client.delete(`/api/v1/projects/${projectId}/team/${memberId}`)
}

export async function updateMemberRole(projectId, memberId, role) {
  const { data } = await client.patch(`/api/v1/projects/${projectId}/team/${memberId}`, { role })
  return data
}

export async function updateSharing(projectId, flags) {
  const { data } = await client.patch(`/api/v1/projects/${projectId}/settings/sharing`, flags)
  return data
}

export async function getMyInvites() {
  const { data } = await client.get('/api/v1/me/invites')
  return data
}

export async function acceptInvite(inviteId) {
  const { data } = await client.post(`/api/v1/invites/${inviteId}/accept`)
  return data
}

export async function declineInvite(inviteId) {
  await client.post(`/api/v1/invites/${inviteId}/decline`)
}
