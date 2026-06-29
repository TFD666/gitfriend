import client from './client'

export async function enqueuePRReview(projectId, pr_number) {
  const { data } = await client.post(`/api/v1/projects/${projectId}/pr-reviews`, { pr_number })
  return data
}

export async function listPRReviews(projectId) {
  const { data } = await client.get(`/api/v1/projects/${projectId}/pr-reviews`)
  return data
}

export async function getPRReviews(projectId, prNumber) {
  const { data } = await client.get(`/api/v1/projects/${projectId}/pr-reviews/${prNumber}`)
  return data
}

export async function postReviewToGitHub(projectId, prNumber, runId) {
  const { data } = await client.post(
    `/api/v1/projects/${projectId}/pr-reviews/${prNumber}/runs/${runId}/post-to-github`
  )
  return data
}
