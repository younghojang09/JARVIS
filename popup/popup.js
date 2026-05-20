// popup.js — 팝업 UI 진입점
// 역할: 마이크 녹음 제어, background.js와 메시지 통신, UI 상태 업데이트

/** ── 상태 정의 ── */
const STATUS = {
  IDLE:       { text: "대기중",    dot: "",           hint: "버튼을 눌러 말하세요" },
  RECORDING:  { text: "녹음중",    dot: "recording",  hint: null }, // hint는 타이머가 동적으로 채움
  PROCESSING: { text: "처리중...", dot: "processing", hint: "잠시 기다려주세요..." },
  DONE:       { text: "완료",      dot: "done",       hint: "버튼을 눌러 다시 말하세요" },
  ERROR:      { text: "오류",      dot: "error",      hint: "버튼을 눌러 다시 시도하세요" },
};

/** ── DOM 참조 ── */
const micBtn        = document.getElementById("micBtn");
const statusDot     = document.getElementById("statusDot");
const statusText    = document.getElementById("statusText");
const micHint       = document.getElementById("micHint");
const transcriptBox = document.getElementById("transcriptBox");
const actionBox     = document.getElementById("actionBox");
const errorBox      = document.getElementById("errorBox");

/** ── 녹음 상태 ── */
let mediaRecorder   = null;
let audioChunks     = [];
let isRecording     = false;
let recordingTimerInterval = null; // 녹음 타이머 인터벌 ID

/** ── 지원 오디오 포맷 자동 감지 ── */

/**
 * 브라우저가 지원하는 오디오 포맷 중 Whisper와 호환되는 것을 자동 선택
 * @returns {string} 지원되는 mimeType (없으면 빈 문자열 → MediaRecorder 기본값 사용)
 */
function getSupportedMimeType() {
  const candidates = [
    "audio/webm;codecs=opus", // Chrome 기본, 가장 선호
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  const supported = candidates.find((t) => MediaRecorder.isTypeSupported(t));
  console.log("[Popup] 선택된 오디오 포맷:", supported || "(브라우저 기본값)");
  return supported || "";
}

/** ── UI 업데이트 헬퍼 ── */

function setStatus(state) {
  const s = STATUS[state];
  statusDot.className    = "status-dot " + s.dot;
  statusText.textContent = s.text;
  if (s.hint !== null) {
    micHint.textContent = s.hint;
  }
}

function setTranscript(text) {
  transcriptBox.className = "result-box has-content";
  transcriptBox.textContent = text;
}

function clearResults() {
  transcriptBox.className = "result-box";
  transcriptBox.innerHTML = '<span class="placeholder-text">음성을 인식하면 여기에 표시됩니다</span>';
  actionBox.className = "result-box action-box";
  actionBox.innerHTML = '<span class="placeholder-text">명령 분석은 Day 3에서 구현 예정입니다</span>';
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

function showError(message) {
  console.error("[Popup] 오류:", message);
  errorBox.innerHTML = "";
  errorBox.textContent = "⚠️ " + message;
  errorBox.classList.remove("hidden");
  setStatus("ERROR");
  micBtn.classList.remove("recording", "processing");
  micBtn.disabled = false;
}

/**
 * 마이크 권한 관련 에러 표시 + "권한 요청 페이지 열기" 버튼 삽입
 * @param {"prompt" | "denied" | "device"} type
 */
function showPermissionError(type) {
  const messages = {
    prompt:  "마이크 권한을 허용해야 합니다. 아래 버튼을 눌러 권한을 설정해주세요.",
    denied:  "마이크가 차단되어 있습니다. 아래 버튼을 눌러 해제 방법을 확인하세요.",
    device:  "마이크 장치를 찾을 수 없습니다. 마이크 연결 상태를 확인해주세요.",
  };

  errorBox.innerHTML = "";

  const msg = document.createElement("p");
  msg.textContent = "⚠️ " + (messages[type] ?? messages.prompt);

  // "device" 오류는 설정 페이지로 유도할 수 없으므로 버튼 미표시
  if (type !== "device") {
    const btn = document.createElement("button");
    btn.className   = "permission-btn";
    btn.textContent = "🎤 권한 요청 페이지 열기";
    btn.addEventListener("click", openPermissionTab);
    errorBox.appendChild(msg);
    errorBox.appendChild(btn);
  } else {
    errorBox.appendChild(msg);
  }

  errorBox.classList.remove("hidden");
  setStatus("ERROR");
  micBtn.classList.remove("recording", "processing");
  micBtn.disabled = false;
}

/** 마이크 권한 전용 탭 열기 */
function openPermissionTab() {
  const url = chrome.runtime.getURL("permission/permission.html");
  console.log("[Popup] 권한 요청 탭 열기:", url);
  chrome.tabs.create({ url });
  window.close(); // 팝업 닫기 (탭 전환 후 팝업이 남아있으면 혼란스러움)
}

/**
 * 현재 마이크 권한 상태 조회
 * @returns {Promise<"granted" | "denied" | "prompt">}
 */
async function checkMicPermission() {
  try {
    const result = await navigator.permissions.query({ name: "microphone" });
    console.log("[Popup] 마이크 권한 상태:", result.state);
    return result.state;
  } catch (err) {
    // permissions API를 지원하지 않는 환경 → 일단 시도해보도록 "prompt" 반환
    console.warn("[Popup] permissions API 사용 불가, 권한 상태 미확인:", err.message);
    return "prompt";
  }
}

/** ── 녹음 타이머 ── */

/** 녹음 시작 시 경과 시간을 micHint에 표시 */
function startRecordingTimer() {
  const startTime = Date.now();
  micHint.textContent = "0:00 — 다시 누르면 중지됩니다";

  recordingTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const secs = String(elapsed % 60).padStart(2, "0");
    micHint.textContent = `${mins}:${secs} — 다시 누르면 중지됩니다`;
  }, 1000);
}

