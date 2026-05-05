# ============================================================
# Legacy CRM — Backup Script (Windows PowerShell)
# Roda no seu computador. Exporta banco + variáveis de ambiente.
# Uso: .\backup_legacy.ps1
# ============================================================

$timestamp = Get-Date -Format "yyyyMMdd_HHmm"
$outputDir = ".\legacy_backup_$timestamp"
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  LEGACY CRM — BACKUP TOOL" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Pede DATABASE_PUBLIC_URL ──────────────────────────────
Write-Host "Cole o DATABASE_PUBLIC_URL do Railway (botlegacy → Postgres → Connect → Public URL):" -ForegroundColor Yellow
Write-Host "Formato: postgresql://postgres:SENHA@HOST.railway.app:PORT/railway" -ForegroundColor DarkGray
$dbUrl = Read-Host "DATABASE_PUBLIC_URL"

if (-not $dbUrl -or -not $dbUrl.StartsWith("postgresql://")) {
    Write-Host "URL inválida. Abortando." -ForegroundColor Red
    exit 1
}

# ── 2. Verifica pg_dump ──────────────────────────────────────
Write-Host "`nVerificando pg_dump..." -ForegroundColor DarkGray
$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
    Write-Host "pg_dump não encontrado. Instale o PostgreSQL client:" -ForegroundColor Red
    Write-Host "  https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    Write-Host "  (marque 'Command Line Tools' na instalação)" -ForegroundColor Yellow
    exit 1
}

# ── 3. Exporta o banco ───────────────────────────────────────
$sqlFile = "$outputDir\database_backup_$timestamp.sql"
Write-Host "`n[1/3] Exportando banco de dados..." -ForegroundColor Green

$env:PGPASSWORD = ($dbUrl -split ':')[2].Split('@')[0]
& pg_dump $dbUrl --no-owner --no-acl -Fp -f $sqlFile 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro no pg_dump. Verifique a URL e tente novamente." -ForegroundColor Red
    exit 1
}

$sizeKB = [math]::Round((Get-Item $sqlFile).Length / 1024, 1)
Write-Host "    Banco exportado: $sqlFile ($sizeKB KB)" -ForegroundColor Green

# ── 4. Cria template de variáveis de ambiente ────────────────
Write-Host "`n[2/3] Gerando template de variáveis de ambiente..." -ForegroundColor Green

$envTemplate = @"
# ============================================================
# Legacy CRM — Variáveis de Ambiente
# Gerado em: $timestamp
# ============================================================
# Cole os valores do Railway (botlegacy → Variables → Raw Editor)
# e atualize os valores marcados com [ATUALIZAR] ao migrar.
# ============================================================

# ── Backend (botlegacy) ──────────────────────────────────────
NODE_ENV=production
DATABASE_URL=[ATUALIZAR: nova URL do novo Postgres Railway]
WHATSAPP_API_URL=[ATUALIZAR: nova URL do bridge no novo Railway]
JWT_SECRET=[copiar do Railway atual]
GEMINI_API_KEY=[copiar do Railway atual]
WHATSAPP_API_KEY=[copiar do Railway atual]

# ── Vercel (frontend) ────────────────────────────────────────
VITE_API_URL=[ATUALIZAR: nova URL do backend no novo Railway]
VITE_BRIDGE_URL=[ATUALIZAR: nova URL do bridge no novo Railway]

# ── Bridge (chic-tranquility) ────────────────────────────────
# Sem variáveis específicas — Railway injeta PORT automaticamente.
# WEBHOOK_URL=[ATUALIZAR: nova URL do backend + /api/webhook/whatsapp]
"@

$envFile = "$outputDir\env_template_$timestamp.txt"
$envTemplate | Out-File -FilePath $envFile -Encoding UTF8
Write-Host "    Template de variáveis: $envFile" -ForegroundColor Green

# ── 5. Gera checklist de migração ────────────────────────────
Write-Host "`n[3/3] Gerando checklist de migração..." -ForegroundColor Green

$checklist = @"
============================================================
LEGACY CRM — CHECKLIST DE MIGRAÇÃO PARA NOVO RAILWAY
Gerado em: $timestamp
============================================================

ANTES DE MIGRAR (fazer na conta atual):
  [ ] Rodar este script e guardar o backup em local seguro
  [ ] Anotar todas as variáveis de ambiente (Railway → Raw Editor)
  [ ] Verificar quantos leads/conversas existem no banco

NA NOVA CONTA RAILWAY:
  [ ] Criar novo projeto Railway
  [ ] Adicionar serviço PostgreSQL
  [ ] Anotar DATABASE_PUBLIC_URL do novo Postgres
  [ ] Importar banco: psql "NOVA_DATABASE_PUBLIC_URL" < database_backup_XXXXXX.sql
  [ ] Adicionar serviço backend: GitHub → legacybauru/botlegacy (root: backend/)
  [ ] Adicionar serviço bridge: GitHub → legacybauru/botlegacy (root: whatsapp-bridge/)
  [ ] Gerar domínio público para o bridge (Networking → Generate Domain)
  [ ] Configurar variáveis no backend (copiar do env_template e atualizar [ATUALIZAR])
  [ ] Configurar WEBHOOK_URL no bridge → nova URL do backend

NO VERCEL:
  [ ] Atualizar VITE_API_URL → nova URL do backend
  [ ] Atualizar VITE_BRIDGE_URL → nova URL do bridge
  [ ] Redeploy

APÓS MIGRAÇÃO:
  [ ] Testar login no sistema
  [ ] Verificar leads existentes no Kanban
  [ ] Reconectar WhatsApp (Setup → Conectar → Escanear QR)
  [ ] Enviar mensagem de teste
  [ ] Desativar serviços na conta Railway antiga

OBSERVAÇÕES:
  - Sessão do WhatsApp NÃO é migrada — precisará re-escanear QR
  - Imagens dos documentos estão no banco (BYTEA) — migram automaticamente com o pg_dump
  - O número de telefone do WhatsApp continua o mesmo após re-escanear
============================================================
"@

$checklistFile = "$outputDir\checklist_migracao.txt"
$checklist | Out-File -FilePath $checklistFile -Encoding UTF8
Write-Host "    Checklist: $checklistFile" -ForegroundColor Green

# ── Resumo ───────────────────────────────────────────────────
Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  BACKUP CONCLUÍDO!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Pasta: $outputDir" -ForegroundColor White
Write-Host "  Banco: database_backup_$timestamp.sql ($sizeKB KB)" -ForegroundColor White
Write-Host "  Vars:  env_template_$timestamp.txt" -ForegroundColor White
Write-Host "  Guia:  checklist_migracao.txt" -ForegroundColor White
Write-Host ""
Write-Host "Guarde essa pasta em local seguro (Google Drive, HD externo, etc.)" -ForegroundColor Yellow
Write-Host ""
