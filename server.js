import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, 'data');
const statePath = path.join(dataDir, 'assistant-state.json');
const profilePath = path.join(dataDir, 'assistant-profile.json');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_STATE = {
  memory: [],
  conversations: [],
  promptVariants: [
    {
      id: 'base-helper',
      createdAt: new Date().toISOString(),
      score: 0,
      uses: 0,
      text:
        '你是一個可自我改進的個人 AI 助理。你必須：1) 先給可執行方案；2) 預設使用免費/開源工具；3) 說明風險與替代方案；4) 回覆要精簡且可落地。'
    }
  ],
  stats: {
    totalChats: 0,
    avgRating: null,
    feedbackCount: 0,
    lastEvolvedAt: null
  }
};

const DEFAULT_PROFILE = {
  name: 'personal-default',
  updatedAt: new Date().toISOString(),
  instruction:
    '回答格式固定為：\\n1) 先給一句結論\\n2) 再給 3-5 個可執行步驟\\n3) 最後給「今天立刻可做」的 checklist。\\n語氣：簡潔、務實、避免空話。'
};

async function ensureState() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(statePath);
  } catch {
    await fs.writeFile(statePath, JSON.stringify(DEFAULT_STATE, null, 2), 'utf-8');
  }

  try {
    await fs.access(profilePath);
  } catch {
    await fs.writeFile(profilePath, JSON.stringify(DEFAULT_PROFILE, null, 2), 'utf-8');
  }
}

async function loadState() {
  await ensureState();
  const raw = await fs.readFile(statePath, 'utf-8');
  return JSON.parse(raw);
}

