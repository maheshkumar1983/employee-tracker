@echo off
setlocal
title Excel Task Tracker - Deployment & Build Script

:menu
cls
echo ========================================================
echo       EXCEL TASK TRACKER - DEPLOYMENT & BUILD SCRIPT
echo ========================================================
echo.
echo Select an option:
echo   [1] Deploy Worker (Backend API)
echo   [2] Deploy Frontend (Cloudflare Pages)
echo   [3] Deploy BOTH Worker and Frontend
echo   [4] Build Flutter Android APK
echo   [5] Exit
echo.
set /p choice="Enter choice [1-5]: "

if "%choice%"=="1" goto deploy_worker
if "%choice%"=="2" goto deploy_frontend
if "%choice%"=="3" goto deploy_both
if "%choice%"=="4" goto build_apk
if "%choice%"=="5" goto end
echo Invalid choice. Please try again.
pause
goto menu

:deploy_worker
echo.
echo --------------------------------------------------------
echo Deploying Cloudflare Worker (Backend API)...
echo --------------------------------------------------------
cd /d "%~dp0worker"
call npx wrangler deploy
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Worker deployment failed!
    cd /d "%~dp0"
    pause
    goto menu
)
cd /d "%~dp0"
echo.
echo [SUCCESS] Worker deployed successfully!
pause
goto menu

:deploy_frontend
echo.
echo --------------------------------------------------------
echo Deploying Frontend (Cloudflare Pages)...
echo --------------------------------------------------------
cd /d "%~dp0"
call npx wrangler pages deploy ./public --project-name=employee-tracker
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Frontend deployment failed!
    pause
    goto menu
)
echo.
echo [SUCCESS] Frontend deployed successfully!
pause
goto menu

:deploy_both
echo.
echo --------------------------------------------------------
echo [1/2] Deploying Cloudflare Worker (Backend API)...
echo --------------------------------------------------------
cd /d "%~dp0worker"
call npx wrangler deploy
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Worker deployment failed!
    cd /d "%~dp0"
    pause
    goto menu
)
cd /d "%~dp0"
echo.
echo --------------------------------------------------------
echo [2/2] Deploying Frontend (Cloudflare Pages)...
echo --------------------------------------------------------
call npx wrangler pages deploy ./public --project-name=employee-tracker
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Frontend deployment failed!
    pause
    goto menu
)
echo.
echo [SUCCESS] Both Worker and Frontend deployed successfully!
pause
goto menu

:build_apk
echo.
echo --------------------------------------------------------
echo Building Flutter Android APK...
echo --------------------------------------------------------
cd /d "%~dp0android_app"
call flutter build apk --release
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Flutter APK build failed!
    cd /d "%~dp0"
    pause
    goto menu
)
cd /d "%~dp0"
echo.
echo [SUCCESS] Android APK built successfully!
echo APK Output: android_app\build\app\outputs\flutter-apk\app-release.apk
pause
goto menu

:end
echo Goodbye!
endlocal
