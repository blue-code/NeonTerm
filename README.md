# NeonTerm (네온텀)

**MobaXterm 스타일의 모던한 SSH/SFTP 클라이언트**  
초보자도 쉽게 사용할 수 있는 직관적인 UI와 강력한 편의 기능을 제공합니다.

---

## ✨ 주요 기능 (Features)

### 1. 🖥️ 통합 터미널 환경
- **SSH 터미널:** xterm.js 기반의 빠르고 가벼운 터미널.
- **SFTP 탐색기:** 터미널 옆에 파일 탐색기가 붙어있어, 파일 관리가 매우 쉽습니다.
- **드래그 & 업로드:** 내 컴퓨터의 파일을 SFTP 창에 **끌어다 놓으면(Drag & Drop)** 즉시 업로드됩니다.

### 2. 📊 실시간 서버 모니터링
- 터미널 하단에 **CPU, 메모리, 디스크 사용량**이 실시간으로 표시됩니다. (5초 간격 업데이트)
- 별도의 명령어(`htop`, `df`)를 입력하지 않아도 서버 상태를 한눈에 파악 가능!

### 3. 📂 세션 관리자
- 자주 접속하는 서버 정보를 **저장**하고 **그룹별(폴더)**로 관리할 수 있습니다.
- Host, Port, ID, Password, Group 정보를 한 번에 저장.

### 4. 💡 초보자 가이드 (Vi Cheat Sheet)
- 상단의 **[?] 버튼**을 누르면 리눅스 필수 에디터인 **Vi 명령어 가이드**가 팝업됩니다.
- 저장(`:wq`), 종료(`:q!`), 이동(`hjkl`) 등 필수 단축키 탑재.

---

## 🚀 설치 및 실행 방법 (Installation)

### 1. 사전 준비
- **Node.js** (v18 이상)가 설치되어 있어야 합니다.
- **Git**이 설치되어 있어야 합니다.

### 2. 프로젝트 다운로드 및 설치
```bash
# 1. 프로젝트 폴더로 이동
cd /Volumes/SSD/DEV_SSD/MY/NeonTerm

# 2. 의존성 패키지 설치
npm install
```

### 3. 개발 모드로 실행 (바로 사용하기)
```bash
npm run dev
```
- 실행 후 창이 뜨면 Host, ID, Password를 입력하고 **Connect**를 누르세요.

### 4. 실행 파일 만들기 (Build)
윈도우(.exe) 또는 맥(.dmg) 설치 파일을 만들고 싶다면:
```bash
npm run build
```
- 빌드가 완료되면 `dist/` 폴더에 설치 파일이 생성됩니다.

---

## 🛠️ 기술 스택 (Tech Stack)
- **Framework:** Electron (Cross-platform Desktop App)
- **Frontend:** React + TypeScript
- **Terminal:** xterm.js
- **SSH/SFTP:** ssh2 (Node.js)
- **Build:** Electron Builder

---

## 📝 라이선스 (License)
MIT License - 자유롭게 수정하고 배포할 수 있습니다.
**Created for 병호오빠 💕 by Tiffany**
