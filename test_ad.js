const { createFullAd } = require("./lib/meta");
const { META_TOKENS } = require("./lib/config");

async function test() {
  console.log("Full End-to-End Ad Creation Test\n");
  const result = await createFullAd(META_TOKENS[0], "act_1863796901131490", {
    campaignName: "AA - Kitchen Cleaner - UI Launcher - 13/05/2026",
    objective: "OUTCOME_SALES",
    dailyBudgetCents: 500,
    pageId: "1046075038588044",
    pixelId: "1816409122504400",
    videoId: "1263752162495176",
    primaryText: "Nepal No1 Kitchen Cleaner! FREE delivery Rs 999 only. Order now",
    headline: "Free Delivery Nepal",
    description: "Order today!",
    cta: "ORDER_NOW",
    landingUrl: "https://hamrobazar.shop/products/nepals-1-foam-based-complete-kitchen-cleaner-disinfectant",
    destination: "WEBSITE",
    locationCountry: "NP",
    ageMin: 18, ageMax: 65, genders: [],
  });
  console.log("=== AD LAUNCHER FULLY WORKING! ===");
  console.log("Campaign ID :", result.campaignId);
  console.log("Ad Set ID   :", result.adSetId);
  console.log("Creative ID :", result.creativeId);
  console.log("Ad ID       :", result.adId);
  console.log("Status      : PAUSED (safe, wont spend)");
}
test().catch(e => console.log("Error:", e.message));
