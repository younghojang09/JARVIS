// background.js — 서비스 워커 (백그라운드 스크립트)
// 역할: 백엔드 API 호출 → Whisper STT + Claude 의도 파악 + 액션 실행 파이프라인

/** Supabase 프로젝트 기본 URL (인증 엔드포인트에 사용) */
const SUPABASE_PROJECT_URL = "https://uhqesvkydcziaefwbdjx.supabase.co";
/** Supabase 공개 API 키 (익명 로그인용) */
const SUPABASE_ANON_KEY = "sb_publishable_q3Iw5g8Q8ibAmRJ0Anl8RA_k-JvaELv";
/** 백엔드 서버 base URL (API 키는 모두 서버에서 관리) */
const BACKEND_URL = "https://voice-browser-backend-youngho.vercel.app";

/** ── 브라우저 제어 도구 정의 (문서/참조용 — 실제 Claude 호출은 백엔드에서 수행) ── */
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
    description: "유튜브에서 특정 영상이나 노래를 검색해서 자동으로 재생합니다.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "검색어. 예: '아이유 좋은날'" },
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
  console.log("[Intent] 백엔드 호출 시작 | 텍스트:", text);

  let response;
  try {
    response = await callBackendAPI(`${BACKEND_URL}/api/parse-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
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

  const { tool, input } = data;
  if (!tool) {
    throw new Error("백엔드가 도구를 반환하지 않았습니다. 다시 시도해주세요.");
  }

  console.log("[Intent] 선택된 도구:", tool, "| 입력:", JSON.stringify(input));

  return {
    tool,
    input,
    intentLabel: formatIntentLabel(tool, input),
  };
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
    case "mute_tab":           return "🔇 탭 음소거 전환";
    case "capture_screenshot": return "📸 화면 캡처";
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

    case "capture_screenshot": {
      return await executeCaptureScreenshot();
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
 * 백엔드에 검색어를 보내 첫 번째 영상 URL을 받아 새 탭에서 자동 재생
 *
 * @param {string} query - 검색어 (예: "아이유 좋은날")
 * @returns {Promise<string>} 성공 메시지 (영상 제목 포함)
 */
async function executeYouTubePlay(query) {
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

  await chrome.tabs.create({ url, active: true });
  console.log("[YouTube] 재생 탭 열기 완료 | 제목:", title, "| URL:", url);

  return `▶ "${title}" 재생 중`;
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
