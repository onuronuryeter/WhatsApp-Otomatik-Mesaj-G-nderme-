@echo off
setlocal

echo.
echo ============================================
echo WhatsApp Business Bot - Kurulum ve Baslatma
echo ============================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo HATA: Node.js bulunamadi!
  echo Lütfen https://nodejs.org adresinden Node.js indirin.
  pause
  exit /b 1
)
for /f "tokens=*" %%i in ('node --version 2^>nul') do echo Node.js %%i bulundu.

echo.
echo [2/3] Bagimliliklar kontrol ediliyor...
if not exist "%~dp0node_modules" (
  echo Bagimliliklar yukleniyor, lutfen bekleyin...
  call npm install
  if errorlevel 1 (
    echo HATA: npm install basarisiz!
    pause
    exit /b 1
  )
  echo Bagimliliklar yuklendi.
) else (
  echo Bagimliliklar mevcut.
)

echo.
echo [3/3] Uygulama baslatiliyor...
echo.
echo Uygulama kisa sure icinde acilacak...
echo WhatsApp baglanti sayfasindan QR kodu tarayin.
echo.

npm start
if errorlevel 1 (
  echo.
  echo Uygulama kapandi. Hatayi kontrol edin.
  pause
)
exit /b %errorlevel%
