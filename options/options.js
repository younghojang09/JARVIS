// options.js — 설정 페이지 스크립트
// 역할: API 키를 chrome.storage.local에 저장하고 불러옴

const openaiInput    = document.getElementById("openaiKey");
const anthropicInput = document.getElementById("anthropicKey");
const youtubeInput   = document.getElementById("youtubeKey");
const saveBtn        = document.getElementById("saveBtn");
const statusMsg      = document.getElementById("statusMsg");

/** 저장된 키를 로드해 입력 필드의 placeholder에 저장 여부 표시 */
function loadSavedKeys() {
  chrome.storage.local.get(["openaiApiKey", "anthropicApiKey", "youtube_api_key"], (result) => {
    // 실제 키 값은 노출하지 않고 저장 여부만 힌트로 표시
    if (result.openaiApiKey) {
      openaiInput.placeholder    = "저장됨 (변경하려면 새 키 입력)";
      openaiInput.dataset.saved  = "true";
    }
    if (result.anthropicApiKey) {
      anthropicInput.placeholder   = "저장됨 (변경하려면 새 키 입력)";
      anthropicInput.dataset.saved = "true";
    }
    if (result.youtube_api_key) {
      youtubeInput.placeholder   = "저장됨 (변경하려면 새 키 입력)";
      youtubeInput.dataset.saved = "true";
    }
  });
}

/** 입력값 저장 */
function saveKeys() {
  const openaiVal    = openaiInput.value.trim();
  const anthropicVal = anthropicInput.value.trim();
  const youtubeVal   = youtubeInput.value.trim();

  if (!openaiVal && !anthropicVal && !youtubeVal) {
    showStatus("저장할 키가 없습니다.", "error");
    return;
  }

  const updates = {};
  if (openaiVal)    updates.openaiApiKey    = openaiVal;
  if (anthropicVal) updates.anthropicApiKey = anthropicVal;
  if (youtubeVal)   updates.youtube_api_key = youtubeVal;

  chrome.storage.local.set(updates, () => {
    if (chrome.runtime.lastError) {
      showStatus("저장 실패: " + chrome.runtime.lastError.message, "error");
      return;
    }

    showStatus("✓ 저장되었습니다.", "success");

    // 저장 후 입력 필드 초기화 및 placeholder 갱신
    openaiInput.value    = "";
    anthropicInput.value = "";
    youtubeInput.value   = "";
    loadSavedKeys();
  });
}

/** 상태 메시지 표시 (3초 후 사라짐) */
function showStatus(message, type) {
  statusMsg.textContent = message;
  statusMsg.className   = "status-msg " + type;
  setTimeout(() => {
    statusMsg.textContent = "";
    statusMsg.className   = "status-msg";
  }, 3000);
}

/** ── 이벤트 바인딩 ── */
saveBtn.addEventListener("click", saveKeys);

// Enter 키로도 저장 가능
[openaiInput, anthropicInput, youtubeInput].forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveKeys();
  });
});

// 페이지 로드 시 저장된 키 확인
loadSavedKeys();
