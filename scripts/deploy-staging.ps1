# Deploy staging build to charts.edusuccess.vn
$ErrorActionPreference = "Stop"

$sha = (git rev-parse --short HEAD).Trim()
$vps = "root@14.225.255.47"
$dest = "/opt/edusuccess/charts"

Write-Host "=== Triển khai commit $sha lên VPS staging ($vps) ===" -ForegroundColor Cyan

if (-not (Test-Path "build.tar.gz")) {
    Write-Host "File build.tar.gz chua ton tai, dang dong goi..." -ForegroundColor Yellow
    tar -czf "build.tar.gz" -C build .
}

Write-Host "1. Uploading build.tar.gz sang VPS..." -ForegroundColor Green
scp "build.tar.gz" "${vps}:${dest}/build.tar.gz"

Write-Host "2. Giai nen va build container tren VPS..." -ForegroundColor Green
ssh $vps "cd $dest && rm -rf build && mkdir -p build && tar -xzf build.tar.gz -C build && rm -f build.tar.gz && docker build -t charts-test:$sha . && docker tag charts-test:$sha charts-test:latest && docker compose -f docker-compose.charts-test.yml up -d --force-recreate && docker exec nginx-proxy nginx -s reload"

Write-Host "3. Kiem chung staging tu ben ngoai (Rule 17)..." -ForegroundColor Green
node scripts/check-staging.cjs

Write-Host "=== Hoan tat trien khai staging! ===" -ForegroundColor Cyan
