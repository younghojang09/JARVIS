# Voice Browser

한국어 음성 명령으로 Chrome 브라우저를 제어하는 Manifest V3 확장 프로그램.

## 파이프라인

```
마이크 입력 → OpenAI Whisper API (STT) → Anthropic Claude API (의도 파악) → 액션 실행
```

## 지원 명령 (1단계)

| 음성 명령 | 동작 |
|-----------|------|
| "유튜브 열어줘" | 새 탭에서 youtube.com 열기 |
| "구글에서 [검색어] 검색해줘" | Google 검색 |
| "새 탭 열어줘" | 빈 탭 열기 |
| "이 탭 닫아줘" | 현재 탭 닫기 |
| "맨 아래로 내려줘" | 페이지 맨 아래로 스크롤 |
| "맨 위로 올려줘" | 페이지 맨 위로 스크롤 |

## 프로젝트 구조

```
voice-browser/
├── manifest.json          # Manifest V3 설정, 권한 정의
├── icons/                 # 확장 프로그램 아이콘
├── popup/
│   ├── popup.html         # 툴바 클릭 시 열리는 팝업 UI
│   ├── popup.js           # 마이크 녹음 → background 메시지 전송
│   └── popup.css          # 팝업 스타일
├── background/
│   └── background.js      # 서비스 워커: API 호출 + 액션 실행
├── content/
│   └── content.js         # 페이지 내 DOM 조작 (스크롤 등)
└── options/
    ├── options.html        # API 키 설정 페이지
    └── options.js
```

## 설치 방법

1. Chrome에서 `chrome://extensions` 접속
2. 오른쪽 상단 **개발자 모드** 활성화
3. **압축 해제된 확장 프로그램 로드** 클릭
4. 이 폴더(`voice-browser/`) 선택
5. 툴바의 확장 프로그램 아이콘 클릭 → ⚙️ 설정에서 API 키 입력

## 필요한 API 키

- **OpenAI API 키**: [platform.openai.com](https://platform.openai.com) — Whisper STT 사용
- **Anthropic API 키**: [console.anthropic.com](https://console.anthropic.com) — Claude 의도 파악 사용

> API 키는 `chrome.storage.local`에만 저장되며 코드에 하드코딩되지 않습니다.

## 개발 단계

- [x] **1단계**: 프로젝트 구조 및 UI 뼈대
- [ ] **2단계**: Whisper + Claude API 실제 연동
- [ ] **3단계**: 명령 범위 확장, 에러 처리 강화

## 필요 권한

| 권한 | 용도 |
|------|------|
| `tabs` | 탭 열기/닫기 |
| `scripting` | content script 주입 |
| `storage` | API 키 저장 |
| `activeTab` | 현재 탭 접근 |
| `<all_urls>` | 모든 페이지에 content script 적용 |
