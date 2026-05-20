// background.js — 서비스 워커 (백그라운드 스크립트)
// 역할: Whisper STT + Claude 의도 파악 + 액션 실행 파이프라인

/** ── 브라우저 제어 도구 정의 (Claude Tool Use에 전달) ── */
const BROWSER_TOOLS = [
  {
    name: "open_url",
    description: "지정한 URL을 새 탭에서 엽니다",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "열 URL (https:// 포함 전체 주소)" },
      },
      required: ["url"],
    },
  },
  {
    name: "search_web",
    description: "구글에서 주어진 검색어로 검색합니다",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "검색할 내용" },
      },
      required: ["query"],
    },
  },
  {
    name: "close_current_tab",
    description: "현재 활성화된 탭을 닫습니다",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "open_new_tab",
    description: "빈 새 탭을 엽니다",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "scroll_page",
    description: "현재 페이지를 스크롤합니다",
    input_schema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["up", "down", "top", "bottom"],
          description: "up: 조금 위, down: 조금 아래, top: 맨 위, bottom: 맨 아래",
        },
      },
      required: ["direction"],
    },
  },
  {
    name: "navigate_back",
    description: "브라우저 뒤로가기",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "navigate_forward",
    description: "브라우저 앞으로가기",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "play_youtube",
    description: "유튜브에서 특정 영상이나 노래를 검색해서 자동으로 재생합니다. '~ 틀어줘', '~ 들려줘', '~ 재생해줘', '~ 틀어봐' 같은 표현에 사용합니다.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "검색어. 예: '아이유 좋은날', '뉴진스 super shy', 'lo-fi music'" },
      },
      required: ["query"],
    },
  },
  {
    name: "refresh_page",
    description: "현재 페이지를 새로고침합니다",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "next_tab",
    description: "다음 탭으로 이동합니다",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "previous_tab",
    description: "이전 탭으로 이동합니다",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "zoom_in",
    description: "현재 페이지를 확대합니다 (25% 단위)",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "zoom_out",
    description: "현재 페이지를 축소합니다 (25% 단위)",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "zoom_reset",
    description: "현재 페이지 확대/축소를 기본값(100%)으로 초기화합니다",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "bookmark_current",
    description: "현재 탭의 페이지를 북마크에 추가합니다",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "mute_tab",
    description: "현재 탭의 오디오를 음소거하거나 음소거를 해제합니다 (토글)",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "unknown_command",
    description: "사용자의 명령을 이해할 수 없거나 지원하지 않는 작업일 때 사용합니다",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "이해하지 못한 이유를 한국어로 설명" },
      },
      required: ["reason"],
    },
  },
];

