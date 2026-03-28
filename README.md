# 個人電腦可用的 AI 助理（免費資源優先）

這版是 **真正可在個人電腦長期使用** 的版本：
- 本機優先：先用 Ollama（免費）
- 雲端備援：可選 OpenRouter free model
- 完全離線保底：模型掛掉仍能給策略回覆
- 有本地網頁介面：直接在瀏覽器聊天、評分、進化、重設

## 1. 安裝與啟動

```bash
npm install
cp .env.example .env
npm start
```

開啟：<http://localhost:3000>

## 2. 建議的個人電腦配置（免費）

1) 安裝 Ollama：<https://ollama.com>

2) 下載模型（擇一）

```bash
ollama pull llama3.1:8b
# 或更輕量
# ollama pull qwen2.5:7b
```

3) `.env` 設定：

```bash
OLLAMA_MODEL=llama3.1:8b
PORT=3000
```

> 不填 OpenRouter 也能用；若需要外部備援再加 `OPENROUTER_API_KEY`。

## 3. 你會用到的介面功能

- 送訊息給助理
- 對回覆打 1~5 分（影響 prompt 變體分數）
- 手動觸發進化
- 一鍵重設記憶
- 檢查 Ollama / OpenRouter / fallback 可用狀態

## 4. API（給你之後擴充）

- `GET /health`
- `GET /assistant/providers`
- `POST /assistant/chat`
- `POST /assistant/feedback`
- `POST /assistant/evolve`
- `GET /assistant/state`
- `GET /assistant/export`（匯出 JSON）
- `POST /assistant/import`（匯入 JSON）
- `POST /assistant/reset`

## 5. 備份與搬家

### 匯出
```bash
curl -OJ http://localhost:3000/assistant/export
```

### 匯入
```bash
curl -X POST http://localhost:3000/assistant/import \
  -H 'Content-Type: application/json' \
  -d @backup.json
```

## 6. 目前「自我進化」的定義

- 依歷史評分動態調整 prompt 變體
- 低分回覆會觸發 prompt 突變
- 進化後下次對話會優先選擇平均分較高的變體

> 這是穩健的「行為層進化」，不會自動改動程式碼，避免把系統玩壞。