async function saveState(state) {
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

async function loadProfile() {
  await ensureState();
  const raw = await fs.readFile(profilePath, 'utf-8');
  return JSON.parse(raw);
}

async function saveProfile(profile) {
  await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf-8');
}

function selectPromptVariant(state) {
  const scored = [...state.promptVariants].sort((a, b) => {
    const aScore = a.uses > 0 ? a.score / a.uses : a.score;
    const bScore = b.uses > 0 ? b.score / b.uses : b.score;
    return bScore - aScore;
  });
  return scored[0] || DEFAULT_STATE.promptVariants[0];
}

function tokenize(text = '') {
  return text
    .toLowerCase()
    .replace(/[\W_]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

function retrieveMemories(state, message, limit = 3) {
  const keywords = new Set(tokenize(message));
  const ranked = state.memory
    .map((item) => {
      const overlap = tokenize(item.summary).filter((t) => keywords.has(t)).length;
      return { item, overlap };
    })
    .filter((row) => row.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit)
    .map((row) => row.item.summary);

  return ranked;
}

function fallbackReply(message, memories) {
  const memoryHint = memories.length
    ? `\n你之前提過：${memories.join('；')}`
    : '';

  return [
    '我目前無法連線到雲端模型，先用離線策略回覆：',
    `1) 釐清目標：${message.slice(0, 80)}`,
    '2) 拆成 3 個可在今天完成的小步驟。',
    '3) 先做最小可行版本，收集結果再優化。',
    memoryHint,
    '若你提供 API key 或啟用 Ollama，我可以給更深入且可自我學習的建議。'
  ]
    .filter(Boolean)
    .join('\n');
}

async function chatWithOllama(messages) {
  if (!process.env.OLLAMA_MODEL) {
    return null;
  }

  const response = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL,
      messages,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama failed: ${response.status}`);
  }

  const data = await response.json();
  return data?.message?.content || null;
}

async function checkOllamaAvailability() {
  if (!process.env.OLLAMA_MODEL) {
    return { enabled: false, available: false, reason: 'OLLAMA_MODEL 未設定' };
  }

  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags');
    if (!response.ok) {
      return { enabled: true, available: false, reason: `HTTP ${response.status}` };
    }
    return { enabled: true, available: true, reason: null };
  } catch {
    return { enabled: true, available: false, reason: '無法連線到 Ollama (127.0.0.1:11434)' };
  }
}

async function chatWithOpenRouter(messages) {
  if (!process.env.OPENROUTER_API_KEY) {
    return null;
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
      messages
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter failed: ${response.status}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || null;
}

async function generateAssistantReply(systemPrompt, memories, message) {
  const profile = await loadProfile();
  const profileInstruction = profile?.instruction
    ? `\\n\\n使用者指定回答模板：\\n${profile.instruction}`
    : '';
  const memoryBlock = memories.length
    ? `\n以下是使用者歷史偏好，請納入回覆：\n- ${memories.join('\n- ')}`
    : '';

  const messages = [
    { role: 'system', content: systemPrompt + profileInstruction + memoryBlock },
    { role: 'user', content: message }
  ];

  const providers = [chatWithOllama, chatWithOpenRouter];
  const errors = [];

  for (const provider of providers) {
    try {
      const text = await provider(messages);
      if (text) {
        return { text, provider: provider.name, errors };
      }
    } catch (err) {
      errors.push(err.message);
    }
  }

  return {
    text: fallbackReply(message, memories),
    provider: 'fallbackReply',
    errors
  };
}

function mutatePrompt(basePrompt, conversationSample) {
  const extra = conversationSample.includes('細節')
    ? '回覆前先列「已知/未知」，再給下一步。'
    : '優先輸出清單、時間表與可驗收結果。';

  return `${basePrompt}\n額外優化規則：${extra}`;
}

app.get('/health', async (_, res) => {
  const state = await loadState();
  res.json({
    ok: true,
    memoryCount: state.memory.length,
    promptVariants: state.promptVariants.length
  });
});

app.get('/assistant/providers', async (_, res) => {
  const ollama = await checkOllamaAvailability();
  const openrouter = {
    enabled: Boolean(process.env.OPENROUTER_API_KEY),
    available: Boolean(process.env.OPENROUTER_API_KEY),
    reason: process.env.OPENROUTER_API_KEY ? null : 'OPENROUTER_API_KEY 未設定'
  };

  res.json({
    ollama,
    openrouter,
    fallback: {
      enabled: true,
      available: true,
      reason: null
    }
  });
});

app.post('/assistant/chat', async (req, res) => {
  const { userId = 'default', message } = req.body;
  if (!message) {
    return res.status(400).json({ error: '缺少 message' });
  }

  try {
    const state = await loadState();
    const chosenPrompt = selectPromptVariant(state);
    const memories = retrieveMemories(state, message);

    const result = await generateAssistantReply(chosenPrompt.text, memories, message);

    chosenPrompt.uses += 1;
    state.stats.totalChats += 1;

    const conversation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      userId,
      createdAt: new Date().toISOString(),
      promptVariantId: chosenPrompt.id,
      provider: result.provider,
      message,
      reply: result.text,
      providerErrors: result.errors
    };

    state.conversations.push(conversation);
    state.conversations = state.conversations.slice(-300);

    state.memory.push({
      createdAt: conversation.createdAt,
      summary: `${message.slice(0, 120)} -> ${result.text.slice(0, 120)}`
    });
    state.memory = state.memory.slice(-400);

    await saveState(state);
    res.json({
      conversationId: conversation.id,
      reply: result.text,
      provider: result.provider,
      promptVariantId: chosenPrompt.id,
      memoryUsed: memories
    });
  } catch (err) {
    console.error('assistant/chat error:', err);
    res.status(500).json({ error: '助理回覆失敗' });
  }
});

app.post('/assistant/feedback', async (req, res) => {
  const { conversationId, rating, improvedReply } = req.body;
  if (!conversationId || typeof rating !== 'number') {
    return res.status(400).json({ error: '缺少 conversationId 或 rating' });
  }

  try {
    const state = await loadState();
    const conversation = state.conversations.find((row) => row.id === conversationId);
    if (!conversation) {
      return res.status(404).json({ error: '找不到 conversationId' });
    }

    if (conversation.rating !== undefined) {
      return res.status(409).json({ error: '這筆對話已評分' });
    }

    conversation.rating = rating;
    if (improvedReply) {
      conversation.improvedReply = improvedReply;
    }

    const variant = state.promptVariants.find((v) => v.id === conversation.promptVariantId);
    if (variant) {
      variant.score += rating;
      if (rating <= 2) {
        const mutated = mutatePrompt(variant.text, conversation.message);
        state.promptVariants.push({
          id: `mutated-${Date.now()}`,
          createdAt: new Date().toISOString(),
          score: 0,
          uses: 0,
          text: mutated
        });
      }
    }
    state.promptVariants = state.promptVariants.slice(-50);

    state.stats.feedbackCount += 1;
    const rated = state.conversations.filter((row) => typeof row.rating === 'number');
    state.stats.avgRating = rated.reduce((acc, row) => acc + row.rating, 0) / rated.length;

    await saveState(state);
    res.json({
      ok: true,
      avgRating: state.stats.avgRating,
      promptVariants: state.promptVariants.length
    });
  } catch (err) {
    console.error('assistant/feedback error:', err);
    res.status(500).json({ error: '儲存回饋失敗' });
  }
});

app.post('/assistant/evolve', async (_, res) => {
  try {
    const state = await loadState();
    const badConversations = state.conversations.filter((c) => c.rating !== undefined && c.rating <= 2);

    if (badConversations.length === 0) {
      return res.json({ ok: true, message: '目前沒有低分對話，暫不進化。' });
    }

    const latest = badConversations[badConversations.length - 1];
    const bestVariant = selectPromptVariant(state);
    const evolvedPrompt = mutatePrompt(bestVariant.text, latest.message);

    state.promptVariants.push({
      id: `evolved-${Date.now()}`,
      createdAt: new Date().toISOString(),
      score: 0,
      uses: 0,
      text: evolvedPrompt
    });

    state.stats.lastEvolvedAt = new Date().toISOString();
    await saveState(state);

    res.json({
      ok: true,
      newVariantId: state.promptVariants[state.promptVariants.length - 1].id,
      promptVariants: state.promptVariants.length
    });
  } catch (err) {
    console.error('assistant/evolve error:', err);
    res.status(500).json({ error: '進化流程失敗' });
  }
});

app.get('/assistant/state', async (_, res) => {
  const state = await loadState();
  res.json({
    stats: state.stats,
    memoryCount: state.memory.length,
    conversations: state.conversations.length,
    promptVariants: state.promptVariants.map(({ id, score, uses, createdAt }) => ({
      id,
      score,
      uses,
      createdAt
    }))
  });
});

app.get('/assistant/profile', async (_, res) => {
  const profile = await loadProfile();
  res.json(profile);
});

app.post('/assistant/profile', async (req, res) => {
  const { instruction } = req.body;
  if (!instruction || typeof instruction !== 'string') {
    return res.status(400).json({ error: '請提供 instruction 字串' });
  }

  const next = {
    name: 'personal-default',
    updatedAt: new Date().toISOString(),
    instruction: instruction.slice(0, 3000)
  };
  await saveProfile(next);
  return res.json({ ok: true, profile: next });
});

app.get('/assistant/export', async (_, res) => {
  const state = await loadState();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=\"assistant-state-${Date.now()}.json\"`);
  res.send(JSON.stringify(state, null, 2));
});

app.post('/assistant/import', async (req, res) => {
  const { state } = req.body;
  if (!state || typeof state !== 'object') {
    return res.status(400).json({ error: '請提供 state 物件' });
  }

  const merged = {
    ...DEFAULT_STATE,
    ...state,
    memory: Array.isArray(state.memory) ? state.memory.slice(-400) : [],
    conversations: Array.isArray(state.conversations) ? state.conversations.slice(-300) : [],
    promptVariants: Array.isArray(state.promptVariants) && state.promptVariants.length > 0
      ? state.promptVariants.slice(-50)
      : DEFAULT_STATE.promptVariants
  };

  await saveState(merged);
  return res.json({ ok: true, message: '匯入完成' });
});

app.post('/assistant/reset', async (_, res) => {
  await saveState(DEFAULT_STATE);
  res.json({ ok: true, message: '助理狀態已重設' });
});

app.post('/generate', async (req, res) => {
  const { imageBase64, prompt } = req.body;

  if (!imageBase64 || !prompt) {
    return res.status(400).json({ error: '缺少圖片或描述文字' });
  }

  try {
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: 'c3c9d85e8afc65aaeb4e0e2e5f38d130c65d8e90e4f6e1e15e1f66d157b74fbb',
        input: {
          source_image: imageBase64,
          motion_prompt: prompt
        }
      })
    });

    const data = await response.json();
    if (!data.urls?.get) {
      return res.status(500).json({ error: 'Replicate API 回傳格式錯誤' });
    }

    const statusUrl = data.urls.get;
    let outputUrl = null;
    const maxRetries = 30;

    for (let i = 0; i < maxRetries; i += 1) {
      const pollRes = await fetch(statusUrl, {
        headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` }
      });
      const pollJson = await pollRes.json();

      if (pollJson.status === 'succeeded') {
        outputUrl = pollJson.output;
        break;
      }

      if (pollJson.status === 'failed') {
        return res.status(500).json({ error: 'AI 生成失敗' });
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (!outputUrl) {
      return res.status(504).json({ error: 'AI 處理超時' });
    }

    return res.json({ videoUrl: outputUrl });
  } catch (err) {
    console.error('generate error:', err);
    return res.status(500).json({ error: '伺服器錯誤，請稍後重試' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await ensureState();
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
