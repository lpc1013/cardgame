@echo off
cd /d "%~dp0"
call node_modules\.bin\vite.cmd dev --port 5173
