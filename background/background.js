// background.js — 서비스 워커 (백그라운드 스크립트)
// 역할: 백엔드 API 호출 → Whisper STT + Claude 의도 파악 + 액션 실행 파이프라인

/** Supabase 프로젝트 기본 URL (인증 엔드포인트에 사용) */
const SUPABASE_PROJECT_URL = "https://uhqesvkydcziaefwbdjx.supabase.co";
/** Supabase 공개 API 키 (익명 로그인용) */
const SUPABASE_ANON_KEY = "sb_publishable_q3Iw5g8Q8ibAmRJ0Anl8RA_k-JvaELv";
/** 백엔드 서버 base URL (API 키는 모두 서버에서 관리) */
const BACKEND_URL = "https://voice-browser-backend-youngho.vercel.app";
/** 대화 히스토리 최대 유지 턴 수 (user + assistant 쌍) */
const MAX_CONV_TURNS = 5;

/** 확장이 마지막으로 열었던 탭 ID — use_current_tab 요청 시 재사용 */
let lastUsedTabId = null;

/** ── 브라우저 제어 도구 정의 (문서/참조용 — 실제 Claude 호출은 백엔드에서 수행) ── */
const BROWSER_TOOLS = [
  {
    name: "open_url",
    description: "지정한 URL을 새 탭에서 엽니다",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "열 URL (https:// 포함 전체 주소)" },
        use_current_tab: { type: "boolean", description: "true이면 마지막으로 사용한 탭에서 열기" },
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
        use_current_tab: { type: "boolean", description: "true이면 마지막으로 사용한 탭에서 열기" },
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
    description: "유튜브에서 특정 영상이나 노래를 검색해서 자동으로 재생합니다.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "검색어. 예: '아이유 좋은날'" },
        use_current_tab: { type: "boolean", description: "true이면 마지막으로 사용한 탭에서 열기" },
      },
      required: ["query"],
    },
  },
  {
    name: "youtube_search",
    description: "유튜브에서 검색어로 검색 결과 페이지를 엽니다 (자동 재생 없이 검색 결과만 표시).",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "유튜브에서 검색할 내용" },
        use_current_tab: { type: "boolean", description: "true이면 마지막으로 사용한 탭에서 열기" },
      },
      required: ["query"],
    },
  },
  {
    name: "naver_search",
    description: "네이버에서 검색어로 검색 결과 페이지를 엽니다.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "네이버에서 검색할 내용" },
        use_current_tab: { type: "boolean", description: "true이면 마지막으로 사용한 탭에서 열기" },
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
    name: "capture_screenshot",
    description: "현재 보이는 탭의 화면을 캡처해서 다운로드합니다.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "summarize_page",
    description: "현재 보고 있는 페이지의 내용을 요약합니다. '이 페이지 요약해줘', '이거 뭐에 관한 거야', '요약해줘' 같은 표현에 사용합니다.",
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

/** ── Supabase 인증 ── */

// 동시 호출 방지: 진행 중인 인증 Promise를 저장
let _authPromise = null;

/**
 * 유효한 Supabase 세션을 반환 (없거나 만료됐으면 익명 로그인 후 반환)
 * 동시에 여러 곳에서 호출해도 하나의 요청만 실제로 전송됨
 *
 * @returns {Promise<{access_token, refresh_token, expires_at, user_id}>}
 */
async function ensureAuth() {
  // 이미 진행 중인 인증 요청이 있으면 그 Promise를 그대로 반환 (새 요청 안 보냄)
  if (_authPromise) {
    console.log("[Auth] 진행 중인 인증 요청 대기 중...");
    return _authPromise;
  }
  // 완료 후 반드시 null 초기화 (성공/실패 모두)
  _authPromise = _doEnsureAuth().finally(() => { _authPromise = null; });
  return _authPromise;
}

/** ensureAuth 내부 실제 처리 */
async function _doEnsureAuth() {
  // 1. 저장된 세션 확인
  const stored = await chrome.storage.local.get("supabase_session");
  const session = stored.supabase_session;

  if (session?.access_token) {
    // expires_at은 Unix 타임스탬프(초) — 60초 버퍼를 두고 만료 여부 판단
    const nowSec = Math.floor(Date.now() / 1000);
    if (session.expires_at && session.expires_at > nowSec + 60) {
      console.log("[Auth] 기존 세션 유효 (만료까지", session.expires_at - nowSec, "초)");
      return session;
    }
    console.log("[Auth] 세션 만료됨. 재로그인 시도...");
  } else {
    console.log("[Auth] 저장된 세션 없음. 익명 로그인 시도...");
  }

  // 2. 익명 로그인 (1차: /auth/v1/signup)
  return await _signInAnonymously();
}

/** 1차 익명 로그인 시도: POST /auth/v1/signup with empty body */
async function _signInAnonymously() {
  const endpoint = `${SUPABASE_PROJECT_URL}/auth/v1/signup`;
  console.log("[Auth] 1차 익명 로그인 요청:", endpoint);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch (networkErr) {
    console.error("[Auth] 1차 네트워크 오류:", networkErr);
    throw new Error("인증 서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.");
  }

  const raw = await response.text();
  // 첫 로그인 시 응답 전체를 출력해서 디버깅 가능하도록
  console.log("[Auth] 1차 응답 상태:", response.status);
  console.log("[Auth] 1차 응답 전체:", raw);

  let data;
  try { data = JSON.parse(raw); } catch { data = {}; }

  if (response.ok && data.access_token) {
    return _saveAndReturnSession(data);
  }

  // 1차 실패 → 2차 폴백 시도
  console.log("[Auth] 1차 실패. 폴백(/auth/v1/token?grant_type=anonymous) 시도...");
  return await _signInAnonymouslyFallback();
}

/** 2차 폴백 익명 로그인: POST /auth/v1/token?grant_type=anonymous */
async function _signInAnonymouslyFallback() {
  const endpoint = `${SUPABASE_PROJECT_URL}/auth/v1/token?grant_type=anonymous`;
  console.log("[Auth] 2차 익명 로그인 요청:", endpoint);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch (networkErr) {
    console.error("[Auth] 2차 네트워크 오류:", networkErr);
    throw new Error("인증 서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.");
  }

  const raw = await response.text();
  console.log("[Auth] 2차 응답 상태:", response.status);
  console.log("[Auth] 2차 응답 전체:", raw);

  let data;
  try { data = JSON.parse(raw); } catch { data = {}; }

  if (!response.ok || !data.access_token) {
    const reason = data.message ?? data.error_description ?? data.error ?? JSON.stringify(data);
    throw new Error("익명 로그인에 실패했습니다: " + reason);
  }

  return _saveAndReturnSession(data);
}

/** 세션 객체 정리 후 storage 저장 + 반환 */
async function _saveAndReturnSession(data) {
  const session = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    data.expires_at,
    user_id:       data.user?.id,
  };
  console.log("[Auth] 익명 로그인 성공 | user_id:", session.user_id, "| expires_at:", session.expires_at);
  await chrome.storage.local.set({ supabase_session: session });
  return session;
}

