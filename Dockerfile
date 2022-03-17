FROM node:10.15.3-alpine
MAINTAINER Hakarune

WORKDIR /usr/src/app

COPY package.json .

RUN npm install

COPY . ./

RUN npm run tsc

EXPOSE 8000

CMD ["npm", "start"]
