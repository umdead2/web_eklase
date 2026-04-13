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
            '--disable-blink-features=AutomationControlled'
        ]
    });

    console.log("Browser launched successfully");
}

start();

// =========================
// ROUTES
// =========================
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/main.html", (req, res) => {
    res.sendFile(path.join(__dirname, "main.html"));
});

// =========================
// LOGIN + DATA
// =========================
app.post("/data", async (req, res) => {
    const { username, password } = req.body;

    const context = await browser.newContext({
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
        viewport: { width: 1280, height: 720 }
    });

    const page = await context.newPage();

    let authHeaders = null;

    // =========================
    // HEADER SNIFFER (KEEP)
    // =========================
    page.on("request", (request) => {
        const url = request.url();

        if (url.includes("/api/diary") || url.includes("/api/news")) {
            const headers = request.headers();

            if (!authHeaders && (headers.cookie || headers.authorization)) {
                authHeaders = headers;
            }
        }
    });

    try {
        console.log(`Logging in: ${username}`);

        // =========================
        // LOGIN (FAST)
        // =========================
        await page.goto("https://family.e-klase.lv/", {
            waitUntil: "domcontentloaded"
        });

        await page.waitForSelector("#username", { timeout: 30000 });

        await page.fill("#username", username);
        await page.fill("#password", password);

        await page.click("#login-button");

        // =========================
        // FAST STABILIZATION WAIT (IMPORTANT)
        // =========================
        await Promise.race([
            page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => {}),
            page.waitForTimeout(1500)
        ]);

        // small buffer ONLY (no heavy waits)
        await page.waitForTimeout(800);

        // =========================
        // FORCE API TRIGGER (LIGHT)
        // =========================
        await page.evaluate(() => {
            fetch("/api/news").catch(() => {});
        }).catch(() => {});

        // wait for sniffing only
        await page.waitForTimeout(500);

        if (!authHeaders) {
            await page.waitForTimeout(1200);

            if (!authHeaders) {
                throw new Error("Failed to capture auth headers");
            }
        }

        console.log("Auth headers captured");

        // =========================
        // DATE LOGIC
        // =========================
        const now = new Date();
        const year = now.getFullYear();
        const isSecondSemester = (now.getMonth() + 1) < 9;

        const fromDate = isSecondSemester
            ? `${year - 1}-09-01`
            : `${year}-09-01`;

        const toDate = isSecondSemester
            ? `${year}-08-31`
            : `${year + 1}-08-31`;

        // =========================
        // DATA FETCH (INSIDE BROWSER SESSION)
        // =========================
        const data = await page.evaluate(async ({ h, from, to }) => {

            const fetchApi = async (url) => {
                try {
                    const res = await fetch(url, { headers: h });
                    return res.ok ? await res.json() : null;
                } catch {
                    return null;
                }
            };

            const [diary, tests, summary, news, evalNews] = await Promise.all([
                fetchApi(`/api/diary?from=${from}&to=${to}`),
                fetchApi(`/api/test-schedules`),
                fetchApi(`/api/evaluations/summary`),
                fetchApi(`/api/news`),
                fetchApi(`/api/evaluation-ratings?includeSameLevelClasses=false&datePeriodModel.from=${from}&datePeriodModel.to=${to}`)
            ]);

            return { diary, tests, summary, news, evalNews };

        }, { h: authHeaders, from: fromDate, to: toDate });

        console.log("Data successfully fetched!");

        res.json({
            success: true,
            ...data
        });

    } catch (err) {
        console.error("Scraping Error:", err.message);

        const errorText = await page.locator("#error-message").textContent().catch(() => null);

        res.status(500).json({
            success: false,
            error: errorText?.trim() || err.message
        });

    } finally {
        await context.close();
    }
});

// =========================
// START SERVER
// =========================
app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
});