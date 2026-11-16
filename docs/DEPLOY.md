# Como subir o IGNIS em produção

Este guia sobe tudo em **uma máquina só** com Docker Compose: site, API, Postgres, Mongo e HTTPS automático (Caddy). É o caminho mais simples para começar; dá para migrar para serviços gerenciados depois.

## O que você precisa

| Item | Detalhe |
| --- | --- |
| Servidor | Linux (Ubuntu 22.04+), **2 vCPU e 4 GB de RAM** no mínimo (a busca por significado e o OCR usam memória), 20 GB de disco |
| Domínio | Dois endereços no **mesmo domínio-pai**, ex.: `app.ignis.com.br` (site) e `api.ignis.com.br` (API), ambos apontando para o IP do servidor (registro DNS tipo A) |
| Portas | 22 (SSH), 80 e 443 liberadas. Postgres e Mongo **não** são expostos |
| Chave da Groq | Em https://console.groq.com. Use uma **chave nova**: a que apareceu em conversas antigas deve ser revogada |

> Os dois endereços precisam ser do mesmo domínio-pai porque o login usa um cookie `SameSite=Lax`. Em domínios diferentes o navegador não envia o cookie (veja "Problemas comuns").

## 1. Preparar o servidor

```bash
# Docker e Compose (Ubuntu)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # saia e entre de novo no SSH

# Firewall: só SSH, HTTP e HTTPS
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

## 2. Baixar os dois repositórios lado a lado

```bash
mkdir ignis && cd ignis
git clone https://github.com/saviodev0/IGNIS_Back_end.git
git clone https://github.com/AntonioPauloFidel/Ignis_FrontEnd.git
```

O compose está em `IGNIS_Back_end/deploy` e procura o front em `../../Ignis_FrontEnd`.

## 3. Configurar

```bash
cd IGNIS_Back_end/deploy
cp .env.example .env
nano .env
```

Preencha `APP_HOST`, `API_HOST`, `GROQ_API_KEY` e gere os três segredos (um comando para cada):

```bash
openssl rand -base64 36   # POSTGRES_PASSWORD
openssl rand -base64 36   # MONGO_PASSWORD
openssl rand -base64 48   # JWT_SECRET
```

O `.env` nunca vai para o Git. Guarde uma cópia dos segredos em um gerenciador de senhas.

## 4. Subir

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

Na primeira vez o build leva alguns minutos. A API aplica as migrações do banco sozinha ao iniciar. O Caddy obtém o certificado HTTPS na primeira visita (precisa de DNS correto e portas 80/443 abertas).

Confira:

```bash
curl https://api.SEU-DOMINIO/health      # {"status":"ok", ... "database":"connected"}
```

Abra `https://app.SEU-DOMINIO` no navegador, crie uma conta e passe pelo roteiro abaixo.

### Roteiro de verificação

1. Cadastrar e entrar (o login deve persistir ao recarregar a página).
2. Iniciar, pausar e finalizar um ciclo; ver em **Ciclos**.
3. Abrir o chat, enviar um PDF e perguntar sobre ele (a resposta cita arquivo e página). **A primeira pergunta demora mais:** o modelo de busca (e, em PDF escaneado, os dados do OCR) são baixados uma vez para o volume `models`.
4. Gerar um quiz a partir do PDF.
5. "Apagar todos os meus dados de IA" no menu de conversas.

## Atualizar

```bash
cd ~/ignis/IGNIS_Back_end && git pull
cd ../Ignis_FrontEnd && git pull
cd ../IGNIS_Back_end/deploy
docker compose -f docker-compose.prod.yml up -d --build
```

Os dados ficam nos volumes e não se perdem. Se mudar `APP_HOST` ou `API_HOST`, o `--build` refaz o site com o novo endereço da API.

## Backup e restauração

```bash
./backup.sh            # gera backups/AAAAMMDD-HHMMSS/ com postgres.dump, mongo.archive.gz e arquivos.tar.gz
```

Agende no `cron` (ex.: todo dia às 3h) e **copie os backups para fora do servidor**. Para restaurar:

```bash
cat backups/XXXX/postgres.dump | docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U ignis -d ignis --clean --if-exists
cat backups/XXXX/mongo.archive.gz | docker compose -f docker-compose.prod.yml exec -T mongo sh -c 'mongorestore --username ignis --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --drop'
```

## Como a configuração funciona

A API **não inicia** em produção se faltar `DATABASE_URL`, `MONGODB_URL`, `CORS_ORIGINS` ou se o `JWT_SECRET` for fraco. O compose monta essas variáveis a partir do seu `.env`:

| Variável | De onde vem |
| --- | --- |
| `CORS_ORIGINS` | `https://` + `APP_HOST` |
| `TRUST_PROXY=1` | fixo (há um proxy, o Caddy, na frente: os limites por IP usam o IP real do aluno) |
| cookie de login `Secure` | automático em produção |
| `UPLOADS_DIR`, `MODELS_DIR` | `/data/arquivos` e `/data/modelos`, em volumes |
| `AI_DAILY_TOKEN_LIMIT`, `GROQ_*`, `LLM_FALLBACK_*`, `METRICS_TOKEN`, `OCR`, `EMBEDDINGS` | opcionais, no `.env` |

## Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| Site abre, mas o login "não pega" (volta para a tela de login) | `APP_HOST` e `API_HOST` em domínios-pai diferentes: o cookie é bloqueado. Use subdomínios do mesmo domínio |
| Erro de CORS no navegador | `APP_HOST` não bate com o endereço aberto no navegador |
| Certificado HTTPS não sai | DNS ainda não aponta para o servidor, ou portas 80/443 fechadas. Veja `docker compose logs caddy` |
| A API reinicia sozinha | Veja `logs api`: a mensagem diz qual variável falta |
| Chat responde "IA indisponível" | `GROQ_API_KEY` ausente ou inválida, ou limite da Groq (configure `LLM_FALLBACK_MODEL` para ter um reserva; o log mostra `usando o reserva`) |
| Falta de memória (contêiner morto) | Servidor com menos de 4 GB. Aumente a máquina ou desligue `EMBEDDINGS=off` e `OCR=off` |
| Muitos "429 Muitas requisições" para todos | `TRUST_PROXY` ausente (todos pareceriam um IP só) |

## Segurança: checklist

- [ ] Chave da Groq antiga **revogada** e a nova só no `.env` do servidor.
- [ ] Firewall liberando apenas 22, 80 e 443.
- [ ] Login por chave SSH (desative senha) e sem login direto como root.
- [ ] Backups copiados para fora do servidor e restauração testada ao menos uma vez.
- [ ] `docker compose ... pull` e `up -d --build` periodicamente para receber atualizações das imagens base.

## Acompanhar a IA em uso (opcional)

Defina `METRICS_TOKEN` no `.env` (por exemplo, `openssl rand -hex 24`) e reinicie a API. A equipe vê o resumo dos últimos 7 dias
(tempo até o primeiro texto, tempo total, taxa de erro, respostas sem fonte, uso do provedor reserva):

```bash
curl -H "x-metrics-token: SEU_TOKEN" "https://api.SEU-DOMINIO/metrics/ai?days=7"
```

As métricas guardam só números e rótulos (nada do que o aluno escreve nem dos arquivos) e expiram em 90 dias.
