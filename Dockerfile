FROM node:10.15.3-alpine
MAINTAINER Hakarune

WORKDIR /usr/src/app

COPY package.json ./

RUN npm install

COPY . .

CMD ["npm", "run", "tsc"]

EXPOSE 8000
