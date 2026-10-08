import { initDb } from '../src/db.js';
import { llmStatus } from '../src/env.js';

const db = initDb();
console.log('LLM:', JSON.stringify(llmStatus()));
console.log('\n=== 事件抽取方式 ===');
for (const e of db.prepare('SELECT event_code,event_type,status,key_elements FROM event ORDER BY id').all()) {
  const k = JSON.parse(e.key_elements);
  console.log(' ' + e.event_code + ' | ' + e.event_type + ' | ' + e.status +
    ' | extract_method=' + k.extract_method + ' | amounts=' + JSON.stringify(k.amounts));
}
console.log('\n=== 证据（类型/权重/来源）===');
for (const r of db.prepare(`SELECT ev.evidence_code, ev.evidence_type, ev.weight, rd.source_name, ev.quote
   FROM evidence ev JOIN raw_document rd ON rd.id = ev.doc_id ORDER BY ev.id`).all()) {
  console.log(' ' + r.evidence_code + ' | ' + r.evidence_type + ' | w=' + r.weight + ' | ' + r.source_name);
  console.log('    quote: ' + r.quote);
}
console.log('\n=== 状态流转链 ===');
for (const r of db.prepare(`SELECT e.event_code, sl.from_status, sl.to_status, sl.rule_code
   FROM event_state_log sl JOIN event e ON e.id = sl.event_id ORDER BY sl.id`).all()) {
  console.log(' ' + r.event_code + ': ' + (r.from_status || '(新建)') + ' -> ' + r.to_status + ' [' + r.rule_code + ']');
}
