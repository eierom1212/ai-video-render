import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.post('/generate', async (req, res) => {
  const { imageBase64, prompt } = req.body;

  if (!imageBase64 || !prompt) {
    return res.status(400).json({ error: '缺少圖片或描述文字' });
  }

  try {
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: "c3c9d85e8afc65aaeb4e0e2e5f38d130c65d8e90e4f6e1e15e1f66d157b74fbb",
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

    for (let i = 0; i < maxRetries; i++) {
      const pollRes = await fetch(statusUrl, {
        headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` }
      });
      const pollJson = await pollRes.json();

      if (pollJson.status === 'succeeded') {
        outputUrl = pollJson.output;
        break;
      } else if (pollJson.status === 'failed') {
        return res.status(500).json({ error: 'AI 生成失敗' });
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (!outputUrl) {
      return res.status(504).json({ error: 'AI 處理超時' });
    }

    res.json({ videoUrl: outputUrl });
  } catch (err) {
    console.error('❌ 錯誤:', err);
    res.status(500).json({ error: '伺服器錯誤，請稍後重試' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
