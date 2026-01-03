FROM node:18 AS build

WORKDIR /app

ARG VITE_API_URL=http://backend:8000
ENV VITE_API_URL=$VITE_API_URL

COPY package.json package-lock.json* yarn.lock* ./

RUN npm install

COPY . .

RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