/** ── 인증 헤더 포함 API 호출 헬퍼 ── */

/**
 * Authorization 헤더를 자동 주입해 백엔드 API를 호출합니다.
 * - 401 응답 시: 세션 삭제 후 재인증 → 1회 재시도
 * - 429 응답 시: 사용량 초과 메시지로 throw
 *
 * @param {string} url
 * @param {RequestInit} options  - headers에 Content-Type 등 포함
 * @param {boolean} [retried]   - 내부 재시도 플래그 (외부에서 사용 X)
 * @returns {Promise<Response>}  - 2xx ~ 5xx 응답 객체 (401/429 제외)
 */
async function callBackendAPI(url, options, retried = false) {
  const session = await ensureAuth();

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "Authorization": `Bearer ${session.access_token}`,
    },
  });

  // 401: 토큰 만료 → 세션 삭제 후 재인증 1회
  if (response.status === 401 && !retried) {
    console.warn("[Auth] 401 응답 → 세션 삭제 후 재인증 시도...");
    await chrome.storage.local.remove("supabase_session");
    _authPromise = null;
    return callBackendAPI(url, options, true);
  }

  // 429: 사용량 초과 → 친절한 한국어 메시지로 throw
  if (response.status === 429) {
    const errBody = await response.json().catch(() => ({}));
    console.error("[API] 429 사용량 초과:", errBody);
    const used  = errBody.used  ?? "?";
    const limit = errBody.limit ?? "?";
    throw new Error(`오늘 사용량을 초과했습니다 (${used}/${limit}회). 내일 다시 시도해주세요.`);
  }

  return response;
}

