param(
    [Parameter()][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version = "0.1.0",
    [Parameter()][ValidateSet('offlineInstaller', 'embedBootstrapper', 'downloadBootstrapper')][string]$WebView2Mode = "offlineInstaller",
    [Parameter()][switch]$SkipNpmInstall,
    [Parameter()][switch]$SkipEnvironmentCheck,
    [Parameter()][string]$StagingRoot = "C:\Users\Public\TileScopeAOI-desktop-build"
)

$ErrorActionPreference = "Stop"

# Build scripts live in packaging\scripts; the repository root is two levels up.
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$SpecRoot = Join-Path $RepoRoot "packaging\specs"
$DesktopRoot = Join-Path $RepoRoot "desktop"
. (Join-Path $PSScriptRoot "pyinstaller_path_guard.ps1")
. (Join-Path $PSScriptRoot "pyinstaller_build.ps1")

$started = Get-Date

$python = Join-Path $RepoRoot "env\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Virtual environment python not found: $python"
}

$spec = Join-Path $SpecRoot "aoi-sidecar.spec"
if (-not (Test-Path -LiteralPath $spec -PathType Leaf)) {
    throw "PyInstaller spec not found: $spec"
}

# Rust 1.99 lives under $HOME\.cargo\bin and is not always on PATH.
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    $cargoBin = Join-Path $HOME ".cargo\bin"
    if (Test-Path -LiteralPath (Join-Path $cargoBin "cargo.exe") -PathType Leaf) {
        $env:PATH = "$cargoBin;$env:PATH"
    } else {
        throw "cargo not found on PATH and not under $cargoBin"
    }
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm not found on PATH"
}

# A path containing any non-ASCII character breaks vite build (rollup segfaults) and subst/junction
# workarounds do not help because vite resolves the real path, so the desktop build is staged under
# an ASCII directory whenever the repository root is not pure ASCII.
function Test-IsPureAscii {
    param([string]$Text)
    foreach ($ch in $Text.ToCharArray()) {
        if ([int][char]$ch -gt 127) { return $false }
    }
    return $true
}

# robocopy exits with 0-7 on success; only 8 and above are failures.
function Invoke-Robocopy {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [string[]]$ExcludeDirs = @()
    )
    $arguments = @($Source, $Destination, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP", "/R:1", "/W:1")
    foreach ($dir in $ExcludeDirs) { $arguments += @("/XD", $dir) }
    & robocopy @arguments | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy failed with exit code $LASTEXITCODE"
    }
}

$distSidecar = Join-Path $RepoRoot "dist\aoi-sidecar"

Push-Location -LiteralPath $RepoRoot
try {
    # (a) dependency licenses, build provenance, then the frozen sidecar itself.
    & $python (Join-Path $RepoRoot "tools\collect_dependency_licenses.py") --output (Join-Path $RepoRoot "build\dependency_licenses")
    if ($LASTEXITCODE -ne 0) { throw "Dependency license collection failed" }
    $commit = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw "Unable to resolve build commit" }
    $dirty = [bool](& git status --porcelain --untracked-files=no)
    @{ commit = $commit; dirty = $dirty } |
        ConvertTo-Json |
        Set-Content -LiteralPath (Join-Path $RepoRoot "build_provenance.json") -Encoding utf8

    # The local build env runs Python 3.13 while requirements.lock.txt targets 3.12, so the strict
    # environment check is skipped; the frozen artifact is still smoke-tested immediately below.
    $buildArguments = @{
        PythonPath = $python
        SpecPath = $spec
        VersionInfoPath = (Join-Path $RepoRoot "build\version_info\aoi-sidecar.txt")
        ProductName = "TileScope AOI Sidecar"
        ExecutableName = "aoi-sidecar.exe"
        Version = $Version
        SkipEnvironmentCheck = [bool]$SkipEnvironmentCheck
    }
    if ($SkipEnvironmentCheck) {
        Write-Warning "Skipping the requirements.lock.txt environment check; the frozen sidecar is still smoke-tested."
    }
    Invoke-PyInstallerBuild @buildArguments
} finally {
    Remove-Item -LiteralPath (Join-Path $RepoRoot "build_provenance.json") -Force -ErrorAction SilentlyContinue
    Pop-Location
}

