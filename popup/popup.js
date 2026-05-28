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

const textCmdInput = document.getElementById("textCmdInput");
const textCmdBtn   = document.getElementById("textCmdBtn");

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

  // 초록 그라데이션 (#10B981 → #34D399), 좌→우
  const grad = ctx.createLinearGradient(0, 0, 240, 0);
  grad.addColorStop(0, "#10B981");
  grad.addColorStop(1, "#34D399");
  ctx.fillStyle = grad;

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

/**
 * 실행 결과 카드 표시 (단일/멀티 도구 모두 지원)
 *
 * @param {Array<{name,input}>} tools        - 백엔드가 반환한 도구 배열
 * @param {Array<string>}       intentLabels - 도구별 레이블
 * @param {Array<{tool,input,success,message}>} results - 실행 결과 배열
 */
function showActionCard(tools, intentLabels, results) {
  const isMulti    = tools.length > 1;
  const allSuccess = results.length > 0 && results.every((r) => r.success);
  const isUnknown  = results.some((r) => r.tool === "unknown_command");

  // 3개 이상이면 "첫번째 + 두번째 외 N개" 형태로 줄여 가독성 유지
  actionLabel.textContent = intentLabels.length > 2
    ? `${intentLabels.slice(0, 2).join(" + ")} 외 ${intentLabels.length - 2}개`
    : intentLabels.join(" + ");

  // raw: 도구 호출 나열 (멀티면 " | "로 구분)
  actionRaw.textContent = tools.map((t) =>
    Object.keys(t.input ?? {}).length > 0
      ? `${t.name}(${JSON.stringify(t.input)})`
      : `${t.name}()`
  ).join("  |  ");

  // 결과 메시지: 멀티면 각 줄에 ✓/✗ 아이콘
  if (results.length > 0) {
    actionResult.textContent = isMulti
      ? results.map((r) => `${r.success ? "✓" : "✗"} ${r.message}`).join("\n")
      : results[0].message;

    actionResult.className = "action-result-msg " +
      (isUnknown ? "unknown" : allSuccess ? "success" : "failure");
    actionResult.classList.remove("hidden");
  } else {
    actionResult.classList.add("hidden");
  }

  actionCard.className = "result-card action-card";
  if (isUnknown)       actionCard.classList.add("unknown");
  else if (allSuccess) actionCard.classList.add("success");
  else                 actionCard.classList.add("failure");

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
    speakResult(response.error);
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
    speakResult("응답 없음. 확장 프로그램을 다시 로드해주세요.");
    return;
  }
  if (response.error) {
    showErrorCard(response.error);
    setStatus("ERROR");
    speakResult(response.error);
    return;
  }

  const { tools = [], results = [], intentLabels = [], success, message, isUnknown } = response;

  console.log(
    `[Popup] 결과 — 도구 수: ${tools.length} | 성공: ${success} | unknown: ${!!isUnknown} | 메시지: ${message}`
  );

  showActionCard(tools, intentLabels, results);

  // 히스토리 레이블: 3개 이상은 "첫번째 + 두번째 외 N개"로 줄임
  const historyLabel = intentLabels.length > 2
    ? `${intentLabels.slice(0, 2).join(" + ")} 외 ${intentLabels.length - 2}개`
    : intentLabels.join(" + ");
  saveToHistory(lastTranscriptText, historyLabel, success && !isUnknown);

  speakResult(message); // 성공·실패·unknown 모두 결과를 음성으로 읽어줌

  if (success && !isUnknown) {
    setStatus("DONE");
  } else {
    setStatus("ERROR");
  }
}

/** 마이크·텍스트 버튼 상태를 처리 완료 상태로 초기화 */
function resetMicButton() {
  micBtn.classList.remove("recording", "processing");
  micBtn.disabled = false;
  textCmdBtn.disabled = false;
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
  console.log("[History UI] 저장 후 렌더링:", commandHistory.length, "개 항목");
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

  clearResults(); // lastTranscriptText = "" 로 초기화하므로, 반드시 그 다음에 설정
  lastTranscriptText = text;
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

/** ── TTS (음성 응답) ── */

/**
 * 화면 표시용 텍스트에서 이모지·파일명·URL을 제거해 음성 읽기에 적합한 형태로 변환
 * @param {string} text
 * @returns {string}
 */
function getSpeechText(text) {
  const result = text
    .replace(/^[✓✗]\s*/, "")                                    // 앞 체크마크 제거
    .replace(/\([^)]*\)/g, "")                                    // 괄호 안 내용 제거 (파일명 등)
    .replace(/https?:\/\/\S+/g, "")                              // URL 제거
    .replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, "")    // 유니코드 이모지 제거
    .replace(/[✓✗→←↑↓⬆⬇▶◀❓]/g, "")                         // 텍스트 특수 기호 제거
    .replace(/:\s*$/gm, "")                                       // 끝 콜론 제거
    .replace(/\s+/g, " ")                                         // 중복 공백 정리
    .trim();
  // 정리 후 빈 문자열이면 원본 반환
  return result || text;
}

/**
 * TTS가 활성화된 경우 background에 음성 생성을 요청하고 MP3를 재생.
 * TTS 실패는 조용히 무시 — 화면 표시에 영향 없음.
 *
 * @param {string} text - 읽어줄 텍스트
 */
