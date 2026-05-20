// popup.js — 팝업 UI 진입점
// 역할: 마이크 녹음 제어, background.js와 메시지 통신, UI 상태 업데이트

/** ── 상태 정의 (단계 기반) ── */
const STATUS = {
  IDLE:      { step: 0, hint: "버튼을 눌러 말하세요" },
  RECORDING: { step: 1, hint: null }, // 타이머가 동적으로 채움
  STT:       { step: 2, hint: "Whisper가 음성을 인식하고 있습니다" },
  ANALYZING: { step: 2, hint: "Claude가 명령을 분석하고 있습니다" },
  DONE:      { step: 3, hint: "완료! 버튼을 눌러 다시 말하세요" },
  ERROR:     { step: 0, hint: "오류 발생 — 버튼을 눌러 다시 시도하세요", isError: true },
};

/** ── DOM 참조 ── */
const micBtn         = document.getElementById("micBtn");
const micPulseRing   = document.getElementById("micPulseRing");
const micHint        = document.getElementById("micHint");
const waveformCanvas = document.getElementById("waveformCanvas");
const exampleText    = document.getElementById("exampleText");
const stepsBar       = document.getElementById("stepsBar");
const stepEls        = Array.from(stepsBar.querySelectorAll(".step"));

const transcriptCard = document.getElementById("transcriptCard");
const transcriptText = document.getElementById("transcriptText");

const actionCard     = document.getElementById("actionCard");
const actionLabel    = document.getElementById("actionLabel");
const actionResult   = document.getElementById("actionResult");
const actionRaw      = document.getElementById("actionRaw");

const errorCard      = document.getElementById("errorCard");
const errorContent   = document.getElementById("errorContent");

const historySection  = document.getElementById("historySection");
const historyList     = document.getElementById("historyList");
const historyClearBtn = document.getElementById("historyClearBtn");

/** ── 녹음 상태 ── */
let mediaRecorder          = null;
let audioChunks            = [];
let isRecording            = false;
let recordingTimerInterval = null;
let lastTranscriptText     = "";

/** ── 웨이브폼 상태 ── */
let audioCtx       = null;
let analyser       = null;
let waveformAnimId = null;

/** ── 예시 힌트 ── */
const EXAMPLES = [
  '"유튜브 열어줘"',
  '"구글에서 파이썬 검색해줘"',
  '"이 탭 닫아줘"',
  '"새 탭 열어줘"',
  '"아래로 스크롤해줘"',
  '"뒤로 가줘"',
  '"새로고침해줘"',
  '"다음 탭으로 이동해줘"',
  '"페이지 확대해줘"',
  '"북마크에 추가해줘"',
  '"소리 꺼줘"',
];
let exampleIdx = 0;

/** ── 히스토리 상수 ── */
const MAX_HISTORY = 5;

/** ── 지원 오디오 포맷 자동 감지 ── */
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

/** ── 단계 표시기 ── */
function setStepActive(stepIdx, isError = false) {
  stepEls.forEach((el, i) => {
    el.classList.remove("active", "done", "error");
    if (i < stepIdx)        el.classList.add("done");
    else if (i === stepIdx) el.classList.add(isError ? "error" : "active");
  });
}

function setStatus(state) {
  const s = STATUS[state];
  setStepActive(s.step, s.isError ?? false);
  if (s.hint !== null) micHint.textContent = s.hint;
}

/** ── 웨이브폼 ── */
function initWaveformCanvas() {
  const dpr = window.devicePixelRatio || 1;
  waveformCanvas.width  = 240 * dpr;
  waveformCanvas.height = 40  * dpr;
  // CSS 크기는 popup.css에서 240x40으로 지정; DPR 보정으로 선명하게 렌더링
  waveformCanvas.getContext("2d").scale(dpr, dpr);
}

function startWaveform(stream) {
  waveformCanvas.classList.remove("hidden");
  audioCtx = new AudioContext();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 128;
  const source = audioCtx.createMediaStreamSource(stream);
  source.connect(analyser);
  drawWaveform();
}

