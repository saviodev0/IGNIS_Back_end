IGNIS Backend — Guia para Rodar o Projeto

Este arquivo contém o passo a passo para iniciar o backend do IGNIS depois de ligar o computador ou clonar o projeto novamente.

1. Pré-requisitos

Verifique se estão instalados:

Node.js

npm

Docker Desktop

Git

No PowerShell:

node --version
npm --version
docker --version
docker compose version
git --version

Versões usadas no desenvolvimento do IGNIS:

Node.js: v26.7.0

npm: v11.19.0

Docker: v29.7.2

Docker Compose: v5.3.1

Prisma: v7.9.1

As versões podem ser diferentes em outra máquina, desde que sejam compatíveis com o projeto.

2. Abrir o projeto

No PowerShell:

cd "C:\Users\vocêaqui\Desktop\Projeto-web\ignis-backend"

Confira se está na pasta correta:

pwd

3. Se acabou de clonar o projeto

Instale as dependências:

npm install

Se o projeto exigir os scripts de instalação dos pacotes bloqueados pelo npm, confira:

npm install-scripts ls

E, caso necessário para o ambiente local, aprove os scripts dos pacotes indicados pelo npm:

npm install-scripts approve <pacote>

Não execute npm audit fix --force automaticamente, porque ele pode atualizar dependências com breaking changes.

4. Verificar o arquivo .env

Na raiz do projeto deve existir:

.env

Exemplo da configuração atual:

DATABASE_URL="url_aqui"
JWT_SECRET="uma-chave-secreta-forte"

Nunca envie o .env para o Git. Ele deve estar no .gitignore.

Se o projeto usar outro valor de JWT_SECRET, mantenha o valor configurado no seu ambiente.

5. Iniciar o Docker Desktop

Abra o Docker Desktop e espere ele ficar pronto.

Depois verifique:

docker ps

6. Subir o PostgreSQL

Dentro da pasta ignis-backend:

docker compose up -d

Confira o container:

docker ps

Deve aparecer o PostgreSQL do IGNIS, normalmente:

ignis-postgres

Para ver os logs:

docker compose logs postgres

Para acompanhar os logs continuamente:

docker compose logs -f postgres

Para sair da visualização dos logs:

Ctrl + C

Não use docker compose down -v normalmente, pois o -v remove os volumes e pode apagar os dados locais do PostgreSQL.

7. Conferir o banco pelo Prisma

Verifique o estado das migrations:

npx prisma migrate status

O resultado esperado é:

Database schema is up to date!

Se o projeto acabou de ser clonado e houver migrations pendentes, aplique-as com:

npx prisma migrate deploy

Para desenvolvimento, quando houver alteração no schema.prisma:

npx prisma migrate dev --name nome_da_migration

Depois gere o Prisma Client:

npx prisma generate

8. Seed das conquistas

O IGNIS possui um seed em:

prisma/seed.ts

Como o seed é executado diretamente pelo tsx, ele carrega o .env através de:

import 'dotenv/config';

Para cadastrar/atualizar as conquistas:

npx tsx prisma/seed.ts

Resultado esperado:

Conquistas cadastradas com sucesso!

O seed usa upsert, então pode ser executado novamente sem criar conquistas duplicadas.

9. Verificar se o código compila

Antes de iniciar o servidor:

npm run build

Resultado esperado:

Found 0 errors

Se houver erro de TypeScript, corrija antes de continuar.

10. Iniciar o backend em desenvolvimento

Use:

npm run start:dev

O NestJS deve iniciar e mostrar algo parecido com:

Found 0 errors
Nest application successfully started

As principais rotas atuais incluem:

POST /users
POST /auth/login
GET  /auth/me
POST /auth/logout
GET  /users/me/stats
POST /study-cycles/start

Deixe esse terminal aberto enquanto estiver desenvolvendo.

Para parar o servidor:

Ctrl + C

11. Fluxo completo depois de ligar o notebook

Se o projeto já estiver configurado e você só desligou o computador, normalmente basta:

Terminal 1 — projeto

cd "C:\Users\vocêaqui\Desktop\Projeto-web\ignis-backend"

Verificar Docker

docker ps

Subir PostgreSQL

docker compose up -d

Conferir banco

npx prisma migrate status

Gerar Prisma Client

npx prisma generate

Rodar seed, se necessário

npx tsx prisma/seed.ts

Compilar

npm run build

Iniciar NestJS

npm run start:dev

Depois abra o Insomnia e teste as rotas.

12. Fluxo quando o node_modules não existe

Se acabou de clonar o projeto:

cd "C:\Users\vocêaqui\Desktop\Projeto-web\ignis-backend"
npm install
docker compose up -d
npx prisma migrate deploy
npx prisma generate
npx tsx prisma/seed.ts
npm run build
npm run start:dev

13. Fluxo quando o schema.prisma foi alterado

Sempre que alterarmos os models do Prisma durante o desenvolvimento:

npx prisma migrate dev --name descricao_da_alteracao

Depois:

npx prisma generate

Depois:

npm run build

E finalmente:

npm run start:dev

14. Comandos úteis do Prisma

Ver status:

npx prisma migrate status

Criar migration de desenvolvimento:

npx prisma migrate dev --name nome_da_migration

Aplicar migrations existentes:

npx prisma migrate deploy

Gerar Prisma Client:

npx prisma generate

Abrir Prisma Studio:

npx prisma studio

Executar o seed:

npx tsx prisma/seed.ts

15. Comandos úteis do Docker

Ver containers:

docker ps

Subir serviços:

docker compose up -d

Parar serviços:

docker compose stop

Iniciar novamente:

docker compose start

Ver logs:

docker compose logs postgres

Parar e remover os containers:

docker compose down

Evite docker compose down -v porque isso também remove os volumes e pode apagar o banco local.

16. Testes básicos no Insomnia

Criar usuário

POST http://localhost:3000/users

Body JSON:

{
  "name": "Sávio",
  "age": 17,
  "email": "savio@teste.com",
  "phone": "63999999999",
  "password": "12345678"
}

A senha é armazenada usando bcrypt e não deve aparecer na resposta.

Login

POST http://localhost:3000/auth/login

Body:

{
  "email": "savio@teste.com",
  "password": "12345678"
}

O login retorna o accessToken e os dados públicos do usuário.

Dados do usuário autenticado

GET http://localhost:3000/auth/me

Enviar a autenticação/cookie configurado pelo projeto.

Estatísticas

GET http://localhost:3000/users/me/stats

Retorna informações como:

{
  "stats": {
    "ignisPoints": 50,
    "totalStudyMinutes": 120,
    "completedCycles": 4,
    "currentStreak": 1,
    "longestStreak": 1
  }
}

Iniciar ciclo

POST http://localhost:3000/study-cycles/start

Body:

{
  "durationMinutes": 25
}

A rota exige autenticação.

17. Se aparecer secretOrPrivateKey must have a value

Esse erro normalmente significa que o JWT_SECRET não foi carregado.

Confira:

JWT_SECRET="sua-chave-secreta"

Depois pare o Nest:

Ctrl + C

e inicie novamente:

npm run start:dev

18. Se aparecer client password must be a string

Confira a DATABASE_URL e compare com o docker-compose.yml.

A configuração atual do Docker usa:

POSTGRES_USER: ignis
POSTGRES_PASSWORD: ignis_dev_password
POSTGRES_DB: ignis

Portanto, a URL correspondente deve usar:

DATABASE_URL="postgresql://ignis:ignis_dev_password@localhost:5432/ignis?schema=public"

Se o banco foi criado anteriormente com outras credenciais e o volume já existe, não altere a senha aleatoriamente. Primeiro confira a configuração existente.

19. Se aparecer erro de Prisma Client

Execute:

npx prisma generate

Depois:

npm run build

20. Se aparecer erro de dependência do Nest

Exemplo:

Nest can't resolve dependencies

Verifique se o módulo que usa determinado serviço importa o módulo que fornece esse serviço.

No IGNIS, por exemplo, StudyCyclesModule usa o AuthGuard, então precisa ter acesso ao AuthModule.

21. Ordem recomendada para desenvolvimento

Sempre que for continuar o desenvolvimento:

1. Docker Desktop
       ↓
2. docker compose up -d
       ↓
3. npx prisma migrate status
       ↓
4. npx prisma generate
       ↓
5. npx tsx prisma/seed.ts (quando necessário)
       ↓
6. npm run build
       ↓
7. npm run start:dev
       ↓
8. Testar no Insomnia

22. Git — depois de uma alteração

Ver alterações:

git status

Adicionar:

git add .

Criar commit:

git commit -m "feat: descrição da alteração"

Enviar para o GitHub:

git push origin main

Antes de fazer commit, confira se .env não está sendo enviado:

git status

O .env deve estar no .gitignore.

23. Checklist rápido

Quando quiser apenas colocar o IGNIS para funcionar:

cd "C:\Users\vocêaqui\Desktop\Projeto-web\ignis-backend"
docker compose up -d
npx prisma migrate status
npx prisma generate
npm run build
npm run start:dev

Se as conquistas precisarem ser cadastradas/atualizadas:

npx tsx prisma/seed.ts

24. Comando de emergência para conferir tudo

Se estiver em dúvida sobre o estado do projeto:

docker ps
npx prisma migrate status
npx prisma generate
npm run build

Se todos estiverem corretos:

npm run start:dev

Estado atual do IGNIS Backend

Atualmente o backend já possui:

Cadastro de usuários

Validação de dados

Senha com bcrypt

Login

JWT

Cookie HttpOnly

/auth/me

Logout

PostgreSQL com Docker

Prisma 7.9.1

Study Cycles

Conclusão de ciclos

Recompensa em IGNIS

Transação para atualização do ciclo/pontos

Estatísticas do usuário

Current streak

Longest streak

Estrutura de conquistas

Seed das conquistas