async function speakResult(text) {
  try {
    const { tts_enabled = true } = await chrome.storage.local.get("tts_enabled");
    if (!tts_enabled) return;

    let speechText = getSpeechText(text);
    if (!speechText) return;

    // 요약 등 긴 텍스트는 앞 300자(문장 단위)만 TTS로 읽음
    if (speechText.length > 300) {
      const cut = speechText.slice(0, 300).replace(/[^.!?\n]*$/, "").trim();
      speechText = cut || speechText.slice(0, 300);
      console.log("[TTS] 긴 텍스트 잘림:", speechText.length, "자");
    }

    console.log("[TTS] 음성 생성 요청:", speechText);

    chrome.runtime.sendMessage(
      { type: "GENERATE_SPEECH", text: speechText },
      (response) => {
        if (!response?.success) {
          console.error("[TTS] 생성 실패:", response?.error);
          return;
        }
        // 정상: background가 offscreen에서 재생 → response.audio 없음
        // 폴백: offscreen 미지원 시 background가 audio를 반환 → popup에서 직접 재생
        if (response.audio) playAudio(response.audio);
      }
    );
  } catch (err) {
    console.warn("[TTS] 오류 (무시됨):", err.message);
  }
}

/**
 * base64 MP3를 Audio 객체로 재생.
 * 이미 재생 중인 오디오가 있으면 먼저 정지.
 *
 * @param {string} base64Mp3
 */
function playAudio(base64Mp3) {
  if (window.currentAudio) {
    window.currentAudio.pause();
    window.currentAudio = null;
  }

  const audio = new Audio("data:audio/mp3;base64," + base64Mp3);
  audio.volume = 0.9;
  window.currentAudio = audio;

  audio.play().catch((err) => {
    console.warn("[TTS] 재생 실패 (무시됨):", err.message);
  });

  console.log("[TTS] 재생 시작");
}

/** ── 멀티 명령 진행 상황 ── */

/** 도구 이름을 한국어 짧은 표현으로 변환 */
function formatToolNameKorean(toolName) {
  const map = {
    open_url:          "URL 열기",
    search_web:        "검색",
    open_new_tab:      "새 탭",
    close_current_tab: "탭 닫기",
    scroll_page:       "스크롤",
    navigate_back:     "뒤로가기",
    navigate_forward:  "앞으로가기",
    play_youtube:      "유튜브 재생",
    refresh_page:      "새로고침",
    next_tab:          "다음 탭",
    previous_tab:      "이전 탭",
    zoom_in:           "확대",
    zoom_out:          "축소",
    zoom_reset:        "화면 초기화",
    bookmark_current:  "북마크",
    mute_tab:          "음소거",
    capture_screenshot:"스크린샷",
  };
  return map[toolName] ?? toolName;
}

/** background에서 오는 PROGRESS_UPDATE 메시지 수신 */
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "PROGRESS_UPDATE") {
    const { current, total, toolName } = message;
    // 단일 명령은 표시 불필요
    if (total > 1) {
      micHint.textContent = `실행 중 (${current}/${total}): ${formatToolNameKorean(toolName)}`;
      console.log(`[Popup] 진행: ${current}/${total} — ${toolName}`);
    }
  }
});

/** ── 이벤트 바인딩 ── */
micBtn.addEventListener("click", () => {
  // 진행 중인 TTS 오디오가 있으면 정지 후 새 명령 시작
  if (window.currentAudio) {
    window.currentAudio.pause();
    window.currentAudio = null;
  }
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

function submitTextCommand() {
  const text = textCmdInput.value.trim();
  if (!text) return;
  textCmdInput.value = "";
  textCmdBtn.disabled = true;
  rerunCommand(text);
}

textCmdBtn.addEventListener("click", submitTextCommand);

textCmdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitTextCommand();
});

/** ── 백그라운드 탭 안내 배너 ── */

/**
 * 첫 실행 시 한 번만 안내 배너를 표시.
 * 닫기(×) 버튼 클릭 시 storage에 플래그를 저장해 다시 표시하지 않음.
 */
async function initInfoBanner() {
  const { info_shown = false } = await chrome.storage.local.get("info_shown");
  if (info_shown) return;

  const banner     = document.getElementById("infoBanner");
  const closeBtn   = document.getElementById("infoBannerClose");

  banner.classList.remove("hidden");

  closeBtn.addEventListener("click", async () => {
    banner.classList.add("hidden");
    await chrome.storage.local.set({ info_shown: true });
    console.log("[Popup] 안내 배너 닫힘, 플래그 저장 완료");
  });
}

/** ── 단축키 자동 시작 ── */

/**
 * 단축키(Ctrl+Shift+1)로 팝업이 열렸을 때 자동으로 녹음 시작.
 * background.js가 설정한 "auto_start_recording" 플래그를 확인하고,
 * 있으면 즉시 제거한 뒤 녹음을 시작.
 */
async function checkAutoStart() {
  const { auto_start_recording = false } = await chrome.storage.local.get("auto_start_recording");
  if (!auto_start_recording) return;

  // 다음 팝업 열 때 자동 실행 안 되도록 플래그 즉시 제거
  await chrome.storage.local.remove("auto_start_recording");
  console.log("[Popup] 단축키로 실행됨 — 자동 녹음 시작");

  // 한 프레임 대기해서 UI가 완전히 준비된 후 녹음 시작
  requestAnimationFrame(() => startRecording());
}

/** ── 초기화 ── */
initWaveformCanvas();
startExampleRotation();
loadHistory();
initInfoBanner();
checkAutoStart();

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
