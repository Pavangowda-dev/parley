<#
  Creates "Parley" shortcuts (Desktop + Start menu) that launch the buddy without a console.
  Usage:  powershell -ExecutionPolicy Bypass -File scripts\install-shortcut.ps1
#>
$root = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $root "node_modules\electron\dist\electron.exe"
if (-not (Test-Path $electron)) { Write-Error "Run 'npm install' first."; exit 1 }
$icon = Join-Path $root "assets\icon.ico"

$shell = New-Object -ComObject WScript.Shell
# remove shortcuts from the old name, if any
foreach ($dir in @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("Programs"))) {
  $old = Join-Path $dir "Talk to Me.lnk"; if (Test-Path $old) { Remove-Item $old -Force }
}
foreach ($dir in @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("Programs"))) {
  $lnk = $shell.CreateShortcut((Join-Path $dir "Parley.lnk"))
  $lnk.TargetPath = $electron
  $lnk.Arguments = "`"$root`""
  $lnk.WorkingDirectory = $root
  if (Test-Path $icon) { $lnk.IconLocation = $icon }
  $lnk.Description = "Parley - your English speaking buddy"
  $lnk.Save()
  Write-Host "Created $dir\Parley.lnk"
}
Write-Host "Done. The app also starts with Windows automatically (toggle in Settings)."
