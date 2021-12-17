FROM node:alpine

RUN apk add --no-cache git

WORKDIR /usr/worktime

COPY package.json .

COPY package-lock.json .

RUN npm ci

COPY . .

CMD ["npm", "start"]