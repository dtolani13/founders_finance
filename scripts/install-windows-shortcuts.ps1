$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $root "release\Founders Finance.exe"
if (-not (Test-Path -LiteralPath $launcher)) {
  & (Join-Path $PSScriptRoot "build-windows-launcher.ps1") | Out-Null
}

$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$startMenu = Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs"

foreach ($folder in @($desktop, $startMenu)) {
  $shortcutPath = Join-Path $folder "Founders Finance.lnk"
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $launcher
  $shortcut.WorkingDirectory = $root
  $shortcut.IconLocation = "$launcher,0"
  $shortcut.Description = "Open the local Founders Finance workspace"
  $shortcut.Save()
}

Write-Output (Join-Path $desktop "Founders Finance.lnk")
Write-Output (Join-Path $startMenu "Founders Finance.lnk")