/** ── 대화 히스토리 관리 ── */

/**
 * chrome.storage에 저장된 대화 히스토리를 반환
 * @returns {Promise<Array>} Claude API messages 형식 배열
 */
async function getConversationHistory() {
  const { conversation_history = [] } = await chrome.storage.local.get("conversation_history");
  return conversation_history;
}

/**
 * 이번 턴의 user + assistant 메시지를 히스토리에 추가
 * MAX_CONV_TURNS 초과 시 가장 오래된 턴부터 제거
 *
 * @param {string} userMessage       - 사용자 발화 텍스트
 * @param {Array}  assistantContent  - Claude tool_use 블록 배열
 */
async function appendToHistory(userMessage, assistantContent) {
  const history = await getConversationHistory();

  history.push({ role: "user",      content: userMessage });
  history.push({ role: "assistant", content: assistantContent });

  // 오래된 턴 제거 (user + assistant 쌍 단위로 앞에서 삭제)
  while (history.length > MAX_CONV_TURNS * 2) {
    history.shift();
    history.shift();
  }

  await chrome.storage.local.set({ conversation_history: history });
  console.log("[History] 저장 완료 | 현재 턴 수:", history.length / 2);
}

/**
 * 대화 히스토리 전체 초기화
 */
async function clearHistory() {
  await chrome.storage.local.remove("conversation_history");
  console.log("[History] 대화 기록 초기화 완료");
}

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

  if (message.type === "GENERATE_SPEECH") {
    generateSpeech(message.text)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Background] GENERATE_SPEECH 오류:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (message.type === "CLEAR_HISTORY") {
    clearHistory()
      .then(() => sendResponse({ success: true }))
      .catch((err) => {
        console.error("[Background] CLEAR_HISTORY 오류:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

/** ── 음성 인식 (백엔드 /api/transcribe 호출) ── */

/**
 * base64 오디오를 백엔드로 전송해 한국어 텍스트로 변환
 *
 * @param {string} audioBase64 - base64 인코딩된 오디오 데이터
 * @param {string} mimeType    - 예: "audio/webm;codecs=opus" (백엔드 전달용 로그에만 사용)
 * @returns {Promise<string>}  - 변환된 텍스트
 */
async function callWhisperAPI(audioBase64, mimeType) {
  // base64 길이로 파일 크기를 추정 (1자 ≈ 0.75 바이트)
  const estimatedBytes = Math.floor(audioBase64.length * 0.75);
  if (estimatedBytes < 100) {
    throw new Error("녹음이 너무 짧습니다. 조금 더 길게 말씀해주세요.");
  }

  console.log("[Transcribe] 백엔드 호출 시작 | 추정 크기:", estimatedBytes, "bytes | mimeType:", mimeType);

  let response;
  try {
    response = await callBackendAPI(`${BACKEND_URL}/api/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: audioBase64 }),
    });
  } catch (err) {
    // TypeError = fetch 자체 실패 (네트워크 오류)
    if (err instanceof TypeError) {
      console.error("[Transcribe] 네트워크 오류:", err);
      throw new Error("서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.");
    }
    throw err; // 429 등 callBackendAPI에서 이미 포맷된 에러는 그대로 전파
  }

  console.log("[Transcribe] 응답 상태:", response.status);

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    console.error("[Transcribe] 오류 응답:", errBody);
    throw new Error(errBody.error ?? `음성 인식 오류 (HTTP ${response.status})`);
  }

  const data = await response.json();
  console.log("[Transcribe] 응답:", data);

  if (!data.text || data.text.trim() === "") {
    throw new Error("음성을 인식하지 못했습니다. 마이크에 가까이 대고 다시 시도해주세요.");
  }

  return data.text.trim();
}

/** ── 의도 파악 (백엔드 /api/parse-intent 호출) ── */

/**
 * @typedef {Object} IntentResult
 * @property {string} tool        - 선택된 도구 이름 (예: "open_url")
 * @property {Object} input       - 도구 입력값 (예: { url: "https://youtube.com" })
 * @property {string} intentLabel - 사람이 읽기 좋은 설명 (예: "🔗 https://youtube.com 열기")
 */

/**
 * 텍스트 명령을 백엔드로 전송해 구조화된 액션으로 변환
 * (백엔드에서 Claude Tool Use 호출 처리)
 *
 * @param {string} text - 사용자 음성 명령 텍스트
 * @returns {Promise<IntentResult>}
 */
async function parseIntent(text) {
  // 컨텍스트 기억 사용 여부 + 이전 히스토리 로드
  const { conversation_enabled = true } = await chrome.storage.local.get("conversation_enabled");
  const history = conversation_enabled ? await getConversationHistory() : [];

  console.log("[Intent] 백엔드 호출 시작 | 텍스트:", text, "| 히스토리 턴 수:", history.length / 2);

  let response;
  try {
    response = await callBackendAPI(`${BACKEND_URL}/api/parse-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, history }),
    });
  } catch (err) {
    if (err instanceof TypeError) {
      console.error("[Intent] 네트워크 오류:", err);
      throw new Error("서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.");
    }
    throw err;
  }

  console.log("[Intent] 응답 상태:", response.status);

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    console.error("[Intent] 오류 응답:", errBody);
    throw new Error(errBody.error ?? `의도 파악 오류 (HTTP ${response.status})`);
  }

  const data = await response.json();
  console.log("[Intent] 응답:", data);

  const tools = data.tools ?? [];
  if (!tools.length) {
    throw new Error("백엔드가 도구를 반환하지 않았습니다. 다시 시도해주세요.");
  }

  console.log("[Intent] 도구 수:", tools.length, "|", tools.map(t => t.name).join(", "));

  // 이번 턴을 히스토리에 추가 (컨텍스트 기억 ON일 때만, 멀티 tool_use 블록 지원)
  if (conversation_enabled) {
    const assistantContent = tools.map((t, i) => ({
      type:  "tool_use",
      id:    `toolu_${Date.now()}_${i}`,
      name:  t.name,
      input: t.input,
    }));
    await appendToHistory(text, assistantContent);
  }

  return { tools };
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
    case "youtube_search":    return `🔍 유튜브: "${input.query}" 검색`;
    case "naver_search":      return `🔍 네이버: "${input.query}" 검색`;
    case "refresh_page":      return "🔄 페이지 새로고침";
    case "next_tab":          return "→ 다음 탭";
    case "previous_tab":      return "← 이전 탭";
    case "zoom_in":           return "🔍+ 페이지 확대";
    case "zoom_out":          return "🔍- 페이지 축소";
    case "zoom_reset":        return "🔍 화면 크기 초기화 (100%)";
    case "bookmark_current":  return "🔖 현재 페이지 북마크 추가";
    case "mute_tab":           return "🔇 탭 음소거 전환";
    case "capture_screenshot": return "📸 화면 캡처";
    case "summarize_page":     return "📄 페이지 요약";
    case "unknown_command":    return `❓ 이해 불가: ${input.reason}`;
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

/** ── 멀티 도구 순차 실행 ── */

/**
 * 도구 배열을 순서대로 실행하고 각 결과를 수집.
 * 한 도구가 실패해도 다음 도구는 계속 시도.
 * 도구 사이에 300ms 지연을 두어 자연스러운 UX 제공.
 *
 * @param {Array<{name:string, input:Object}>} tools
 * @param {Function} onProgress - ({current, total, toolName}) 콜백
 * @returns {Promise<Array<{tool, input, success, message}>>}
 */
async function executeToolsSequentially(tools, onProgress) {
  const results = [];

  for (let i = 0; i < tools.length; i++) {
    const { name, input } = tools[i];

    onProgress({ current: i + 1, total: tools.length, toolName: name });
    console.log(`[Multi] ${i + 1}/${tools.length}: ${name} 실행 중`);

    try {
      const message = await executeAction(name, input);
      results.push({ tool: name, input, success: true, message });
      console.log(`[Multi] ${i + 1}/${tools.length}: 완료 — ${message}`);
    } catch (err) {
      results.push({ tool: name, input, success: false, message: err.message });
      console.error(`[Multi] ${i + 1}/${tools.length}: 실패 — ${err.message}`);
    }

    // 마지막 도구 제외하고 지연 (UX 자연스럽게)
    if (i < tools.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  const successCount = results.filter((r) => r.success).length;
  console.log(`[Multi] 전체 완료: ${tools.length}개 중 ${successCount}개 성공`);

  return results;
}

/**
 * 의도 레이블 앞의 이모지·특수기호 토큰을 제거해 짧은 텍스트 반환
 * 예: "🔍 \"BTS\" 검색" → '"BTS" 검색'
 * 예: "✖️ 현재 탭 닫기"  → "현재 탭 닫기"
 *
 * @param {string} label
 * @returns {string}
 */
function shortIntentLabel(label) {
  const parts = label.split(" ");
  // 첫 토큰에 한글이나 영숫자가 없으면 이모지·기호 토큰으로 판단해 제거
  if (parts.length > 1 && !/[가-힣\w]/.test(parts[0])) {
    return parts.slice(1).join(" ");
  }
  return label;
}

/**
 * 실행 결과 배열을 한 줄 요약 메시지로 변환 (TTS/UI 공용)
 *
 * @param {Array<{success, message, tool}>} results
 * @param {Array<string>} intentLabels - formatIntentLabel()로 생성된 레이블 배열
 * @returns {string}
 */
function summarizeResults(results, intentLabels = []) {
  const n         = results.length;
  const successes = results.filter((r) => r.success);
  const failures  = results.filter((r) => !r.success);

  // 단일 결과: 메시지 그대로
  if (n === 1) return results[0].message;

  // 전체 성공
  if (failures.length === 0) {
    return `${n}개 명령을 모두 완료했습니다`;
  }

  // 전체 실패
  if (successes.length === 0) {
    return `${n}개 명령이 모두 실패했습니다`;
  }

  // 부분 실패: 실패한 첫 번째 항목의 레이블 포함
  const firstFailIdx = results.indexOf(failures[0]);
  const failLabel    = shortIntentLabel(intentLabels[firstFailIdx] ?? failures[0].tool);
  const moreText     = failures.length > 1 ? ` 외 ${failures.length - 1}개` : "";
  return `${successes.length}개 성공, ${failures.length}개 실패 (${failLabel}${moreText})`;
}

/** ── 의도 파악 + 실행 통합 ── */

/**
 * 텍스트 명령을 파싱하고 도구를 순차 실행.
 * 반환 형식:
 * { success, isUnknown, tools, results, intentLabels, message }
 *
 * @param {string} text
 */
async function processCommand(text) {
  console.log("[processCommand] 시작:", text);

  const { tools } = await parseIntent(text); // 실패 시 throw → 핸들러가 error로 반환
  console.log("[processCommand] 의도 파악 완료:", tools.length, "개 도구");

  // unknown_command 처리 (단일 도구일 때만 발생)
  if (tools.length === 1 && tools[0].name === "unknown_command") {
    const t = tools[0];
    const msg = `이해하지 못했습니다: ${t.input?.reason ?? "알 수 없는 이유"}`;
    return {
      success:      false,
      isUnknown:    true,
      tools,
      results:      [{ tool: t.name, input: t.input, success: false, message: msg }],
      intentLabels: [formatIntentLabel(t.name, t.input)],
      message:      msg,
    };
  }

  console.log("[Multi] 실행 시작:", tools.length, "개 도구");

  const results = await executeToolsSequentially(tools, (progress) => {
    // 팝업으로 진행 상황 전달 (팝업이 닫혔으면 무시)
    chrome.runtime.sendMessage({ type: "PROGRESS_UPDATE", ...progress })
      .catch(() => {});
  });

  const allSuccess   = results.every((r) => r.success);
  // intentLabels를 먼저 계산해서 summarizeResults에 전달 (부분 실패 시 도구명 포함)
  const intentLabels = tools.map((t) => formatIntentLabel(t.name, t.input));
  const summary      = summarizeResults(results, intentLabels);

  return {
    success:  allSuccess,
    isUnknown: false,
    tools,
    results,
    intentLabels,
    message:  allSuccess ? `✓ ${summary}` : summary,
  };
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
      // use_current_tab이 true이고 이전 탭이 살아있으면 URL 변경, 아니면 새 탭 생성
      if (input.use_current_tab && lastUsedTabId && await isTabAlive(lastUsedTabId)) {
        await chrome.tabs.update(lastUsedTabId, { url, active: false });
        console.log("[Action] open_url 완료 (기존 탭 변경):", url);
        return `기존 탭에서 열었습니다: ${url}`;
      }
      const tab = await chrome.tabs.create({ url, active: false });
      lastUsedTabId = tab.id;
      console.log("[Action] open_url 완료 (백그라운드):", url);
      return `백그라운드 탭에서 열었습니다: ${url}`;
    }

    case "search_web": {
      const url = `https://www.google.com/search?q=${encodeURIComponent(input.query)}`;
      // use_current_tab이 true이고 이전 탭이 살아있으면 URL 변경, 아니면 새 탭 생성
      if (input.use_current_tab && lastUsedTabId && await isTabAlive(lastUsedTabId)) {
        await chrome.tabs.update(lastUsedTabId, { url, active: false });
        console.log("[Action] search_web 완료 (기존 탭 변경):", input.query);
        return `"${input.query}" 검색 결과를 기존 탭에서 열었습니다`;
      }
      const tab = await chrome.tabs.create({ url, active: false });
      lastUsedTabId = tab.id;
      console.log("[Action] search_web 완료 (백그라운드):", input.query);
      return `"${input.query}" 검색 결과를 새 탭에서 열었습니다`;
    }

    case "open_new_tab": {
      // 팝업 포커스 유지를 위해 백그라운드로 열기
      await chrome.tabs.create({ active: false });
      console.log("[Action] open_new_tab 완료 (백그라운드)");
      return "새 탭을 백그라운드에서 열었습니다";
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
      return await executeYouTubePlay(input.query, input.use_current_tab);
    }

    case "youtube_search": {
      return await executeYoutubeSearch(input);
    }

    case "naver_search": {
      return await executeNaverSearch(input);
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

    case "capture_screenshot": {
      return await executeCaptureScreenshot();
    }

    case "summarize_page": {
      return await executeSummarizePage();
    }

    case "unknown_command":
      // processCommand에서 이미 처리 — 여기까지 오지 않음
      console.warn("[Action] unknown_command가 executeAction에 전달됨 (예상치 못한 경로)");
      return "인식 불가 명령";

    default:
      throw new Error(`알 수 없는 도구: ${tool}`);
  }
}

/** ── YouTube 재생 (백엔드 /api/youtube-search 호출) ── */

/**
 * 백엔드에 검색어를 보내 첫 번째 영상 URL을 받아 탭에서 자동 재생
 *
 * @param {string}  query         - 검색어 (예: "아이유 좋은날")
 * @param {boolean} useCurrentTab - true이면 마지막 탭 재사용, false이면 새 탭 생성
 * @returns {Promise<string>} 성공 메시지 (영상 제목 포함)
 */
async function executeYouTubePlay(query, useCurrentTab = false) {
  console.log("[YouTube] 백엔드 호출 시작 | 검색어:", query);

  let response;
  try {
    response = await callBackendAPI(`${BACKEND_URL}/api/youtube-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
  } catch (err) {
    if (err instanceof TypeError) {
      console.error("[YouTube] 네트워크 오류:", err);
      throw new Error("서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.");
    }
    throw err;
  }

  console.log("[YouTube] 응답 상태:", response.status);

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    console.error("[YouTube] 오류 응답:", errBody);
    throw new Error(errBody.error ?? `YouTube 검색 오류 (HTTP ${response.status})`);
  }

  const data = await response.json();
  console.log("[YouTube] 응답:", data);

  const { url, title } = data;
  if (!url) {
    throw new Error(`"${query}" 검색 결과를 찾을 수 없습니다.`);
  }

  // use_current_tab이 true이고 이전 탭이 살아있으면 URL 변경, 아니면 새 탭 생성
  if (useCurrentTab && lastUsedTabId && await isTabAlive(lastUsedTabId)) {
    await chrome.tabs.update(lastUsedTabId, { url, active: false });
    console.log("[YouTube] 기존 탭에서 재생 | 제목:", title, "| URL:", url);
  } else {
    const tab = await chrome.tabs.create({ url, active: false });
    lastUsedTabId = tab.id;
    console.log("[YouTube] 재생 탭 열기 완료 (백그라운드) | 제목:", title, "| URL:", url);
  }

  return `▶ "${title}" 재생을 시작했습니다`;
}

/** ── 스크린샷 캡처 ── */

/**
 * 현재 보이는 탭을 PNG로 캡처해서 다운로드 폴더에 저장
 *
 * @returns {Promise<string>} 성공 메시지 (파일명 포함)
 */
async function executeCaptureScreenshot() {
  // 파일명: screenshot-YYYY-MM-DD-HH-MM-SS.png
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const filename =
    `screenshot-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.png`;

  console.log("[Screenshot] 캡처 시작, 파일명:", filename);

  let dataUrl;
  try {
    // null → 현재 포커스된 창의 활성 탭 캡처 (activeTab 권한 필요)
    dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
  } catch (err) {
    console.error("[Screenshot] 캡처 실패:", err.message);
    // chrome://, chrome-extension:// 등 보호된 페이지는 캡처 불가
    if (
      err.message.includes("Cannot access") ||
      err.message.includes("chrome://") ||
      err.message.includes("chrome-extension://")
    ) {
      throw new Error("이 페이지는 캡처할 수 없습니다. 일반 웹페이지에서 시도해주세요.");
    }
    throw new Error("화면 캡처에 실패했습니다: " + err.message);
  }

  console.log("[Screenshot] 캡처 완료, dataUrl 길이:", dataUrl.length);

  // chrome.downloads.download은 콜백 기반 → Promise로 래핑
  const downloadId = await new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url: dataUrl, filename, saveAs: false },
      (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error("다운로드 실패: " + chrome.runtime.lastError.message));
        } else {
          resolve(id);
        }
      }
    );
  });

  console.log("[Screenshot] 다운로드 시작, downloadId:", downloadId, "파일명:", filename);
  return `📸 화면을 캡처해서 다운로드했습니다 (${filename})`;
}

/** ── 페이지 요약 ── */

/**
 * 현재 활성 탭의 텍스트를 추출해 백엔드 /api/summarize로 요약 요청
 * 성공 시 요약 문자열 반환, 실패 시 throw
 *
 * @returns {Promise<string>} 요약 텍스트
 */
async function executeSummarizePage() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab) throw new Error("활성 탭을 찾을 수 없습니다.");

  // chrome://, chrome-extension://, about: 등 시스템 페이지는 스크립트 주입 불가
  const url = activeTab.url ?? "";
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:")
  ) {
    throw new Error("이 페이지는 요약할 수 없습니다. (시스템 페이지)");
  }

  // 페이지 텍스트 추출 — article > main > body 순으로 시도
  let extracted;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: () => {
        const el =
          document.querySelector("article") ||
          document.querySelector("main") ||
          document.body;
        return {
          text:  el.innerText.slice(0, 50000),
          title: document.title,
        };
      },
    });
    extracted = results[0]?.result;
  } catch (err) {
    console.error("[Summarize] 텍스트 추출 실패:", err.message);
    throw new Error("이 페이지는 요약할 수 없습니다. (스크립트 주입 불가)");
  }

  if (!extracted?.text || extracted.text.trim().length < 100) {
    throw new Error("요약할 내용이 충분하지 않습니다.");
  }

  console.log("[Summarize] 텍스트 추출 완료 | 길이:", extracted.text.length, "| 제목:", extracted.title);

  // 백엔드 /api/summarize 호출
  let response;
  try {
    response = await callBackendAPI(`${BACKEND_URL}/api/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: extracted.text, title: extracted.title }),
    });
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error("서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.");
    }
    throw err;
  }

  console.log("[Summarize] 응답 상태:", response.status);

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    console.error("[Summarize] 오류 응답:", errBody);
    throw new Error(errBody.error ?? `요약 오류 (HTTP ${response.status})`);
  }

  const data = await response.json();
  console.log("[Summarize] 요약 완료");

  if (!data.summary) {
    throw new Error("백엔드가 요약 결과를 반환하지 않았습니다.");
  }

  return data.summary;
}

