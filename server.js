if (process.env.RENDER) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = '/ms-playwright';
}

if (process.env.DOCKER || !process.env.RENDER) {
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
let browserLaunchPromise = null;

// =========================
// BROWSER LAUNCH WITH RETRY
// =========================
async function launchBrowser() {
    if (browser) return browser;
    
    if (browserLaunchPromise) return browserLaunchPromise;

    browserLaunchPromise = (async () => {
        try {
            console.log("🚀 Launching browser...");
            browser = await chromium.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-gpu',
                    '--disable-web-resources',
                    '--no-default-browser-check',
                    '--no-pings'
                ]
            });
            
            console.log("✅ Browser launched successfully");
            
            // Monitor browser crash
            browser.on('disconnected', () => {
                console.warn("⚠️ Browser disconnected! Will restart on next request.");
                browser = null;
                browserLaunchPromise = null;
            });
            
            return browser;
        } catch (err) {
            console.error("❌ Browser launch failed:", err.message);
            browserLaunchPromise = null;
            throw err;
        }
    })();

    return browserLaunchPromise;
}

// Initial launch
launchBrowser().catch(err => {
    console.error("Initial browser launch failed:", err.message);
    process.exit(1);
});

// =========================
// ROUTES
// =========================
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/main.html", (req, res) => {
    res.sendFile(path.join(__dirname, "main.html"));
});

// Health check
app.get("/health", async (req, res) => {
    try {
        const b = await launchBrowser();
        res.json({ status: "ok", browser: !!b });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

// =========================
// LOGIN + DATA
// =========================
app.post("/data", async (req, res) => {
    const { username, password } = req.body;
    let context = null;
    let page = null;

    try {
        // Ensure browser is running
        const b = await launchBrowser();
        if (!b) throw new Error("Browser failed to launch");

        console.log(`\n📝 [${new Date().toISOString()}] Login attempt: ${username}`);

        context = await b.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
            viewport: { width: 1280, height: 720 }
        });

        page = await context.newPage();
        let authHeaders = null;

        // =========================
        // CAPTURE AUTH HEADERS
        // =========================
        page.on("request", (request) => {
            const url = request.url();
            if (url.includes("/api/diary") || url.includes("/api/news")) {
                const headers = request.headers();
                if (!authHeaders && (headers.cookie || headers.authorization)) {
                    authHeaders = headers;
                    console.log("✅ Auth headers captured");
                }
            }
        });

        // =========================
        // NAVIGATE TO LOGIN PAGE
        // =========================
        try {
            await page.goto("https://family.e-klase.lv/", {
                waitUntil: "domcontentloaded",
                timeout: 50000
            });
            console.log("✅ Page loaded");
        } catch (err) {
            throw new Error(`Failed to load login page: ${err.message}`);
        }

        // =========================
        // WAIT FOR FORM
        // =========================
        try {
            await page.waitForSelector("#username", { timeout: 50000 });
            console.log("✅ Login form found");
        } catch (err) {
            const pageTitle = await page.title().catch(() => "unknown");
            const pageUrl = page.url();
            console.error(`❌ Form not found. Title: ${pageTitle}, URL: ${pageUrl}`);
            throw new Error("Login form elements not found on page");
        }

        // =========================
        // FILL & SUBMIT FORM
        // =========================
        await page.fill("#username", username);
        await page.fill("#password", password);
        console.log("✅ Credentials entered");

        await page.click("#login-button");
        console.log("✅ Login button clicked");

        // =========================
        // WAIT FOR REDIRECT
        // =========================
        try {
            await Promise.race([
                page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 40000 }),
                page.waitForTimeout(3000)
            ]);
            console.log("✅ Navigation complete");
        } catch (err) {
            console.warn("⚠️ Navigation timeout (may be normal)");
        }

        await page.waitForTimeout(1500);

        // =========================
        // TRIGGER API CALLS
        // =========================
        await page.evaluate(() => {
            fetch("/api/news").catch(() => {});
            fetch("/api/diary").catch(() => {});
        }).catch(() => {});

        await page.waitForTimeout(1000);

        // =========================
        // VERIFY AUTH HEADERS
        // =========================
        if (!authHeaders) {
            console.warn("⚠️ Auth headers not captured, waiting...");
            await page.waitForTimeout(2000);
            if (!authHeaders) {
                throw new Error("Could not capture authentication headers");
            }
        }

        // =========================
        // CALCULATE DATE RANGE
        // =========================
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        
        // School year runs Sept-Aug
        const isSecondSemester = month < 9;
        const fromDate = isSecondSemester ? `${year - 1}-09-01` : `${year}-09-01`;
        const toDate = isSecondSemester ? `${year}-08-31` : `${year + 1}-08-31`;

        console.log(`📅 Date range: ${fromDate} to ${toDate}`);

        // =========================
        // FETCH ALL DATA
        // =========================
        const data = await page.evaluate(async ({ h, from, to }) => {
            const fetchApi = async (url, label) => {
                try {
                    const res = await fetch(url, { 
                        headers: h,
                        timeout: 15000 
                    });
                    if (!res.ok) {
                        console.warn(`API ${label} returned ${res.status}`);
                        return null;
                    }
                    return await res.json();
                } catch (err) {
                    console.error(`API ${label} failed:`, err.message);
                    return null;
                }
            };

            return await Promise.all([
                fetchApi(`/api/diary?from=${from}&to=${to}`, "diary"),
                fetchApi(`/api/test-schedules`, "tests"),
                fetchApi(`/api/evaluations/summary`, "summary"),
                fetchApi(`/api/news`, "news"),
                fetchApi(`/api/evaluation-ratings?includeSameLevelClasses=false&datePeriodModel.from=${from}&datePeriodModel.to=${to}`, "evalNews")
            ]).then(([diary, tests, summary, news, evalNews]) => ({
                diary, tests, summary, news, evalNews
            }));

        }, { h: authHeaders, from: fromDate, to: toDate });

        console.log("✅ All data fetched successfully!\n");

        res.json({ success: true, ...data });

    } catch (err) {
        console.error(`\n❌ Error: ${err.message}\n`);

        let errorText = null;
        try {
            if (page && !page.isClosed?.()) {
                errorText = await page.locator("#error-message").textContent().catch(() => null);
            }
        } catch (e) {
            // ignore
        }

        res.status(500).json({
            success: false,
            error: errorText?.trim() || err.message
        });

    } finally {
        try {
            if (page && !page.isClosed?.()) await page.close();
            if (context) await context.close();
        } catch (err) {
            console.warn("Cleanup warning:", err.message);
        }
    }
});

// =========================
// ERROR HANDLER
// =========================
app.use((err, req, res, next) => {
    console.error("Express error:", err);
    res.status(500).json({ error: err.message });
});

// =========================
// START SERVER
// =========================
app.listen(port, "0.0.0.0", () => {
    console.log(`\n🌐 Server running on http://0.0.0.0:${port}\n`);
});