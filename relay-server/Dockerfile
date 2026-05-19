FROM node:20-alpine
WORKDIR /app
COPY index.js .
RUN npm init -y && npm install ws@8 --omit=dev
EXPOSE 4000
CMD ["node", "index.js"]
