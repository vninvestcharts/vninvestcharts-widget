# Bypass Docker Desktop credential helper để push lên GHCR
# Chạy: .\scripts\ghcr-push.ps1

param(
    [string]$Username = "vietdungiitb",
    [string]$Image = "ghcr.io/vietdungiitb/klinestockchart:latest"
)

$pat = Read-Host -Prompt "Nhap Classic PAT (ghp_...)" -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pat)
$plain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

if (-not $plain.StartsWith("ghp_")) {
    Write-Host "ERROR: Phai dung Classic PAT (bat dau bang ghp_)" -ForegroundColor Red
    exit 1
}

# Tao temp docker config khong co credsStore
$tmpDir = Join-Path $env:TEMP "docker-ghcr-push-$(Get-Random)"
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${Username}:${plain}"))
$config = @{ auths = @{ "ghcr.io" = @{ auth = $encoded } } } | ConvertTo-Json -Depth 5
Set-Content -Path "$tmpDir\config.json" -Value $config -Encoding UTF8

Write-Host "Pushing $Image ..." -ForegroundColor Cyan

$env:DOCKER_CONFIG = $tmpDir
try {
    docker push $Image
    if ($LASTEXITCODE -eq 0) {
        Write-Host "PUSH THANH CONG!" -ForegroundColor Green
    } else {
        Write-Host "PUSH THAT BAI (exit $LASTEXITCODE)" -ForegroundColor Red
    }
} finally {
    $env:DOCKER_CONFIG = $null
    Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
}
