# T-038.1 - Imagen del backend de Ideator.
FROM node:20-alpine

WORKDIR /app

# El cliente de Prisma necesita openssl en Alpine.
RUN apk add --no-cache openssl

COPY package*.json ./

# A proposito NO se podan las devDependencies: el CLI de Prisma vive ahi y es
# lo que permite correr las migraciones dentro del contenedor
# (docker compose run --rm backend npm run migrate).
RUN npm ci

COPY src ./src

RUN npx prisma generate --schema=src/database/schema.prisma

ENV NODE_ENV=production
EXPOSE 3000

USER node

# Las migraciones NO se corren en el arranque: son un paso explicito del
# despliegue, para no sorprender con cambios de schema al reiniciar.
CMD ["node", "src/server.js"]
