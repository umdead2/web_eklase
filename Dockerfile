# Use the image that matches your playwright version
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Ensure the port matches your Express server (5000)
EXPOSE 5000

CMD ["node", "server.js"]