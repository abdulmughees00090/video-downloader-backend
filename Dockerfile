FROM node:18

# Install yt-dlp using pip (works on Debian)
RUN apt-get update && apt-get install -y python3 python3-pip && \
    pip3 install yt-dlp && \
    apt-get clean

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
