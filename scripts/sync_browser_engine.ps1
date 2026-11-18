# Synchronizes browser_engine python source code across all deployment/runtime locations
# Preserves: Chromium binary (155.0.8059.12), user profiles (profiles/, profiles.json), logs, crash screenshots.

param (
    [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$src = Join-Path $repoRoot "browser_engine"

if (-not (Test-Path $src)) {
    Write-Error "Source directory not found: $src"
    exit 1
}

$destinations = @(
    (Join-Path $repoRoot "roots\browsermulti"),
    (Join-Path $repoRoot "src-tauri\target\release\browser_engine"),
    (Join-Path $repoRoot "src-tauri\target\release\roots\browsermulti")
)

# Also check LocalAppData if installed
$localAppData = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::LocalApplicationData)
$appDataBrowserEngine = Join-Path $localAppData "RETubeMatrix\browser_engine"
$appDataRootsMulti = Join-Path $localAppData "RETubeMatrix\roots\browsermulti"

if (Test-Path $appDataBrowserEngine) {
    $destinations += $appDataBrowserEngine
}
if (Test-Path $appDataRootsMulti) {
    $destinations += $appDataRootsMulti
}

# Also sync debug target directories if they exist
$debugBrowserEngine = Join-Path $repoRoot "src-tauri\target\debug\browser_engine"
$debugRootsMulti = Join-Path $repoRoot "src-tauri\target\debug\roots\browsermulti"
if (Test-Path $debugBrowserEngine) { $destinations += $debugBrowserEngine }
if (Test-Path $debugRootsMulti) { $destinations += $debugRootsMulti }

Write-Host "Syncing browser_engine across $($destinations.Count) target locations..."

# Clean up stale legacy root files
$staleNames = @("bkt_check.py")

if (-not $VerifyOnly) {
    foreach ($dest in $destinations) {
        if (-not (Test-Path $dest)) {
            New-Item -ItemType Directory -Path $dest -Force | Out-Null
        }

        # Copy root files
        $rootFiles = @("runner.py", "outlier_hunter.py", "requirements.txt")
        foreach ($rf in $rootFiles) {
            $srcFile = Join-Path $src $rf
            if (Test-Path $srcFile) {
                Copy-Item $srcFile (Join-Path $dest $rf) -Force
            }
        }

        # Mirror subdirectories (actions, core, tests) with robocopy /MIR
        foreach ($sub in @("actions", "core", "tests")) {
            $subSrc = Join-Path $src $sub
            $subDest = Join-Path $dest $sub
            if (Test-Path $subSrc) {
                robocopy $subSrc $subDest /MIR /XF *.pyc /XD __pycache__ /NP /NFL /NDL /NJH /NJS | Out-Null
                if ($LASTEXITCODE -ge 8) {
                    Write-Error "Robocopy failed with code $LASTEXITCODE while copying $subSrc to $subDest"
                    exit 1
                }
                $global:LASTEXITCODE = 0
            }
        }

        # Remove stale files
        foreach ($sf in $staleNames) {
            $stalePath = Join-Path $dest $sf
            if (Test-Path $stalePath) {
                Remove-Item $stalePath -Force
                Write-Host "  Removed stale legacy file: $stalePath"
            }
        }
    }
}

# Audit & verify SHA256 of all source files
$srcFiles = Get-ChildItem -Path $src -Recurse -File | Where-Object { 
    $_.FullName -notmatch "__pycache__" -and 
    $_.FullName -notmatch "profiles" -and 
    $_.FullName -notmatch "logs" -and 
    $_.FullName -notmatch "crash_screenshots" -and 
    $_.FullName -notmatch "\.tmp" -and
    $_.Name -notmatch "profiles\.json" -and
    $_.Name -notmatch "deleted_profiles\.json"
}

$totalDiffs = 0
foreach ($dest in $destinations) {
    $diffCount = 0
    $missingCount = 0
    $extraCount = 0
    foreach ($sf in $srcFiles) {
        $rel = $sf.FullName.Substring($src.Length + 1)
        $dstFile = Join-Path $dest $rel
        if (Test-Path $dstFile) {
            $h1 = (Get-FileHash -Path $sf.FullName -Algorithm SHA256).Hash
            $h2 = (Get-FileHash -Path $dstFile -Algorithm SHA256).Hash
            if ($h1 -ne $h2) {
                $diffCount++
            }
        } else {
            $missingCount++
        }
    }

    if (Test-Path $dest) {
        $dstFiles = Get-ChildItem -Path $dest -Recurse -File | Where-Object {
            $_.FullName -notmatch "__pycache__" -and 
            $_.FullName -notmatch "155\.0\.8059\.12" -and
            $_.FullName -notmatch "profiles" -and 
            $_.FullName -notmatch "logs" -and 
            $_.FullName -notmatch "crash_screenshots" -and 
            $_.FullName -notmatch "\.tmp" -and
            $_.Name -notmatch "profiles\.json" -and
            $_.Name -notmatch "deleted_profiles\.json"
        }
        $destResolved = (Resolve-Path $dest).Path
        foreach ($df in $dstFiles) {
            $rel = $df.FullName.Substring($destResolved.Length + 1)
            $srcFile = Join-Path $src $rel
            if (-not (Test-Path $srcFile)) {
                $extraCount++
                Write-Warning "  [$dest] Extra stale file: $rel"
            }
        }
    }

    $status = if ($diffCount -eq 0 -and $missingCount -eq 0 -and $extraCount -eq 0) { 
        "OK (100% Match)" 
    } else { 
        "FAILED (Diff: $diffCount, Missing: $missingCount, Extra: $extraCount)" 
    }
    Write-Host "  [$dest] -> $status"
    $totalDiffs += $diffCount + $missingCount + $extraCount
}

if ($totalDiffs -eq 0) {
    Write-Host "SUCCESS: All $($destinations.Count) locations are 100% byte-for-byte identical with browser_engine source!" -ForegroundColor Green
} else {
    Write-Warning "Audit completed with $totalDiffs discrepancies."
}
