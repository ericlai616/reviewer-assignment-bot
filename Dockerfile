FROM node:12-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN node --version
RUN npm install

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
