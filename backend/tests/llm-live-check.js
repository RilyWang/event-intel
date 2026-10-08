// 真实验证 LLM 抽取：对样例文档跑一次，打印模型抽取结果与校验结论
import { loadEnv, llmStatus } from '../src/env.js';
import { extractWithLLM } from '../src/llm.js';
import { extract } from '../src/pipeline.js';
import { DOCUMENTS, TARGETS } from '../src/samples.js';

loadEnv(true);
console.log('LLM 状态:', JSON.stringify(llmStatus(), null, 2));

const targets = TARGETS.map((t, i) => ({ id: i + 1, ...t }));

const picks = ['DOC-0001', 'DOC-0003', 'DOC-0005'];
for (const code of picks) {
  const doc = DOCUMENTS.find((d) => d.doc_code === code);
  console.log(`\n=== ${code} | ${doc.title}`);
  const t0 = Date.now();
  const r = await extractWithLLM(doc, targets);
  const ms = Date.now() - t0;
  if (r.fallback) {
    console.log(`  LLM 回退（${ms}ms）: ${r.error}`);
  } else {
    console.log(`  主体: ${r.subject ? r.subject.target_name + '(' + r.subject.target_code + ')' : 'null'}`);
    console.log(`  事件类型: ${r.eventType} | 证据类型: ${r.evidenceType}`);
    console.log(`  金额: ${JSON.stringify(r.amounts)} | 发生时间: ${r.eventTime}`);
    console.log(`  quote: ${r.quote}`);
    console.log(`  尝试次数: ${r.attempts} | JSON模式: ${r.json_mode} | 耗时 ${ms}ms`);
  }
}

// 走统一入口，确认上游拿到的结果
console.log('\n=== 统一入口 extract() 对 DOC-0003 ===');
const ex = await extract(DOCUMENTS.find((d) => d.doc_code === 'DOC-0003'), targets);
console.log(JSON.stringify({ method: ex.extractMethod, subject: ex.subject?.target_name, eventType: ex.eventType, evidenceType: ex.evidenceType, quote: ex.quote, fallback: ex.llm_fallback_reason }, null, 2));
