const observedAt = '2026-10-02T08:00:00Z'
const frame = (rows: Record<string, unknown>[]) => ({ frames: [{ name: 'local', length: rows.length, fields: Object.keys(rows[0] ?? {}).map(name => ({ name, values: rows.map(row => row[name]) })) }] })
export const adminFixtures: Record<string, unknown> = {
  '/api/health/dependencies': {ok:true},
  '/api/control/platform/dashboard': { observedAt, counts: {users:120,companies:6,projects:18,activeRuns:3}, attention:{runs:0,deliveries:0,knowledge:0,notifications:0}, dependencies:{postgres:true,redis:true,wukong:true},recentAudit:[{id:'local-audit',kind:'本地演示记录',created_at:observedAt}] },
  '/api/control/platform/observability': { observedAt, results: {
    summary: frame([{runs:120,failures:2,input_tokens:12000,output_tokens:4000,cost_usd:0.12}]),
    trend: frame([{time:observedAt,runs:4,failures:0}]), models: frame([]), recentRuns: frame([]),
  } },
  '/api/control/status-page': { config:{title:'本地服务状态',description:'隔离的演示数据'},incident:null,groups:[{id:1,name:'演示服务',monitorList:[{id:1,name:'本地 API / 长标题服务名称'.repeat(3),type:'http'}]}],maintenanceList:[],history:{'1':[{status:1,time:observedAt,ping:38}]},latest:{'1':{status:1,time:observedAt,ping:38}},uptime:{'1_24':1} },
  '/api/control/auth-settings': { sessionExpiresIn:86400,otpExpiresIn:300,rateLimitWindow:60,rateLimitMax:100,locked:{defaultRole:'user',requireEmailVerification:true,captchaProvider:'turnstile',captchaEndpoints:[]},secrets:{smtp:true,turnstile:true} },
  '/api/control/company/dashboard': {companyName:'本地演示组织',metrics:[{label:'成员',resource:'users',value:12},{label:'项目',resource:'projects',value:4}]},
  '/api/control/company/usage': {calls:120,inputTokens:12000,outputTokens:4000,costUsd:.12},
}