function stopWaveform() {
  cancelAnimationFrame(waveformAnimId);
  waveformAnimId = null;
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  analyser = null;
  waveformCanvas.classList.add("hidden");
  waveformCanvas.getContext("2d").clearRect(0, 0, 240, 40);
}

function drawWaveform() {
  waveformAnimId = requestAnimationFrame(drawWaveform);
  if (!analyser) return;

  const ctx    = waveformCanvas.getContext("2d");
  const bufLen = analyser.frequencyBinCount;
  const data   = new Uint8Array(bufLen);
  analyser.getByteFrequencyData(data);

  ctx.clearRect(0, 0, 240, 40);
  ctx.fillStyle = "#5856D6"; // var(--accent)

  const barW = 240 / bufLen;
  const gap  = 1.5;

  for (let i = 0; i < bufLen; i++) {
    const barH = Math.max((data[i] / 255) * 40, 2);
    const x = i * barW;
    const y = (40 - barH) / 2;
    const w = Math.max(barW - gap, 1);
    const r = Math.min(w / 2, 2);
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, barH, r);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, w, barH);
    }
  }
}

/** ── 예시 힌트 로테이션 ── */
function startExampleRotation() {
  exampleText.textContent = EXAMPLES[0];
  exampleText.style.opacity = "1";

  setInterval(() => {
    exampleText.style.opacity = "0";
    setTimeout(() => {
      exampleIdx = (exampleIdx + 1) % EXAMPLES.length;
      exampleText.textContent = EXAMPLES[exampleIdx];
      exampleText.style.opacity = "1";
    }, 220);
  }, 3000);
}

/** ── 결과 카드 UI ── */
function showTranscriptCard(text) {
  transcriptText.textContent = text;
  transcriptCard.classList.remove("hidden");
}

function showActionCard(tool, input, intentLabel, execResult) {
  actionLabel.textContent = intentLabel;

  actionRaw.textContent = Object.keys(input).length > 0
    ? `${tool}(${JSON.stringify(input)})`
    : `${tool}()`;

  if (execResult) {
    actionResult.textContent = execResult.message;
    actionResult.className = "action-result-msg " +
      (execResult.isUnknown ? "unknown" : execResult.success ? "success" : "failure");
    actionResult.classList.remove("hidden");
  } else {
    actionResult.classList.add("hidden");
  }

  actionCard.className = "result-card action-card";
  if (execResult) {
    if (execResult.isUnknown)    actionCard.classList.add("unknown");
    else if (execResult.success) actionCard.classList.add("success");
    else                         actionCard.classList.add("failure");
  }
  actionCard.classList.remove("hidden");
}

function showErrorCard(message) {
  errorContent.textContent = message;
  // 기존에 삽입된 권한 버튼 제거
  const existing = errorCard.querySelector(".permission-btn");
  if (existing) existing.remove();
  errorCard.classList.remove("hidden");
}

/**
 * 마이크 권한 오류 표시 + "권한 요청 페이지 열기" 버튼 동적 삽입
 * @param {"prompt" | "denied" | "device"} type
 */
function showPermissionError(type) {
  const messages = {
    prompt: "마이크 권한을 허용해야 합니다. 아래 버튼을 눌러 권한을 설정해주세요.",
    denied: "마이크가 차단되어 있습니다. 아래 버튼을 눌러 해제 방법을 확인하세요.",
    device: "마이크 장치를 찾을 수 없습니다. 마이크 연결 상태를 확인해주세요.",
  };

  errorContent.textContent = messages[type] ?? messages.prompt;

  const existing = errorCard.querySelector(".permission-btn");
  if (existing) existing.remove();

  // "device" 오류는 설정 페이지로 유도 불가 → 버튼 미표시
  if (type !== "device") {
    const btn = document.createElement("button");
    btn.className   = "permission-btn";
    btn.textContent = "🎤 권한 요청 페이지 열기";
    btn.addEventListener("click", openPermissionTab);
    errorCard.appendChild(btn);
  }

  errorCard.classList.remove("hidden");
  setStatus("ERROR");
  resetMicButton();
}

