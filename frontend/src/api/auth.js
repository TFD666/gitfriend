import client from './client'

export async function getMe() {
  const { data } = await client.get('/api/v1/auth/me')
  return data
}

export async function logout() {
  await client.post('/api/v1/auth/logout')
}

export async function getStats() {
  const { data } = await client.get('/api/v1/stats')
  return data
}

export async function getActivity() {
  const { data } = await client.get('/api/v1/activity')
  return data
}
