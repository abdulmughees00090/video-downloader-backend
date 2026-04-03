FROM node:18

# Install yt-dlp using npm (works every time)
RUN npm install -g yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
