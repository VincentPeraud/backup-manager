FROM node:24-alpine

WORKDIR /app

RUN apk update
RUN apk add --no-cache docker-cli openssh-client rsync

RUN npm i -g tsx

COPY package.json .

RUN yarn install --frozen-lockfile

COPY . .

CMD ["yarn", "start"]