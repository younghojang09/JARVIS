// options.js — 설정 페이지 스크립트
// 역할: API 키를 chrome.storage.local에 저장하고 불러옴

const openaiInput   = document.getElementById("openaiKey");
const anthropicInput = document.getElementById("anthropicKey");
const saveBtn       = document.getElementById("saveBtn");
const statusMsg     = document.getElementById("statusMsg");

/** 저장된 키를 로드해 입력 필드에 채움 */
function loadSavedKeys() {
  chrome.storage.local.get(["openaiApiKey", "anthropicApiKey"], (result) => {
    if (result.openaiApiKey) {
      // 실제 키 값은 노출하지 않고 저장 여부만 힌트로 표시
      openaiInput.placeholder = "저장됨 (변경하려면 새 키 입력)";
      openaiInput.dataset.saved = "true";
    }
    if (result.anthropicApiKey) {
      anthropicInput.placeholder = "저장됨 (변경하려면 새 키 입력)";
      anthropicInput.dataset.saved = "true";
    }
  });
}

/** 입력값 저장 */
function saveKeys() {
  const openaiVal   = openaiInput.value.trim();
  const anthropicVal = anthropicInput.value.trim();

  // 둘 다 비어있으면 저장할 게 없음
  if (!openaiVal && !anthropicVal) {
    showStatus("저장할 키가 없습니다.", "error");
    return;
  }

  const updates = {};
  if (openaiVal)   updates.openaiApiKey    = openaiVal;
  if (anthropicVal) updates.anthropicApiKey = anthropicVal;

  chrome.storage.local.set(updates, () => {
    if (chrome.runtime.lastError) {
      showStatus("저장 실패: " + chrome.runtime.lastError.message, "error");
      return;
    }

    showStatus("✓ 저장되었습니다.", "success");

    // 저장 후 입력 필드 초기화 및 상태 갱신
    openaiInput.value   = "";
    anthropicInput.value = "";
    loadSavedKeys();
  });
}

/** API 키 삭제 (개발/디버그용) */
function clearKeys() {
  chrome.storage.local.remove(["openaiApiKey", "anthropicApiKey"], () => {
    openaiInput.placeholder   = "sk-...";
    anthropicInput.placeholder = "sk-ant-...";
    delete openaiInput.dataset.saved;
    delete anthropicInput.dataset.saved;
    showStatus("API 키가 삭제되었습니다.", "success");
  });
}

/** 상태 메시지 표시 (3초 후 사라짐) */
function showStatus(message, type) {
  statusMsg.textContent  = message;
  statusMsg.className    = "status-msg " + type;
  setTimeout(() => {
    statusMsg.textContent = "";
    statusMsg.className   = "status-msg";
  }, 3000);
}

/** ── 이벤트 바인딩 ── */
saveBtn.addEventListener("click", saveKeys);

// Enter 키로도 저장 가능
[openaiInput, anthropicInput].forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveKeys();
  });
});

// 페이지 로드 시 저장된 키 확인
loadSavedKeys();
