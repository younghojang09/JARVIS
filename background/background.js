// background.js — 서비스 워커 (백그라운드 스크립트)
// 역할: 팝업으로부터 오디오를 받아 Whisper → (Day3: Claude → 액션 실행) 파이프라인 처리

/** ── 메시지 라우터 ── */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PROCESS_AUDIO") {
    handleAudioPipeline(message.audioBase64, message.mimeType)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Background] 파이프라인 오류:", err);
        sendResponse({ error: err.message });
      });
    return true; // 비동기 응답을 위해 반드시 true 반환
  }

  if (message.type === "EXECUTE_ACTION") {
    executeAction(message.action)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

/** ── 메인 파이프라인 ── */

/**
 * Day 2: Whisper STT만 실행
 * Day 3에서 Claude 의도 파악 + 액션 실행 추가 예정
 *
 * @param {string} audioBase64 - base64 인코딩된 오디오
 * @param {string} mimeType    - 예: "audio/webm;codecs=opus"
 * @returns {{ transcript: string }}
 */
async function handleAudioPipeline(audioBase64, mimeType) {
  console.log("[Pipeline] 시작 — mimeType:", mimeType);

  // 1단계: Whisper STT
  const transcript = await callWhisperAPI(audioBase64, mimeType);
  console.log("[Pipeline] STT 완료:", transcript);

  // 2단계: Claude 의도 파악 (Day 3에서 구현)
  // const action = await callClaudeAPI(transcript);

  // 3단계: 액션 실행 (Day 3에서 구현)
  // await executeAction(action);

  return { transcript };
}

/** ── Whisper API 호출 ── */

/**
 * OpenAI Whisper API를 호출해 오디오를 한국어 텍스트로 변환
 *
 * @param {string} audioBase64 - base64 인코딩된 오디오 데이터
 * @param {string} mimeType    - 오디오 MIME 타입 (예: "audio/webm;codecs=opus")
 * @returns {Promise<string>}  - 변환된 텍스트
 */
async function callWhisperAPI(audioBase64, mimeType) {
  const { openaiApiKey } = await chrome.storage.local.get("openaiApiKey");
  if (!openaiApiKey) throw new Error("OpenAI API 키가 설정되지 않았습니다. 설정(⚙️)에서 입력해주세요.");

  // base64 → Uint8Array → Blob → File
  // Whisper는 파일 확장자로 포맷을 판별하므로 올바른 확장자 필수
  const ext      = mimeType.split("/")[1].split(";")[0]; // "webm;codecs=opus" → "webm"
  const bytes    = base64ToUint8Array(audioBase64);
  const audioFile = new File([bytes], `recording.${ext}`, { type: mimeType });

  console.log("[Whisper] 파일 크기:", audioFile.size, "bytes | 파일명:", audioFile.name);

  if (audioFile.size < 100) {
    throw new Error("녹음이 너무 짧습니다. 조금 더 길게 말씀해주세요.");
  }

  const formData = new FormData();
  formData.append("file", audioFile);
  formData.append("model", "whisper-1");
  formData.append("language", "ko"); // 한국어 고정으로 인식 정확도 향상

  console.log("[Whisper] API 호출 시작...");

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        // Content-Type은 지정하지 않음 — fetch가 FormData 경계값 포함해 자동 설정
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: formData,
    });
  } catch (networkErr) {
    console.error("[Whisper] 네트워크 오류:", networkErr);
    throw new Error("네트워크 오류: 인터넷 연결을 확인해주세요.");
  }

  console.log("[Whisper] 응답 상태:", response.status);

  if (!response.ok) {
    const errBody = await response.text().catch(() => "(응답 본문 없음)");
    console.error("[Whisper] 오류 응답 본문:", errBody);
    throw new Error(whisperErrorMessage(response.status));
  }

  const data = await response.json();
  console.log("[Whisper] 원본 응답:", data);

  if (!data.text || data.text.trim() === "") {
    throw new Error("음성을 인식하지 못했습니다. 마이크에 가까이 대고 다시 시도해주세요.");
  }

  return data.text.trim();
}

/**
 * Whisper API HTTP 상태 코드 → 한국어 에러 메시지 변환
 * @param {number} status
 * @returns {string}
 */
function whisperErrorMessage(status) {
  const messages = {
    401: "OpenAI API 키가 올바르지 않습니다. 설정(⚙️)에서 키를 확인해주세요.",
    403: "OpenAI API 키 권한이 없습니다.",
    413: "녹음 파일이 너무 큽니다. 짧게 말씀해주세요. (최대 25MB)",
    429: "API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
    500: "OpenAI 서버 오류입니다. 잠시 후 다시 시도해주세요.",
    503: "OpenAI 서비스가 일시적으로 불가합니다. 잠시 후 다시 시도해주세요.",
  };
  return messages[status] ?? `Whisper API 오류 (HTTP ${status})`;
}

/** ── Claude API 호출 뼈대 (Day 3에서 구현) ── */

/**
 * @typedef {Object} Action
 * @property {string} type        - OPEN_URL | SEARCH | NEW_TAB | CLOSE_TAB | SCROLL
 * @property {string} [url]       - OPEN_URL 액션에 사용
 * @property {string} [query]     - SEARCH 액션에 사용
 * @property {string} [direction] - SCROLL 액션에 사용 ("top" | "bottom")
 */

/**
 * Anthropic Claude API로 텍스트 명령을 액션 객체로 변환 (Day 3에서 구현)
 * @param {string} text
 * @returns {Promise<Action>}
 */
async function callClaudeAPI(text) {
  const { anthropicApiKey } = await chrome.storage.local.get("anthropicApiKey");
  if (!anthropicApiKey) throw new Error("Anthropic API 키가 설정되지 않았습니다.");
  // TODO Day 3: Claude API 호출 구현
  throw new Error("Claude API는 Day 3에서 구현 예정입니다.");
}

/** ── 액션 실행 ── */

/**
 * 파싱된 액션을 실제로 실행
 * @param {Action} action
 */
async function executeAction(action) {
  console.log("[Action] 실행:", action);

  switch (action.type) {
    case "OPEN_URL":
      await chrome.tabs.create({ url: action.url });
      break;

    case "SEARCH": {
      const url = `https://www.google.com/search?q=${encodeURIComponent(action.query)}`;
      await chrome.tabs.create({ url });
      break;
    }

    case "NEW_TAB":
      await chrome.tabs.create({});
      break;

    case "CLOSE_TAB": {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) await chrome.tabs.remove(tab.id);
      break;
    }

    case "SCROLL": {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await chrome.tabs.sendMessage(tab.id, { type: "SCROLL", direction: action.direction });
      }
      break;
    }

    default:
      throw new Error(`알 수 없는 액션 타입: ${action.type}`);
  }
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

/**
 * 액션 객체를 사람이 읽기 좋은 문자열로 변환
 * @param {Action} action
 * @returns {string}
 */
function formatActionLabel(action) {
  switch (action.type) {
    case "OPEN_URL":  return `🔗 ${action.url} 열기`;
    case "SEARCH":    return `🔍 "${action.query}" 검색`;
    case "NEW_TAB":   return "➕ 새 탭 열기";
    case "CLOSE_TAB": return "✖️ 현재 탭 닫기";
    case "SCROLL":    return action.direction === "top" ? "⬆️ 맨 위로 이동" : "⬇️ 맨 아래로 이동";
    default:          return `액션: ${action.type}`;
  }
}
