import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { API_BASE } from '../api/client'

export default function Auth() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const error = params.get('error')

  useEffect(() => {
    if (!error) {
      navigate('/dashboard', { replace: true })
    }
  }, [error, navigate])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl p-8 shadow-md max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-gray-900 font-semibold mb-2">Authentication failed</p>
          <p className="text-sm text-gray-500 mb-6 font-mono">{error}</p>
          <a
            href={`${API_BASE}/api/v1/auth/github/authorize`}
            className="inline-block px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Try again with GitHub
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400 text-sm">Redirecting…</p>
    </div>
  )
}
