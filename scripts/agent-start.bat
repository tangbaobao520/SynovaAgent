@echo off
REM agent-start.bat -- SynovaAgent Windows 3-step startup (D229)
REM Equivalent to agent-start.sh for Linux/Mac. Zero bash dependency.
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."

echo ========================================
echo   SynovaAgent Windows Starting...
echo ========================================
echo.

REM ===== Step 0: Control Tower Signal Init (D230) =====
echo [0/4] Control tower signal init...
if exist "%ROOT%\scripts\control-tower\emit-signal.py" (
    python "%ROOT%\scripts\control-tower\emit-signal.py" gatekeeper green "startup_check"
    python "%ROOT%\scripts\control-tower\emit-signal.py" context-injector yellow "pending_first_injection"
    python "%ROOT%\scripts\control-tower\emit-signal.py" contract-archiver yellow "pending_first_extract"
    python "%ROOT%\scripts\control-tower\emit-signal.py" write-lock green "lock_service_ready"
    python "%ROOT%\scripts\control-tower\emit-signal.py" env-validator green "env_snapshot_available"
    echo   [OK] Control tower signals initialized
) else (
    echo   [SKIP] emit-signal.py not found
)
echo.

REM ===== Step 1: Environment Validation =====
echo [1/4] Environment validation...

if not exist "%ROOT%\scripts\control-tower\env_validator.py" (
    echo   [WARN] env_validator.py not found -- skipping (degraded)
) else (
    python "%ROOT%\scripts\control-tower\env_validator.py" validate
    if !ERRORLEVEL! NEQ 0 (
        if !ERRORLEVEL! EQU 2 (
            echo   [WARN] Validation has degraded items -- continuing
        ) else (
            echo   [FAIL] Environment validation failed -- run: python scripts/control-tower/env_validator.py snapshot
            exit /b 1
        )
    ) else (
        echo   [PASS] Environment validation passed
    )
)
echo.

REM ===== Step 2: Contract Gate =====
echo [2/4] Contract gate...

if not exist "%ROOT%\scripts\run-contract-gate.ts" (
    echo   [SKIP] run-contract-gate.ts not found -- skipping (degraded)
) else (
    dir "%ROOT%\.codex\contracts\*.json" >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
        npx tsx "%ROOT%\scripts\run-contract-gate.ts"
        if !ERRORLEVEL! NEQ 0 (
            echo   [FAIL] Contract gate failed -- Agent startup rejected
            exit /b 1
        )
        echo   [PASS] Contract gate passed
    ) else (
        echo   [SKIP] No pending contracts
    )
)
echo.

REM ===== Step 3: Write Lock Init =====
echo [3/4] Write lock init...

if not exist "%ROOT%\.write-locks" (
    mkdir "%ROOT%\.write-locks"
)
echo   [OK] .write-locks ready
echo.

REM ===== Final: Agent Start =====
echo ========================================
echo   4 steps complete, entering main loop...
echo ========================================
echo.

cd /d "%ROOT%"
npx tsx src/index.ts

exit /b %ERRORLEVEL%
