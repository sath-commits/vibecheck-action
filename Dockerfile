FROM node:20-slim
WORKDIR /action
COPY index.js .
ENTRYPOINT ["node", "/action/index.js"]
