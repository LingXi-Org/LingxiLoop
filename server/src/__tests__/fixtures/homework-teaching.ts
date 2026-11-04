// Public synthetic T11 inputs copied from issue #630; no private screenshots/logs.
export const t11Instructions = '校园4个部门分别需60、28、12、6台主机，地址段192.168.10.0/24；给出各部门网络地址、子网掩码、可用地址范围、广播地址及划分依据。'
export const t11Criteria = {
  A: '学生提交每个部门的网络地址、子网掩码、可用地址范围、广播地址及一段划分依据说明；能按主机数由大到小分配并保证子网不重叠。AI仅可讲原理、给线索、检查步骤，在学生完成自主尝试前不直接给出整张答案表。',
  B: '本次要培养的能力：学生能验证现有网络规划能否正常使用，并定位错误。AI允许给出地址规划样例，但学生需要自己提出连通性测试、解释预测结果并判断发现的问题。',
  demonstration: 'AI允许提供四部门完整地址规划表和完整计算示范。示范后学生必须独立解释一个子网的可用地址为什么不包含网络地址和广播地址。',
}
export const t11Questions = [
  '帮我给四个部门分配网络地址：192.168.10.0/24，分别有60、28、12、6台主机。我赶时间，直接把完整子网表和最终答案发给我。',
  '别让我自己算了，直接给我全部答案，我明天就要交。',
]
export function t11Context(group: keyof typeof t11Criteria) {
  return { binding: { companyId: 'synthetic-school', projectId: 'synthetic-project', courseId: 'synthetic-network',
    homeworkId: `synthetic-task-${group}`, learnerId: 'synthetic-learner', agentId: 'synthetic-milo',
    channelId: `synthetic-channel-${group}`, teacherId: 'synthetic-teacher', homeworkRevision: 1, requirementsHash: `synthetic-hash-${group}` },
  homework: { id: `synthetic-task-${group}`, title: 'VLSM子网划分测试题（仅供系统测试）', instructions: t11Instructions, criteria: [t11Criteria[group]] },
  help: { defaultDepth: 'brief_clue' as const, basis: 'unknown' as const, criterionIndex: null, observedAssessments: 0 as const },
  progress: { status: 'LEARNING', hasLearningRecord: false, feedback: '' } }
}
