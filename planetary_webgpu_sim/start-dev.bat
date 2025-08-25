@echo off
REM start-dev.bat - inicia el servidor de desarrollo Vite para este proyecto

n:: Cambiar a la unidad y carpeta del proyecto
cd /d "D:\Paginas-WEB-Casa\planetary_webgpu_sim"

necho Iniciando servidor de desarrollo en D:\Paginas-WEB-Casa\planetary_webgpu_sim
echo Ejecutando: npm run dev
echo Presiona Ctrl+C para detener.

n:: Ejecutar el script npm (usa CALL para permitir retornos correctos en batch)
call npm run dev

n:: Mantener la ventana abierta después de que termine (opcional)
pause