$sidecarExe = Join-Path $distSidecar "aoi-sidecar.exe"
if (-not (Test-Path -LiteralPath $sidecarExe -PathType Leaf)) {
    throw "Frozen sidecar not found: $sidecarExe"
}

# (b) run the frozen sidecar smoke test; any non-zero exit fails the build.
& $sidecarExe --smoke-test
if ($LASTEXITCODE -ne 0) { throw "Frozen sidecar smoke test failed with exit code $LASTEXITCODE" }

# The frozen onedir must contain no Qt runtime outside the license evidence collected in step (a);
# the licenses folder legitimately names PySide6/shiboken6 in its license-text directories.
$qtArtifacts = Get-ChildItem -LiteralPath $distSidecar -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Name -match '^(PySide6|shiboken6|PyQt5|PyQt6|Qt6|Qt5|QtCore|QtGui|QtWidgets)' -and
        $_.FullName -notlike '*\licenses\*'
    }
if ($qtArtifacts) {
    $names = ($qtArtifacts | Select-Object -First 10 -ExpandProperty FullName) -join '; '
    throw "Frozen sidecar contains Qt artifacts: $names"
}

# (c) on-site reference sheets beside the sidecar (same map as build_exe.ps1).
$siteDocs = @{
    "docs\packaging\DEVICE_PARAMETER_GUIDE.md" = "DEVICE_PARAMETER_GUIDE.md"
    "docs\device-error-codes.md" = "ERROR_CODES.md"
    "docs\source-provenance.md" = "SOURCE_PROVENANCE.md"
    "THIRD_PARTY_NOTICES.md" = "THIRD_PARTY_NOTICES.md"
    "distribution-policy.json" = "distribution-policy.json"
    "LICENSE" = "LICENSE"
}
foreach ($source in $siteDocs.Keys) {
    $sourcePath = Join-Path $RepoRoot $source
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "On-site document not found: $sourcePath"
    }
    Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $distSidecar $siteDocs[$source]) -Force
}