function stopRecordingTimer() {
  clearInterval(recordingTimerInterval);
  recordingTimerInterval = null;
}

/** ── 마이크 녹음 ── */

async function startRecording() {
  if (micBtn.disabled) return;

  console.log("[Popup] 마이크 권한 상태 확인 중...");

  // ── 1. 권한 사전 체크 ──────────────────────────────────────
  const permState = await checkMicPermission();

  if (permState === "denied") {
    // Chrome이 이 출처의 마이크를 영구 차단 중 → getUserMedia 시도 없이 바로 안내
    console.warn("[Popup] 마이크 권한 차단됨");
    showPermissionError("denied");
    return;
  }

  if (permState === "prompt") {
    // 아직 한 번도 허용/거부 선택 안 함 → 풀페이지 탭에서 안전하게 요청
    // (팝업에서 요청하면 다이얼로그 중 팝업이 닫혀 요청이 끊길 수 있음)
    console.log("[Popup] 권한 미설정 → permission 탭으로 이동");
    showPermissionError("prompt");
    return;
  }

  // ── 2. 권한이 "granted"인 경우 정상 녹음 진행 ────────────────
  console.log("[Popup] 권한 확인됨, 녹음 시작");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks  = [];

    const mimeType     = getSupportedMimeType();
    const recorderOpts = mimeType ? { mimeType } : {};
    mediaRecorder = new MediaRecorder(stream, recorderOpts);

    mediaRecorder.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    });

    mediaRecorder.addEventListener("stop", onRecordingStop);

    mediaRecorder.start();
    isRecording = true;

    micBtn.classList.add("recording");
    setStatus("RECORDING");
    startRecordingTimer();
    clearResults();

  } catch (err) {
    // 권한은 있었지만 다른 이유로 실패 (장치 없음, 다른 앱이 점유 중 등)
    console.error("[Popup] getUserMedia 오류:", err.name, err.message, err.stack);

    if (err.name === "NotAllowedError") {
      // 권한이 "granted"였는데 NotAllowedError → 사용자가 OS 레벨에서 차단했을 가능성
      showPermissionError("denied");
    } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      showPermissionError("device");
    } else {
      showError(`마이크 오류 (${err.name}): ${err.message}`);
    }
  }
}

function stopRecording() {
  if (!mediaRecorder || !isRecording) return;

  console.log("[Popup] 녹음 종료, 오디오 청크 수:", audioChunks.length);

  stopRecordingTimer();

  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach((t) => t.stop());
  isRecording = false;

  micBtn.classList.remove("recording");
  micBtn.classList.add("processing");
  micBtn.disabled = true; // 처리 완료될 때까지 버튼 비활성화
  setStatus("PROCESSING");
}

/** 녹음 종료 후 오디오 Blob을 background로 전송 */
async function onRecordingStop() {
  const actualMimeType = mediaRecorder.mimeType || "audio/webm";
  const audioBlob      = new Blob(audioChunks, { type: actualMimeType });

  console.log("[Popup] 오디오 Blob 크기:", audioBlob.size, "bytes | mimeType:", actualMimeType);

  const audioBase64 = await blobToBase64(audioBlob);
  console.log("[Popup] base64 변환 완료, background로 전송 중...");

  chrome.runtime.sendMessage(
    { type: "PROCESS_AUDIO", audioBase64, mimeType: actualMimeType },
    handleBackgroundResponse
  );
}

/** ── Background 응답 처리 ── */

function handleBackgroundResponse(response) {
  console.log("[Popup] Background 응답:", response);

  micBtn.classList.remove("processing");
  micBtn.disabled = false;

  // 응답 없음 = 서비스 워커 재시작 필요
  if (!response) {
    showError("백그라운드 응답 없음. 확장 프로그램을 다시 로드하거나 재설치해주세요.");
    return;
  }

  if (response.error) {
    showError(response.error);
    return;
  }

  if (response.transcript) {
    console.log("[Popup] 변환 텍스트:", response.transcript);
    setTranscript(response.transcript);
  }

  // Day 3에서 actionLabel 추가 예정
  // if (response.actionLabel) { setAction(response.actionLabel); }

  setStatus("DONE");
}

/** ── 유틸 ── */

/**
 * Blob을 base64 문자열로 변환 (data URL에서 헤더 제거)
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror   = reject;
    reader.readAsDataURL(blob);
  });
}

/** ── 이벤트 바인딩 ── */

micBtn.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

/** 팝업 열릴 때 API 키 설정 여부 확인 */
chrome.storage.local.get(["openaiApiKey", "anthropicApiKey"], (result) => {
  if (!result.openaiApiKey) {
    // Whisper 호출에 필수 → 에러로 표시
    showError("OpenAI API 키가 설정되지 않았습니다. 설정(⚙️)에서 입력해주세요.");
    return;
  }
  if (!result.anthropicApiKey) {
    // Day 3 전까지는 불필요 → 경고만 표시
    console.warn("[Popup] Anthropic API 키 미설정 (Day 3 기능에 필요)");
  }
  console.log("[Popup] API 키 확인 완료, 준비됨");
});
