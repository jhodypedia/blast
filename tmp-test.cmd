@echo off
cd /d "C:\Users\admin\Desktop\project\blast"
call npx vitest run > tmp-check-2.txt 2>&1
echo EXITCODE=%ERRORLEVEL% >> tmp-check-2.txt
