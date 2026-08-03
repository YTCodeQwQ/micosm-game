@echo off
chcp 65001 >nul
title Micosm Server Launcher
echo ==============================================
echo   Micosm Game - one-click launcher
echo   Site: https://game.micosm.fun
echo ==============================================
echo.

echo [0/4] Stopping old processes on ports 3000/3210/3211...
for %%P in (3000 3210 3211) do (
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do (
    taskkill /F /PID %%p >nul 2>&1
  )
)
taskkill /F /IM cloudflared.exe >nul 2>&1
timeout /t 3 /nobreak >nul
echo.

cd /d "E:\project\mi game"

echo [1/4] Starting web app (port 3000)...
start "Micosm App" cmd /k "set NO_PROXY=127.0.0.1,localhost,::1&& npm run dev"

echo [2/4] Starting KataGo Go AI (port 3210)...
start "KataGo AI" cmd /k "npm run ai"

echo [3/4] Starting Rapfi Gomoku AI (port 3211)...
start "Rapfi AI" cmd /k "npm run ai:gomoku"

echo [4/4] Starting Cloudflare Tunnel...
start "Cloudflare Tunnel" cmd /k "cd /d C:\Users\26857\.cloudflared&& set HTTP_PROXY=&& set HTTPS_PROXY=&& cloudflared.exe tunnel run micosm"

echo.
echo All 4 processes launched. Waiting 25s for startup...
timeout /t 25 /nobreak >nul

echo.
echo Checking health...
setlocal enabledelayedexpansion
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do set APP_PID=%%p
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3210 ^| findstr LISTENING') do set KATA_PID=%%p
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3211 ^| findstr LISTENING') do set RAPFI_PID=%%p
if defined APP_PID (echo   [OK] App running on :3000) else (echo   [!!] App NOT running)
if defined KATA_PID (echo   [OK] KataGo running on :3210) else (echo   [!!] KataGo NOT running)
if defined RAPFI_PID (echo   [OK] Rapfi running on :3211) else (echo   [!!] Rapfi NOT running)
echo.
echo Done. Open https://game.micosm.fun
pause
