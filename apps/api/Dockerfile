FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm install
COPY apps/api apps/api
RUN npm run build --workspace=@cardacquire/api

FROM node:20-alpine

WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
RUN npm install --omit=dev --workspace=@cardacquire/api

WORKDIR /app/apps/api
CMD ["npm", "start"]