function hideErrorCard() {
  errorCard.classList.add("hidden");
  errorContent.textContent = "";
  const existing = errorCard.querySelector(".permission-btn");
  if (existing) existing.remove();
}

function clearResults() {
  transcriptCard.classList.add("hidden");
  transcriptText.textContent = "";
  actionCard.className = "result-card action-card hidden";
  hideErrorCard();
  lastTranscriptText = "";
}

/** 마이크 권한 전용 탭 열기 */
function openPermissionTab() {
  chrome.tabs.create({ url: chrome.runtime.getURL("permission/permission.html") });
  window.close(); // 팝업 닫기 (탭 전환 후 팝업이 남아 있으면 혼란스러움)
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
    // permissions API를 지원하지 않는 환경 → 일단 시도하도록 "prompt" 반환
    console.warn("[Popup] permissions API 사용 불가:", err.message);
    return "prompt";
  }
}

/** ── 녹음 타이머 ── */
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
  const permState = await checkMicPermission();

  if (permState === "denied") {
    console.warn("[Popup] 마이크 권한 차단됨");
    showPermissionError("denied");
    return;
  }

  if (permState === "prompt") {
    // 팝업에서 요청하면 다이얼로그 중 팝업이 닫혀 요청이 끊길 수 있음 → 풀페이지 탭으로 이동
    console.log("[Popup] 권한 미설정 → permission 탭으로 이동");
    showPermissionError("prompt");
    return;
  }

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
    micPulseRing.classList.add("recording");
    setStatus("RECORDING");
    startRecordingTimer();
    startWaveform(stream);
    clearResults();

  } catch (err) {
    console.error("[Popup] getUserMedia 오류:", err.name, err.message);
    if (err.name === "NotAllowedError") {
      showPermissionError("denied");
    } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      showPermissionError("device");
    } else {
      showErrorCard(`마이크 오류 (${err.name}): ${err.message}`);
      setStatus("ERROR");
      resetMicButton();
    }
  }
}

function stopRecording() {
  if (!mediaRecorder || !isRecording) return;

  console.log("[Popup] 녹음 종료, 오디오 청크 수:", audioChunks.length);

  stopRecordingTimer();
  stopWaveform();

  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach((t) => t.stop());
  isRecording = false;

  micBtn.classList.remove("recording");
  micPulseRing.classList.remove("recording");
  micBtn.classList.add("processing");
  micBtn.disabled = true;
  setStatus("STT");
}

/** 녹음 종료 후 오디오 Blob → background 전송 */
async function onRecordingStop() {
  const actualMimeType = mediaRecorder.mimeType || "audio/webm";
  const audioBlob      = new Blob(audioChunks, { type: actualMimeType });

  console.log("[Popup] 오디오 Blob 크기:", audioBlob.size, "bytes | mimeType:", actualMimeType);

  const audioBase64 = await blobToBase64(audioBlob);
  console.log("[Popup] base64 변환 완료, background로 전송 중...");

  chrome.runtime.sendMessage(
    { type: "PROCESS_AUDIO", audioBase64, mimeType: actualMimeType },
    handleAudioResponse
  );
}

/** ── Background 응답 처리 ── */
function handleAudioResponse(response) {
  console.log("[Popup] PROCESS_AUDIO 응답:", response);

  if (!response) {
    resetMicButton();
    showErrorCard("백그라운드 응답 없음. 확장 프로그램을 다시 로드해주세요.");
    setStatus("ERROR");
    return;
  }
  if (response.error) {
    resetMicButton();
    showErrorCard(response.error);
    setStatus("ERROR");
    return;
  }

  lastTranscriptText = response.transcript;
  showTranscriptCard(response.transcript);
  setStatus("ANALYZING");

  chrome.runtime.sendMessage(
    { type: "PROCESS_COMMAND", text: response.transcript },
    handleCommandResponse
  );
}

