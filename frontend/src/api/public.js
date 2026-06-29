import axios from 'axios'
import { API_BASE } from './client'

// Separate client — no credentials needed for public endpoints.
const publicClient = axios.create({ baseURL: API_BASE })

export async function getPublicProfile(username) {
  const { data } = await publicClient.get(`/api/v1/public/users/${username}`)
  return data
}

export async function getPublicProject(username, slug) {
  const { data } = await publicClient.get(`/api/v1/public/users/${username}/projects/${slug}`)
  return data
}
