# Многоэтапная сборка: приложение работает и без внешней БД
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Зависимости
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Сборка
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Запуск
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/drizzle.config.json ./drizzle.config.json
RUN mkdir -p /app/data && chown -R app:app /app/data
USER app
EXPOSE 3000
CMD ["npm", "run", "start"]
