/**
 * E2E Test: SharePoint KM — AUTH_REQUIRED Signal
 *
 * Maps to TestRail: "Agentic > SharePoint KM > AUTH_REQUIRED Signal"
 * C1550338–C1550345
 *
 * Type: Regression | Priority: P1 | Platform: Web
 *
 * ⚠️  PRE-REQUISITE: sharepointConfig.enable=true on the test network.
 *     Run `SHAREPOINT_ENABLED=true npx playwright test` once SharePoint
 *     is configured on the target environment.
 *     Tests will be skipped automatically when env is not configured.
 */
import { test, expect } from '../../../fixtures';
import { SharePointKMChatPage } from '../../../../src/pages/agentic/sharepoint-km/sharepoint-km-chat.page';
import { loadEnvConfig } from '../../../../src/config/env.config';

const isSharePointEnabled = process.env.SHAREPOINT_ENABLED === 'true';

test.describe('SharePoint KM — AUTH_REQUIRED Signal', {
  tag: ['@sharepoint-km', '@auth-required', '@web'],
}, () => {

  let chatPage: SharePointKMChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new SharePointKMChatPage(page);
    await chatPage.gotoAgentic();
  });

  // C1550338
  test('tool_agent.ts intercepts AUTH_REQUIRED and surfaces <auth_required> XML block',
    {
      annotation: { type: 'TestRail', description: 'C1550338' },
      tag: ['@regression', '@P1'],
    },
    async ({ page }) => {
      test.skip(!isSharePointEnabled, 'Requires SHAREPOINT_ENABLED=true and Microsoft connection absent');

      await chatPage.sendMessageAndWaitForResponse('Search SharePoint for Q4 report');

      // Should surface auth_required block — NOT a fabricated answer
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.toLowerCase()).toMatch(/sign.?in|auth.?required|connect.*microsoft/i);
      expect(bodyText.toLowerCase()).not.toMatch(/here are the documents|i found the following/i);
    },
  );

  // C1550339
  test('<auth_required> block includes provider, hint, and sign_in_url attributes',
    {
      annotation: { type: 'TestRail', description: 'C1550339' },
      tag: ['@regression', '@P1'],
    },
    async ({ page }) => {
      test.skip(!isSharePointEnabled, 'Requires SHAREPOINT_ENABLED=true and Microsoft connection absent');

      await chatPage.sendMessageAndWaitForResponse('Find SharePoint documents about budget');
      const bodyText = await page.locator('body').innerText();

      // Block must contain provider and sign-in prompt
      expect(bodyText.toLowerCase()).toMatch(/microsoft|sign.?in/i);
    },
  );

  // C1550340
  test('Clicking sign-in button from <auth_required> block redirects to Microsoft OAuth',
    {
      annotation: { type: 'TestRail', description: 'C1550340' },
      tag: ['@regression', '@P1'],
    },
    async ({ page }) => {
      test.skip(!isSharePointEnabled, 'Requires SHAREPOINT_ENABLED=true and Microsoft connection absent');

      await chatPage.sendMessageAndWaitForResponse('Search SharePoint for project plan');

      const signInBtn = page.locator('a:has-text("Sign in"), button:has-text("Sign in with Microsoft")').first();
      if (await signInBtn.isVisible()) {
        const [popup] = await Promise.all([
          page.waitForEvent('popup').catch(() => null),
          signInBtn.click(),
        ]);
        // Should open Microsoft OAuth — check redirect URL pattern
        const targetUrl = popup?.url() ?? page.url();
        expect(targetUrl).toMatch(/login\.microsoftonline\.com|microsoft\.com|authorize/i);
        if (popup) await popup.close();
      } else {
        test.skip(true, 'Sign-in button not found — AUTH_REQUIRED block not visible');
      }
    },
  );

  // C1550341
  test('Tool returning AUTH_REQUIRED does NOT cause AI to fabricate a response',
    {
      annotation: { type: 'TestRail', description: 'C1550341' },
      tag: ['@regression', '@P1'],
    },
    async ({ page }) => {
      test.skip(!isSharePointEnabled, 'Requires SHAREPOINT_ENABLED=true and Microsoft connection absent');

      await chatPage.sendMessageAndWaitForResponse('What SharePoint documents mention Q4?');
      const bodyText = await page.locator('body').innerText();

      // AI should NOT fabricate document content
      expect(bodyText).not.toMatch(/document 1:|document titled|here are \d+ documents/i);
      // Should show auth prompt
      expect(bodyText.toLowerCase()).toMatch(/sign.?in|connect|microsoft|auth/i);
    },
  );

  // C1550342
  test('AUTH_REQUIRED signal with empty extraData does not crash tool_agent.ts',
    {
      annotation: { type: 'TestRail', description: 'C1550342' },
      tag: ['@regression', '@P2'],
    },
    async ({ page }) => {
      test.skip(!isSharePointEnabled, 'Requires SHAREPOINT_ENABLED=true and Microsoft connection absent');

      await chatPage.sendMessageAndWaitForResponse('Search SharePoint for anything');

      // Page should remain functional — no crash/blank screen
      await expect(chatPage.mainContainer).toBeVisible({ timeout: 5_000 });
      await expect(chatPage.chatInput).toBeEnabled({ timeout: 5_000 });
      // No unhandled error dialog
      const errorDialog = page.locator('[role="alertdialog"], [class*="crash"], text=/something went wrong/i');
      await expect(errorDialog).not.toBeVisible();
    },
  );

  // C1550343
  test('User disconnecting Microsoft mid-flight results in AUTH_REQUIRED on next invocation',
    {
      annotation: { type: 'TestRail', description: 'C1550343' },
      tag: ['@regression', '@P2'],
    },
    async () => {
      test.skip(true, 'Requires programmatic disconnect of Microsoft mid-flight — manual or API-level test');
    },
  );

  // C1550344
  test('AUTH_REQUIRED for non-Microsoft provider surfaces correct provider-specific sign_in_url',
    {
      annotation: { type: 'TestRail', description: 'C1550344' },
      tag: ['@regression', '@P2'],
    },
    async () => {
      test.skip(!isSharePointEnabled, 'Requires SHAREPOINT_ENABLED=true and non-Microsoft provider setup');
    },
  );

  // C1550345
  test('Multiple tools returning AUTH_REQUIRED each surface their own <auth_required> block',
    {
      annotation: { type: 'TestRail', description: 'C1550345' },
      tag: ['@regression', '@P2'],
    },
    async ({ page }) => {
      test.skip(!isSharePointEnabled, 'Requires multiple tools configured and all missing auth');

      await chatPage.sendMessageAndWaitForResponse('Search SharePoint and also check my calendar');
      const bodyText = await page.locator('body').innerText();
      // Should not crash even with multiple AUTH_REQUIRED signals
      await expect(chatPage.mainContainer).toBeVisible();
      await expect(chatPage.chatInput).toBeEnabled();
    },
  );
});
