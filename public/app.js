const providerStatus = document.getElementById('providerStatus');
const messageInput = document.getElementById('message');
const sendBtn = document.getElementById('sendBtn');
const replyBox = document.getElementById('reply');
const ratingRow = document.getElementById('ratingRow');
const evolveBtn = document.getElementById('evolveBtn');
const resetBtn = document.getElementById('resetBtn');
const refreshStatusBtn = document.getElementById('refreshStatusBtn');
const profileInstruction = document.getElementById('profileInstruction');
const saveProfileBtn = document.getElementById('saveProfileBtn');

let lastConversationId = null;

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function refreshProviders() {
  try {
    const data = await api('/assistant/providers');
    providerStatus.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    providerStatus.textContent = `檢查失敗: ${err.message}`;
  }
}

async function loadProfile() {
  try {
    const data = await api('/assistant/profile');
    profileInstruction.value = data.instruction || '';
  } catch (err) {
    console.error('loadProfile error', err);
  }
}

function renderRatingButtons() {
  ratingRow.innerHTML = '';
  for (let i = 1; i <= 5; i += 1) {
    const btn = document.createElement('button');
    btn.textContent = `${i} 分`;
    btn.className = 'muted';
    btn.onclick = async () => {
      if (!lastConversationId) {
        alert('請先送出一則訊息。');
        return;
      }
      try {
        const data = await api('/assistant/feedback', {
          method: 'POST',
          body: JSON.stringify({
            conversationId: lastConversationId,
            rating: i
          })
        });
        alert(`已送出評分，平均分數: ${Number(data.avgRating).toFixed(2)}`);
      } catch (err) {
        alert(`評分失敗: ${err.message}`);
      }
    };
    ratingRow.appendChild(btn);
  }
}

sendBtn.onclick = async () => {
  const message = messageInput.value.trim();
  if (!message) {
    alert('請先輸入內容');
    return;
  }

  replyBox.textContent = '思考中...';
  try {
    const data = await api('/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ userId: 'local-user', message })
    });

    lastConversationId = data.conversationId;
    replyBox.textContent = `Provider: ${data.provider}\nPrompt: ${data.promptVariantId}\n\n${data.reply}`;
  } catch (err) {
    replyBox.textContent = `失敗: ${err.message}`;
  }
};

evolveBtn.onclick = async () => {
  try {
    const data = await api('/assistant/evolve', { method: 'POST' });
    alert(data.message || `進化完成，新變體: ${data.newVariantId}`);
  } catch (err) {
    alert(`進化失敗: ${err.message}`);
  }
};

resetBtn.onclick = async () => {
  if (!confirm('確定要重設所有記憶與進化紀錄？')) {
    return;
  }

  try {
    const data = await api('/assistant/reset', { method: 'POST' });
    alert(data.message);
    lastConversationId = null;
    replyBox.textContent = '';
  } catch (err) {
    alert(`重設失敗: ${err.message}`);
  }
};

refreshStatusBtn.onclick = refreshProviders;
saveProfileBtn.onclick = async () => {
  const instruction = profileInstruction.value.trim();
  if (!instruction) {
    alert('模板不可為空');
    return;
  }
  try {
    await api('/assistant/profile', {
      method: 'POST',
      body: JSON.stringify({ instruction })
    });
    alert('已儲存回答模板');
  } catch (err) {
    alert(`儲存失敗: ${err.message}`);
  }
};

renderRatingButtons();
refreshProviders();
loadProfile();
