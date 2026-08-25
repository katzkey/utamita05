# 自動起動の解除とヘルパーの停止
$startup = [Environment]::GetFolderPath('Startup')
$lnk     = Join-Path $startup 'utamita05-helper.lnk'

if (Test-Path $lnk) {
  Remove-Item $lnk -Force
  Write-Host "[OK] 自動起動を解除しました。" -ForegroundColor Green
} else {
  Write-Host "自動起動は登録されていません。"
}

$running = Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
           Where-Object { $_.CommandLine -like '*helper_server*' }
if ($running) {
  $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Write-Host "起動中のヘルパーも停止しました。"
}
