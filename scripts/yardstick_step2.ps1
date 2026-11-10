# v1.0 Step 2 yardstick (docs/PLAN_v1.0_2026-11-09.md, D5 and D7), for Windows PowerShell 5.1.
# Fixed-world paired games: in each tree's own world (its outcome model), the frozen v0.9 engine and that tree's v1.0
# engine call the same 108 games (seeds 101-112, 3 levels x 3 staffs). Two trees:
#   2a = Step 2a (guardrail removed, 3-1 setting, recalibrated), tunneling OFF
#   2b = Step 2 head, tunneling ON (D5)
# Each comparison reports runs per game and decision regret, v1.0 minus v0.9, with SE over games.
# Budget (D7): the variety cost must stay under 0.25 runs per game. Over it: stop, nothing gets tuned silently.
#
# Run from the repo root on branch v1.0-work, after `git pull`:
#   powershell -ExecutionPolicy Bypass -File scripts\yardstick_step2.ps1
# About 4 x 25 minutes at 10 jobs. A stopped run resumes: finished games are kept.
param(
    [string]$StepA = "b50f02f",          # Step 2a commit (tunneling off)
    [string]$StepB = "f93457b",           # Step 2b commit (tunneling on; the engine is unchanged after it in Step 2)
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

function Run-Pair([string]$tag, [string]$commit) {
    $tree = Join-Path $parent "pc-yard-$tag"
    if (-not (Test-Path (Join-Path $tree "engine.py"))) {
        git -C $repo worktree add --detach $tree $commit
    }
    Push-Location $tree
    try {
        Write-Host "== $tag : v0.9 engine calling in this tree's world"
        $env:TRUTH_TAB = "world"
        $env:CALL_ENGINE = Join-Path $v09 "engine.py"
        python -X utf8 readthrough/run_games.py --seeds 101-112 --jobs $Jobs --dest yardstick --suffix "_${tag}_v09"
        if ($LASTEXITCODE -ne 0) { throw "v0.9 games failed ($tag)" }
        Remove-Item Env:CALL_ENGINE
        Write-Host "== $tag : v1.0 engine"
        python -X utf8 readthrough/run_games.py --seeds 101-112 --jobs $Jobs --dest yardstick --suffix "_${tag}_v10"
        if ($LASTEXITCODE -ne 0) { throw "v1.0 games failed ($tag)" }
        python -X utf8 readthrough/step7_regret.py "runs/yardstick/v09_${tag}_v09" "runs/yardstick/v09_${tag}_v10" --out (Join-Path $out "yardstick_step$tag.txt")
        if ($LASTEXITCODE -ne 0) { throw "regret failed ($tag)" }
    } finally {
        Remove-Item Env:CALL_ENGINE -ErrorAction SilentlyContinue
        Remove-Item Env:TRUTH_TAB -ErrorAction SilentlyContinue
        Pop-Location
    }
}

git -C $repo fetch origin
Run-Pair "2a" $StepA
Run-Pair "2b" $StepB
Write-Host ""
Write-Host "Done. Results: results\v10\yardstick_step2a.txt (tunneling off) and results\v10\yardstick_step2b.txt (tunneling on)."
Write-Host "Send both files (or paste the [all] block from each)."