/** ── 메시지 라우터 ── */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  if (message.type === "PROCESS_AUDIO") {
    callWhisperAPI(message.audioBase64, message.mimeType)
      .then((transcript) => {
        console.log("[Background] PROCESS_AUDIO 완료:", transcript);
        sendResponse({ transcript });
      })
      .catch((err) => {
        console.error("[Background] PROCESS_AUDIO 오류:", err);
        sendResponse({ error: err.message });
      });
    return true;
  }

  if (message.type === "PARSE_INTENT") {
    parseIntent(message.text)
      .then((result) => {
        console.log("[Background] PARSE_INTENT 완료:", result);
        sendResponse(result);
      })
      .catch((err) => {
        console.error("[Background] PARSE_INTENT 오류:", err);
        sendResponse({ error: err.message });
      });
    return true;
  }

  if (message.type === "PROCESS_COMMAND") {
    // 의도 파악 + 실행을 한 번에 처리해서 결과 반환
    processCommand(message.text)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Background] PROCESS_COMMAND 오류:", err);
        sendResponse({ error: err.message });
      });
    return true;
  }

  if (message.type === "EXECUTE_ACTION") {
    executeAction(message.tool, message.input)
      .then((msg) => sendResponse({ ok: true, message: msg }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

/** ── Whisper API 호출 ── */

/**
 * OpenAI Whisper API를 호출해 오디오를 한국어 텍스트로 변환
 *
 * @param {string} audioBase64 - base64 인코딩된 오디오 데이터
 * @param {string} mimeType    - 예: "audio/webm;codecs=opus"
 * @returns {Promise<string>}  - 변환된 텍스트
 */
async function callWhisperAPI(audioBase64, mimeType) {
  const { openaiApiKey } = await chrome.storage.local.get("openaiApiKey");
  if (!openaiApiKey) throw new Error("OpenAI API 키가 설정되지 않았습니다. 설정(⚙️)에서 입력해주세요.");

  const ext      = mimeType.split("/")[1].split(";")[0];
  const bytes    = base64ToUint8Array(audioBase64);
  const audioFile = new File([bytes], `recording.${ext}`, { type: mimeType });

  console.log("[Whisper] 파일 크기:", audioFile.size, "bytes | 파일명:", audioFile.name);

  if (audioFile.size < 100) {
    throw new Error("녹음이 너무 짧습니다. 조금 더 길게 말씀해주세요.");
  }

  const formData = new FormData();
  formData.append("file", audioFile);
  formData.append("model", "whisper-1");
  formData.append("language", "ko");

  console.log("[Whisper] API 호출 시작...");

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiApiKey}` },
      body: formData,
    });
  } catch (networkErr) {
    console.error("[Whisper] 네트워크 오류:", networkErr);
    throw new Error("네트워크 오류: 인터넷 연결을 확인해주세요.");
  }

  console.log("[Whisper] 응답 상태:", response.status);

  if (!response.ok) {
    const errBody = await response.text().catch(() => "(응답 본문 없음)");
    console.error("[Whisper] 오류 응답:", errBody);
    throw new Error(whisperErrorMessage(response.status));
  }

  const data = await response.json();
  console.log("[Whisper] 원본 응답:", data);

  if (!data.text || data.text.trim() === "") {
    throw new Error("음성을 인식하지 못했습니다. 마이크에 가까이 대고 다시 시도해주세요.");
  }

  return data.text.trim();
}

function whisperErrorMessage(status) {
  const m = {
    401: "OpenAI API 키가 올바르지 않습니다. 설정(⚙️)에서 키를 확인해주세요.",
    403: "OpenAI API 키 권한이 없습니다.",
    413: "녹음 파일이 너무 큽니다. 짧게 말씀해주세요. (최대 25MB)",
    429: "API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
    500: "OpenAI 서버 오류입니다. 잠시 후 다시 시도해주세요.",
    503: "OpenAI 서비스가 일시적으로 불가합니다. 잠시 후 다시 시도해주세요.",
  };
  return m[status] ?? `Whisper API 오류 (HTTP ${status})`;
}

/** ── Claude API 의도 파악 (Tool Use) ── */

/**
 * @typedef {Object} IntentResult
 * @property {string} tool        - 선택된 도구 이름 (예: "open_url")
 * @property {Object} input       - 도구 입력값 (예: { url: "https://youtube.com" })
 * @property {string} intentLabel - 사람이 읽기 좋은 설명 (예: "🔗 https://youtube.com 열기")
 */

/**
 * 텍스트 명령을 Claude API (Tool Use)로 전송해 구조화된 액션으로 변환
 *
 * @param {string} text - 사용자 음성 명령 텍스트
 * @returns {Promise<IntentResult>}
 */
async function parseIntent(text) {
  const { anthropicApiKey } = await chrome.storage.local.get("anthropicApiKey");
  if (!anthropicApiKey) throw new Error("Anthropic API 키가 설정되지 않았습니다. 설정(⚙️)에서 입력해주세요.");

  const requestBody = {
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system:
      "당신은 한국어 음성 명령을 해석하는 어시스턴트입니다. " +
      "사용자의 발화를 듣고 가장 적절한 도구를 선택해서 호출하세요. " +
      "URL이 필요한 경우 완전한 https:// 주소를 사용하세요. " +
      "'아이유 좋은날 틀어줘'/'lo-fi 들려줘'/'BTS 재생해줘'/'유튜브에서 강아지 영상 보여줘' → play_youtube. " +
      "단, '유튜브 열어줘'처럼 명확한 검색어 없이 유튜브 메인을 여는 것은 open_url 사용. " +
      "명령 예시: '새로고침해줘'/'다시 불러와줘' → refresh_page, " +
      "'다음 탭'/'오른쪽 탭' → next_tab, '이전 탭'/'왼쪽 탭' → previous_tab, " +
      "'확대해줘'/'키워줘'/'화면 크게' → zoom_in, '축소해줘'/'줄여줘'/'작게' → zoom_out, " +
      "'화면 초기화'/'원래 크기' → zoom_reset, " +
      "'북마크 추가'/'저장해줘'/'즐겨찾기 추가' → bookmark_current, " +
      "'음소거'/'소리 꺼'/'음소거 해제' → mute_tab. " +
      "명확하지 않거나 지원하지 않는 명령은 unknown_command를 사용하세요.",
    tools: BROWSER_TOOLS,
    // "any": 반드시 도구 중 하나를 선택하도록 강제 (auto면 텍스트 응답을 줄 수 있음)
    tool_choice: { type: "any" },
    messages: [{ role: "user", content: text }],
  };

  console.log("[Claude] 요청 body:", JSON.stringify(requestBody, null, 2));

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        // 브라우저 컨텍스트(서비스 워커)에서 직접 Anthropic API 호출 시 필요
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (networkErr) {
    console.error("[Claude] 네트워크 오류:", networkErr);
    throw new Error("네트워크 오류: 인터넷 연결을 확인해주세요.");
  }

  console.log("[Claude] 응답 상태:", response.status);

  if (!response.ok) {
    const errBody = await response.text().catch(() => "(응답 본문 없음)");
    console.error("[Claude] 오류 응답:", errBody);
    throw new Error(claudeErrorMessage(response.status));
  }

  const data = await response.json();
  console.log("[Claude] 원본 응답:", JSON.stringify(data, null, 2));

  // content 배열에서 tool_use 블록 추출
  const toolBlock = data.content?.find((b) => b.type === "tool_use");
  if (!toolBlock) {
    // tool_choice: "any" 임에도 tool_use가 없는 경우 (예외 상황)
    console.error("[Claude] tool_use 블록 없음. 전체 응답:", data);
    throw new Error("Claude가 도구를 선택하지 않았습니다. 다시 시도해주세요.");
  }

  console.log("[Claude] 선택된 도구:", toolBlock.name, "| 입력:", JSON.stringify(toolBlock.input));

  return {
    tool: toolBlock.name,
    input: toolBlock.input,
    intentLabel: formatIntentLabel(toolBlock.name, toolBlock.input),
  };
}

function claudeErrorMessage(status) {
  const m = {
    401: "Anthropic API 키가 올바르지 않습니다. 설정(⚙️)에서 키를 확인해주세요.",
    403: "Anthropic API 키 권한이 없습니다.",
    429: "API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
    500: "Anthropic 서버 오류입니다. 잠시 후 다시 시도해주세요.",
    503: "Anthropic 서비스가 일시적으로 불가합니다. 잠시 후 다시 시도해주세요.",
  };
  return m[status] ?? `Claude API 오류 (HTTP ${status})`;
}

/**
 * 도구 이름 + 입력값을 사람이 읽기 좋은 한 줄 문자열로 변환
 * @param {string} tool
 * @param {Object} input
 * @returns {string}
 */
function formatIntentLabel(tool, input) {
  switch (tool) {
    case "open_url":          return `🔗 ${input.url} 열기`;
    case "search_web":        return `🔍 "${input.query}" 검색`;
    case "close_current_tab": return "✖️ 현재 탭 닫기";
    case "open_new_tab":      return "➕ 새 탭 열기";
    case "navigate_back":     return "⬅️ 뒤로가기";
    case "navigate_forward":  return "➡️ 앞으로가기";
    case "scroll_page":       return scrollLabel(input.direction);
    case "play_youtube":      return `▶ "${input.query}" 재생`;
    case "refresh_page":      return "🔄 페이지 새로고침";
    case "next_tab":          return "→ 다음 탭";
    case "previous_tab":      return "← 이전 탭";
    case "zoom_in":           return "🔍+ 페이지 확대";
    case "zoom_out":          return "🔍- 페이지 축소";
    case "zoom_reset":        return "🔍 화면 크기 초기화 (100%)";
    case "bookmark_current":  return "🔖 현재 페이지 북마크 추가";
    case "mute_tab":          return "🔇 탭 음소거 전환";
    case "unknown_command":   return `❓ 이해 불가: ${input.reason}`;
    default:                  return `${tool}: ${JSON.stringify(input)}`;
  }
}

function scrollLabel(direction) {
  switch (direction) {
    case "top":    return "⬆️ 맨 위로 스크롤";
    case "bottom": return "⬇️ 맨 아래로 스크롤";
    case "up":     return "↑ 위로 스크롤";
    case "down":   return "↓ 아래로 스크롤";
    default:       return `스크롤: ${direction}`;
  }
}

/** ── 의도 파악 + 실행 통합 ── */

/**
 * 텍스트 명령을 파싱하고 바로 실행까지 수행
 * unknown_command나 실행 실패는 throw 대신 success:false로 반환
 *
 * @param {string} text
 * @returns {Promise<{success, isUnknown, tool, input, intentLabel, message}>}
 */
async function processCommand(text) {
  console.log("[processCommand] 시작:", text);

  const intent = await parseIntent(text); // 실패 시 throw → 메시지 핸들러가 error로 반환
  console.log("[processCommand] 의도 파악 완료:", intent.tool, intent.input);

  if (intent.tool === "unknown_command") {
    return {
      success: false,
      isUnknown: true,
      tool: intent.tool,
      input: intent.input,
      intentLabel: intent.intentLabel,
      message: `이해하지 못했습니다: ${intent.input.reason}`,
    };
  }

  try {
    const executionMsg = await executeAction(intent.tool, intent.input);
    console.log("[processCommand] 실행 완료:", executionMsg);
    return {
      success: true,
      tool: intent.tool,
      input: intent.input,
      intentLabel: intent.intentLabel,
      message: `✓ ${executionMsg}`,
    };
  } catch (execErr) {
    console.error("[processCommand] 실행 오류:", execErr.message);
    return {
      success: false,
      tool: intent.tool,
      input: intent.input,
      intentLabel: intent.intentLabel,
      message: execErr.message,
    };
  }
}

/** ── 액션 실행 ── */

/**
 * 도구 이름과 입력값으로 실제 브라우저 동작 수행
 * 성공 시 한국어 결과 문자열 반환, 실패 시 throw
 *
 * @param {string} tool
 * @param {Object} input
 * @returns {Promise<string>} 성공 메시지
 */
async function executeAction(tool, input) {
  console.log("[Action] 실행 시작:", tool, JSON.stringify(input));

  switch (tool) {

    case "open_url": {
      const url = normalizeUrl(input.url);
      await chrome.tabs.create({ url, active: true });
      console.log("[Action] open_url 완료:", url);
      return `새 탭에서 열었습니다: ${url}`;
    }

    case "search_web": {
      const url = `https://www.google.com/search?q=${encodeURIComponent(input.query)}`;
      await chrome.tabs.create({ url, active: true });
      console.log("[Action] search_web 완료:", input.query);
      return `"${input.query}" 검색 결과를 열었습니다`;
    }

    case "open_new_tab": {
      await chrome.tabs.create({ active: true });
      console.log("[Action] open_new_tab 완료");
      return "새 탭을 열었습니다";
    }

    case "close_current_tab": {
      // 마지막 남은 탭은 닫지 않음 (브라우저 종료로 이어지므로)
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      if (allTabs.length <= 1) {
        throw new Error("마지막 탭은 닫을 수 없습니다.");
      }
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error("활성 탭을 찾을 수 없습니다.");
      await chrome.tabs.remove(activeTab.id);
      console.log("[Action] close_current_tab 완료, tabId:", activeTab.id);
      return "현재 탭을 닫았습니다";
    }

    case "scroll_page": {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error("활성 탭을 찾을 수 없습니다.");

      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          // ★ 이 함수는 페이지 컨텍스트에서 실행됨 (서비스 워커 스코프 바깥)
          // ★ 외부 변수·클로저 접근 불가 → 필요한 값은 반드시 args로 전달
          func: (direction) => {
            const STEP = 300; // 부분 스크롤 1회 이동 픽셀
            switch (direction) {
              case "top":    window.scrollTo({ top: 0, behavior: "smooth" }); break;
              case "bottom": window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); break;
              case "up":     window.scrollBy({ top: -STEP, behavior: "smooth" }); break;
              case "down":   window.scrollBy({ top:  STEP, behavior: "smooth" }); break;
            }
          },
          args: [input.direction],
        });
      } catch (err) {
        // chrome:// 나 extension 페이지 등 스크립트 주입이 금지된 페이지
        console.error("[Action] executeScript 실패:", err.message);
        throw new Error("이 페이지는 스크롤할 수 없습니다. (보호된 페이지)");
      }

      console.log("[Action] scroll_page 완료:", input.direction);
      return scrollLabel(input.direction);
    }

    case "navigate_back": {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error("활성 탭을 찾을 수 없습니다.");
      try {
        await chrome.tabs.goBack(activeTab.id);
      } catch (err) {
        throw new Error("뒤로 이동할 수 없습니다. (이전 페이지가 없거나 접근 불가)");
      }
      console.log("[Action] navigate_back 완료");
      return "뒤로 이동했습니다";
    }

    case "navigate_forward": {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error("활성 탭을 찾을 수 없습니다.");
      try {
        await chrome.tabs.goForward(activeTab.id);
      } catch (err) {
        throw new Error("앞으로 이동할 수 없습니다. (다음 페이지가 없거나 접근 불가)");
      }
      console.log("[Action] navigate_forward 완료");
      return "앞으로 이동했습니다";
    }

    case "play_youtube": {
      return await executeYouTubePlay(input.query);
    }

    case "refresh_page": {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error("활성 탭을 찾을 수 없습니다.");
      await chrome.tabs.reload(activeTab.id);
      console.log("[Action] refresh_page 완료");
      return "페이지를 새로고침했습니다";
    }

    case "next_tab": {
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || allTabs.length <= 1) throw new Error("이동할 다른 탭이 없습니다.");
      const sorted  = allTabs.sort((a, b) => a.index - b.index);
      const curIdx  = sorted.findIndex((t) => t.id === activeTab.id);
      const nextTab = sorted[(curIdx + 1) % sorted.length];
      await chrome.tabs.update(nextTab.id, { active: true });
      console.log("[Action] next_tab 완료");
      return "다음 탭으로 이동했습니다";
    }

    case "previous_tab": {
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || allTabs.length <= 1) throw new Error("이동할 다른 탭이 없습니다.");
      const sorted  = allTabs.sort((a, b) => a.index - b.index);
      const curIdx  = sorted.findIndex((t) => t.id === activeTab.id);
      const prevTab = sorted[(curIdx - 1 + sorted.length) % sorted.length];
      await chrome.tabs.update(prevTab.id, { active: true });
      console.log("[Action] previous_tab 완료");
      return "이전 탭으로 이동했습니다";
    }

    case "zoom_in": {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error("활성 탭을 찾을 수 없습니다.");
      const cur  = await chrome.tabs.getZoom(activeTab.id);
      const next = Math.min(Math.round((cur + 0.25) * 100) / 100, 5.0);
      await chrome.tabs.setZoom(activeTab.id, next);
      console.log("[Action] zoom_in 완료:", next);
      return `페이지를 ${Math.round(next * 100)}%로 확대했습니다`;
    }

    case "zoom_out": {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error("활성 탭을 찾을 수 없습니다.");
      const cur  = await chrome.tabs.getZoom(activeTab.id);
      const next = Math.max(Math.round((cur - 0.25) * 100) / 100, 0.25);
      await chrome.tabs.setZoom(activeTab.id, next);
      console.log("[Action] zoom_out 완료:", next);
      return `페이지를 ${Math.round(next * 100)}%로 축소했습니다`;
    }

    case "zoom_reset": {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error("활성 탭을 찾을 수 없습니다.");
      await chrome.tabs.setZoom(activeTab.id, 1.0);
      console.log("[Action] zoom_reset 완료");
      return "페이지 크기를 100%로 초기화했습니다";
    }

    case "bookmark_current": {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error("활성 탭을 찾을 수 없습니다.");
      if (!activeTab.url || activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("chrome-extension://")) {
        throw new Error("이 페이지는 북마크에 추가할 수 없습니다.");
      }
      await chrome.bookmarks.create({ title: activeTab.title || activeTab.url, url: activeTab.url });
      console.log("[Action] bookmark_current 완료:", activeTab.url);
      return `북마크에 추가했습니다: ${activeTab.title || activeTab.url}`;
    }

    case "mute_tab": {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error("활성 탭을 찾을 수 없습니다.");
      const isMuted = activeTab.mutedInfo?.muted ?? false;
      await chrome.tabs.update(activeTab.id, { muted: !isMuted });
      console.log("[Action] mute_tab 완료, muted:", !isMuted);
      return isMuted ? "음소거를 해제했습니다" : "탭을 음소거했습니다";
    }

    case "unknown_command":
      // processCommand에서 이미 처리 — 여기까지 오지 않음
      console.warn("[Action] unknown_command가 executeAction에 전달됨 (예상치 못한 경로)");
      return "인식 불가 명령";

    default:
      throw new Error(`알 수 없는 도구: ${tool}`);
  }
}

