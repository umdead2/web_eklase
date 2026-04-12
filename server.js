process.env.PLAYWRIGHT_BROWSERS_PATH = '/ms-playwright';

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
        headless: true, // Crucial for server environments
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage' // Helps with memory limits on Render
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
    const context = await browser.newContext();
    const page = await context.newPage();

    const { username, password } = req.body;
    let authHeaders = null;

    page.on("request", request => {
        if (request.url().includes("api/")) {
            authHeaders = request.headers();
        }
    });

    try {
        await page.goto("https://family.e-klase.lv/");

        await page.fill("#username", username);
        await page.fill("#password", password);
        await page.click("#login-button");
        try {
            // 1. Give it a few seconds to successfully redirect
            await page.waitForURL(/\/home/i, { timeout: 5000, waitUntil: 'domcontentloaded' });
            
            // Continue with data fetching...
            console.log("Login Success!");
            
        } catch (e) {
            // 2. If we DIDN'T redirect, check if an error message is visible
            // We use a locator here with a short timeout
            const errorLocator = page.locator('#error-message');
            
            // Check if the element exists and has text
            const messageText = await errorLocator.textContent().catch(() => null);

            if (messageText && messageText.trim().length > 0) {
                console.log("Login failed:", messageText);
                await context.close();
                return res.status(401).json({ 
                    success: false, 
                    error: messageText.trim() 
                });
            }

            // 3. If no error message was found but we still didn't redirect
            await context.close();
            return res.status(500).json({ error: "Login timed out or failed." });
        }

        await page.waitForURL(/\/home/i, { waitUntil: "networkidle" });

        const now = new Date();
        const currentYear = now.getFullYear();
        const isSecondSemester = (now.getMonth() + 1) < 9;

        const fromDate = isSecondSemester
            ? `${currentYear - 1}-09-01`
            : `${currentYear}-09-01`;

        const toDate = isSecondSemester
            ? `${currentYear}-08-31`
            : `${currentYear + 1}-08-31`;

        let data = null;

        if (authHeaders) {
            data = await page.evaluate(async ({ h, from, to }) => {
                const [dRes, tRes, sRes, nRes, enRes] = await Promise.all([
                    fetch(`/api/diary?from=${from}&to=${to}`, { headers: h }),
                    fetch("/api/test-schedules", { headers: h }),
                    fetch("/api/evaluations/summary", { headers: h }),
                    fetch("/api/news", { headers: h }),
                    fetch(`/api/evaluation-ratings?includeSameLevelClasses=false&datePeriodModel.from=${from}&datePeriodModel.to=${to}`, { headers: h }),
                ]);

                return {
                    diary: dRes.ok ? await dRes.json() : null,
                    tests: tRes.ok ? await tRes.json() : null,
                    summary: sRes.ok ? await sRes.json() : null,
                    news: nRes.ok ? await nRes.json() : null,
                    evalNews: enRes.ok ? await enRes.json() : null
                };
            }, { h: authHeaders, from: fromDate, to: toDate });
        }

        await context.close();

        res.json(data);

    } catch (err) {
        console.error(err);
        res.status(500).send("Login failed");
    }
});

app.listen(port, () => {
    console.log("Server running on http://localhost:" + port);
});