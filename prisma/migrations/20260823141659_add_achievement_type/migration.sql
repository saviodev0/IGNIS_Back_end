-- Adiciona a coluna temporariamente permitindo NULL
ALTER TABLE "Achievement"
ADD COLUMN "type" TEXT;

-- Define CYCLES para as conquistas que já existem
UPDATE "Achievement"
SET "type" = 'CYCLES'
WHERE "type" IS NULL;

-- Agora torna a coluna obrigatória
ALTER TABLE "Achievement"
ALTER COLUMN "type" SET NOT NULL;