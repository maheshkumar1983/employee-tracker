@echo off
setlocal EnableDelayedExpansion
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
echo   [4] Update Employees List in Worker (Upload employees.json)
echo   [5] Build Lightweight Android APKs (Fast & Small for Mobile)
echo   [6] Build Universal Android APK (All-in-One)
echo   [7] Push Changes to GitHub Repository
echo   [8] Exit
echo.
set /p choice="Enter choice [1-8]: "

if "%choice%"=="1" goto deploy_worker
if "%choice%"=="2" goto deploy_frontend
if "%choice%"=="3" goto deploy_both
if "%choice%"=="4" goto update_employees
if "%choice%"=="5" goto build_split_apk
if "%choice%"=="6" goto build_universal_apk
if "%choice%"=="7" goto git_push
if "%choice%"=="8" goto end
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

:update_employees
echo.
echo --------------------------------------------------------
echo Uploading employees.json to Cloudflare Worker Secret...
echo --------------------------------------------------------
if not exist "%~dp0employees.json" (
    echo.
    echo [ERROR] employees.json file not found at %~dp0employees.json
    pause
    goto menu
)
cd /d "%~dp0worker"
type "%~dp0employees.json" | call npx wrangler secret put EMPLOYEES_JSON
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to update EMPLOYEES_JSON secret!
    cd /d "%~dp0"
    pause
    goto menu
)
cd /d "%~dp0"
echo.
echo [SUCCESS] Employees list updated in Cloudflare Worker!
pause
goto menu

:build_split_apk
echo.
echo --------------------------------------------------------
echo Building Lightweight Split Android APKs (--split-per-abi)...
echo --------------------------------------------------------
cd /d "%~dp0android_app"
call flutter build apk --release --split-per-abi
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Flutter APK build failed!
    cd /d "%~dp0"
    pause
    goto menu
)
cd /d "%~dp0"
echo.
echo [SUCCESS] Lightweight Android APKs built successfully!
echo.
echo Recommended for modern smartphones (64-bit ARM):
echo   android_app\build\app\outputs\flutter-apk\app-arm64-v8a-release.apk
echo.
echo For older 32-bit devices:
echo   android_app\build\app\outputs\flutter-apk\app-armeabi-v7a-release.apk
echo.
pause
goto menu

:build_universal_apk
echo.
echo --------------------------------------------------------
echo Building Universal Android APK (All-in-One)...
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
echo [SUCCESS] Universal Android APK built successfully!
echo APK Output: android_app\build\app\outputs\flutter-apk\app-release.apk
pause
goto menu

:git_push
echo.
echo --------------------------------------------------------
echo Pushing All Changes to GitHub...
echo --------------------------------------------------------
cd /d "%~dp0"
set /p commit_msg="Enter commit message (or press ENTER for default): "
if "!commit_msg!"=="" set commit_msg=Update project and employees
call git add .
call git commit -m "!commit_msg!"
call git push origin main
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Git push failed!
    pause
    goto menu
)
echo.
echo [SUCCESS] Changes pushed to GitHub successfully!
pause
goto menu

:end
echo Goodbye!
endlocal
