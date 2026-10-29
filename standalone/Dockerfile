# Immagine dell'Archivio Use Case standalone.
#   npm install && node standalone/build.js
#   docker build -f standalone/Dockerfile -t ad-usecase-archive .
FROM node:22-alpine
WORKDIR /app
COPY dist-standalone/ /app/
ENV UCM_DATA_DIR=/data UCM_PORT=8080 UCM_HOST=0.0.0.0 NODE_OPTIONS=--disable-warning=ExperimentalWarning
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 8080
CMD ["node", "server/index.js"]
