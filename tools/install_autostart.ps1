# ヘルパーを PC 起動時に自動で立ち上げる設定
$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$startup = [Environment]::GetFolderPath('Startup')
$lnk     = Join-Path $startup 'utamita05-helper.lnk'
$target  = Join-Path $here 'start_helper_hidden.vbs'

if (-not (Test-Path $target)) {
  Write-Host "[ERROR] start_helper_hidden.vbs が見つかりません" -ForegroundColor Red
  exit 1
}

$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath       = 'wscript.exe'
$s.Arguments        = '"' + $target + '"'
$s.WorkingDirectory = $here
$s.Description      = 'utamita05 local helper'
$s.Save()

if (Test-Path $lnk) {
  Write-Host "[OK] 登録しました。次回 PC 起動時から自動で立ち上がります。" -ForegroundColor Green
} else {
  Write-Host "[ERROR] 登録に失敗しました。" -ForegroundColor Red
  exit 1
}

# すでに動いていなければ今すぐ起動
$running = Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
           Where-Object { $_.CommandLine -like '*helper_server*' }
if ($running) {
  Write-Host "ヘルパーは既に動いています。"
} else {
  Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + $target + '"')
  Write-Host "今すぐ起動しました（ウィンドウは出ません）。"
}
