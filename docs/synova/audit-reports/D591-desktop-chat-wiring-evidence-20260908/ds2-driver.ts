/**
 * ds2-driver.ts — D591 DS2/DS3/DS4 物理证据驱动（等价 headless 挂真实后端）
 *
 * 生产代码全链路真实:
 *   createStreamingController（electron-renderer/src/hooks/useStreaming.ts 桌面真流式消费核心，生产导出）
 *   + restoreLastSession（CenterPanel.tsx 恢复时序，生产导出）
 *   + 真实全局 fetch → 真实后端（DEV_MODE=false）→ ConversationEngine → SessionStore 落库。
 * 唯一替身 = LLM stand-in（网络边界替身，D590 先例；换真实 key 即完全生产语义）。
 * fetch 仅做日志透传（不改生产代码路径），window/localStorage 为 renderer 环境桩。
 *
 * K3 复现: bash run-ds2-evidence.sh（幂等自清理）
 */
interface FakeStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const PORT = process.env.D591_PORT ?? '18902';
const BASE = `http://localhost:${PORT}`;
const t0 = Date.now();

function log(msg: string): void {
  console.log(`[+${String(Date.now() - t0).padStart(4)}ms] ${msg}`);
}

function check(name: string, cond: boolean): void {
  log(`${cond ? '✅' : '❌'} ${name}`);
  if (!cond) process.exitCode = 1;
}

// ── renderer 环境桩（window.localStorage / electronAPI.getServerUrl）──
const storageMap = new Map<string, string>();
const memoryStorage: FakeStorage = {
  getItem: (k) => (storageMap.has(k) ? (storageMap.get(k) as string) : null),
  setItem: (k, v) => { storageMap.set(k, v); },
  removeItem: (k) => { storageMap.delete(k); },
};
(globalThis as { window?: unknown }).window = {
  localStorage: memoryStorage,
  electronAPI: { getServerUrl: () => BASE },
};

async function main(): Promise<void> {
  log(`node=${process.version} target=${BASE} DEV_MODE=false（后端侧） LLM=本地替身（D590 先例）`);

  // 生产模块（真实桌面消费核心，非测试替身）
  const { createStreamingController } = await import('../../../../electron-renderer/src/hooks/useStreaming');
  const { useConversationStore, restoreMessages, readLastSessionId, LAST_SESSION_ID_STORAGE_KEY } =
    await import('../../../../electron-renderer/src/stores/conversation-store');
  const { restoreLastSession } = await import('../../../../electron-renderer/src/components/CenterPanel');

  // fetch 日志透传（不改行为——观察续轮 body 是否携带 sessionId）
  const realFetch = globalThis.fetch.bind(globalThis);
  let lastConversationBody = '';
  (globalThis as { fetch: typeof fetch }).fetch = (input, init) => {
    const url = String(input);
    const body = init?.body ? String(init.body) : '';
    if (url.includes('/api/conversations')) lastConversationBody = body;
    log(`[fetch] ${init?.method ?? 'GET'} ${url}${body ? ` body=${body}` : ''}`);
    return realFetch(input, init);
  };

  // host：捕获 16ms flush 事件（真流式逐字证据）
  let flushCount = 0;
  let streamingAcc = '';
  const host = {
    setStreaming: (v: boolean) => log(`[host] setStreaming=${v}`),
    appendStreaming: (t: string) => {
      flushCount += 1;
      streamingAcc += t;
      log(`[flush #${flushCount}] +${JSON.stringify(t)} → streamingText=${JSON.stringify(streamingAcc)}`);
    },
    resetStreaming: () => {
      log(`[host] resetStreaming（agent_message 全文落库后清流式区，最终累计=${JSON.stringify(streamingAcc)}）`);
    },
    setExperts: (e: string[]) => { if (e.length > 0) log(`[host] setExperts(${e.length})`); },
  };
  const ctrl = createStreamingController(host);

  // ── DS2: 第一轮对话——token 帧逐字进 streamingText + agent_message 全文上屏 ──
  log('== DS2 第一轮: sendMessage("你好，请介绍一下你自己")（conversation 模式，缺省） ==');
  await ctrl.sendMessage('你好，请介绍一下你自己');

  const store1 = useConversationStore.getState();
  const assistantMsgs1 = store1.messages.filter((m) => m.type === 'assistant');
  const lastAssistant = assistantMsgs1[assistantMsgs1.length - 1];
  const userMsgs1 = store1.messages.filter((m) => m.type === 'user');
  log(`第一轮结果: 消息总数=${store1.messages.length} user=${userMsgs1.length} assistant=${assistantMsgs1.length} flush次数=${flushCount}`);
  log(`最后 assistant 全文: ${JSON.stringify(lastAssistant?.type === 'assistant' ? lastAssistant.content : null)}`);

  check('DS2-a 真流式: token 帧 16ms flush 逐字进 streamingText（flush 次数 > 1）', flushCount > 1);
  check('DS2-b agent_message 全文落消息列表（assistant 消息存在且非空）',
    lastAssistant?.type === 'assistant' && lastAssistant.content.length > 0);
  check('DS2-c 用户消息乐观上屏（提交回声）', userMsgs1.length === 1);

  // ── DS3: open 帧 sessionId 对账 + 续轮 body 携带 sessionId ──
  const sid = store1.currentSessionId;
  log(`== DS3 提交回声对账: currentSessionId=${sid ? sid : '(null)'} localStorage=${memoryStorage.getItem(LAST_SESSION_ID_STORAGE_KEY)} ==`);
  check('DS3-a open 帧 sessionId 落 store', typeof sid === 'string' && sid.startsWith('sess_'));
  check('DS3-b sessionId 落 localStorage 键', memoryStorage.getItem(LAST_SESSION_ID_STORAGE_KEY) === sid);

  log('== DS3 续轮: sendMessage("继续")（应携带 sessionId） ==');
  await ctrl.sendMessage('继续');
  check('DS3-c 续轮 body 携带 sessionId（服务端 fromState 续轮）',
    lastConversationBody.includes('"sessionId"') && lastConversationBody.includes(sid ?? ''));

  // ── DS4: 模拟重启——消息区清零但 localStorage 锚保留 → restoreLastSession 读回 ──
  log('== DS4 模拟重启: 清内存态（保留 localStorage 锚）→ restoreLastSession() ==');
  useConversationStore.setState({ messages: [], currentSessionId: null, phase: 'idle' });
  check('DS4-a 重启模拟: 消息区已清零、localStorage 锚仍在',
    useConversationStore.getState().messages.length === 0 && readLastSessionId() === sid);

  const restoreResult = await restoreLastSession();
  const store4 = useConversationStore.getState();
  const projected = restoreMessages({ messages: store4.messages.map((m) => ({
    role: m.type === 'user' ? 'user' : m.type === 'assistant' ? 'assistant' : 'system',
    content: m.type === 'user' || m.type === 'assistant' ? m.content : '',
  })) });
  log(`恢复结果: ${restoreResult} 消息数=${store4.messages.length} 投影数=${projected.length}`);
  check('DS4-b 刷新恢复: restoreLastSession 返回 restored 且消息区非空',
    restoreResult === 'restored' && store4.messages.length >= 4);
  check('DS4-c 恢复后续轮锚回到 currentSessionId', store4.currentSessionId === sid);

  log(process.exitCode === 1 ? '== D591 e2e 证据驱动: FAIL ==' : '== D591 e2e 证据驱动: 全部 PASS ==');
}

main().catch((err: unknown) => {
  log(`❌ 驱动器异常: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
