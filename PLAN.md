# MobaXterm-like SFTP/SSH Client Project Plan

## 1. Project Overview
- **Name**: `NeonTerm` (Simple, File-centric SSH Client)
- **Goal**: Create a lightweight, cross-platform (Windows/macOS) desktop application focusing on **SSH terminal with integrated SFTP file manager**.
- **Tech Stack**:
  - **Framework**: Electron (Cross-platform runtime)
  - **Frontend**: React + TypeScript (UI/UX)
  - **Terminal**: xterm.js (Web-based terminal emulator)
  - **SSH/SFTP**: ssh2 (Node.js SSH client)
  - **Build Tool**: Electron Builder (For .exe and .dmg)

## 2. Directory Structure (`/Volumes/SSD/DEV_SSD/MY/NeonTerm`)
```
NeonTerm/
├── package.json          # Dependencies & Scripts
├── electron/             # Electron Main Process
│   ├── main.ts           # Window creation & IPC handling
│   └── preload.ts        # Bridge between Renderer and Main
├── src/                  # React Renderer Process
│   ├── App.tsx           # Main Layout
│   ├── components/
│   │   ├── Terminal.tsx  # xterm.js wrapper
│   │   ├── FileManager.tsx # SFTP File Explorer (Drag & Drop)
│   │   └── LoginModal.tsx # Host/User/Pass input
│   └── services/
│       └── sshService.ts # SSH connection logic
├── public/               # Static assets
└── dist/                 # Build output
```

## 3. Key Features (MVP)
1.  **Split View**: Left side Terminal, Right side File Manager (Resizable).
2.  **SSH Connection**: Host, Port, Username, Password/Key auth.
3.  **SFTP Integration**:
    -   Auto-navigate to current terminal directory (Sync).
    -   Upload (Drag & Drop from OS to App).
    -   Download (Right-click or Drag to Desktop).
4.  **Cross-Platform Build**: Scripts to package for Windows (.exe) and macOS (.dmg).

## 4. Implementation Steps
1.  **Initialize Project**: Setup Electron + React + Vite.
2.  **Core SSH/SFTP Logic**: Implement `ssh2` based connection manager in Electron Main process.
3.  **UI Development**:
    -   Terminal pane using `xterm.js`.
    -   File Tree/List view for SFTP.
4.  **Integration**: Link Terminal commands (`cd`) to File Manager view updates.
5.  **Packaging**: Configure `electron-builder`.

## 5. Next Action
I will initialize this project structure in `/Volumes/SSD/DEV_SSD/MY/NeonTerm`.
