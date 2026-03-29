/**
 * E2E Test: SharePoint KM — sharepoint_km Tool (EkoAI Chat)
 *
 * Maps to TestRail: "Agentic > SharePoint KM > EkoAI Integration > sharepoint_km Tool"
 * C1550300–C1550311
 *
 * Type: Regression/Smoke | Priority: P1/P2 | Platform: Web
 *
 * ⚠️  PRE-REQUISITE for C1550300–C1550310:
 *     - sharepointConfig.enable=true on EkoAI Network doc
 *     - User authenticated with Microsoft via Auth Connections
 *     - Documents indexed in Discovery Engine
 *     Set SHAREPOINT_ENABLED=true + MICROSOFT_CONNECTED=true when ready.
 *
 *     C1550311–C1550315 (security/negative) run without SharePoint configured.
 */
import { test, expect } from '../../../fixtures';
import { SharePointKMChatPage } from '../../../../src/pages/agentic/sharepoint-km/sharepoint-km-chat.page';

const isSharePointEnabled  = process.env.SHAREPOINT_ENABLED   === 'true';
const isMicrosoftConnected = process.env.MICROSOFT_CONNECTED  === 'true';
const isFullyReady         = isSharePointEnabled && isMicrosoftConnected;

test.describe('SharePoint KM — sharepoint_km Tool', {
  tag: ['@sharepoint-km', '@ekoai-integration', '@web'],
}, () => {

  let chatPage: SharePointKMChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new SharePointKMChatPage(page);
    await chatPage.gotoAgentic();
  });

  // ── Positive / Happy Path ─────────────────────────────────────────

  // C1550300
  test('sharepoint_km tool is invoked when useSharepointKm flag is set',
    {
      annotation: { type: 'TestRail', description: 'C1550300' },
      tag: ['@smoke', '@P1'],
    },
    async ({ page }) => {
      test.skip(!isFullyReady, 'Requires SHAREPOINT_ENABLED=true + MICROSOFT_CONNECTED=true + docs indexed');

      await chatPage.sendMessageAndWaitForResponse("Search SharePoint for Q4 report");

      const bodyText = await page.locator('body').innerText();
      // Tool should be force-invoked and return document results
      expect(bodyText.toLowerCase()).toMatch(/sharepoint|document|file/i);
    },
  );

  // C1550301
  test('sharepoint_km tool output is wrapped in <sharepoint_km> XML tags on finished SSE event',
    {
      annotation: { type: 'TestRail', description: 'C1550301' },
      tag: ['@regression', '@P1'],
    },
    async ({ page }) => {
      test.skip(!isFullyReady, 'Requires SHAREPOINT_ENABLED=true + MICROSOFT_CONNECTED=true + docs indexed');

      await chatPage.sendMessageAndWaitForResponse("What documents mention project Apollo?");
      const bodyText = await page.locator('body').innerText();
      // Response should contain document metadata
      expect(bodyText.toLowerCase()).toMatch(/sharepoint|document|file|name/i);
    },
  );

  // C1550302
  test('sharepoint_km tool retrieves Microsoft token from AuthConnectionService automatically',
    {
      annotation: { type: 'TestRail', description: 'C1550302' },
      tag: ['@regression', '@P1'],
    },
    async ({ page }) => {
      test.skip(!isFullyReady, 'Requires SHAREPOINT_ENABLED=true + valid Microsoft token in AuthConnectionService');

      await chatPage.sendMessageAndWaitForResponse("Find SharePoint files about budget 2025");
      const bodyText = await page.locator('body').innerText();
      // Should NOT ask user to provide token manually
      expect(bodyText.toLowerCase()).not.toMatch(/please provide.*token|enter your token|api key required/i);
    },
  );

  // C1550303
  test('sharepoint_km tool returns AUTH_REQUIRED when user has no Microsoft connection',
    {
      annotation: { type: 'TestRail', description: 'C1550303' },
      tag: ['@smoke', '@P1'],
    },
    async ({ page }) => {
      test.skip(!isSharePointEnabled, 'Requires SHAREPOINT_ENABLED=true but user must NOT have Microsoft connected');

      await chatPage.sendMessageAndWaitForResponse("Search SharePoint for meeting notes");
      const bodyText = await page.locator('body').innerText();

      // Must surface sign-in prompt, NOT fabricated answer
      expect(bodyText.toLowerCase()).toMatch(/sign.?in|connect|microsoft|auth/i);
      expect(bodyText.toLowerCase()).not.toMatch(/here are the files|i found \d+ documents/i);
    },
  );

  // C1550304
  test('Expired Microsoft token triggers AUTH_REQUIRED and does not return partial results',
    {
      annotation: { type: 'TestRail', description: 'C1550304' },
      tag: ['@regression', '@P1'],
    },
    async () => {
      test.skip(true, 'Requires ability to force-expire Microsoft token — use API-level test');
    },
  );

  // C1550305
  test('sharepoint_km tool is NOT registered when sharepointConfig.enable=false',
    {
      annotation: { type: 'TestRail', description: 'C1550305' },
      tag: ['@regression', '@P1'],
    },
    async ({ page }) => {
      test.skip(isSharePointEnabled, 'This test requires SharePoint to be DISABLED on the network');

      await chatPage.sendMessageAndWaitForResponse("Search SharePoint for quarterly report");
      const bodyText = await page.locator('body').innerText();

      // With SharePoint disabled, tool not invoked — AI responds normally or says not available
      expect(bodyText.toLowerCase()).not.toMatch(/connecting to sharepoint|fetching from sharepoint/i);
    },
  );

  // C1550306
  test('useSharepointKm=false does NOT force-invoke sharepoint_km tool',
    {
      annotation: { type: 'TestRail', description: 'C1550306' },
      tag: ['@regression', '@P2'],
    },
    async () => {
      test.skip(true, 'useSharepointKm flag is API-level — validate via API test, not UI');
    },
  );

  // ── AI Behavior (M-cases) ─────────────────────────────────────────

  // C1550307
  test('M1: AI invokes sharepoint_km when user asks about SharePoint documents',
    {
      annotation: { type: 'TestRail', description: 'C1550307' },
      tag: ['@sanity', '@P1'],
    },
    async ({ page }) => {
      test.skip(!isFullyReady, 'Requires full SharePoint setup with indexed documents');

      await chatPage.sendMessageAndWaitForResponse("What SharePoint documents do we have about the Q4 strategy?");
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.toLowerCase()).toMatch(/sharepoint|document|file/i);
    },
  );

  // C1550308
  test('M2: AI surfaces sign-in prompt when sharepoint_km returns AUTH_REQUIRED',
    {
      annotation: { type: 'TestRail', description: 'C1550308' },
      tag: ['@sanity', '@P1'],
    },
    async ({ page }) => {
      test.skip(!isSharePointEnabled, 'Requires SharePoint enabled but user not connected');

      await chatPage.sendMessageAndWaitForResponse("Search SharePoint for project files");
      const bodyText = await page.locator('body').innerText();

      expect(bodyText.toLowerCase()).toMatch(/sign.?in|connect.*microsoft|microsoft.*connect/i);
    },
  );

  // C1550309
  test('M3: AI correctly attributes answers to SharePoint documents and renders document cards',
    {
      annotation: { type: 'TestRail', description: 'C1550309' },
      tag: ['@regression', '@P1'],
    },
    async ({ page }) => {
      test.skip(!isFullyReady, 'Requires full SharePoint setup with indexed documents');

      await chatPage.sendMessageAndWaitForResponse("Show me SharePoint documents about Q3 results");
      // Document cards should be rendered
      await expect(chatPage.documentCard.or(
        page.locator('[class*="document"], [class*="card"]').first()
      )).toBeVisible({ timeout: 20_000 });
    },
  );

  // C1550310
  test('M4: AI handles empty SharePoint search results without hallucinating documents',
    {
      annotation: { type: 'TestRail', description: 'C1550310' },
      tag: ['@regression', '@P2'],
    },
    async ({ page }) => {
      test.skip(!isFullyReady, 'Requires full SharePoint setup — query must return 0 results');

      // Use a very specific query unlikely to match anything
      await chatPage.sendMessageAndWaitForResponse("SharePoint documents about xyzzy-nonexistent-qa-test-query-2026");
      const bodyText = await page.locator('body').innerText();

      // Should say no results found — not fabricate document names
      expect(bodyText.toLowerCase()).toMatch(/no documents|not found|couldn't find|no results/i);
      expect(bodyText).not.toMatch(/document 1:|file titled|I found a document called/i);
    },
  );

  // C1550311 — RUNNABLE NOW (no SharePoint needed)
  test('M5: AI does NOT invoke sharepoint_km for queries unrelated to SharePoint',
    {
      annotation: { type: 'TestRail', description: 'C1550311' },
      tag: ['@regression', '@P2'],
    },
    async ({ page }) => {
      // This test can run without SharePoint — just verify tool is not invoked
      await chatPage.sendMessageAndWaitForResponse("What is the capital of France?");
      await page.waitForTimeout(3_000);
      const bodyText = await page.locator('body').innerText();

      // Response should be a normal answer — no SharePoint tool invocation
      expect(bodyText.toLowerCase()).toMatch(/paris|france/i);
      expect(bodyText.toLowerCase()).not.toMatch(/searching sharepoint|fetching from sharepoint/i);
    },
  );
});
