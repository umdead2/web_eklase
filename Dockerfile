# Use the official Playwright image
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

# Copy only package files first to leverage Docker cache
COPY package*.json ./

# Install dependencies
RUN npm install

# IMPORTANT: This command downloads the browsers into the image
RUN npx playwright install chromium --with-deps

# Copy the rest of your app code
COPY . .

EXPOSE 5000

# Start the server
CMD ["node", "server.js"]