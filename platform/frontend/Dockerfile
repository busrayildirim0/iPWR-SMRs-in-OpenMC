# --- STAGE 1: Build Aşaması ---
FROM node:20-alpine AS build-stage

WORKDIR /app

COPY platform/frontend/package*.json ./
RUN npm install

COPY platform/frontend/ ./
# React/Vite uygulamasını prodüksiyon için derle (dist klasörü üretir)
RUN npm run build

# --- STAGE 2: Production Nginx Aşaması ---
FROM nginx:alpine AS production-stage

# React build çıktılarını Nginx'in yayın klasörüne kopyala
COPY --from=build-stage /app/dist /usr/share/nginx/html

# Nginx reverse proxy yapılandırması (API isteklerini yönlendirmek için)
COPY platform/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
