import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://127.0.0.1:8100/index.php";
let failures = 0;
function check(label, cond) {
  console.log((cond ? "PASS" : "FAIL") + ": " + label);
  if (!cond) failures++;
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

// Keep the suite hermetic and fast: the web fonts are cosmetic and come from a
// third-party CDN, so never let a test wait on them.
const _newPage = browser.newPage.bind(browser);
browser.newPage = async (...args) => {
  const pg = await _newPage(...args);
  await pg.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  return pg;
};

const TEST_PHONE = "0599990001";
const TEST_PIN = "554433";
let auctionId = null;

// ---- Admin flow: create a bidder + item + live auction from scratch ----
{
  const page = await browser.newPage();
  await page.goto(`${BASE}?page=login`);
  await page.fill('input[name=phone]', "0500000000");
  await page.fill('input[name=pin]', "998877");
  await page.click('button[type=submit]');
  await page.waitForLoadState();
  check("admin login lands on admin dashboard", page.url().includes("page=admin"));

  // create bidder
  await page.goto(`${BASE}?page=admin_user_new`);
  await page.fill('input[name=real_name]', "مستخدم بي اتش بي");
  await page.fill('input[name=phone]', TEST_PHONE);
  await page.fill('input[name=alias]', "مزايد بي اتش بي");
  await page.fill('input[name=pin]', TEST_PIN);
  await page.locator("main form button[type=submit]").click();
  await page.waitForLoadState();
  check("create user redirects to users list", page.url().includes("page=admin_users"));
  check("new user appears in list", (await page.locator("body").innerText()).includes("مزايد بي اتش بي"));

  // toggle status twice to leave it active but confirm the control works
  const row = page.locator("tr", { hasText: "مزايد بي اتش بي" });
  const toggleBtn = row.locator("button");
  const before = await toggleBtn.innerText();
  await toggleBtn.click();
  await page.waitForLoadState();
  const after = await page.locator("tr", { hasText: "مزايد بي اتش بي" }).locator("button").innerText();
  check("toggle changed status label", before !== after);
  await page.locator("tr", { hasText: "مزايد بي اتش بي" }).locator("button").click();
  await page.waitForLoadState();

  // create item with image
  await page.goto(`${BASE}?page=admin_item_new`);
  await page.fill('input[name=title]', "قطعة بي اتش بي");
  await page.fill('textarea[name=description]', "وصف تجريبي");
  const testImg = "/tmp/test-upload.svg";
  fs.writeFileSync(testImg, `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#333"/></svg>`);
  await page.setInputFiles('input[name="images[]"]', testImg);
  await page.locator("main form button[type=submit]").click();
  await page.waitForLoadState();
  check("create item redirects to edit page", page.url().includes("page=admin_item_edit"));
  const itemId = new URL(page.url()).searchParams.get("id");
  check("uploaded image shows in edit page", await page.locator(".thumbs img").count() > 0);

  // the image must actually be served (this is the "pics not visible" fix)
  const imgSrc = await page.locator(".thumbs img").first().getAttribute("src");
  check("image is served via media route", imgSrc && imgSrc.includes("media="));
  const imgResp = await page.request.get(new URL(imgSrc, page.url()).href);
  const ctype = (imgResp.headers()["content-type"] || "");
  check("image loads (200 + image content-type)", imgResp.ok() && ctype.startsWith("image/"));

  // create auction for the item
  await page.goto(`${BASE}?page=admin_auction_new&item_id=${itemId}`);
  const now = new Date(Date.now() - 60000);
  const end = new Date(Date.now() + 2 * 3600000);
  // The app treats datetime-local values as Riyadh wall-clock time (matching a
  // Riyadh admin's browser), so emit them in Asia/Riyadh regardless of the CI TZ.
  function toLocal(d) {
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
    return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
  }
  await page.fill('input[name=opening_price]', "1000");
  await page.fill('input[name=bid_increment]', "100");
  await page.fill('input[name=start_at]', toLocal(now));
  await page.fill('input[name=end_at]', toLocal(end));
  await page.locator("main form button[type=submit]").click();
  await page.waitForLoadState();
  check("create auction redirects to auction edit", page.url().includes("page=admin_auction_edit"));
  auctionId = new URL(page.url()).searchParams.get("id");

  // publish it
  const publishBtn = page.locator("button", { hasText: "نشر المزاد" });
  if (await publishBtn.count() > 0) {
    await publishBtn.click();
    await page.waitForLoadState();
  }
  check("auction now shows LIVE badge", (await page.locator("main .badge").first().innerText()).includes("قائم"));

  // suspend / resume
  const suspendBtn = page.locator("button", { hasText: "تعليق المزاد" });
  if (await suspendBtn.count() > 0) {
    await suspendBtn.click();
    await page.waitForLoadState();
    check("auction suspended", (await page.locator("body").innerText()).includes("المزاد معلّق"));
    const resumeBtn = page.locator("button", { hasText: "استئناف المزاد" });
    await resumeBtn.click();
    await page.waitForLoadState();
    check("auction resumed", !(await page.locator("body").innerText()).includes("المزاد معلّق"));
  } else {
    check("suspend button present", false);
  }

  await page.goto(`${BASE}?page=admin_results`);
  check("results page loads", (await page.locator("body").innerText()).includes("لوحة النتائج"));

  await page.goto(`${BASE}?page=admin_audit`);
  const auditText = await page.locator("body").innerText();
  check("audit page loads", auditText.includes("سجل العمليات"));
  check("audit has entries", auditText.includes("auction_created") || auditText.includes("user_created"));

  await page.close();
}

// ---- Bidder flow: log in as the user just created and bid on it ----
{
  const page = await browser.newPage();
  await page.goto(`${BASE}?page=login`);
  await page.fill('input[name=phone]', TEST_PHONE);
  await page.fill('input[name=pin]', TEST_PIN);
  await page.click('button[type=submit]');
  await page.waitForLoadState();
  check("bidder login lands on home", page.url().includes("index.php") && !page.url().includes("page=login"));

  await page.goto(`${BASE}?page=item&id=${auctionId}`);
  check("item detail page loaded", (await page.locator("body").innerText()).includes("سجل المزايدات"));

  page.on("dialog", (d) => d.accept());

  // Match the rules gate by its destination, not its wording, so copy changes
  // don't silently skip the accept step and leave no bid button.
  const rulesLink = page.locator('main a[href*="page=rules"]');
  if (await rulesLink.count() > 0) {
    await rulesLink.first().click();
    await page.waitForLoadState();
    await page.locator('main form button[type=submit]').click();
    await page.waitForLoadState();
  }

  const bidBtn = page.locator("#js-bid-btn");
  if (await bidBtn.count() > 0 && await bidBtn.isEnabled()) {
    const urlBefore = page.url();
    await bidBtn.click();
    // The bid posts in the background and the panel updates in place — the page
    // deliberately does NOT navigate, so the result sound can play out in full.
    await page.waitForFunction(
      () => document.getElementById("js-bid-btn") && document.getElementById("js-bid-btn").disabled,
      null, { timeout: 10000 });
    check("bidding does not reload the page", page.url() === urlBefore);
    const priceAfter = await page.locator("#js-price").innerText();
    check("price shows the bid amount", priceAfter.includes("1,000") || priceAfter.includes("1000"));
    check("now shown as top bidder", (await page.locator("body").innerText()).includes("أنت أعلى مزايد حاليًا"));
    check("bid history has an entry", (await page.locator("body").innerText()).includes("مزايد بي اتش بي"));
    check("my own bid row is highlighted", await page.locator("#js-bids-body tr.mine").count() >= 1);
  } else {
    check("bid button available", false);
  }
  await page.close();
}

// ---- Public (signed-out) flow: browsing works, bidding is gated ----
{
  const page = await browser.newPage();   // fresh context-less page = no session

  await page.goto(`${BASE}?page=home`);
  const homeText = await page.locator("body").innerText();
  check("guest can view the catalogue", !page.url().includes("page=login") && homeText.includes("المزادات القائمة"));
  check("guest sees a sign-in prompt", homeText.includes("تسجيل الدخول"));

  await page.goto(`${BASE}?page=item&id=${auctionId}`);
  const itemText = await page.locator("body").innerText();
  check("guest can view an item page", !page.url().includes("page=login") && itemText.includes("سجل المزايدات"));
  check("guest sees the live price", itemText.includes("1,000") || itemText.includes("1000"));
  check("guest is asked to sign in to bid", itemText.includes("سجّل الدخول للمزايدة"));
  check("guest has no bid form", await page.locator("#bid-form").count() === 0);

  // Live price feed must work for guests too (no 401).
  const status = await page.request.get(`${BASE}?ajax=status&id=${auctionId}`);
  const json = await status.json();
  check("guest gets the live status feed", status.ok() && json.current_price === 1000);
  check("guest feed exposes no personal state", json.is_top_bidder === false && json.has_user_bid === false);

  // Private areas stay private: the login form is rendered in place of the page,
  // so assert on what is actually shown rather than on the URL.
  await page.goto(`${BASE}?page=admin`);
  let t = await page.locator("body").innerText();
  check("guest cannot reach admin", await page.locator('input[name=pin]').count() === 1 && !t.includes("عدد القطع"));

  await page.goto(`${BASE}?page=admin_users`);
  t = await page.locator("body").innerText();
  check("guest cannot see the user list", !t.includes("الاسم الحقيقي") && !t.includes("0500000000"));

  await page.goto(`${BASE}?page=my_bids`);
  check("guest cannot reach my-bids", await page.locator('input[name=pin]').count() === 1);

  const footText = await page.locator("footer").innerText();
  check("footer credits Madar Albayan", footText.includes("مدار البيان"));
  check("footer shows a current copyright", footText.includes("جميع الحقوق محفوظة") && footText.includes(String(new Date().getFullYear())));
  check("site is branded مزاد الذكريات", (await page.locator("header .brand").innerText()).includes("مزاد الذكريات"));

  // The home hero carries the initiative's copy and the charity pledge.
  await page.goto(`${BASE}?page=home`);
  const hero = await page.locator("body").innerText();
  check("home shows the tagline", hero.includes("كل قطعةٍ تروي قصة"));
  check("charity pledge covers all proceeds", hero.includes("جميعُ صافي قيمة المزاد"));
  check("no leftover story-page links", !hero.includes("قصة المزاد"));
  await page.close();
}

// ---- Countdown must not depend on the viewer's device timezone ----
{
  // Same page, two very different device clocks. A wall-clock string would make
  // these disagree by hours; an absolute timestamp keeps them identical.
  const readCountdown = async (timezoneId) => {
    const ctx = await browser.newContext({ timezoneId });
    const pg = await ctx.newPage();
    await pg.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await pg.goto(`${BASE}?page=item&id=${auctionId}`);
    await pg.waitForTimeout(1200);
    const mins = await pg.evaluate(() => {
      const el = document.querySelector(".countdown");
      if (!el) return null;
      return Math.round((parseInt(el.dataset.end, 10) - Date.now()) / 60000);
    });
    await ctx.close();
    return mins;
  };
  const riyadh = await readCountdown("Asia/Riyadh");
  const london = await readCountdown("Europe/London");
  check("countdown is present", riyadh !== null && london !== null);
  check("countdown agrees across timezones", Math.abs(riyadh - london) <= 1);
}

// ---- Multi-image gallery ----
{
  const page = await browser.newPage();
  await page.goto(`${BASE}?page=item&id=${auctionId}`);
  const shots = await page.locator("#gal-track img").count();
  check("gallery renders the item's images", shots >= 1);
  if (shots > 1) {
    check("gallery has dots", await page.locator("#gal-dots span").count() === shots);
    await page.locator("#gal-thumbs img").nth(1).click();
    await page.waitForTimeout(800);
    check("tapping a thumbnail switches the image",
      await page.locator("#gal-thumbs img").nth(1).getAttribute("class") === "on");
  }

  // The catalogue fills its frames edge to edge; the viewer is where the whole,
  // uncropped photo is seen.
  const fit = await page.evaluate(() => ({
    gallery: getComputedStyle(document.querySelector(".gal-track img")).objectFit,
    viewer: getComputedStyle(document.getElementById("lb-img")).objectFit,
  }));
  check("gallery fills its frame edge to edge", fit.gallery === "cover");
  check("viewer shows the whole photo uncropped", fit.viewer === "contain");

  check("viewer starts closed", await page.locator("#lightbox").isHidden());
  await page.locator(".gal-track img").first().click();
  await page.waitForTimeout(400);
  check("tapping a photo opens the full-screen viewer", await page.locator("#lightbox").isVisible());
  const small = await page.locator("#lb-img").boundingBox();
  await page.locator("#lb-img").click();
  await page.waitForTimeout(400);
  const big = await page.locator("#lb-img").boundingBox();
  check("tapping inside the viewer magnifies", big.width > small.width * 1.5);
  await page.locator("#lb-close").click();
  await page.waitForTimeout(300);
  check("viewer closes", await page.locator("#lightbox").isHidden());
  await page.close();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
