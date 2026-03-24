#!/usr/bin/env pwsh
$env:ANTHROPIC_AUTH_TOKEN = $env:ANTHROPIC_AUTH_TOKEN
$env:ANTHROPIC_BASE_URL = $env:ANTHROPIC_BASE_URL
$env:ANTHROPIC_MODEL = $env:ANTHROPIC_MODEL
& node "$PSScriptRoot\packages\client\cli\dist\cli.js" $args
