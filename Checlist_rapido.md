RODANDO RAPIDO 

cd "C:\Users\vocêaqui\Desktop\Projeto-web\ignis-backend"
docker compose up -d
npx prisma migrate status
npx prisma generate
npm run build
npm run start:dev

Se as conquistas precisarem ser cadastradas/atualizadas:

npx tsx prisma/seed.ts