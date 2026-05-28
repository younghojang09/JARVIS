// offscreen.js — TTS 오디오 재생 전용 offscreen document
// background.js가 생성하며, 팝업이 닫혀도 오디오가 끊기지 않도록 여기서 재생함

let currentAudio = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "PLAY_AUDIO_OFFSCREEN") return;

  // 이미 재생 중인 오디오가 있으면 먼저 정지
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const audio = new Audio("data:audio/mp3;base64," + message.audio);
  audio.volume = 0.9;
  currentAudio = audio;

  audio.play().catch((err) => {
    console.warn("[Offscreen] 재생 실패:", err.message);
  });

  audio.addEventListener("ended", () => {
    currentAudio = null;
    console.log("[Offscreen] 재생 완료");
  });

  console.log("[Offscreen] 재생 시작");
});
