# 음성 제어 브라우저 확장 개발 일지

## 프로젝트 개요
- 시작일: 2026-05-20
- 목표: 한국어 음성 명령으로 브라우저를 조작하는 크롬 확장
- 도구: Claude Code, Anthropic API, OpenAI Whisper API

Day 1 (2026-05-20)
 한 일
 - Claude Code로 프로젝트 초기 구조 생성
 - manifest.json, popup, background, content, options 뼈대 완성
 - 크롬에 확장 로드 성공 (Voice Browser 1.0.0)

 Claude Code가 잘한 것
 - 정확하고 오류 없는 코드를 작성하였고, 정확한 명령어를 정확한 출력값으로 나타냄.

 Claude Code가 실수한 것
 - 특별한 실수 없음

 배운 점
 - 바이브 코딩이 생각보다 매우 단순하며, 코딩을 모르는 사람도 복잡하고 어려운 코딩을 실행할 수 있음에 대해서 알게됨.

Day 2 (2026-05-20)
 한 일
 - MediaRecorder API로 마이크 녹음 구현
 - OpenAI Whisper API 연동 (한국어 모드)
 - 권한 요청 페이지 별도 분리

 Claude Code가 잘한 것
 - 한국어로 표시되어있는 오류 메시지를 자가진단으로 해결하였으며, 마이크 권한의 문제를 잘 해결하였음.

 Claude Code가 실수한 것 / 막힌 점
 - 처음에 popup에서 직접 getUserMedia 호출 → 권한 거부됨 → 별도 페이지로 분리
 - OpenAI API 결제 수단 미등록 상태에서 호출 시도 → "요청 한도 초과" 에러

 배운 점
 - 크롬 확장 popup은 닫히면서 권한 요청이 끊기는 특성이 있음
 - OpenAI API는 결제 수단 등록 후 반영까지 약간의 시간 필요

Day 3 (2026-05-20)
 한 일
 - Claude API (Sonnet 4.5) 연동
 - Tool Use 기능으로 의도 파악 구현
 - 8개 도구 정의 (open_url, search_web, scroll_page 등)
 - "유튜브 열어줘" → {tool: "open_url", url: "https://www.youtube.com"} 성공

 Claude Code가 잘한 것
 - Tool Use API 구조를 정확히 구현
 - system 프롬프트, anthropic-version 헤더 등 디테일 처리
 - 한국어 명령을 자연스럽게 파싱하도록 설계

 Claude Code가 실수한 것 / 막힌 점
 - Anthropic 크레딧이 부족해서 API 호출 실패 (HTTP 400)
  → OpenAI랑 Anthropic은 별개 회사, 결제도 따로 해야 함
  → 코드 문제가 아니라 결제 문제였음
 - 처음엔 결제 화면에서 한국 카드 사용 가능 여부 헷갈림

 배운 점
 - Tool Use는 자유 텍스트 파싱보다 훨씬 안정적
 - Claude가 한국어 명령도 정확히 적절한 도구를 선택함
 - "유튜브 열어줘" 같은 자연스러운 한국어도 잘 처리 (특정 키워드만 매칭하는 게 아님)
 - AI 서비스 만들려면 결제/계정 관리 같은 외적 요소도 신경써야 함

Day 4 (2026-05-20)
 한 일
 - 의도 파악된 액션을 실제로 실행하는 로직 구현
 - 8개 액션 모두 작동: open_url, search_web, scroll_page 등
 - chrome.tabs, chrome.scripting API 활용
 - popup → background → 실행 → 결과 표시 전체 파이프라인 완성

 작동 확인한 명령
 - "유튜브 열어줘" → 실제로 유튜브 열림
 - "구글에서 ___ 검색해줘" → 구글 검색 결과 표시
 - "맨 아래로 내려줘" → 페이지 스크롤
 - "북마크 추가해줘" → 북마크 추가

 Claude Code가 잘한 것
 - 바로 정확하게 코드를 작성함

 막힌 점 / 배운 점
 - 없음

 감상
 - MVP 완성! 본인이 음성으로 브라우저를 조작하는 걸 보는 순간 진짜 신기함

