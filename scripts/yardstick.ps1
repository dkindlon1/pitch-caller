# v1.0 yardstick, one comparison (docs/PLAN_v1.0_2026-11-09.md, D7), for Windows PowerShell 5.1.
# Fixed-world paired games: in the given commit's world (its outcome model), the frozen v0.9 engine and that commit's
# v1.0 engine call the same 108 games (seeds 101-112, 3 levels x 3 staffs). Reports runs per game and world regret,
# v1.0 minus v0.9, with SE over games. Budget (D7): 0.25 runs/game of world regret.
#
# Run from the repo root on branch v1.0-work, after `git pull`:
#   powershell -ExecutionPolicy Bypass -File scripts\yardstick.ps1 -Tag 2c -Commit <hash>
# About 2 x 25-45 minutes at 10 jobs. A stopped run resumes: finished games are kept.
# Output: results\v10\yardstick_step<Tag>.txt
param(
    [Parameter(Mandatory = $true)][string]$Tag,
    [Parameter(Mandatory = $true)][string]$Commit,
    [int]$Jobs = 10
)
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path "$PSScriptRoot\..").Path
$parent = Split-Path $repo -Parent
$v09 = Join-Path $parent "pitch-caller-v09"
if (-not (Test-Path (Join-Path $v09 "engine.py"))) {
    git -C $repo worktree add $v09 v0.9-final
}
$out = Join-Path $repo "results\v10"
New-Item -ItemType Directory -Force -Path $out | Out-Null
git -C $repo fetch origin

$tree = Join-Path $parent "pc-yard-$Tag"
if (-not (Test-Path (Join-Path $tree "engine.py"))) {
    git -C $repo worktree add --detach $tree $Commit
}
Push-Location $tree
try {
    Write-Host "== $Tag : v0.9 engine calling in this tree's world"
    $env:TRUTH_TAB = "world"
    $env:CALL_ENGINE = Join-Path $v09 "engine.py"
    python -X utf8 readthrough/run_games.py --seeds 101-112 --jobs $Jobs --dest yardstick --suffix "_${Tag}_v09"
    if ($LASTEXITCODE -ne 0) { throw "v0.9 games failed" }
    Remove-Item Env:CALL_ENGINE
    Write-Host "== $Tag : v1.0 engine"
    python -X utf8 readthrough/run_games.py --seeds 101-112 --jobs $Jobs --dest yardstick --suffix "_${Tag}_v10"
    if ($LASTEXITCODE -ne 0) { throw "v1.0 games failed" }
    python -X utf8 readthrough/step7_regret.py "runs/yardstick/v09_${Tag}_v09" "runs/yardstick/v09_${Tag}_v10" --out (Join-Path $out "yardstick_step$Tag.txt")
    if ($LASTEXITCODE -ne 0) { throw "regret failed" }
} finally {
    Remove-Item Env:CALL_ENGINE -ErrorAction SilentlyContinue
    Remove-Item Env:TRUTH_TAB -ErrorAction SilentlyContinue
    Pop-Location
}
Write-Host ""
Write-Host "Done: results\v10\yardstick_step$Tag.txt. Push it (git add, commit, push) or paste the [all] block."
