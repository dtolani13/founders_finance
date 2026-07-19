$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $root "release\Founders Finance.exe"
$guide = Join-Path $root "release\Founders Finance Owner Guide.pdf"
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

  if (Test-Path -LiteralPath $guide) {
    $guideShortcutPath = Join-Path $folder "Founders Finance Owner Guide.lnk"
    $guideShortcut = $shell.CreateShortcut($guideShortcutPath)
    $guideShortcut.TargetPath = $guide
    $guideShortcut.WorkingDirectory = $root
    $guideShortcut.IconLocation = "$launcher,0"
    $guideShortcut.Description = "Open the Founders Finance owner instructions"
    $guideShortcut.Save()
  }
}

Write-Output (Join-Path $desktop "Founders Finance.lnk")
Write-Output (Join-Path $startMenu "Founders Finance.lnk")
if (Test-Path -LiteralPath $guide) {
  Write-Output (Join-Path $desktop "Founders Finance Owner Guide.lnk")
  Write-Output (Join-Path $startMenu "Founders Finance Owner Guide.lnk")
}
