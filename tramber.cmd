@echo off
setlocal
set "ANTHROPIC_AUTH_TOKEN=%ANTHROPIC_AUTH_TOKEN%"
set "ANTHROPIC_BASE_URL=%ANTHROPIC_BASE_URL%"
set "ANTHROPIC_MODEL=%ANTHROPIC_MODEL%"
node "%~dp0packages\client\cli\dist\cli.js" %*
