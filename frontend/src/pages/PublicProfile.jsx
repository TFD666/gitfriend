import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { getPublicProfile } from '../api/public'
import PublicNav from '../components/ui/PublicNav'
import PublicFooter from '../components/ui/PublicFooter'

function timeAgo(iso) {
  if (!iso) return null
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000)
  if (d < 1) return 'today'
  if (d < 30) return `${d}d ago`
  const m = Math.floor(d / 30)
  if (m < 12) return `${m}mo ago`
  return `${Math.floor(m / 12)}y ago`
}

const ARTIFACT_BADGE_LABELS = {
  portfolio: 'Portfolio',
  resume_bullets: 'Resume',
  interview_prep: 'Interview Prep',
}

function Skeleton({ width = '100%', height = '16px', style = {} }) {
  return (
    <div style={{
      width, height, borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-subtle)',
      ...style,
    }} />
  )
}

export default function PublicProfile() {
  const { username } = useParams()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['public-profile', username],
    queryFn: () => getPublicProfile(username),
    retry: false,
  })

  const is404 = isError && error?.response?.status === 404

  const CONTENT_STYLE = {
    maxWidth: '760px', margin: '0 auto', padding: '0 24px',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <PublicNav username={null} />

      <div style={CONTENT_STYLE}>
        {/* Profile hero */}
        <section style={{ padding: '48px 0 40px' }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Skeleton width="40px" height="2px" />
              <Skeleton width="50%" height="40px" />
              <Skeleton width="35%" height="16px" />
              <Skeleton width="100px" height="32px" style={{ marginTop: '4px' }} />
            </div>
          ) : data ? (
            <>
              {/* Accent line above username */}
              <div style={{
                width: '40px', height: '2px',
                background: 'var(--accent)', marginBottom: '16px',
              }} />

              <h1 style={{ fontSize: '32px', fontWeight: 700, margin: '0 0 8px', lineHeight: 1.1 }}>
                <span style={{ color: 'var(--text-muted)' }}>@</span>
                <span style={{ color: 'var(--text-primary)' }}>{username}</span>
              </h1>

              <p style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
                GitHub developer · {data.projects.length} project{data.projects.length !== 1 ? 's' : ''} published
              </p>

              <a
                href={`https://github.com/${username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none', fontSize: '13px' }}
              >
                <svg width="14" height="14" viewBox="0 0 98 96" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
                </svg>
                GitHub ↗
              </a>
            </>
          ) : null}
        </section>

        {/* 404 */}
        {is404 && (
          <div className="empty-state" style={{ paddingTop: '40px' }}>
            <p className="empty-state-title">Profile not found</p>
            <p className="empty-state-desc">@{username} doesn't exist or has no public page.</p>
          </div>
        )}

        {/* Generic error */}
        {isError && !is404 && (
          <div className="empty-state" style={{ paddingTop: '40px' }}>
            <p className="empty-state-desc" style={{ color: 'var(--danger)' }}>Something went wrong. Try refreshing.</p>
          </div>
        )}

        {/* Project cards */}
        {data && (
          <section style={{ paddingBottom: '40px' }}>
            {data.projects.length === 0 ? (
              <div className="empty-state">
                <FileText size={32} className="empty-state-icon" />
                <p className="empty-state-title" style={{ margin: 0 }}>No published projects yet</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {data.projects.map(project => {
                  const repoParts = project.github_repo_full_name?.split('/') ?? []
                  const repoOwner = repoParts[0] ?? ''
                  const repoName = repoParts[1] ?? project.name ?? ''
                  const excerpt = project.description?.slice(0, 100) ?? ''

                  return (
                    <div
                      key={project.slug}
                      style={{
                        background: 'var(--bg-surface)', border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-lg)', padding: '20px 24px',
                        transition: 'border-color 150ms ease',
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-focus)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    >
                      {/* Top row: repo name + date */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '8px' }}>
                        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{repoOwner}/</span>
                          {repoName}
                        </h2>
                        {project.published_at && (
                          <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
                            {timeAgo(project.published_at)}
                          </span>
                        )}
                      </div>

                      {/* Description excerpt */}
                      {excerpt && (
                        <p style={{
                          fontSize: '13px', color: 'var(--text-secondary)',
                          lineHeight: 1.5, margin: '0 0 16px',
                        }}>
                          {excerpt}{excerpt.length >= 100 ? '…' : ''}
                        </p>
                      )}

                      {/* Artifact badges + View link */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {project.artifact_types?.map(type => (
                            <span key={type} className="badge badge-neutral">
                              {ARTIFACT_BADGE_LABELS[type] ?? type}
                            </span>
                          ))}
                        </div>
                        <Link
                          to={`/u/${username}/${project.slug}`}
                          className="btn-ghost"
                          style={{ fontSize: '13px', textDecoration: 'none', flexShrink: 0, padding: '4px 10px' }}
                        >
                          View project →
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '40px' }}>
            {[0, 1].map(i => (
              <div key={i} style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)', padding: '20px 24px',
                display: 'flex', flexDirection: 'column', gap: '12px',
              }}>
                <Skeleton width="55%" height="20px" />
                <Skeleton width="85%" height="14px" />
                <Skeleton width="40%" height="14px" />
              </div>
            ))}
          </div>
        )}

        <PublicFooter />
      </div>
    </div>
  )
}
