import { useQuery } from '@tanstack/react-query'
import { getMe } from '../api/auth'
import { getProject } from '../api/projects'
import { getTeamRoster } from '../api/team'

/**
 * Returns the current user's effective role on a project:
 *   'owner'  — project.user_id === me.id
 *   'editor' — active TeamMember with role editor
 *   'viewer' — active TeamMember with role viewer
 *   null     — still loading
 */
export function useProjectRole(projectId) {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe, staleTime: Infinity })

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
    enabled: !!projectId,
  })

  const isOwner = me && project && String(project.user_id) === String(me.id)

  const { data: roster } = useQuery({
    queryKey: ['team', projectId],
    queryFn: () => getTeamRoster(projectId),
    enabled: !!(me && project && !isOwner),
    staleTime: 60_000,
  })

  if (!me || !project) return null
  if (isOwner) return 'owner'

  const member = roster?.members?.find(m => String(m.user.id) === String(me.id))
  return member?.role ?? null  // 'editor' | 'viewer' | null while roster loads
}