/** ── TTS (백엔드 /api/tts 호출) ── */

/**
 * 텍스트를 백엔드 OpenAI TTS로 변환해 base64 MP3로 반환
 * 실패해도 { success: false, error } 형태로 반환 (throw 안 함)
 *
 * @param {string} text - 읽어줄 텍스트
 * @returns {Promise<{success: boolean, audio?: string, error?: string}>}
 */
async function generateSpeech(text) {
  console.log("[TTS] 백엔드 호출 시작 | 텍스트:", text);

  let response;
  try {
    response = await callBackendAPI(`${BACKEND_URL}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    // TypeError = fetch 자체 실패(네트워크), 나머지는 429 등 포맷된 에러
    const msg = err instanceof TypeError ? "서버에 연결할 수 없습니다." : err.message;
    console.error("[TTS] 호출 실패:", msg);
    return { success: false, error: msg };
  }

  console.log("[TTS] 응답 상태:", response.status);

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    console.error("[TTS] 오류 응답:", errBody);
    return { success: false, error: errBody.error ?? `TTS 오류 (HTTP ${response.status})` };
  }

  const data = await response.json();
  console.log("[TTS] 음성 생성 완료, audio 길이:", data.audio?.length ?? 0);

  if (!data.audio) {
    return { success: false, error: "백엔드가 audio를 반환하지 않았습니다." };
  }

  return { success: true, audio: data.audio };
}

/** ── 유튜브 검색 결과 페이지 열기 ── */

/**
 * 유튜브 검색 결과 페이지를 탭에서 엽니다 (자동 재생 없음)
 *
 * @param {Object}  input
 * @param {string}  input.query             - 검색어
 * @param {boolean} [input.use_current_tab] - true이면 마지막 탭 재사용
 * @returns {Promise<string>} 성공 메시지
 */
async function executeYoutubeSearch(input) {
  const query = input.query;
  const url   = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

  // use_current_tab이 true이고 이전 탭이 살아있으면 URL 변경, 아니면 새 탭 생성
  if (input.use_current_tab && lastUsedTabId && await isTabAlive(lastUsedTabId)) {
    await chrome.tabs.update(lastUsedTabId, { url, active: false });
    console.log("[YoutubeSearch] 기존 탭에서 검색:", query);
  } else {
    const tab = await chrome.tabs.create({ url, active: false });
    lastUsedTabId = tab.id;
    console.log("[YoutubeSearch] 새 탭에서 검색:", query);
  }

  return `유튜브에서 "${query}"를 검색했습니다`;
}

/** ── 네이버 검색 결과 페이지 열기 ── */

/**
 * 네이버 검색 결과 페이지를 탭에서 엽니다
 *
 * @param {Object}  input
 * @param {string}  input.query             - 검색어
 * @param {boolean} [input.use_current_tab] - true이면 마지막 탭 재사용
 * @returns {Promise<string>} 성공 메시지
 */
async function executeNaverSearch(input) {
  const query = input.query;
  const url   = `https://search.naver.com/search.naver?query=${encodeURIComponent(query)}`;

  // use_current_tab이 true이고 이전 탭이 살아있으면 URL 변경, 아니면 새 탭 생성
  if (input.use_current_tab && lastUsedTabId && await isTabAlive(lastUsedTabId)) {
    await chrome.tabs.update(lastUsedTabId, { url, active: false });
    console.log("[NaverSearch] 기존 탭에서 검색:", query);
  } else {
    const tab = await chrome.tabs.create({ url, active: false });
    lastUsedTabId = tab.id;
    console.log("[NaverSearch] 새 탭에서 검색:", query);
  }

  return `네이버에서 "${query}"를 검색했습니다`;
}

/** ── 유틸 ── */

/**
 * 탭 ID가 아직 열려 있는지 확인 (닫혔거나 존재하지 않으면 false)
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
async function isTabAlive(tabId) {
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch {
    return false;
  }
}

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

/** ── 키보드 단축키 핸들러 ── */

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-voice") return;

  console.log("[Background] 단축키 감지: toggle-voice");

  // 팝업이 열릴 때 자동으로 녹음을 시작하도록 플래그 설정
  await chrome.storage.local.set({ auto_start_recording: true });

  try {
    // chrome.action.openPopup()은 Chrome 99+ + 사용자 제스처 컨텍스트에서만 작동
    await chrome.action.openPopup();
    console.log("[Background] 팝업 열기 완료");
  } catch (err) {
    // 미지원 환경(구버전 Chrome 등)이면 사용자가 직접 팝업을 열어야 함
    // 플래그는 유지되므로 팝업을 열면 자동 녹음 시작됨
    console.warn("[Background] openPopup 실패 (팝업 아이콘을 직접 클릭해주세요):", err.message);
  }
});