# (e0) stage the desktop build under an ASCII path when the repository root is not pure ASCII.
$useStaging = -not (Test-IsPureAscii $RepoRoot)
if ($useStaging) {
    Write-Host "Repository path is not pure ASCII; staging desktop build under $StagingRoot"
    $desktopBuildRoot = $StagingRoot
    Invoke-Robocopy -Source $DesktopRoot -Destination $desktopBuildRoot `
        -ExcludeDirs @("node_modules", "dist", "target", "gen")
} else {
    $desktopBuildRoot = $DesktopRoot
}

# (d) mirror the frozen sidecar onedir into the desktop sidecar directory.
$sidecarMirror = Join-Path $desktopBuildRoot "src-tauri\sidecar"
if (Test-Path -LiteralPath $sidecarMirror) {
    Get-ChildItem -LiteralPath $sidecarMirror -Force -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
} else {
    New-Item -ItemType Directory -Force -Path $sidecarMirror | Out-Null
}
if (-not $useStaging) {
    # Keep the tracked .gitkeep when building in place.
    New-Item -ItemType File -Force -Path (Join-Path $sidecarMirror ".gitkeep") | Out-Null
}
Invoke-Robocopy -Source $distSidecar -Destination $sidecarMirror

# (e) install dependencies, override version + WebView2 mode, and build the installer.
Push-Location -LiteralPath $desktopBuildRoot
try {
    if (-not $SkipNpmInstall) {
        Write-Host "Installing desktop dependencies (npm ci)..."
        & npm ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
    }
    $configOverride = Join-Path $RepoRoot "build\tauri-config-override.json"
    $configJson = @{
        version = $Version
        bundle = @{ windows = @{ webviewInstallMode = @{ type = $WebView2Mode } } }
    } | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($configOverride, $configJson)
    Write-Host "Building desktop installer (npx tauri build)..."
    & npx tauri build --config $configOverride
    if ($LASTEXITCODE -ne 0) { throw "tauri build failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

# (f) copy the NSIS installer to dist\desktop.
$nsisDir = Join-Path $desktopBuildRoot "src-tauri\target\release\bundle\nsis"
if (-not (Test-Path -LiteralPath $nsisDir -PathType Container)) {
    throw "NSIS bundle directory not found: $nsisDir"
}
$setup = Get-ChildItem -LiteralPath $nsisDir -Filter "*setup.exe" -File | Select-Object -First 1
if (-not $setup) {
    throw "NSIS installer not found under $nsisDir"
}
$distDesktop = Join-Path $RepoRoot "dist\desktop"
New-Item -ItemType Directory -Force -Path $distDesktop | Out-Null
$installerName = "TileScope-AOI-$Version-setup.exe"
$installerPath = Join-Path $distDesktop $installerName
Copy-Item -LiteralPath $setup.FullName -Destination $installerPath -Force
$installerSize = (Get-Item -LiteralPath $installerPath).Length

# (g) frozen JSON-RPC smoke over stdio: hello, runtime_status, shutdown.
function Read-SidecarLine {
    param([Parameter(Mandatory = $true)]$Reader, [int]$TimeoutMs = 30000)
    $task = $Reader.ReadLineAsync()
    if (-not $task.Wait($TimeoutMs)) {
        throw "Timed out waiting for sidecar stdout"
    }
    return $task.Result
}

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $sidecarExe
$psi.WorkingDirectory = $distSidecar
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true
# The sidecar emits UTF-8 NDJSON (ensure_ascii=False), so decode both streams as UTF-8; the
# default ANSI codepage turns the Traditional-Chinese payload into mojibake and breaks ConvertFrom-Json.
$psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
$process = [System.Diagnostics.Process]::Start($psi)
try {
    $stdin = $process.StandardInput
    $stdout = $process.StandardOutput
    $stdin.WriteLine('{"jsonrpc":"2.0","id":1,"method":"hello","params":{}}')
    $stdin.WriteLine('{"jsonrpc":"2.0","id":2,"method":"runtime_status","params":{}}')
    $stdin.Flush()

    $hello = $null
    $status = $null
    # One startup event, then the hello and runtime_status responses.
    for ($i = 0; $i -lt 3; $i++) {
        $line = Read-SidecarLine -Reader $stdout
        if ($null -eq $line) { throw "Sidecar closed stdout before answering" }
        $obj = $line | ConvertFrom-Json
        if ($obj.id -eq 1) { $hello = $obj.result }
        elseif ($obj.id -eq 2) { $status = $obj.result }
    }

    $stdin.WriteLine('{"jsonrpc":"2.0","id":3,"method":"shutdown","params":{}}')
    $stdin.Flush()
    $line = Read-SidecarLine -Reader $stdout
    if ($null -eq $line) { throw "Sidecar closed stdout before shutdown response" }
    $shutdown = ($line | ConvertFrom-Json).result

    if (-not $process.WaitForExit(30000)) {
        $process.Kill()
        throw "Sidecar did not exit after shutdown"
    }
    if ($null -eq $hello -or $hello.protocol_version -ne 1 -or -not $hello.core_version) {
        throw "Frozen hello response invalid"
    }
    if ($null -eq $status -or $status.sidecar -ne "ready") {
        throw "Frozen runtime_status response invalid"
    }
    if ($null -eq $shutdown -or $shutdown.ok -ne $true) {
        throw "Frozen shutdown response invalid"
    }
    Write-Host "Frozen sidecar JSON-RPC smoke: hello / runtime_status / shutdown OK"
} finally {
    if (-not $process.HasExited) { $process.Kill() }
    $process.Dispose()
}

# Report sizes and elapsed time.
$sidecarSize = (Get-ChildItem -LiteralPath $distSidecar -Recurse -Force -File |
    Measure-Object -Property Length -Sum).Sum
$elapsed = (Get-Date) - $started
Write-Host "Installer: $installerPath"
Write-Host "Installer size: $installerSize bytes"
Write-Host "Sidecar onedir size: $sidecarSize bytes"
Write-Host ("Total build time: {0:N1} seconds" -f $elapsed.TotalSeconds)
