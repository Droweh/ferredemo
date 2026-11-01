@echo off
chcp 65001 >nul
title FerroMax - Configuracion
color 0F
cls
echo.
echo  FERROMAX / CONFIGURACION DE LA DEMO
echo  ---------------------------------
echo.
if not exist "%~dp0scripts\configurar.ps1" (
  echo  No se encontro scripts\configurar.ps1.
  echo  Descomprimi el proyecto completo e intenta de nuevo.
  echo.
  pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\configurar.ps1"
set "FERROMAX_EXIT=%ERRORLEVEL%"
echo.
if not "%FERROMAX_EXIT%"=="0" (
  echo  La configuracion no se completo. Revisa el mensaje anterior.
) else (
  echo  Listo. Podes cerrar esta ventana.
)
echo.
pause
exit /b %FERROMAX_EXIT%
