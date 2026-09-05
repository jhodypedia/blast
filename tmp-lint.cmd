@echo off
cd /d "C:\Users\admin\Desktop\project\blast"
call npx eslint > tmp-check-3.txt 2>&1
echo LINT_EXITCODE=%ERRORLEVEL% >> tmp-check-3.txt
