/**
 * Gemini Mini GPT Studio - Main Application Logic
 * Modular client-side architecture for managing Gemini API calls,
 * stream processing, conversation history, and dynamic UI states.
 */

(function () {
  'use strict';

  // ==========================================
  // 1. STATE & STORAGE MANAGEMENT
  // ==========================================
  const STORAGE_KEYS = {
    API_KEY: 'gemini_mini_api_key',
    MODEL: 'gemini_mini_model',
    SYSTEM_INSTRUCTION: 'gemini_mini_system_instruction',
    TEMP: 'gemini_mini_temp',
    MAX_TOKENS: 'gemini_mini_max_tokens',
    THEME: 'gemini_mini_theme',
    CHATS: 'gemini_mini_chats_list',
    ACTIVE_CHAT_ID: 'gemini_mini_active_chat_id'
  };

  const PROVIDED_KEY = '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';

  let state = {
    apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || PROVIDED_KEY,
    model: localStorage.getItem(STORAGE_KEYS.MODEL) || (PROVIDED_KEY.startsWith('gsk_') ? 'llama-3.3-70b-versatile' : 'gemini-2.5-flash'),
    systemInstruction: localStorage.getItem(STORAGE_KEYS.SYSTEM_INSTRUCTION) || '',
    temperature: parseFloat(localStorage.getItem(STORAGE_KEYS.TEMP)) || 0.7,
    maxTokens: parseInt(localStorage.getItem(STORAGE_KEYS.MAX_TOKENS), 10) || 2048,
    theme: localStorage.getItem(STORAGE_KEYS.THEME) || 'dark',
    chats: JSON.parse(localStorage.getItem(STORAGE_KEYS.CHATS) || '[]'),
    activeChatId: localStorage.getItem(STORAGE_KEYS.ACTIVE_CHAT_ID) || null,
    attachedImages: [], // array of { file, mimeType, base64 }
    isGenerating: false,
    abortController: null,
    recognition: null,
    isListening: false
  };

  // Configure Marked.js Options
  if (window.marked) {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
  }

  // DOM Elements Selector Cache
  const DOM = {
    sidebar: document.getElementById('sidebar'),
    closeSidebarBtn: document.getElementById('closeSidebarBtn'),
    toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
    newChatBtn: document.getElementById('newChatBtn'),
    historyList: document.getElementById('historyList'),
    
    // Header
    modelSelect: document.getElementById('modelSelect'),
    exportChatBtn: document.getElementById('exportChatBtn'),
    clearChatBtn: document.getElementById('clearChatBtn'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    
    // Status & Settings
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    quickKeyConfigBtn: document.getElementById('quickKeyConfigBtn'),
    openSettingsBtn: document.getElementById('openSettingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsModalBtn: document.getElementById('closeSettingsModalBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    clearApiKeyBtn: document.getElementById('clearApiKeyBtn'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    toggleApiKeyVisibility: document.getElementById('toggleApiKeyVisibility'),
    eyeIcon: document.getElementById('eyeIcon'),
    systemInstructionInput: document.getElementById('systemInstructionInput'),
    tempSlider: document.getElementById('tempSlider'),
    tempVal: document.getElementById('tempVal'),
    maxTokensSlider: document.getElementById('maxTokensSlider'),
    maxTokensVal: document.getElementById('maxTokensVal'),

    // Chat Area
    chatContainer: document.getElementById('chatContainer'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    messageList: document.getElementById('messageList'),
    presetCards: document.querySelectorAll('.preset-card'),

    // Input Bar
    imagePreviewContainer: document.getElementById('imagePreviewContainer'),
    attachImageBtn: document.getElementById('attachImageBtn'),
    imageFileInput: document.getElementById('imageFileInput'),
    promptInput: document.getElementById('promptInput'),
    micBtn: document.getElementById('micBtn'),
    sendBtn: document.getElementById('sendBtn')
  };

  // ==========================================
  // 2. INITIALIZATION & SETUP
  // ==========================================
  function initApp() {
    applyTheme(state.theme);
    updateApiKeyStatus();
    loadSettingsIntoModal();

    // Ensure model selector is sync'd
    DOM.modelSelect.value = state.model;

    // Load or create initial chat session
    if (!state.chats.length) {
      createNewChat(false);
    } else if (!state.activeChatId || !state.chats.find(c => c.id === state.activeChatId)) {
      state.activeChatId = state.chats[0].id;
      saveState();
    }

    renderHistoryList();
    renderActiveChat();
    setupEventListeners();
    setupSpeechRecognition();
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEYS.API_KEY, state.apiKey);
    localStorage.setItem(STORAGE_KEYS.MODEL, state.model);
    localStorage.setItem(STORAGE_KEYS.SYSTEM_INSTRUCTION, state.systemInstruction);
    localStorage.setItem(STORAGE_KEYS.TEMP, state.temperature);
    localStorage.setItem(STORAGE_KEYS.MAX_TOKENS, state.maxTokens);
    localStorage.setItem(STORAGE_KEYS.THEME, state.theme);
    localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(state.chats));
    if (state.activeChatId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_CHAT_ID, state.activeChatId);
    }
    updateApiKeyStatus();
  }

  function updateApiKeyStatus() {
    if (state.apiKey && state.apiKey.trim().length > 10) {
      DOM.statusDot.classList.add('active');
      if (state.apiKey.trim().startsWith('gsk_')) {
        DOM.statusText.textContent = 'Groq API Ready';
      } else {
        DOM.statusText.textContent = 'Gemini API Ready';
      }
    } else {
      DOM.statusDot.classList.remove('active');
      DOM.statusText.textContent = 'API Key Required';
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = DOM.themeToggleBtn.querySelector('i');
    if (theme === 'light') {
      icon.className = 'fa-solid fa-sun';
    } else {
      icon.className = 'fa-solid fa-moon';
    }
  }

  // ==========================================
  // 3. CHAT MANAGEMENT (CRUD)
  // ==========================================
  function createNewChat(shouldRender = true) {
    const newChat = {
      id: 'chat_' + Date.now(),
      title: 'New Conversation',
      createdAt: new Date().toISOString(),
      messages: []
    };
    state.chats.unshift(newChat);
    state.activeChatId = newChat.id;
    saveState();

    if (shouldRender) {
      renderHistoryList();
      renderActiveChat();
    }
    return newChat;
  }

  function getActiveChat() {
    return state.chats.find(c => c.id === state.activeChatId);
  }

  function deleteChat(chatId, e) {
    if (e) e.stopPropagation();
    state.chats = state.chats.filter(c => c.id !== chatId);
    if (state.activeChatId === chatId) {
      state.activeChatId = state.chats.length ? state.chats[0].id : null;
    }
    if (!state.chats.length) {
      createNewChat(false);
    }
    saveState();
    renderHistoryList();
    renderActiveChat();
  }

  function renameChat(chatId, e) {
    if (e) e.stopPropagation();
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;

    const newTitle = prompt('Enter conversation name:', chat.title);
    if (newTitle && newTitle.trim()) {
      chat.title = newTitle.trim();
      saveState();
      renderHistoryList();
    }
  }

  function renderHistoryList() {
    DOM.historyList.innerHTML = '';
    state.chats.forEach(chat => {
      const item = document.createElement('div');
      item.className = `history-item ${chat.id === state.activeChatId ? 'active' : ''}`;
      item.onclick = () => switchChat(chat.id);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'history-item-title';
      titleSpan.textContent = chat.title || 'Untitled Chat';

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'history-item-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn-sm';
      editBtn.title = 'Rename';
      editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
      editBtn.onclick = (e) => renameChat(chat.id, e);

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn-sm';
      delBtn.title = 'Delete';
      delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
      delBtn.onclick = (e) => deleteChat(chat.id, e);

      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(delBtn);

      item.appendChild(titleSpan);
      item.appendChild(actionsDiv);
      DOM.historyList.appendChild(item);
    });
  }

  function switchChat(chatId) {
    if (state.isGenerating) return;
    state.activeChatId = chatId;
    saveState();
    renderHistoryList();
    renderActiveChat();
  }

  function renderActiveChat() {
    const activeChat = getActiveChat();
    DOM.messageList.innerHTML = '';

    if (!activeChat || !activeChat.messages.length) {
      DOM.welcomeScreen.style.display = 'flex';
      DOM.messageList.style.display = 'none';
      return;
    }

    DOM.welcomeScreen.style.display = 'none';
    DOM.messageList.style.display = 'flex';

    activeChat.messages.forEach(msg => {
      appendMessageToDOM(msg);
    });

    scrollToBottom();
  }

  // ==========================================
  // 4. DOM MESSAGE RENDERING & MARKDOWN
  // ==========================================
  function appendMessageToDOM(msg) {
    const isUser = msg.role === 'user';
    const row = document.createElement('div');
    row.className = `message-row ${isUser ? 'user-row' : 'ai-row'}`;
    row.dataset.msgId = msg.id;

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = `avatar ${isUser ? 'avatar-user' : 'avatar-ai'}`;
    avatar.innerHTML = isUser 
      ? '<i class="fa-solid fa-user"></i>' 
      : '<i class="fa-solid fa-sparkles"></i>';

    // Bubble
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Attached Images inside user message
    if (isUser && msg.images && msg.images.length) {
      msg.images.forEach(imgData => {
        const img = document.createElement('img');
        img.src = imgData.url || `data:${imgData.mimeType};base64,${imgData.base64}`;
        img.className = 'message-media-preview';
        bubble.appendChild(img);
      });
    }

    // Text Content Container
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-text-content';

    if (isUser) {
      contentDiv.textContent = msg.content;
    } else {
      contentDiv.innerHTML = parseMarkdown(msg.content);
    }
    bubble.appendChild(contentDiv);

    // Message Footer (Actions: copy, text-to-speech)
    const footer = document.createElement('div');
    footer.className = 'message-footer';
    
    const timeSpan = document.createElement('span');
    timeSpan.textContent = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    const actions = document.createElement('div');
    actions.className = 'message-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'icon-btn-sm';
    copyBtn.title = 'Copy Text';
    copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(msg.content);
      copyBtn.innerHTML = '<i class="fa-solid fa-check" style="color:#10b981;"></i>';
      setTimeout(() => { copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 2000);
    };
    actions.appendChild(copyBtn);

    if (!isUser) {
      const speakBtn = document.createElement('button');
      speakBtn.className = 'icon-btn-sm';
      speakBtn.title = 'Read Aloud';
      speakBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
      speakBtn.onclick = () => speakText(msg.content, speakBtn);
      actions.appendChild(speakBtn);
    }

    footer.appendChild(timeSpan);
    footer.appendChild(actions);
    bubble.appendChild(footer);

    row.appendChild(avatar);
    row.appendChild(bubble);

    DOM.messageList.appendChild(row);
    enhanceCodeBlocks(row);
  }

  function parseMarkdown(rawText) {
    if (!rawText) return '';
    if (window.marked) {
      return marked.parse(rawText);
    }
    return rawText.replace(/\n/g, '<br>');
  }

  function enhanceCodeBlocks(parentElem) {
    const codeElements = parentElem.querySelectorAll('pre code');
    codeElements.forEach((codeEl) => {
      // Highlight syntax using highlight.js
      if (window.hljs) {
        hljs.highlightElement(codeEl);
      }

      const pre = codeEl.parentElement;
      if (pre.parentElement.classList.contains('code-block-wrapper')) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';

      const header = document.createElement('div');
      header.className = 'code-header';

      // Detect language
      const langClass = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
      const langName = langClass ? langClass.replace('language-', '') : 'code';

      header.innerHTML = `
        <span>${langName}</span>
        <button class="copy-code-btn" type="button">
          <i class="fa-regular fa-copy"></i> Copy code
        </button>
      `;

      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(header);
      wrapper.appendChild(pre);

      const copyBtn = header.querySelector('.copy-code-btn');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(codeEl.innerText);
        copyBtn.innerHTML = '<i class="fa-solid fa-check" style="color: #10b981;"></i> Copied!';
        setTimeout(() => {
          copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy code';
        }, 2000);
      });
    });
  }

  function scrollToBottom() {
    setTimeout(() => {
      DOM.chatContainer.scrollTop = DOM.chatContainer.scrollHeight;
    }, 50);
  }

  // ==========================================
  // 5. GEMINI API INTEGRATION & STREAMING
  // ==========================================
  async function handleSendMessage() {
    const text = DOM.promptInput.value.trim();
    if ((!text && !state.attachedImages.length) || state.isGenerating) return;

    if (!state.apiKey) {
      openSettingsModal();
      alert('Please configure your Google Gemini API key to start chatting.');
      return;
    }

    const activeChat = getActiveChat();
    if (!activeChat) return;

    // Auto-generate title if this is the first message
    if (activeChat.messages.length === 0 && text) {
      activeChat.title = text.length > 30 ? text.substring(0, 30) + '...' : text;
      renderHistoryList();
    }

    // 1. Create User Message
    const userMsg = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: text,
      images: [...state.attachedImages],
      timestamp: new Date().toISOString()
    };

    activeChat.messages.push(userMsg);
    saveState();

    // Update UI
    DOM.welcomeScreen.style.display = 'none';
    DOM.messageList.style.display = 'flex';
    appendMessageToDOM(userMsg);

    // Reset Input
    DOM.promptInput.value = '';
    DOM.promptInput.style.height = 'auto';
    clearAttachedImages();
    updateSendButtonState();

    // 2. Prepare AI Response Message Placeholder
    const aiMsgId = 'msg_' + (Date.now() + 1);
    const aiMsg = {
      id: aiMsgId,
      role: 'model',
      content: '',
      timestamp: new Date().toISOString()
    };

    activeChat.messages.push(aiMsg);
    saveState();

    // Render AI Row with Typing Indicator
    const aiRow = document.createElement('div');
    aiRow.className = 'message-row ai-row';
    aiRow.dataset.msgId = aiMsgId;
    aiRow.innerHTML = `
      <div class="avatar avatar-ai"><i class="fa-solid fa-sparkles"></i></div>
      <div class="message-bubble">
        <div class="typing-indicator" id="indicator_${aiMsgId}">
          <div class="dot"></div>
          <div class="dot"></div>
          <div class="dot"></div>
        </div>
        <div class="message-text-content" id="text_${aiMsgId}"></div>
        <div class="message-footer" style="display: none;" id="footer_${aiMsgId}">
          <span>Just now</span>
          <div class="message-actions">
            <button class="icon-btn-sm copy-btn" title="Copy"><i class="fa-regular fa-copy"></i></button>
            <button class="icon-btn-sm speak-btn" title="Read Aloud"><i class="fa-solid fa-volume-high"></i></button>
          </div>
        </div>
      </div>
    `;
    DOM.messageList.appendChild(aiRow);
    scrollToBottom();

    // Set Generating State
    state.isGenerating = true;
    state.abortController = new AbortController();
    toggleSendButtonIcon(true);

    try {
      const isGroq = state.apiKey.trim().startsWith('gsk_') || state.model.startsWith('llama-') || state.model.startsWith('mixtral-') || state.model.startsWith('gemma');

      const indicator = document.getElementById(`indicator_${aiMsgId}`);
      const textElem = document.getElementById(`text_${aiMsgId}`);
      let streamedContent = '';

      if (isGroq) {
        // Groq API Endpoint (OpenAI Chat Completions Format)
        const groqEndpoint = 'https://api.groq.com/openai/v1/chat/completions';
        const groqModel = state.model.startsWith('gemini') ? 'llama-3.3-70b-versatile' : state.model;

        const messagesPayload = [];
        if (state.systemInstruction && state.systemInstruction.trim()) {
          messagesPayload.push({ role: 'system', content: state.systemInstruction.trim() });
        }

        activeChat.messages.slice(0, -1).forEach(m => {
          if (m.images && m.images.length) {
            const contentParts = [{ type: 'text', text: m.content || '' }];
            m.images.forEach(img => {
              contentParts.push({
                type: 'image_url',
                image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
              });
            });
            messagesPayload.push({ role: m.role === 'user' ? 'user' : 'assistant', content: contentParts });
          } else {
            messagesPayload.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content || '' });
          }
        });

        const response = await fetch(groqEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.apiKey.trim()}`
          },
          body: JSON.stringify({
            model: groqModel,
            messages: messagesPayload,
            temperature: state.temperature,
            max_tokens: state.maxTokens,
            stream: true
          }),
          signal: state.abortController.signal
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.error?.message || `Groq API Error HTTP ${response.status}: ${response.statusText}`);
        }

        if (indicator) indicator.style.display = 'none';

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.replace('data: ', '').trim();
              if (dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                const chunk = parsed.choices?.[0]?.delta?.content;
                if (chunk) {
                  streamedContent += chunk;
                  aiMsg.content = streamedContent;
                  if (textElem) {
                    textElem.innerHTML = parseMarkdown(streamedContent);
                    enhanceCodeBlocks(aiRow);
                  }
                  scrollToBottom();
                }
              } catch (e) {}
            }
          }
        }
      } else {
        // Google Gemini API Endpoint
        const contentsPayload = activeChat.messages.slice(0, -1).map(m => {
          const parts = [];
          if (m.content) {
            parts.push({ text: m.content });
          }
          if (m.images && m.images.length) {
            m.images.forEach(img => {
              parts.push({
                inline_data: {
                  mime_type: img.mimeType,
                  data: img.base64
                }
              });
            });
          }
          return {
            role: m.role === 'user' ? 'user' : 'model',
            parts: parts
          };
        });

        const requestBody = {
          contents: contentsPayload,
          generationConfig: {
            temperature: state.temperature,
            maxOutputTokens: state.maxTokens
          }
        };

        if (state.systemInstruction && state.systemInstruction.trim()) {
          requestBody.system_instruction = {
            parts: [{ text: state.systemInstruction.trim() }]
          };
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${state.model}:streamGenerateContent?alt=sse&key=${state.apiKey.trim()}`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: state.abortController.signal
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.error?.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        if (indicator) indicator.style.display = 'none';

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.replace('data: ', '').trim();
              if (dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                const candidate = parsed.candidates?.[0];
                const textChunk = candidate?.content?.parts?.[0]?.text;
                if (textChunk) {
                  streamedContent += textChunk;
                  aiMsg.content = streamedContent;
                  if (textElem) {
                    textElem.innerHTML = parseMarkdown(streamedContent);
                    enhanceCodeBlocks(aiRow);
                  }
                  scrollToBottom();
                }
              } catch (err) {
                console.warn('Chunk parse error:', err);
              }
            }
          }
        }
      }

      // Finalize message state
      saveState();

      // Show actions footer
      const footer = document.getElementById(`footer_${aiMsgId}`);
      if (footer) {
        footer.style.display = 'flex';
        const copyBtn = footer.querySelector('.copy-btn');
        if (copyBtn) {
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(aiMsg.content);
            copyBtn.innerHTML = '<i class="fa-solid fa-check" style="color:#10b981;"></i>';
            setTimeout(() => { copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 2000);
          };
        }
        const speakBtn = footer.querySelector('.speak-btn');
        if (speakBtn) {
          speakBtn.onclick = () => speakText(aiMsg.content, speakBtn);
        }
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Stream generation aborted by user.');
        aiMsg.content += ' *(Generation stopped)*';
      } else {
        console.error('Gemini API Error:', error);
        aiMsg.content = `⚠️ **API Error:** ${error.message}`;
      }
      saveState();
      const textElem = document.getElementById(`text_${aiMsgId}`);
      if (textElem) textElem.innerHTML = parseMarkdown(aiMsg.content);
      const indicator = document.getElementById(`indicator_${aiMsgId}`);
      if (indicator) indicator.style.display = 'none';
    } finally {
      state.isGenerating = false;
      state.abortController = null;
      toggleSendButtonIcon(false);
    }
  }

  function stopGeneration() {
    if (state.abortController) {
      state.abortController.abort();
    }
  }

  function toggleSendButtonIcon(isGenerating) {
    if (isGenerating) {
      DOM.sendBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
      DOM.sendBtn.title = 'Stop Generation';
      DOM.sendBtn.disabled = false;
      DOM.sendBtn.style.background = '#ef4444';
    } else {
      DOM.sendBtn.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
      DOM.sendBtn.title = 'Send Message';
      DOM.sendBtn.style.background = '';
      updateSendButtonState();
    }
  }

  // ==========================================
  // 6. IMAGE ATTACHMENT HANDLING
  // ==========================================
  function handleImageUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const base64Data = evt.target.result.split(',')[1];
        state.attachedImages.push({
          file: file,
          mimeType: file.type,
          base64: base64Data,
          url: evt.target.result
        });
        renderAttachedImages();
        updateSendButtonState();
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  }

  function renderAttachedImages() {
    DOM.imagePreviewContainer.innerHTML = '';
    if (!state.attachedImages.length) {
      DOM.imagePreviewContainer.style.display = 'none';
      return;
    }

    DOM.imagePreviewContainer.style.display = 'flex';
    state.attachedImages.forEach((img, idx) => {
      const thumb = document.createElement('div');
      thumb.className = 'preview-thumb';
      
      const imgTag = document.createElement('img');
      imgTag.src = img.url;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-thumb-btn';
      removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      removeBtn.onclick = () => {
        state.attachedImages.splice(idx, 1);
        renderAttachedImages();
        updateSendButtonState();
      };

      thumb.appendChild(imgTag);
      thumb.appendChild(removeBtn);
      DOM.imagePreviewContainer.appendChild(thumb);
    });
  }

  function clearAttachedImages() {
    state.attachedImages = [];
    renderAttachedImages();
  }

  // ==========================================
  // 7. SPEECH SYNTHESIS & RECOGNITION
  // ==========================================
  function speakText(text, buttonElem) {
    if (!('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in this browser.');
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      if (buttonElem) buttonElem.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
      return;
    }

    // Clean markdown symbols for clearer speech
    const cleanText = text.replace(/[`*#_~]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;

    if (buttonElem) {
      buttonElem.innerHTML = '<i class="fa-solid fa-volume-xmark" style="color:#ef4444;"></i>';
    }

    utterance.onend = () => {
      if (buttonElem) buttonElem.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    };

    window.speechSynthesis.speak(utterance);
  }

  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      DOM.micBtn.style.display = 'none';
      return;
    }

    state.recognition = new SpeechRecognition();
    state.recognition.continuous = false;
    state.recognition.interimResults = true;

    state.recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0])
        .map(result => result.transcript)
        .join('');

      DOM.promptInput.value = transcript;
      updateSendButtonState();
    };

    state.recognition.onend = () => {
      state.isListening = false;
      DOM.micBtn.classList.remove('active');
    };

    state.recognition.onerror = (err) => {
      console.error('Speech recognition error:', err);
      state.isListening = false;
      DOM.micBtn.classList.remove('active');
    };
  }

  function toggleSpeechRecognition() {
    if (!state.recognition) return;

    if (state.isListening) {
      state.recognition.stop();
    } else {
      state.recognition.start();
      state.isListening = true;
      DOM.micBtn.classList.add('active');
    }
  }

  // ==========================================
  // 8. MODALS & EXPORT UTILITIES
  // ==========================================
  function openSettingsModal() {
    DOM.apiKeyInput.value = state.apiKey;
    DOM.systemInstructionInput.value = state.systemInstruction;
    DOM.tempSlider.value = state.temperature;
    DOM.tempVal.textContent = state.temperature;
    DOM.maxTokensSlider.value = state.maxTokens;
    DOM.maxTokensVal.textContent = state.maxTokens;
    DOM.settingsModal.classList.add('active');
  }

  function closeSettingsModal() {
    DOM.settingsModal.classList.remove('active');
  }

  function saveSettings() {
    state.apiKey = DOM.apiKeyInput.value.trim();
    state.systemInstruction = DOM.systemInstructionInput.value.trim();
    state.temperature = parseFloat(DOM.tempSlider.value);
    state.maxTokens = parseInt(DOM.maxTokensSlider.value, 10);
    saveState();
    closeSettingsModal();
  }

  function clearApiKey() {
    if (confirm('Are you sure you want to remove your stored API key?')) {
      state.apiKey = '';
      DOM.apiKeyInput.value = '';
      saveState();
      closeSettingsModal();
    }
  }

  function loadSettingsIntoModal() {
    DOM.tempSlider.value = state.temperature;
    DOM.tempVal.textContent = state.temperature;
    DOM.maxTokensSlider.value = state.maxTokens;
    DOM.maxTokensVal.textContent = state.maxTokens;
  }

  function exportChatLog() {
    const activeChat = getActiveChat();
    if (!activeChat || !activeChat.messages.length) {
      alert('No chat messages to export.');
      return;
    }

    let mdContent = `# ${activeChat.title || 'Chat Export'}\n*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;
    activeChat.messages.forEach(m => {
      const sender = m.role === 'user' ? '👤 User' : '🤖 Gemini';
      mdContent += `### ${sender}\n${m.content}\n\n`;
    });

    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeChat.title || 'gemini_chat').toLowerCase().replace(/[^a-z0-9]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function updateSendButtonState() {
    if (state.isGenerating) return;
    const hasText = DOM.promptInput.value.trim().length > 0;
    const hasImages = state.attachedImages.length > 0;
    DOM.sendBtn.disabled = !(hasText || hasImages);
  }

  // ==========================================
  // 9. EVENT LISTENERS
  // ==========================================
  function setupEventListeners() {
    // Sidebar Controls
    DOM.toggleSidebarBtn.addEventListener('click', () => {
      DOM.sidebar.classList.toggle('collapsed');
    });
    DOM.closeSidebarBtn.addEventListener('click', () => {
      DOM.sidebar.classList.add('collapsed');
    });
    DOM.newChatBtn.addEventListener('click', () => createNewChat(true));

    // Header Controls
    DOM.modelSelect.addEventListener('change', (e) => {
      state.model = e.target.value;
      saveState();
    });
    DOM.themeToggleBtn.addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(state.theme);
      saveState();
    });
    DOM.clearChatBtn.addEventListener('click', () => {
      const activeChat = getActiveChat();
      if (activeChat && activeChat.messages.length && confirm('Clear all messages in this conversation?')) {
        activeChat.messages = [];
        saveState();
        renderActiveChat();
      }
    });
    DOM.exportChatBtn.addEventListener('click', exportChatLog);

    // Settings Modal
    DOM.quickKeyConfigBtn.addEventListener('click', openSettingsModal);
    DOM.openSettingsBtn.addEventListener('click', openSettingsModal);
    DOM.closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
    DOM.saveSettingsBtn.addEventListener('click', saveSettings);
    DOM.clearApiKeyBtn.addEventListener('click', clearApiKey);

    DOM.toggleApiKeyVisibility.addEventListener('click', () => {
      const isPassword = DOM.apiKeyInput.type === 'password';
      DOM.apiKeyInput.type = isPassword ? 'text' : 'password';
      DOM.eyeIcon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    });

    DOM.tempSlider.addEventListener('input', (e) => {
      DOM.tempVal.textContent = e.target.value;
    });
    DOM.maxTokensSlider.addEventListener('input', (e) => {
      DOM.maxTokensVal.textContent = e.target.value;
    });

    // Preset Cards Click
    DOM.presetCards.forEach(card => {
      card.addEventListener('click', () => {
        const promptText = card.dataset.prompt;
        if (promptText) {
          DOM.promptInput.value = promptText;
          updateSendButtonState();
          DOM.promptInput.focus();
        }
      });
    });

    // Input Bar Actions
    DOM.promptInput.addEventListener('input', () => {
      // Auto adjust textarea height
      DOM.promptInput.style.height = 'auto';
      DOM.promptInput.style.height = Math.min(DOM.promptInput.scrollHeight, 180) + 'px';
      updateSendButtonState();
    });

    DOM.promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (state.isGenerating) {
          stopGeneration();
        } else {
          handleSendMessage();
        }
      }
    });

    DOM.sendBtn.addEventListener('click', () => {
      if (state.isGenerating) {
        stopGeneration();
      } else {
        handleSendMessage();
      }
    });

    // Image Upload
    DOM.attachImageBtn.addEventListener('click', () => {
      DOM.imageFileInput.click();
    });
    DOM.imageFileInput.addEventListener('change', handleImageUpload);

    // Voice Input Mic
    DOM.micBtn.addEventListener('click', toggleSpeechRecognition);
  }

  // Initialize App on DOM Ready
  document.addEventListener('DOMContentLoaded', initApp);

})();
