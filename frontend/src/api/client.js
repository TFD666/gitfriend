import axios from 'axios'

export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const client = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
})

export default client
