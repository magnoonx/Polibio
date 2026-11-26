@echo off
chcp 65001 > nul
title Polibio Docker Compose
echo ========================================================================
echo    Levantando Contenedores de Polibio con Docker Compose
echo ========================================================================
echo.
docker compose up -d
echo.
echo Cluster desplegado:
echo - Portal Web: http://localhost:8000
echo - PostgreSQL RLS: localhost:15432
echo - Prometheus: http://localhost:9090
echo - Ollama Local: http://localhost:11434
echo.
pause

