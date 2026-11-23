@echo off
setlocal

set "ROOT=%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Install Node.js and add npm to PATH.
  exit /b 1
)

if not exist "%ROOT%server\node_modules" (
  echo Server dependencies are missing. Run npm install in the server folder first.
  exit /b 1
)

if not exist "%ROOT%client\node_modules" (
  echo Client dependencies are missing. Run npm install in the client folder first.
  exit /b 1
)

echo Starting NexusFlow. MongoDB must be running for telemetry ingestion.
start "NexusFlow Server" /D "%ROOT%server" cmd /k "npm start"
start "NexusFlow Client" /D "%ROOT%client" cmd /k "npm run dev"
start "NexusFlow Simulator" /D "%ROOT%simulator" cmd /k "npm start"

endlocal
