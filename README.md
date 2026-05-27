# 🎙️ JARVIS

한국어 음성과 텍스트로 브라우저를 제어하는 AI 어시스턴트

> "아이유 좋은날 틀어줘" 한 마디로 유튜브 영상이 자동 재생되는 경험

## ✨ 주요 기능

### 🗣️ 자연스러운 한국어 음성 명령
- OpenAI Whisper로 한국어 음성 인식
- Anthropic Claude (Tool Use)로 의도 파악
- 17개의 실용적인 브라우저 제어 명령 지원

### 🎵 YouTube 자동 재생
- "아이유 좋은날 틀어줘" → 검색부터 재생까지 자동
- YouTube Data API v3로 안정적인 검색

### 🎨 미니멀 모던 UI
- 실시간 음성 파형 시각화
- 처리 단계 표시
- 명령 히스토리

## 🛠️ 기술 스택

- **Frontend**: Vanilla JS, HTML, CSS
- **Framework**: Chrome Extension Manifest V3
- **APIs**:
  - OpenAI Whisper API (음성 인식)
  - Anthropic Claude API (Tool Use, 의도 파악)
  - YouTube Data API v3 (영상 검색)
- **개발 도구**: Claude Code (AI 페어 프로그래밍)

## 📦 지원하는 명령

| 분류 | 명령 예시 |
|---|---|
| 페이지 열기 | "유튜브 열어줘", "구글에서 강아지 검색해줘" |
| 탭 조작 | "새 탭 열어줘", "이 탭 닫아줘", "다음 탭으로" |
| 페이지 제어 | "맨 아래로 내려줘", "새로고침해줘", "뒤로 가줘" |
| 디스플레이 | "확대해줘", "축소해줘" |
| 음악 재생 | "아이유 좋은날 틀어줘", "lo-fi 들려줘" |
| 기타 | "북마크 추가해줘", "음소거" |

## 🚀 설치 방법

### 1. 저장소 클론
\`\`\`bash
git clone https://github.com/본인유저네임/voice-browser.git
cd voice-browser
\`\`\`

### 2. 크롬에 로드
1. `chrome://extensions/` 접속
2. 우측 상단 **개발자 모드** 활성화
3. **압축해제된 확장 프로그램 로드** 클릭
4. `voice-browser` 폴더 선택

### 3. API 키 설정
확장의 옵션 페이지에서 다음 API 키를 입력:
- **OpenAI API Key** ([발급](https://platform.openai.com/api-keys))
- **Anthropic API Key** ([발급](https://console.anthropic.com/))
- **YouTube Data API Key** ([발급](https://console.cloud.google.com/))

## 🏗️ 아키텍처

\`\`\`
사용자 음성
   ↓
[MediaRecorder] 마이크 입력
   ↓
[OpenAI Whisper] 음성 → 텍스트
   ↓
[Claude Tool Use] 텍스트 → 액션 의도
   ↓
[Chrome APIs] 실제 브라우저 조작
\`\`\`

## 📝 개발 일지

이 프로젝트는 Claude Code를 이용한 바이브 코딩으로 개발되었습니다.
전체 개발 과정은 [DEVLOG.md](./DEVLOG.md)에 기록되어 있습니다.

## 🎓 프로젝트 배경

본 프로젝트는 IT 포럼 발표를 위해 제작되었습니다. 
"Claude Code로 크롬 확장을 만들어본 경험"을 주제로 합니다.

## 📄 라이선스

MIT License

