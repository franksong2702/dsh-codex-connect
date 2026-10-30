/** Finite task-failure projection. Never returns messages, stacks, targets or input data. */
const taskDiagnosticReasons = Object.freeze({
  CUA_INPUT_FOCUS_LOST:'focus_lost',CUA_INPUT_USER_TAKEOVER:'hardware_changed',CUA_INPUT_CLOSED:'input_closed',
  CUA_INPUT_SCOPE_DENIED:'scope_denied',CUA_INPUT_EXPIRED:'expired',CUA_CHROME_INPUT_INVALID:'input_policy',
  CUA_CHROME_NAVIGATION_DENIED:'input_policy',CUA_CHROME_KEY_DENIED:'input_policy',CUA_CHROME_TEXT_DENIED:'input_policy',
  CUA_TASK_CLOSED:'task_closed',CUA_TASK_REVOKED:'revoked',CUA_TASK_DENIED:'denied',CUA_TASK_REQUEST_CHANGED:'intent_changed',
  CUA_TASK_TARGET_DENIED:'identity_changed',CUA_TARGET_STALE:'identity_changed',STALE_APP:'identity_changed',
  ABORTED:'cancelled',ASK_CANCELLED:'cancelled',PERMISSION_DENIED:'permission_missing',APP_APPROVAL_UNAVAILABLE:'approval_unavailable',
  NATIVE_ERROR:'native_unavailable',NATIVE_TIMEOUT:'native_timeout',NATIVE_PROTOCOL:'native_protocol',
  DIAGNOSTIC_TASK_EXPIRED:'expired',DIAGNOSTIC_RECEIPT_UNKNOWN:'receipt_unknown',CLEANUP_UNCONFIRMED:'cleanup_unconfirmed',UNKNOWN:'unknown',
})
const taskDiagnosticStages = new Set(['preflight','consent','arm','arm_receipt','receipt','monitor','operation','before_model','cleanup'])
const taskDiagnosticSources = new Set(['host','native','worker','tool','lifecycle'])
export function taskErrorProjection(error,stage,source) {
  stage=taskDiagnosticStages.has(stage)?stage:'preflight';source=taskDiagnosticSources.has(source)?source:'worker'
  const queue=[error],seen=new Set(),result=[]
  while(queue.length&&seen.size<16&&result.length<8){const value=queue.shift();if(!value||typeof value!=='object'||seen.has(value))continue;seen.add(value)
    if(typeof value.code==='string'&&Object.hasOwn(taskDiagnosticReasons,value.code))result.push(Object.freeze({code:value.code,reason:taskDiagnosticReasons[value.code],stage,source}))
    for(const key of ['cause','error'])if(value[key]&&typeof value[key]==='object')queue.push(value[key])
  }
  return result.length?result:[Object.freeze({code:'UNKNOWN',reason:'unknown',stage,source})]
}
export function taskDiagnosticProjection(value) {
  if(!value||typeof value!=='object')return null
  const stage=taskDiagnosticStages.has(value.stage)?value.stage:'preflight'
  const chain=Array.isArray(value.chain)?value.chain.slice(0,8).map(row=>taskErrorProjection({code:row?.code},row?.stage,row?.source)[0]):[]
  const progress=Array.isArray(value.progress)?value.progress.slice(0,16).filter(row=>taskDiagnosticStages.has(row?.stage)&&Number.isSafeInteger(row.atMs)&&row.atMs>=0).map(row=>Object.freeze({stage:row.stage,atMs:row.atMs})):[]
  return Object.freeze({stage,primary:chain.find(row=>row.code===value.primary?.code&&row.stage===value.primary?.stage&&row.source===value.primary?.source)??chain[0]??null,chain:Object.freeze(chain),progress:Object.freeze(progress)})
}
export function createTaskDiagnostics() {
  const started=Date.now(),state={stage:'preflight',primary:null,chain:[],progress:[]}
  const enter=stage=>{if(!taskDiagnosticStages.has(stage))return;if(state.progress.at(-1)?.stage!==stage&&state.progress.length<16)state.progress.push({stage,atMs:Math.max(0,Date.now()-started)});state.stage=stage}
  enter('preflight')
  return Object.freeze({enter,error(error,stage=state.stage,source='host'){enter(stage);const projected=taskErrorProjection(error,stage,source);state.primary??=projected.find(row=>!['CUA_INPUT_CLOSED','CUA_TASK_CLOSED','UNKNOWN'].includes(row.code))??projected[0];for(const row of projected){if(state.chain.length<8&&!state.chain.some(prior=>prior.code===row.code&&prior.stage===row.stage&&prior.source===row.source))state.chain.push(row)}},snapshot(){return taskDiagnosticProjection(state)}})
}
