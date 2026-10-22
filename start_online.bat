@echo off
chcp 65001 >nul
title 배틀 가위바위보 온라인 서버 및 외부 접속 터널
echo ========================================================
echo 🎮 배틀 가위바위보 서버를 시작하고 외부 접속 주소를 생성합니다...
echo ========================================================
start "배틀 가위바위보 로컬 서버" cmd /k "node "%~dp0server.js""
timeout /t 2 >nul
echo.
echo 🌐 아래에 표시되는 https://xxxx.lhr.life 주소를 스마트폰이나 다른 PC에서 여세요!
echo ========================================================
ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -R 80:localhost:3000 nokey@localhost.run
pause