/** ── YouTube 재생 ── */

/**
 * YouTube Data API로 검색 후 첫 번째 영상을 새 탭에서 자동 재생
 *
 * @param {string} query - 검색어 (예: "아이유 좋은날")
 * @returns {Promise<string>} 성공 메시지 (영상 제목 포함)
 */
async function executeYouTubePlay(query) {
  const { youtube_api_key } = await chrome.storage.local.get("youtube_api_key");
  if (!youtube_api_key) {
    throw new Error("YouTube API 키가 설정되지 않았습니다. 설정(⚙️)에서 입력해주세요.");
  }

  const apiUrl =
    "https://www.googleapis.com/youtube/v3/search" +
    `?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=1&key=${youtube_api_key}`;

  // 로그에는 API 키를 마스킹해서 출력
  console.log("[YouTube] API 호출:", apiUrl.replace(youtube_api_key, "***"));

  let response;
  try {
    response = await fetch(apiUrl);
  } catch (networkErr) {
    console.error("[YouTube] 네트워크 오류:", networkErr);
    throw new Error("네트워크 오류: 인터넷 연결을 확인해주세요.");
  }

  console.log("[YouTube] 응답 상태:", response.status);

  if (!response.ok) {
    const errBody = await response.text().catch(() => "(응답 본문 없음)");
    console.error("[YouTube] 오류 응답:", errBody);
    if (response.status === 400) throw new Error("YouTube API 키가 올바르지 않습니다. 설정(⚙️)에서 확인해주세요.");
    if (response.status === 403) throw new Error("YouTube API 할당량을 초과했거나 키가 비활성화되어 있습니다. 잠시 후 다시 시도해주세요.");
    throw new Error(`YouTube 검색에 실패했습니다. 잠시 후 다시 시도해주세요. (HTTP ${response.status})`);
  }

  const data = await response.json();
  console.log("[YouTube] 원본 응답:", JSON.stringify(data, null, 2));

  if (!data.items || data.items.length === 0) {
    throw new Error(`"${query}" 검색 결과를 찾을 수 없습니다.`);
  }

  const video   = data.items[0];
  const videoId = video.id.videoId;
  const title   = video.snippet.title;

  console.log("[YouTube] 재생할 영상 — ID:", videoId, "| 제목:", title);

  // autoplay=1: 일부 브라우저에서 음소거 상태일 때만 자동 재생됨
  // 사용자가 탭 클릭 시 재생 가능하도록 새 탭에서 열기
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}&autoplay=1`;
  await chrome.tabs.create({ url: videoUrl, active: true });

  return `▶ "${title}" 재생 중`;
}

/** ── 유틸 ── */

/**
 * URL에 프로토콜이 없으면 https:// 를 자동으로 붙임
 * Claude가 가끔 "youtube.com" 같이 반환할 때를 대비
 * @param {string} url
 * @returns {string}
 */
function normalizeUrl(url) {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return "https://" + url;
  }
  return url;
}

/** ── 유틸 ── */

/**
 * base64 문자열을 Uint8Array로 변환
 * @param {string} base64
 * @returns {Uint8Array}
 */
function base64ToUint8Array(base64) {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}
