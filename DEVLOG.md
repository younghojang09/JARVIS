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