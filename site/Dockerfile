# Site de documentation : construction Docusaurus puis service statique par nginx.
FROM node:24-alpine AS build
WORKDIR /site
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /site/build /usr/share/nginx/html
EXPOSE 80
