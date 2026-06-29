import client from './client'

export async function summarizeFile(projectId, filePath, { force = false } = {}) {
  const { data } = await client.post(
    `/api/v1/summarize/${projectId}/file`,
    { file_path: filePath },
    { params: force ? { force: true } : {} },
  )
  return data
}

export async function summarizePR(projectId, prNumber, { force = false } = {}) {
  const { data } = await client.post(
    `/api/v1/summarize/${projectId}/pr`,
    { pr_number: prNumber },
    { params: force ? { force: true } : {} },
  )
  return data
}
