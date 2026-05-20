// content.js — 콘텐츠 스크립트
// 역할: 웹 페이지 내 DOM을 직접 조작 (스크롤 등)
//       background.js로부터 메시지를 받아 페이지 조작 함수 실행

/** ── 메시지 수신 ── */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {

    case "SCROLL":
      handleScroll(message.direction);
      sendResponse({ ok: true });
      break;

    case "PING":
      // content script가 로드되었는지 background에서 확인할 때 사용
      sendResponse({ ok: true });
      break;

    default:
      sendResponse({ error: `알 수 없는 메시지 타입: ${message.type}` });
  }

  return true;
});

/** ── 스크롤 ── */

/**
 * 페이지를 맨 위 또는 맨 아래로 부드럽게 스크롤
 * @param {"top" | "bottom"} direction
 */
function handleScroll(direction) {
  const target = direction === "top" ? 0 : document.body.scrollHeight;
  window.scrollTo({ top: target, behavior: "smooth" });
}

/** ── 추후 확장 예정 함수 (뼈대) ── */

/**
 * 페이지에서 특정 텍스트를 포함하는 링크를 클릭
 * @param {string} linkText
 */
// function clickLink(linkText) { ... }

/**
 * 특정 입력 필드에 텍스트 입력
 * @param {string} selector
 * @param {string} value
 */
// function fillInput(selector, value) { ... }
