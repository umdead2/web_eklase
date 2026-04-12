# Match the Playwright version in your package.json
FROM mcr.microsoft.com/playwright:v1.50.1-jammy

# Set the working directory
WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies 
# (The browsers are already in the Docker image, so we don't need 'npx playwright install')
RUN npm install

# Copy the rest of the code
COPY . .

# Render uses the PORT environment variable
EXPOSE 5000

# Start the server
CMD ["node", "server.js"]