const express = require("express");
const { chromium } = require("playwright");
const path = require("path");

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(express.static(__dirname));

let browser;

// =========================
// START BROWSER (FAST)
// =========================
async function start() {
    browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
        ]
    });

    console.log("Browser launched successfully");
}

// =========================
// ROUTES
// =========================
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "login/login.html"));
});

app.get("/main", (req, res) => {
    res.sendFile(path.join(__dirname, "main/main.html"));
});

// =========================
// LOGIN + DATA
// =========================
app.post("/data", async (req, res) => {
    const { username, password } = req.body;
    const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 720 }, // Force 1080p Desktop
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false // Essential for e-klase to not trigger mobile mode
    });

    const page = await context.newPage();

    await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());

    try {
        console.log(`Logging in: ${username}`);
        await page.goto("https://family.e-klase.lv/", { waitUntil: "commit" });

        await page.waitForSelector("#username");
        await page.fill("#username", username);
        await page.fill("#password", password);

        // Capture headers
        const authHeaders = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Auth timeout")), 15000);
            page.on('request', request => {
                const h = request.headers();
                if (h['authorization']?.startsWith('Bearer') && h['x-profile-id']) {
                    clearTimeout(timeout);
                    resolve(h);
                }
            });
            page.click("#login-button").catch(reject);
        });

        const now = new Date();
        const year = now.getFullYear();
        const fromDate = (now.getMonth() + 1) < 9 ? `${year - 1}-09-01` : `${year}-09-01`;
        const toDate = (now.getMonth() + 1) < 9 ? `${year}-08-31` : `${year + 1}-08-31`;

        const data = await page.evaluate(async ({ h, from, to }) => {
            const fetchApi = async (url) => {
                try {
                    const res = await fetch(url, { 
                        headers: {
                            ...h,
                            "Accept": "application/json",
                            "X-Requested-With": "XMLHttpRequest"
                        },
                        referrer: "https://family.e-klase.lv/home"
                    });
                    
                    if (!res.ok) {
                        console.error(`Fetch failed (${res.status}) for: ${url}`);
                        return null;
                    }
                    return await res.json();
                } catch (err) {
                    console.error(`Fetch error: ${err.message}`);
                    return null;
                }
            };

            // Promise.all returns an array of results in the order they were called
            const results = await Promise.all([
                fetchApi(`/api/diary?from=${from}&to=${to}`),
                fetchApi(`/api/test-schedules`),
                fetchApi(`/api/evaluations/summary`),
                fetchApi(`/api/news`),
                fetchApi(`/api/evaluation-ratings?includeSameLevelClasses=false&datePeriodModel.from=${from}&datePeriodModel.to=${to}`),
                fetchApi(`api/user`)
            ]);

            return {
                diary: results[0],
                tests: results[1],
                summary: results[2],
                news: results[3],
                evalNews: results[4],
                user: results[5]
            };
        }, { h: authHeaders, from: fromDate, to: toDate });

        // FIXED: You were trying to destructure 'data' as an array [diary, tests...] 
        // but 'evaluate' returns an object { diary, tests... }.
        res.json({date: now, ...data });

    } catch (err) {
        console.error("Scraping Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        await context.close();
    }
});
// =========================
// START SERVER
// =========================
(async () => {
    try {
        await start();

        app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
            console.log("Server running");
        });
    } catch (err) {
        console.error("Failed to start browser:", err);
        process.exit(1);
    }
})();