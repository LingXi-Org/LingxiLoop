const labels: Record<string, string> = { CREATED: '已创建', DRAFT: '草稿', ACTIVE: '进行中', COURSE_ENDED: '已结课', READ_ONLY: '只读', TRANSFER_PENDING: '转移中', RETENTION: '保留期', ARCHIVED: '已归档', DELETED: '已删除' }
export function statusLabel(status: string) { return labels[status] ?? '状态暂不可用' }
