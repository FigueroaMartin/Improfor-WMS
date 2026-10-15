@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
node node_modules\next\dist\bin\next dev