Day 5 (2026-05-20)
 Day 5-A: UI 다듬기 + 새 명령 추가
  한 일
  - 팝업 UI를 미니멀/모던 스타일로 전면 개편 (Apple/Linear 풍)
  - 색상 팔레트 재정의 (보라 강조색 #5856D6, 흰 베이스)
  - 음성 파형 시각화 구현 (AnalyserNode + requestAnimationFrame)
  - 처리 단계 표시 추가 (대기 / 듣는 중 / 분석 중 / 실행 중)
  - 명령 히스토리 기능 (최근 5개, chrome.storage.local에 저장)
  - 명령 예시 회전 표시 (3초마다 페이드 전환)
  - 마이크 버튼 펄스 애니메이션 강화
  새로 추가한 명령 (8개)
  - refresh_page: "새로고침해줘", "이 페이지 다시 불러와줘"
  - next_tab: "다음 탭으로 가줘"
  - previous_tab: "이전 탭으로 가줘"
  - zoom_in: "확대해줘", "키워줘"
  - zoom_out: "축소해줘", "줄여줘"
  - zoom_reset: "줌 원래대로"
  - bookmark_current: "북마크에 추가해줘"
  - mute_tab: "음소거", "소리 꺼"
  Claude Code가 잘한 것
  - CSS 변수로 색상 체계를 깔끔하게 분리
  - AnalyserNode를 활용한 실시간 파형 시각화를 안정적으로 구현
  - 명령 히스토리에 시간 표시 (몇 초 전, 몇 분 전)를 자연스럽게 처리
  Claude Code가 실수한 것 / 막힌 점
  - 처음에 한꺼번에 너무 많은 기능을 요청하면 작업이 분산되고 디테일이 떨어짐
  - Day 5-A와 Day 5-B로 분리한 결정이 옳았음
  - bookmarks 권한을 manifest에 추가하는 걸 깜빡하면 작동 안 함 — 권한 관리의 중요성을 느낌
  배운 점
  - UI 디자인이 사용 경험에 미치는 영향이 매우 큼
  - 큰 변경 작업은 단계별로 분리하는 게 안정적
  - AI에게 작업을 맡길 때도 한 번에 시키는 것보다 명확한 단위로 나누는 것이 결과물 품질을 높임

 Day 5-B: YouTube 자동 재생
  한 일
  - YouTube Data API v3 연동
  - play_youtube 도구 추가
  - 검색어 → 첫 영상 ID → autoplay URL로 자동 이동
  - 영상 제목까지 함께 표시 (재생 중인 영상 확인 가능)
  - 옵션 페이지에 YouTube API 키 입력란 추가
  작동 확인한 명령
  - "아이유 좋은날 틀어줘" → 영상 검색 + 자동 이동 성공
  - "lo-fi music 들려줘" → 음악 영상 재생
  - "유튜브 열어줘"는 기존대로 메인 페이지만 열림 (구분 잘 됨)
  Claude Code가 잘한 것
  - system 프롬프트 업데이트로 "틀어줘" vs "열어줘" 차이를 Claude가 정확히 인식
  - YouTube API 응답 파싱과 에러 처리를 깔끔하게 구현
  - 영상 제목까지 가져와서 UI에 표시하는 디테일
  Claude Code가 실수한 것 / 막힌 점
  - 특별한 실수 없음
  배운 점
  - DOM 의존이 아닌 공식 API를 쓰면 안정성이 압도적으로 높음
  - API 키마다 발급 방식이 다름 (OpenAI/Anthropic은 결제 필요, YouTube는 무료 할당량)
  - 자동 재생은 브라우저 정책상 제약이 있음 (autoplay=1 파라미터를 추가해도 항상 작동하지는 않음)
  - 세 개의 서로 다른 API (Whisper, Claude, YouTube)를 하나의 확장에서 조합하는 경험을 얻음
  감상
  - 단순 음성 명령기에서 발표 가능한 완성품 수준으로 도약
  - 자기 목소리로 노래가 재생되는 순간 진짜 "AI 시대"라는 게 체감됨

Day 6 (2026-05-21)
 한 일
  - 스크린샷 캡처 기능 추가 (capture_screenshot 도구)
  - chrome.tabs.captureVisibleTab API와 chrome.downloads API 연동
  - "스크린샷 찍어줘", "화면 캡처해줘" 등 다양한 표현 지원
  - 학교 로고로 확장 아이콘 교체 (16x16은 H, 48x48과 128x128은 학교 마크)
  - UI 메인 색상을 보라(#5856D6)에서 초록(#10B981, emerald-500)으로 전면 변경
  - 보조 색상 충돌 해결: 성공 상태를 파랑(#007AFF)으로 변경하여 메인 초록과 분리
  - 깃허브 저장소 생성 및 전체 코드 업로드 (younghojang09/voice-browser)
  - .gitignore 설정으로 민감 정보 및 캐시 파일 제외
  - README.md 발표용으로 다듬어 작성
 작동 확인한 명령
  - "스크린샷 찍어줘" → 다운로드 폴더에 PNG 파일 자동 저장
  - "화면 캡처해줘" → 동일하게 작동
 Claude Code가 잘한 것
  - 캡처 기능 한 번에 깔끔하게 구현 (manifest 권한, 도구 정의, 실행 함수, 에러 처리까지)
  - 색상 변경 시 CSS 변수 활용한 일관된 처리
  - chrome:// 페이지 캡처 불가 케이스도 미리 처리해서 친절한 한국어 에러 메시지 표시
 Claude Code가 실수한 것 / 막힌 점
  - 특별한 실수 없음
 배운 점
  - 크롬 확장 아이콘은 16/48/128 세 가지 크기가 필요하며, 작은 크기에서는 단순한 디자인이 유리함
  - 학교 로고처럼 디테일이 많은 이미지는 16x16에서 뭉개지므로 작은 크기용 별도 디자인이 필요할 수 있음
  - 깃에 한 번 추적된 파일은 .gitignore에 나중에 추가해도 자동으로 제외되지 않음 (git rm --cached 필요)
  - Personal Access Token은 비밀번호 대신 깃허브 인증에 사용하며, 발급 후 다시 볼 수 없으므로 즉시 안전한 곳에 저장해야 함
  - API 키는 코드에 절대 하드코딩하지 않고 chrome.storage에 저장해야 함 (깃허브 공개 시 노출 방지)
  감상
  - 단순히 작동하는 프로그램에서 "내 작품"으로 격상되는 느낌
  - 학교 로고와 초록 톤으로 통일하니까 발표용 완성도가 확 올라감
  - 깃허브에 코드를 올리고 나니 "오픈소스 프로젝트"라는 실감이 듦

Day 7 (2026-05-21)
 한 일
  - 백엔드 서버 구축 (Vercel + Node.js Serverless)
  - 사용자 API 키 없이 작동하도록 전환
  - 3개 API 엔드포인트 (transcribe, parse-intent, youtube-search) 구현
  - Supabase 프로젝트 생성, profiles/usage_logs 테이블 설계
  - 익명 인증 기반 사용자 관리
  - 일일 사용량 제한 (50회) 구현
  - 확장에 Supabase 익명 로그인 + 토큰 헤더 통합
  - 401, 429 응답 처리 (토큰 만료, 사용량 초과)
  - Vercel 환경변수로 모든 API 키 안전하게 관리
  - 백엔드 코드 깃허브 별도 저장소로 공개
 작동 확인한 흐름
  - 확장이 익명 토큰 발급 → 백엔드 호출 → Claude API 의도 파악 → 페이지 새로고침
  - 사용량 자동 기록 (Supabase DB)
 Claude Code가 잘한 것
  - Supabase 클라이언트 설정과 인증 미들웨어 깔끔하게 분리
  - 토큰 만료 재시도 로직, 사용량 초과 친절한 메시지 처리
  - 환경변수 누락 시 명확한 에러 메시지로 디버깅 도움
 막힌 점 / 배운 점
  - vercel.json에 runtime 명시하면 최신 Vercel에서는 에러 발생 (자동 인식으로 충분)
  - Supabase가 키 이름을 publishable/secret으로 변경하면서 SDK 문서랑 일부 불일치
  - 익명 로그인은 별도로 활성화해야 함 (Authentication 설정)
  - 백엔드를 별도 폴더로 분리한 결정이 옳았음 - 확장 코드 망가뜨릴 위험 차단
 감상
  - 단순 확장에서 풀스택 서비스로 진화
  - "사용자가 키 발급 안 해도 됨" 이 한 줄이 사용자 경험을 완전히 바꿈
  - 발표할 때 "백엔드도 직접 만들었다"는 한 마디의 무게가 다름
Day 7 후반 (2026-05-21~28)
 추가한 기능
  - 음성 응답 (TTS): 처음엔 브라우저 내장 SpeechSynthesis 사용 → 너무 부자연스러워 OpenAI TTS (nova)로 교체
  - 컨텍스트 기억: 최근 5턴 대화를 chrome.storage에 저장, parse-intent 호출 시 history 함께 전송
  - 멀티 명령: Claude Tool Use의 multi-tool 호출 활용, 3개 이상도 순차 실행
  - 페이지 요약: 현재 페이지 텍스트를 chrome.scripting으로 추출 후 Claude로 요약, 음성으로 들려줌
  - 단축키: Ctrl+Shift+1로 어느 페이지에서나 즉시 녹음 시작 (chrome.action.openPopup + auto_start_recording  플래그)
  - 텍스트 입력: 마이크 대신 키보드로도 명령 가능 (시끄러운 환경 대응)
  - 탭 컨텍스트: lastUsedTabId 추적 → "거기서" 같은 참조 시 새 탭 안 열고 기존 탭 재사용
  - 유튜브 검색/재생 구분: "틀어줘"는 play_youtube, "검색해줘"는 youtube_search로 분리
  - 네이버 검색: naver_search 도구 추가
  - 명령 기록 실시간 갱신 버그 수정
 Claude Code가 잘한 것
  - Tool Use 기반으로 단일/멀티 명령을 일관된 구조로 처리한 설계
  - 인증, 사용량 추적, 에러 처리를 미들웨어 패턴으로 깔끔하게 분리
  - 백엔드 system 프롬프트만 수정해도 새 의도 인식이 가능하게 한 유연한 구조
 Claude Code가 실수한 것 / 막힌 점
  - 처음 멀티 명령 시 컨텍스트 히스토리에 tool_use 블록을 그대로 넣으면 Anthropic API가 tool_result를 요구하는 문제 → assistant 메시지의 tool_use를 텍스트로 sanitize하는 헬퍼로 우회
  - 새 탭이 active: true로 열려서 팝업 포커스가 사라지는 문제 → active: false로 백그라운드 열기
  - macOS 보안 정책으로 Claude Code가 Desktop 폴더 파일을 수정하지 못한 EPERM 에러 → 전체 디스크 접근 권한 부여로 해결
  - 깃허브 push 시 일시적 remote rejection → 재시도로 해결
  - 한 번 git에 추적된 파일은 .gitignore 추가해도 자동 제외 안 됨 → git rm --cached 필요
 배운 점
  - 사용자 경험에서 "응답이 빠른 느낌"이 실제 처리 속도만큼 중요함 (처리 단계 시각화의 가치)
  - 자연스러운 음성 (OpenAI TTS) vs 기계음 (브라우저 내장)의 차이가 제품 완성도에 미치는 영향이 큼
  - Tool Use 패턴은 새 도구 추가가 매우 쉬워서, 기능 확장 시 비용이 거의 없음
  - 백엔드 system 프롬프트가 사실상 "AI의 행동 규약"이라, 코드 변경 없이도 동작을 미세 조정 가능
  - 사용자 경험과 보안은 종종 충돌함 (단축키로 팝업 자동 열기는 사용자 제스처 컨텍스트가 필요하다는 등의 제약)

Day 8 (2026-05-28)
 한 일
  - JARVIS로 리브랜딩 (확장 이름, 팝업 제목, 옵션 페이지, README 등 사용자에게 보이는 모든 텍스트)
  - 내부 코드, 폴더명, 변수명, 백엔드 URL은 유지 (안정성 우선)
  - 깃허브 저장소 이름 변경: voice-browser → jarvis, voice-browser-backend → jarvis-backend
  - 로컬 git remote URL 업데이트
  - 아이콘은 학교 로고 유지 (정체성 보존)
 Claude Code가 잘한 것
  - "화면 표시만 변경, 내부 식별자는 보존" 같은 미묘한 범위 지시를 정확히 따름
  - 한국어 문구를 어색하지 않게 자연스럽게 다듬음
 막힌 점
  - 깃허브 저장소 이름은 대소문자 구분이 없어서 jarvis-backend와 JARVIS-backend가 둘 다 접속됨 (정상 동작)
 감상
  - 단순 음성 명령기에서 시작해 풀스택 AI 어시스턴트 JARVIS까지 도달
  - 한 사람이 며칠 만에 만들 수 있는 시스템의 범위가 AI 도구 등장 이후 얼마나 넓어졌는지 체감
  - "내가 코드를 다 이해하지 못해도 결과물이 작동한다"는 바이브 코딩의 본질을 직접 경험
  - 동시에 AI 협업도 결국 사람의 판단(범위 정하기, 우선순위 결정, 시각적 감각, 문제 진단)이 결정적임을 배움