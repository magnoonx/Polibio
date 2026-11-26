@echo off
chcp 65001 > nul
title Polibio Sovereign Cluster
echo ========================================================================
echo    Iniciando Polibio: Plataforma Soberana de Documentación, PKI & Ledger
echo ========================================================================
echo.
echo Ejecutando orquestador de microservicios...
echo Abrir en su navegador: http://localhost:8000
echo.
node orchestrator.js
pause

