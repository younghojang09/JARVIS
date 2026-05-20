// permission.js — 마이크 권한 요청 전용 페이지
// 역할: 팝업이 아닌 풀페이지 탭에서 getUserMedia를 호출해 권한 다이얼로그를 안정적으로 표시
//       팝업 컨텍스트에서는 권한 다이얼로그 표시 중 팝업이 닫혀 요청이 끊기는 문제가 있음

const sectionRequesting = document.getElementById("sectionRequesting");
const sectionGranted    = document.getElementById("sectionGranted");
const sectionDenied     = document.getElementById("sectionDenied");

/** 지정된 섹션만 표시하고 나머지 숨김 */
function showSection(id) {
  [sectionRequesting, sectionGranted, sectionDenied].forEach((el) => {
    el.classList.add("hidden");
  });
  document.getElementById(id).classList.remove("hidden");
}

/** 마이크 권한 요청 실행 */
async function requestMicPermission() {
  console.log("[Permission] getUserMedia 호출 시작");
  showSection("sectionRequesting");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // 권한 확인용이므로 스트림을 즉시 해제 (실제 녹음은 팝업에서 수행)
    stream.getTracks().forEach((track) => track.stop());

    console.log("[Permission] 권한 허용됨");
    showSection("sectionGranted");
  } catch (err) {
    console.error("[Permission] 권한 오류:", err.name, err.message);

    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      // 마이크 자체가 없는 경우 — denied 화면의 안내 문구를 동적으로 교체
      document.querySelector("#sectionDenied .desc").innerHTML =
        "마이크 장치를 찾을 수 없습니다.<br />마이크가 연결되어 있는지 확인해주세요.";
      document.getElementById("btnRetry").style.display = "none";
    }

    showSection("sectionDenied");
  }
}

/** ── 이벤트 바인딩 ── */

// 성공 화면 — 탭 닫기
document.getElementById("btnClose").addEventListener("click", () => window.close());

// 실패 화면 — 다시 시도
document.getElementById("btnRetry").addEventListener("click", () => {
  requestMicPermission();
});

// 실패 화면 — 닫기
document.getElementById("btnClose2").addEventListener("click", () => window.close());

// 페이지 로드 즉시 권한 요청
requestMicPermission();
