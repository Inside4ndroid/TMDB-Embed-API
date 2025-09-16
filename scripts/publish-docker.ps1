Param(
    [string]$ImageName = "tmdb-embed-api",
    [string]$Registry = "docker.io",
    [string]$Repo = "yourdockeruser",  # e.g. docker hub username or org
    [string]$Tag = "latest",
    [switch]$UseGitTag,
    [switch]$Push,
    [switch]$MultiArch,
    [string]$Platforms = "linux/amd64,linux/arm64"
)

# Usage examples:
#   .\scripts\publish-docker.ps1 -Repo youruser -Tag test -Push
#   .\scripts\publish-docker.ps1 -Repo youruser -UseGitTag -Push
#   .\scripts\publish-docker.ps1 -Repo youruser -UseGitTag -Push -MultiArch

$ErrorActionPreference = 'Stop'

function Write-Info($msg){ Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn($msg){ Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg){ Write-Host "[ERR]  $msg" -ForegroundColor Red }

# Derive tag from git if requested
if($UseGitTag){
    if(Test-Path .git){
        $gitTag = git describe --tags --abbrev=0 2>$null
        if(-not $gitTag){ Write-Err "No git tag found. Create one or omit -UseGitTag."; exit 1 }
        $Tag = $gitTag
    } else {
        Write-Err "No .git directory. Cannot derive tag."; exit 1
    }
}

# Normalize registry prefix
if($Registry -in @('docker.io','index.docker.io','')){
    $FullImage = "$Repo/$ImageName:$Tag"
} else {
    $FullImage = "$Registry/$Repo/$ImageName:$Tag"
}

Write-Info "Building image: $FullImage"

if($MultiArch){
    # Ensure buildx exists
    $bx = docker buildx version 2>$null
    if($LASTEXITCODE -ne 0){
        Write-Info "Creating buildx builder (first time)"
        docker buildx create --use --name multiarch-builder | Out-Null
    }
    docker buildx use multiarch-builder
    docker buildx inspect --bootstrap | Out-Null
    Write-Info "Building multi-arch for: $Platforms"
    docker buildx build --platform $Platforms --build-arg VERSION=$Tag -t $FullImage --push:$Push .
    if(-not $Push){
        Write-Warn "Multi-arch buildx without --push stores result in registry only when --push is set; local images may not exist."
    }
} else {
    docker build --build-arg VERSION=$Tag -t $FullImage .
    if($Push){
        Write-Info "Pushing $FullImage"
        docker push $FullImage
    } else {
        Write-Info "Skipping push (add -Push to push)."
    }
}

Write-Info "Done."