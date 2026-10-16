@echo off
REM Opens the ReelForge dashboard in your browser. Your episodes live in the "episodes" folder.
cd /d "%~dp0"
node packages\cli\bin\reelforge.js studio %*
if errorlevel 1 pause
