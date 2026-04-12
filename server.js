if (process.env.RENDER) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = '/ms-playwright';
}
const express = require("express");
const { chromium } = require("playwright");
const path = require("path");

const app = express();
const port = 5000;

app.use(express.json());
app.use(express.static(__dirname));

let browser;

async function start() {
    browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // Vital for Render's 512MB RAM
            '--disable-blink-features=AutomationControlled' // Hides the "automated" flag
        ]
    });
}
start();

// Serve login page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "login.html"));
});

// Serve main page
app.get("/main.html", (req, res) => {
    res.sendFile(path.join(__dirname, "main.html"));
});

// LOGIN + DATA FETCH
app.post("/data", async (req, res) => {
    // 1. Setup context with a real user agent to bypass bot detection
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 }
    });
    
    const page = await context.newPage();
    const { username, password } = req.body;
    let authHeaders = null;

    // Listen for requests to grab headers
    page.on("request", request => {
        if (request.url().includes("api/")) {
            const headers = request.headers();
            // Ensure we get a header that actually has a bearer token or session cookie
            if (headers['authorization'] || headers['cookie']) {
                authHeaders = headers;
            }
        }
    });

    try {
        // 2. Go to login page and wait until it's fully loaded
        await page.goto("https://family.e-klase.lv/", { waitUntil: 'networkidle', timeout: 60000 });

        await page.fill("#username", username);
        await page.fill("#password", password);
        
        // 3. Trigger login and wait for the redirect to finish completely
        await Promise.all([
            page.click("#login-button"),
            // Wait for the URL to change to home AND for the network to stop being busy
            page.waitForURL(/\/home/i, { waitUntil: 'networkidle', timeout: 30000 })
        ]);

        console.log("Login Success! Waiting for headers...");

        // 4. Critical: Wait a moment to ensure an API call happens and we catch the headers
        // Sometimes the home page takes a second to trigger its first background fetch
        let retries = 0;
        while (!authHeaders && retries < 10) {
            await page.waitForTimeout(500); 
            retries++;
        }

        if (!authHeaders) {
            throw new Error("Could not capture authentication headers.");
        }

        // 5. Date calculation logic
        const now = new Date();
        const currentYear = now.getFullYear();
        const isSecondSemester = (now.getMonth() + 1) < 9;
        const fromDate = isSecondSemester ? `${currentYear - 1}-09-01` : `${currentYear}-09-01`;
        const toDate = isSecondSemester ? `${currentYear}-08-31` : `${currentYear + 1}-08-31`;

        // 6. Execute data fetching inside the browser context
        const data = await page.evaluate(async ({ h, from, to }) => {
            const fetchApi = async (url) => {
                const res = await fetch(url, { headers: h });
                return res.ok ? await res.json() : null;
            };

            return await Promise.all([
                fetchApi(`/api/diary?from=${from}&to=${to}`),
                fetchApi("/api/test-schedules"),
                fetchApi("/api/evaluations/summary"),
                fetchApi("/api/news"),
                fetchApi(`/api/evaluation-ratings?includeSameLevelClasses=false&datePeriodModel.from=${from}&datePeriodModel.to=${to}`)
            ]).then(([diary, tests, summary, news, evalNews]) => ({
                diary, tests, summary, news, evalNews
            }));
        }, { h: authHeaders, from: fromDate, to: toDate });

        res.json(data);

    } catch (err) {
        console.error("Error during scraping:", err.message);
        
        // Check for specific login error messages before giving up
        const errorMsg = await page.locator('#error-message').textContent().catch(() => null);
        
        res.status(err.message.includes("timeout") ? 504 : 500).json({
            success: false,
            error: errorMsg || err.message || "Internal Server Error"
        });
    } finally {
        // 7. ALWAYS close context to free up Render's limited RAM
        await context.close();
    }
});
app.listen(port, () => {
    console.log("Server running on http://localhost:" + port);
});