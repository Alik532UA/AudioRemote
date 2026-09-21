@echo off
rem Rebuild the desktop app. All human-readable output lives in the Node
rem script: cmd reads its own file in the system codepage and would garble
rem Ukrainian text. See scripts\rebuild-exe.mjs.
cd /d "%~dp0"
node scripts\rebuild-exe.mjs --run
pause
