@echo off
cd /d "C:\Users\admin\Desktop\project\blast"
call npx tsc --noEmit > tmp-check-1.txt 2>&1
echo EXITCODE=%ERRORLEVEL% >> tmp-check-1.txt
