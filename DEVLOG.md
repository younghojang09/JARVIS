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