function handleCommandResponse(response) {
  console.log("[Popup] PROCESS_COMMAND 응답:", response);

  resetMicButton();

  if (!response) {
    showErrorCard("응답 없음. 확장 프로그램을 다시 로드해주세요.");
    setStatus("ERROR");
    return;
  }
  if (response.error) {
    showErrorCard(response.error);
    setStatus("ERROR");
    return;
  }

  const { tool, input, intentLabel, success, message, isUnknown } = response;

  console.log(
    `[Popup] 결과 — 도구: ${tool} | 성공: ${success} | unknown: ${!!isUnknown} | 메시지: ${message}`
  );

  showActionCard(tool, input ?? {}, intentLabel, { success, message, isUnknown });
  saveToHistory(lastTranscriptText, intentLabel, success && !isUnknown);

  if (success && !isUnknown) {
    setStatus("DONE");
  } else {
    setStatus("ERROR");
  }
}

/** 마이크 버튼 상태를 처리 완료 상태로 초기화 */
function resetMicButton() {
  micBtn.classList.remove("recording", "processing");
  micBtn.disabled = false;
}

/** ── 히스토리 ── */
async function loadHistory() {
  const { commandHistory = [] } = await chrome.storage.local.get("commandHistory");
  renderHistory(commandHistory);
}

async function saveToHistory(text, intentLabel, success) {
  if (!text) return;
  const { commandHistory = [] } = await chrome.storage.local.get("commandHistory");
  commandHistory.unshift({ text, intentLabel, success, timestamp: Date.now() });
  if (commandHistory.length > MAX_HISTORY) commandHistory.length = MAX_HISTORY;
  await chrome.storage.local.set({ commandHistory });
  renderHistory(commandHistory);
}

function renderHistory(history) {
  if (!history.length) {
    historySection.classList.add("hidden");
    return;
  }
  historySection.classList.remove("hidden");
  historyList.innerHTML = history
    .map((item, i) =>
      `<li class="history-item ${item.success ? "success" : "failure"}" data-idx="${i}">
        <span class="history-text">${escapeHtml(item.text)}</span>
        <span class="history-time">${timeAgo(item.timestamp)}</span>
      </li>`
    )
    .join("");

  historyList.querySelectorAll(".history-item").forEach((el) => {
    el.addEventListener("click", () => {
      const item = history[parseInt(el.dataset.idx, 10)];
      if (item) rerunCommand(item.text);
    });
  });
}

/** 히스토리 항목을 다시 실행 (Whisper 생략, PROCESS_COMMAND만 전송) */
function rerunCommand(text) {
  if (isRecording || micBtn.disabled) return;

  lastTranscriptText = text;
  clearResults();
  showTranscriptCard(text);
  setStatus("ANALYZING");
  micBtn.classList.add("processing");
  micBtn.disabled = true;

  chrome.runtime.sendMessage({ type: "PROCESS_COMMAND", text }, handleCommandResponse);
}

/** ── 유틸 ── */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror   = reject;
    reader.readAsDataURL(blob);
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;");
}

function timeAgo(timestamp) {
  const secs = Math.floor((Date.now() - timestamp) / 1000);
  if (secs < 60)    return "방금 전";
  if (secs < 3600)  return `${Math.floor(secs / 60)}분 전`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}시간 전`;
  return `${Math.floor(secs / 86400)}일 전`;
}

/** ── 이벤트 바인딩 ── */
micBtn.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

historyClearBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove("commandHistory");
  renderHistory([]);
});

/** ── 초기화 ── */
initWaveformCanvas();
startExampleRotation();
loadHistory();

// API 키 설정 여부 확인 (두 키 모두 필요)
chrome.storage.local.get(["openaiApiKey", "anthropicApiKey"], (result) => {
  const missing = [];
  if (!result.openaiApiKey)    missing.push("OpenAI (Whisper)");
  if (!result.anthropicApiKey) missing.push("Anthropic (Claude)");

  if (missing.length > 0) {
    showErrorCard(`API 키 미설정: ${missing.join(", ")}. 설정(⚙️)에서 입력해주세요.`);
    setStatus("ERROR");
    return;
  }

  console.log("[Popup] API 키 확인 완료, 준비됨");
});
