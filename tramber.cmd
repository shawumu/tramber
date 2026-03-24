@echo off
setlocal
REM 设置环境变量
set "ANTHROPIC_AUTH_TOKEN=%ANTHROPIC_AUTH_TOKEN%"
set "ANTHROPIC_BASE_URL=%ANTHROPIC_BASE_URL%"
set "ANTHROPIC_MODEL=%ANTHROPIC_MODEL%"
REM 设置NODE_PATH以解析workspace依赖
set "NODE_PATH=%~dp0node_modules;%~dp0packages\node_modules"
REM 执行CLI
node "%~dp0packages\client\cli\dist\cli.js" %*
