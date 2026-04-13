// 1. CONDITIONAL BROWSER PATH (Fixes the "Executable doesn't exist" on your PC)
if (process.env.RENDER) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = '/ms-playwright';
}

const express = require("express");
const { chromium } = require("playwright");
const path = require("path");

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(express.static(__dirname));

let browser;

// 2. STEALTH BROWSER LAUNCH
async function start() {
    browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled' // Hides bot status
        ]
    });
    console.log("Browser launched successfully");
}
start();

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/main.html", (req, res) => {
    res.sendFile(path.join(__dirname, "main.html"));
});

// 3. SECURE LOGIN + DATA FETCH
app.post("/data", async (req, res) => {
    const { username, password } = req.body;
    
    // Create context with a real-world Identity
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 }
    });

    const page = await context.newPage();
    let authHeaders = null;

    // 4. HEADER SNIFFER (Waits specifically for a valid session header)
    page.on("request", request => {
        const url = request.url();
        if (url.includes("api/diary") || url.includes("api/news")) {
            const headers = request.headers();
            if (headers['authorization'] || headers['cookie']) {
                authHeaders = headers;
            }
        }
    });

    try {
        console.log(`Attempting login for: ${username}`);
        await page.goto("https://family.e-klase.lv/", { waitUntil: 'networkidle', timeout: 60000 });

        await page.fill("#username", username);
        await page.fill("#password", password);
        
        // 5. CLICK AND WAIT FOR NAVIGATION
        await Promise.all([
            page.click("#login-button"),
            page.waitForURL(/\/home/i, { waitUntil: 'networkidle', timeout: 45000 })
        ]);

        // 6. WAIT FOR CONTENT TO ACTUALLY APPEAR (Prevents empty JSON)
        // We wait for the diary container to exist in the DOM
        await page.waitForSelector('.lessons-table, .diary-container, #diary-container', { timeout: 15000 }).catch(() => {
            console.log("Warning: Specific selector not found, proceeding anyway...");
        });

        // Small "settle" time for Render's network
        await page.waitForTimeout(2000); 

        if (!authHeaders) {
            console.log("Headers not caught by listener, attempting manual grab...");
            // Fallback: try to trigger a small fetch to force a header capture
            await page.evaluate(() => fetch('/api/news').catch(() => null));
            await page.waitForTimeout(1000);
        }

        // Date Logic
        const now = new Date();
        const currentYear = now.getFullYear();
        const isSecondSemester = (now.getMonth() + 1) < 9;
        const fromDate = isSecondSemester ? `${currentYear - 1}-09-01` : `${currentYear}-09-01`;
        const toDate = isSecondSemester ? `${currentYear}-08-31` : `${currentYear + 1}-08-31`;

        // 7. INTERNAL DATA FETCHING
        const data = await page.evaluate(async ({ h, from, to }) => {
            const fetchApi = async (url) => {
                try {
                    const res = await fetch(url, { headers: h });
                    return res.ok ? await res.json() : null;
                } catch (e) { return null; }
            };

            const [diary, tests, summary, news, evalNews] = await Promise.all([
                fetchApi(`/api/diary?from=${from}&to=${to}`),
                fetchApi("/api/test-schedules"),
                fetchApi("/api/evaluations/summary"),
                fetchApi("/api/news"),
                fetchApi(`/api/evaluation-ratings?includeSameLevelClasses=false&datePeriodModel.from=${from}&datePeriodModel.to=${to}`)
            ]);

            return { diary, tests, summary, news, evalNews };
        }, { h: authHeaders, from: fromDate, to: toDate });

        console.log("Data successfully fetched!");
        res.json(data);

    } catch (err) {
        console.error("Scraping Error:", err.message);
        
        // Check if the page is showing an actual login error
        const errorText = await page.locator('#error-message').textContent().catch(() => null);
        
        res.status(500).json({
            success: false,
            error: errorText?.trim() || "Login timed out or E-klase blocked the request."
        });
    } finally {
        // 8. CRITICAL: Clean up memory
        await context.close();
    }
});

app.listen(5000, "0.0.0.0", () => {
  console.log("Server running");
});