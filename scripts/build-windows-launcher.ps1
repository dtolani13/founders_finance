$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$compiler = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$source = Join-Path $root "desktop\FoundersFinanceLauncher.cs"
$icon = Join-Path $root "assets\brand\founders-finance\founders-finance.ico"
$outputDirectory = Join-Path $root "release"
$output = Join-Path $outputDirectory "Founders Finance.exe"

if (-not (Test-Path -LiteralPath $compiler)) { throw "The Windows C# compiler was not found." }
if (-not (Test-Path -LiteralPath $icon)) { throw "The Founders Finance application icon was not found." }

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
& $compiler /nologo /target:winexe /optimize+ /platform:anycpu "/win32icon:$icon" "/out:$output" $source
if ($LASTEXITCODE -ne 0) { throw "The Founders Finance Windows launcher build failed." }

Write-Output $output
