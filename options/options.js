// options.js — 설정 페이지 스크립트

/** ── DOM 참조 ── */
const ttsEnabledEl          = document.getElementById("ttsEnabled");
const ttsTestBtn            = document.getElementById("ttsTestBtn");
const conversationEnabledEl = document.getElementById("conversationEnabled");
const clearHistoryBtn       = document.getElementById("clearHistoryBtn");

/** ── 저장된 설정 로드 ── */
async function loadSettings() {
  const {
    tts_enabled          = true,
    conversation_enabled = true,
  } = await chrome.storage.local.get(["tts_enabled", "conversation_enabled"]);

  ttsEnabledEl.checked          = tts_enabled;
  conversationEnabledEl.checked = conversation_enabled;

  console.log("[Options] 설정 로드 완료 | tts_enabled:", tts_enabled,
    "| conversation_enabled:", conversation_enabled);
}

/** ── 이벤트 핸들러 ── */

// TTS 토글 변경 → 즉시 저장
ttsEnabledEl.addEventListener("change", async () => {
  await chrome.storage.local.set({ tts_enabled: ttsEnabledEl.checked });
  console.log("[Options] tts_enabled 저장:", ttsEnabledEl.checked);
});

// 음성 테스트 버튼 → background에 GENERATE_SPEECH 요청
ttsTestBtn.addEventListener("click", () => {
  ttsTestBtn.disabled    = true;
  ttsTestBtn.textContent = "생성 중...";

  chrome.runtime.sendMessage(
    { type: "GENERATE_SPEECH", text: "안녕하세요. 음성 테스트입니다." },
    (response) => {
      ttsTestBtn.disabled    = false;
      ttsTestBtn.textContent = "🔊 음성 테스트";

      if (!response?.success) {
        console.error("[Options] TTS 테스트 실패:", response?.error);
        return;
      }

      if (window.currentAudio) window.currentAudio.pause();

      const audio = new Audio("data:audio/mp3;base64," + response.audio);
      audio.volume = 0.9;
      window.currentAudio = audio;
      audio.play().catch((err) => console.warn("[Options] TTS 재생 실패:", err.message));

      console.log("[Options] TTS 테스트 재생 시작");
    }
  );
});

// 컨텍스트 기억 토글 변경 → 즉시 저장
conversationEnabledEl.addEventListener("change", async () => {
  await chrome.storage.local.set({ conversation_enabled: conversationEnabledEl.checked });
  console.log("[Options] conversation_enabled 저장:", conversationEnabledEl.checked);
});

// 대화 기록 지우기 버튼 → background에 CLEAR_HISTORY 요청
clearHistoryBtn.addEventListener("click", () => {
  clearHistoryBtn.disabled    = true;
  clearHistoryBtn.textContent = "삭제 중...";

  chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" }, (response) => {
    clearHistoryBtn.disabled = false;

    if (response?.success) {
      clearHistoryBtn.textContent = "✓ 삭제됨";
      setTimeout(() => { clearHistoryBtn.textContent = "🗑️ 대화 기록 지우기"; }, 1500);
      console.log("[Options] 대화 기록 초기화 완료");
    } else {
      clearHistoryBtn.textContent = "🗑️ 대화 기록 지우기";
      console.error("[Options] 대화 기록 삭제 실패:", response?.error);
    }
  });
});

/** ── 초기화 ── */
loadSettings();
