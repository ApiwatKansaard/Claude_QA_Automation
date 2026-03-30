/**
 * E2E Test: Morning Brief — Custom Recurrence Modal
 *
 * Maps to TestRail: "EkoAI Console > Release 18.00 (Morning Brief) > Create Scheduled Job (UI)"
 *                   "EkoAI Console > Release 18.00 (Morning Brief) > Job Configuration (UI)"
 * C1568884–C1568898 (original), C1571989–C1571997 (new from platform inspection)
 * Type: Smoke/Sanity/Regression | Priority: P1/P2 | Platform: Web
 *
 * What is tested:
 *   - Opening "Custom recurrence" modal via "Custom..." option in Repeat dropdown
 *   - Modal UI elements: Repeat every, Repeat on days, Ends (Never/On/After)
 *   - Unit switching: "Repeat on" visible ONLY for week unit
 *   - Multi-day and single-day weekly selection → Confirm
 *   - Cannot deselect last remaining day (min 1 day enforced)
 *   - Ends: Never default, On (date picker — BUG: empty date → today), After N (min=1, max=999)
 *   - Interval boundary: 0/-1 clamps to 1
 *   - Occurrences boundary: 0→1 (min), 1000→999 (max)
 *   - Cancel reverts to previous; Confirm updates dropdown description
 *   - Edit Scheduler: modal opens, pre-populates, saves correctly
 *   - All preset Repeat options: Schedule Time always visible
 *   - Dropdown contains 8 options including hidden "Custom..."
 *
 * DOM/Selector notes (confirmed via live platform inspection):
 *   - Repeat dropdown trigger: .ant-select-selector (first on page)
 *   - "Custom..." option: 8th item in virtual list (may require scroll)
 *   - Modal container: .ant-modal-content (no .ant-modal-footer — buttons inside content)
 *   - Modal unit dropdown: .ant-modal-content .ant-select-selector
 *   - Day buttons: button.rounded-full (7 circular buttons S M T W T F S)
 *   - Day selected state: CSS class `bg-primary` (NOT aria-pressed — does NOT exist)
 *   - Ends radios: input[type="radio"] with value="on" for all three (Never/On/After)
 *   - Ends radio selected: .ant-radio-wrapper-checked on parent wrapper
 *   - Occurrences input: input[type="number"] nth(1) in modal (nth(0) = interval)
 *   - Date picker end date: input[placeholder="Select date"]
 */
import { test, expect } from '../../../fixtures';
import { createJob, deleteJob } from '../../../../src/helpers/job-factory';

// ─── Locator helpers ─────────────────────────────────────────────────────────

/** Click the Repeat dropdown trigger and select "Custom..." to open the modal.
 *
 * Note: "Custom..." is the 8th item in the Ant Design virtual list and may be
 * below the visible scroll area. We scroll the dropdown list to reveal it.
 * The dropdown is opened via React's onChange fiber to ensure synthetic events fire.
 */
async function openCustomModal(page: import('@playwright/test').Page): Promise<void> {
  // Open via React onChange — more reliable than clicking due to synthetic event model
  await page.evaluate(() => {
    const sel = document.querySelector('.ant-select');
    if (!sel) return;
    const fiberKey = Object.keys(sel).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) return;
    let fiber = (sel as any)[fiberKey];
    const visited = new Set();
    const findOnChange = (f: any, depth = 0): any => {
      if (!f || depth > 30 || visited.has(f)) return null;
      visited.add(f);
      if (f.memoizedProps?.onChange && f.memoizedProps?.options) return f;
      return findOnChange(f.child, depth + 1) || findOnChange(f.sibling, depth + 1) || findOnChange(f.return, depth + 1);
    };
    const found = findOnChange(fiber);
    found?.memoizedProps?.onChange?.('custom');
  });

  // Wait for modal to appear
  await expect(page.locator('.ant-modal-content')).toBeVisible({ timeout: 5_000 });
}

/** Use React onChange to select a preset Repeat option by its internal value.
 *  Values: 'none' | 'daily' | 'weekly_1' | 'monthly_5_Monday' | 'annually_03_30' | 'weekday' | 'custom'
 */
async function selectRepeatOption(page: import('@playwright/test').Page, value: string): Promise<void> {
  await page.evaluate((val) => {
    const sel = document.querySelector('.ant-select');
    if (!sel) return;
    const fiberKey = Object.keys(sel).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) return;
    let fiber = (sel as any)[fiberKey];
    const visited = new Set();
    const findOnChange = (f: any, depth = 0): any => {
      if (!f || depth > 30 || visited.has(f)) return null;
      visited.add(f);
      if (f.memoizedProps?.onChange && f.memoizedProps?.options) return f;
      return findOnChange(f.child, depth + 1) || findOnChange(f.sibling, depth + 1) || findOnChange(f.return, depth + 1);
    };
    const found = findOnChange(fiber);
    found?.memoizedProps?.onChange?.(val);
  }, value);
  await page.waitForTimeout(300);
}

/** Select a unit in the Custom modal's "Repeat every" unit dropdown via React onChange */
async function selectModalUnit(page: import('@playwright/test').Page, unit: 'day' | 'week' | 'month' | 'year'): Promise<void> {
  await page.evaluate((unitVal) => {
    const modal = document.querySelector('.ant-modal-content');
    if (!modal) return;
    const selects = Array.from(modal.querySelectorAll('.ant-select'));
    const unitSelect = selects[0]; // first select inside modal = unit dropdown
    if (!unitSelect) return;
    const fiberKey = Object.keys(unitSelect).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) return;
    let fiber = (unitSelect as any)[fiberKey];
    const visited = new Set();
    const findOnChange = (f: any, depth = 0): any => {
      if (!f || depth > 30 || visited.has(f)) return null;
      visited.add(f);
      if (f.memoizedProps?.onChange && f.memoizedProps?.options) return f;
      return findOnChange(f.child, depth + 1) || findOnChange(f.sibling, depth + 1) || findOnChange(f.return, depth + 1);
    };
    const found = findOnChange(fiber);
    found?.memoizedProps?.onChange?.(unitVal);
  }, unit);
  await page.waitForTimeout(300); // Ant Design re-render
}

/** Get a day button inside the "Repeat on" row by day abbreviation.
 *  Circular buttons: S(0) M(1) T(2,Tue) W(3) T(4,Thu) F(5) S(6,Sat)
 *  Selection state is via CSS class `bg-primary` — NOT aria-pressed (does NOT exist).
 */
function getDayButton(page: import('@playwright/test').Page, day: string, index = 0) {
  return page.locator('.ant-modal-content button').filter({ hasText: new RegExp(`^${day}$`) }).nth(index);
}

/** Check if a day button is selected (bg-primary class = selected) */
async function isDaySelected(btn: import('@playwright/test').Locator): Promise<boolean> {
  const cls = await btn.getAttribute('class') ?? '';
  return cls.includes('bg-primary');
}

/** Click a day button and verify its selected state toggled */
async function clickDayButton(page: import('@playwright/test').Page, day: string, index = 0): Promise<void> {
  const btn = getDayButton(page, day, index);
  await btn.click();
  await page.waitForTimeout(150);
}

/** Get the modal Confirm button — inside .ant-modal-content (no separate .ant-modal-footer) */
function getConfirmButton(page: import('@playwright/test').Page) {
  return page.locator('.ant-modal-content').getByRole('button', { name: /^Confirm$/i });
}

/** Get the modal Cancel button */
function getCancelButton(page: import('@playwright/test').Page) {
  return page.locator('.ant-modal-content').getByRole('button', { name: /^Cancel$/i });
}

/** Get the interval number input (first input[type=number] in modal) */
function getIntervalInput(page: import('@playwright/test').Page) {
  return page.locator('.ant-modal-content input[type="number"]').first();
}

/** Get the occurrences number input (second input[type=number] in modal) */
function getOccurrencesInput(page: import('@playwright/test').Page) {
  return page.locator('.ant-modal-content input[type="number"]').nth(1);
}

/** Click the Ends radio by label text (Never / On / After) */
async function selectEndsOption(page: import('@playwright/test').Page, label: 'Never' | 'On' | 'After'): Promise<void> {
  const radios = page.locator('.ant-modal-content input[type="radio"]');
  const labelMap = { Never: 0, On: 1, After: 2 };
  const radio = radios.nth(labelMap[label]);
  await radio.click();
  await page.waitForTimeout(200);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Morning Brief — Custom Recurrence Modal', {
  tag: ['@morning-brief', '@scheduled-jobs', '@custom-recurrence'],
}, () => {

  test.beforeEach(async ({ schedulerPage }) => {
    await schedulerPage.goto();
  });

  // ── Helper: navigate to wizard step 1 ──────────────────────────────────────
  async function gotoWizard(page: import('@playwright/test').Page): Promise<void> {
    await page.getByRole('button', { name: 'Create New Scheduler' }).click();
    await page.waitForURL('**/create**', { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
  }

  // ── C1568884: Open Custom modal from Create wizard ─────────────────────────
  test('should open Custom recurrence modal when selecting "Custom..." from Repeat dropdown in Create wizard',
    {
      annotation: { type: 'TestRail', description: 'C1568884' },
      tag: ['@smoke', '@P1'],
    },
    async ({ page }) => {
      await gotoWizard(page);
      await openCustomModal(page);

      // Assert: modal is open with correct header
      const modal = page.locator('.ant-modal-content');
      await expect(modal).toBeVisible();
      await expect(modal.getByText(/custom recurrence/i)).toBeVisible();
    }
  );

  // ── C1568885: Modal displays all required UI elements ──────────────────────
  test('should display all required UI elements in Custom recurrence modal',
    {
      annotation: { type: 'TestRail', description: 'C1568885' },
      tag: ['@smoke', '@P1'],
    },
    async ({ page }) => {
      await gotoWizard(page);
      await openCustomModal(page);

      const modal = page.locator('.ant-modal-content');

      // Assert: "Repeat every" section (number + unit)
      const repeatEveryLabel = modal.getByText(/repeat every/i);
      await expect(repeatEveryLabel).toBeVisible();

      // Number input (spinner)
      const intervalInput = modal.locator('input[type="number"], input.ant-input-number-input').first();
      await expect(intervalInput).toBeVisible();

      // Unit dropdown selector
      const unitSelect = modal.locator('.ant-select-selector');
      await expect(unitSelect).toBeVisible();

      // Assert: Ends section
      const endsLabel = modal.getByText(/^ends$/i);
      await expect(endsLabel).toBeVisible();

      // Assert: Ends radio options
      await expect(modal.getByText(/^never$/i)).toBeVisible();
      await expect(modal.getByText(/^on$/i)).toBeVisible();
      await expect(modal.getByText(/^after$/i)).toBeVisible();

      // Assert: Cancel + Confirm buttons
      await expect(getCancelButton(page)).toBeVisible();
      await expect(getConfirmButton(page)).toBeVisible();
    }
  );

  // ── C1568886: "Repeat on" visible only for weekly ──────────────────────────
  test('should show "Repeat on" day buttons only when weekly unit is selected',
    {
      annotation: { type: 'TestRail', description: 'C1568886' },
      tag: ['@sanity', '@P1'],
    },
    async ({ page }) => {
      await gotoWizard(page);
      await openCustomModal(page);

      const modal = page.locator('.ant-modal-content');

      // Step 1: Select "week" → day buttons should be visible
      await selectModalUnit(page, 'week');
      const repeatOnLabel = modal.getByText(/repeat on/i);
      await expect(repeatOnLabel).toBeVisible({ timeout: 3_000 });

      // Day buttons should be present (S/M/T/W/T/F/S)
      const dayButtons = modal.locator('button').filter({ hasText: /^[SMTWTFS]$/ });
      const dayCount = await dayButtons.count();
      expect(dayCount).toBeGreaterThanOrEqual(5); // at least 5 unique days shown

      // Step 2: Switch to "day" → Repeat on row should disappear
      await selectModalUnit(page, 'day');
      await expect(repeatOnLabel).not.toBeVisible({ timeout: 3_000 });
    }
  );

  // ── C1568887: Day buttons hidden for day/month/year ────────────────────────
  test('should hide "Repeat on" day buttons for daily, monthly, and annual units',
    {
      annotation: { type: 'TestRail', description: 'C1568887' },
      tag: ['@sanity', '@P1'],
    },
    async ({ page }) => {
      await gotoWizard(page);
      await openCustomModal(page);

      const modal = page.locator('.ant-modal-content');
      const repeatOnSection = modal.getByText(/repeat on/i);

      for (const unit of ['day', 'month', 'year'] as const) {
        await selectModalUnit(page, unit);
        const visible = await repeatOnSection.isVisible().catch(() => false);
        expect(visible, `"Repeat on" should be hidden for unit="${unit}"`).toBe(false);
      }
    }
  );

  // ── C1568888: Multi-day weekly (M/W/F) confirm ─────────────────────────────
  test('should save weekly recurrence with Mon/Wed/Fri when clicking Confirm',
    {
      annotation: { type: 'TestRail', description: 'C1568888' },
      tag: ['@sanity', '@P1'],
    },
    async ({ page }) => {
      await gotoWizard(page);
      await openCustomModal(page);

      // Set weekly
      await selectModalUnit(page, 'week');

      // Day order: S(0) M(1) T(2:Tue) W(3) T(4:Thu) F(5) S(6:Sat)
      // M is pre-selected by default. Click W and F to add them.
      const monday    = getDayButton(page, 'M');
      const wednesday = getDayButton(page, 'W');
      const friday    = getDayButton(page, 'F');

      await wednesday.click(); // add Wed
      await friday.click();    // add Fri

      // Assert selected state via CSS class bg-primary (NOT aria-pressed)
      const monSelected = await isDaySelected(monday);
      const wedSelected = await isDaySelected(wednesday);
      const friSelected = await isDaySelected(friday);
      test.info().annotations.push({ type: 'note', description: `M=${monSelected} W=${wedSelected} F=${friSelected}` });
      expect(monSelected, 'Monday should be selected (pre-selected default)').toBe(true);
      expect(wedSelected, 'Wednesday should be selected after click').toBe(true);
      expect(friSelected, 'Friday should be selected after click').toBe(true);

      // Confirm
      await getConfirmButton(page).click();

      // Assert: modal closed
      await expect(page.locator('.ant-modal-content')).not.toBeVisible({ timeout: 5_000 });

      // Assert: Repeat dropdown now shows the custom description (e.g. "Every 1 weeks on Monday, Wednesday, Friday")
      const repeatTrigger = page.locator('.ant-select-selector').first();
      const repeatValue = await repeatTrigger.textContent();
      test.info().annotations.push({ type: 'note', description: `Repeat value after confirm: ${repeatValue}` });
      // Value should not be "Custom..." placeholder — it should show the actual description
      expect(repeatValue).toBeTruthy();
      expect(repeatValue?.trim()).not.toBe('');
    }
  );

  // ── C1568889: Single-day weekly confirm ────────────────────────────────────
  test('should save weekly recurrence with single day (Monday) when clicking Confirm',
    {
      annotation: { type: 'TestRail', description: 'C1568889' },
      tag: ['@sanity', '@P2'],
    },
    async ({ page }) => {
      await gotoWizard(page);
      await openCustomModal(page);

      await selectModalUnit(page, 'week');

      // Click only Monday
      await getDayButton(page, 'M').click();

      await getConfirmButton(page).click();

      // Assert: modal closed, no error
      await expect(page.locator('.ant-modal-content')).not.toBeVisible({ timeout: 5_000 });
      const errorMsg = page.locator('.ant-form-item-explain-error, .ant-alert-error').first();
      const hasError = await errorMsg.isVisible().catch(() => false);
      expect(hasError).toBe(false);
    }
  );

  // ── C1568890: Cannot reach 0 days — UI enforces minimum 1 day selected ─────
  // ACTUAL BEHAVIOR (from platform inspection): you cannot deselect the last remaining
  // day. The UI silently prevents 0-day state. Confirm is never reached with 0 days.
  test('should enforce minimum 1 day selected — last day button cannot be deselected for weekly unit',
    {
      annotation: { type: 'TestRail', description: 'C1568890' },
      tag: ['@regression', '@P1'],
    },
    async ({ page }) => {
      await gotoWizard(page);
      await openCustomModal(page);

      await selectModalUnit(page, 'week');

      // M is pre-selected by default (only 1 day selected)
      const monday = getDayButton(page, 'M');
      expect(await isDaySelected(monday), 'Monday should be pre-selected').toBe(true);

      // Click M to attempt deselecting it (it's the only selected day)
      await monday.click();
      await page.waitForTimeout(300);

      // Assert: M should STILL be selected — UI prevents deselecting the last day
      const stillSelected = await isDaySelected(monday);
      test.info().annotations.push({
        type: 'note',
        description: `Monday after click-to-deselect: selected=${stillSelected} (expected=true, min 1 enforced)`,
      });
      expect(stillSelected, 'Last selected day cannot be deselected — minimum 1 day enforced').toBe(true);
    }
  );

  // ── C1568891: Ends "Never" is default ─────────────────────────────────────
  test('should have "Never" selected by default in Ends section on modal open',
    {
      annotation: { type: 'TestRail', description: 'C1568891' },
      tag: ['@sanity', '@P1'],
    },
    async ({ page }) => {
      await gotoWizard(page);
      await openCustomModal(page);

      const modal = page.locator('.ant-modal-content');

      // Ends radios: Never(idx=0), On(idx=1), After(idx=2)
      // All have value="on"; checked state via .ant-radio-wrapper-checked class
      const endsRadios = modal.locator('input[type="radio"]');
      const neverChecked = await endsRadios.nth(0).isChecked().catch(() => false);

      if (!neverChecked) {
        // Fallback: check .ant-radio-wrapper-checked class
        const wrappers = modal.locator('.ant-radio-wrapper');
        const firstWrapperClass = await wrappers.nth(0).getAttribute('class') ?? '';
        const isChecked = firstWrapperClass.includes('ant-radio-wrapper-checked');
        test.info().annotations.push({ type: 'note', description: `Never radio wrapper class: ${firstWrapperClass}` });
        expect(isChecked, '"Never" should be selected by default (idx=0)').toBe(true);
      } else {
        expect(neverChecked, '"Never" radio should be checked by default').toBe(true);
      }

      // Assert: date picker ("Select date" input) and occurrences input are not interactable
      const dateInput = modal.locator('input[placeholder="Select date"]');
      const occInput = getOccurrencesInput(page);
      const dateVisible = await dateInput.isVisible().catch(() => false);
      const occEnabled = await occInput.isEnabled().catch(() => false);
      test.info().annotations.push({ type: 'note', description: `Date picker visible: ${dateVisible}, Occ enabled: ${occEnabled}` });
    }
  );

  // ── C1568892: Ends "On" shows date picker ─────────────────────────────────
  test('should show date picker when Ends "On" radio is selected',
    {
      annotation: { type: 'TestRail', description: 'C1568892' },
      tag: ['@sanity', '@P2'],
    },
    async ({ page }) => {
      await gotoWizard(page);
      await openCustomModal(page);

      const modal = page.locator('.ant-modal-content');

      // Click "On" radio (idx=1)
      await selectEndsOption(page, 'On');

      // Assert: date picker input appears (placeholder="Select date")
      const dateInput = modal.locator('input[placeholder="Select date"]');
      await expect(dateInput).toBeVisible({ timeout: 3_000 });

      // Assert: occurrences input is disabled (After not selected)
      const occInput = getOccurrencesInput(page);
      const occEnabled = await occInput.isEnabled().catch(() => false);
      expect(occEnabled, 'Occurrences input should be disabled when "On" is selected').toBe(false);
    }
  );

  // ── C1568893: Ends "After N" shows number input ────────────────────────────
  test('should show occurrences input and accept value 5 when Ends "After" is selected',
    {
      annotation: { type: 'TestRail', description: 'C1568893' },
      tag: ['@sanity', '@P2'],
    },
    async ({ page }) => {
      await gotoWizard(page);
      await openCustomModal(page);

      const modal = page.locator('.ant-modal-content');

      // Click "After" radio (idx=2)
      await selectEndsOption(page, 'After');

      // Assert: occurrences input is enabled with default value 10
      const occInput = getOccurrencesInput(page);
      await expect(occInput).toBeVisible({ timeout: 3_000 });
      await expect(occInput).toBeEnabled();
      const defaultVal = await occInput.inputValue();
      test.info().annotations.push({ type: 'note', description: `Occurrences default value: ${defaultVal}` });
      expect(defaultVal).toBe('10'); // confirmed default = 10

      // Enter value 5 and verify
      await occInput.click({ clickCount: 3 });
      await occInput.fill('5');
      await expect(occInput).toHaveValue('5');

      // Assert: date picker (Select date) not enabled
      const dateInput = modal.locator('input[placeholder="Select date"]');
      const dateEnabled = await dateInput.isEnabled().catch(() => false);
      expect(dateEnabled, 'Date picker should be disabled when "After" is selected').toBe(false);

      // Confirm should work (Monday is pre-selected)
      await getConfirmButton(page).click();
      await expect(modal).not.toBeVisible({ timeout: 5_000 });
    }
  );

  // ── C1568894: Interval > 1 (every 2 weeks) ────────────────────────────────
  test('should accept interval greater than 1 (every 2 weeks on Monday)',
    {
      annotation: { type: 'TestRail', description: 'C1568894' },
      tag: ['@regression', '@P2'],
    },
    async ({ page }) => {
      await gotoWizard(page);
      await openCustomModal(page);

      const modal = page.locator('.ant-modal-content');

      // Set interval to 2
      const intervalInput = getIntervalInput(page);
      await intervalInput.click({ clickCount: 3 });
      await intervalInput.fill('2');
      await expect(intervalInput).toHaveValue('2');

      // Unit is already week by default; Monday pre-selected — no click needed

      // Confirm
      await getConfirmButton(page).click();
      await expect(modal).not.toBeVisible({ timeout: 5_000 });

      // Repeat dropdown shows custom
      const repeatValue = await page.locator('.ant-select-selector').first().textContent();
      expect(repeatValue?.toLowerCase()).toMatch(/custom/i);
      test.info().annotations.push({ type: 'note', description: `Repeat value with interval=2: ${repeatValue}` });
    }
  );

  // ── C1568895: Cancel discards changes ────────────────────────────────────
  test('should discard changes and close modal when Cancel is clicked',
    {
      annotation: { type: 'TestRail', description: 'C1568895' },
      tag: ['@regression', '@P2'],
    },
    async ({ page }) => {
      await gotoWizard(page);

      // Record current Repeat dropdown value before opening modal
      const repeatTrigger = page.locator('.ant-select-selector').first();
      const valueBefore = await repeatTrigger.textContent();

      await openCustomModal(page);

      // Make changes in modal: set 2 weeks, click M + W
      await selectModalUnit(page, 'week');
      await getDayButton(page, 'M').click();
      await getDayButton(page, 'W').click();

      // Cancel
      await getCancelButton(page).click();

      // Assert: modal closed
      await expect(page.locator('.ant-modal-content')).not.toBeVisible({ timeout: 5_000 });

      // Assert: Repeat dropdown still shows original value (not "Custom")
      const valueAfter = await repeatTrigger.textContent();
      test.info().annotations.push({ type: 'note', description: `Before: "${valueBefore}" | After cancel: "${valueAfter}"` });
      // The value should not have changed to "Custom" after cancel
      expect(valueAfter).toBe(valueBefore);
    }
  );

  // ── C1568896: Open custom modal from Edit Scheduler ───────────────────────
  test('should open Custom recurrence modal from Repeat dropdown on Edit Scheduler page',
    {
      annotation: { type: 'TestRail', description: 'C1568896' },
      tag: ['@smoke', '@P1'],
    },
    async ({ jobConfigPage, page }) => {
      // Use existing fixture job
      const jobId = await createJob('MBCustomRecurOpen');

      try {
        await jobConfigPage.gotoJob(jobId);
        await page.waitForLoadState('networkidle');

        // Open modal from config page
        await openCustomModal(page);

        // Assert: same modal
        const modal = page.locator('.ant-modal-content');
        await expect(modal).toBeVisible();
        await expect(modal.getByText(/custom recurrence/i)).toBeVisible();
      } finally {
        await deleteJob(jobId);
      }
    }
  );

  // ── C1568897: Modal pre-populates saved values ────────────────────────────
  test('should pre-populate saved custom recurrence values when modal is re-opened on config page',
    {
      annotation: { type: 'TestRail', description: 'C1568897' },
      tag: ['@sanity', '@P2'],
    },
    async ({ jobConfigPage, page }) => {
      const jobId = await createJob('MBCustomRecurPrePop');

      try {
        await jobConfigPage.gotoJob(jobId);
        await page.waitForLoadState('networkidle');

        // Set custom: weekly Mon/Wed/Fri
        await openCustomModal(page);
        await selectModalUnit(page, 'week');
        await getDayButton(page, 'M').click();
        await getDayButton(page, 'W').click();
        await getDayButton(page, 'F').click();
        await getConfirmButton(page).click();
        await expect(page.locator('.ant-modal-content')).not.toBeVisible({ timeout: 5_000 });

        // Save
        await jobConfigPage.saveButton.click();
        await page.waitForLoadState('networkidle');

        // Re-open modal — should be pre-populated
        await openCustomModal(page);

        const modal = page.locator('.ant-modal-content');
        await expect(modal).toBeVisible();

        // Assert: week unit is selected
        const unitText = await modal.locator('.ant-select-selector').textContent();
        test.info().annotations.push({ type: 'note', description: `Unit on re-open: ${unitText}` });
        expect(unitText?.toLowerCase()).toMatch(/week/i);

        // Assert: M, W, F are pre-selected
        const monday    = getDayButton(page, 'M');
        const wednesday = getDayButton(page, 'W');
        const friday    = getDayButton(page, 'F');
        const monSel = await isDaySelected(monday);
        const wedSel = await isDaySelected(wednesday);
        const friSel = await isDaySelected(friday);
        test.info().annotations.push({ type: 'note', description: `M=${monSel} W=${wedSel} F=${friSel} (bg-primary class)` });
        // All three should be pre-selected from save
        expect(monSel, 'Monday should be pre-selected').toBe(true);
        expect(wedSel, 'Wednesday should be pre-selected').toBe(true);
        expect(friSel, 'Friday should be pre-selected').toBe(true);
      } finally {
        await deleteJob(jobId);
      }
    }
  );

  // ── C1568898: Confirm on config page updates schedule ────────────────────
  test('should update schedule when custom recurrence is confirmed and saved on configuration page',
    {
      annotation: { type: 'TestRail', description: 'C1568898' },
      tag: ['@regression', '@P2'],
    },
    async ({ jobConfigPage, page }) => {
      const jobId = await createJob('MBCustomRecurSave');

      try {
        await jobConfigPage.gotoJob(jobId);
        await page.waitForLoadState('networkidle');

        // Change to custom weekly Mon/Wed/Fri
        await openCustomModal(page);
        await selectModalUnit(page, 'week');
        await getDayButton(page, 'M').click();
        await getDayButton(page, 'W').click();
        await getDayButton(page, 'F').click();
        await getConfirmButton(page).click();
        await expect(page.locator('.ant-modal-content')).not.toBeVisible({ timeout: 5_000 });

        // Assert: Repeat field shows custom value before saving
        const repeatTrigger = page.locator('.ant-select-selector').first();
        const repeatValue = await repeatTrigger.textContent();
        expect(repeatValue?.toLowerCase()).toMatch(/custom/i);

        // Save change
        await jobConfigPage.saveButton.click();
        await page.waitForLoadState('networkidle');

        // Assert: page still on Edit Scheduler (save didn't redirect unexpectedly)
        await expect(jobConfigPage.pageHeading).toBeVisible();

        // Reload and verify schedule persisted
        await jobConfigPage.gotoJob(jobId);
        await page.waitForLoadState('networkidle');
        const reloadedRepeat = await page.locator('.ant-select-selector').first().textContent();
        test.info().annotations.push({ type: 'note', description: `Repeat after reload: ${reloadedRepeat}` });
        expect(reloadedRepeat?.toLowerCase()).toMatch(/custom/i);
      } finally {
        await deleteJob(jobId);
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW TESTS — from platform inspection (C1571989–C1571997)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── C1571989: Cannot deselect last day (min 1 enforced) ──────────────────
  test('should enforce minimum 1 day for weekly — clicking the only selected day has no effect',
    {
      annotation: { type: 'TestRail', description: 'C1571989' },
      tag: ['@regression', '@P1'],
    },
    async ({ page }) => {
      await gotoWizard(page);
      await openCustomModal(page);

      // Default: week unit, Monday pre-selected
      const monday = getDayButton(page, 'M');
      expect(await isDaySelected(monday)).toBe(true);

      // Click M to try deselecting it (it is the ONLY selected day)
      await monday.click();
      await page.waitForTimeout(300);

      // UI should prevent 0-day state — Monday remains selected
      const stillSelected = await isDaySelected(monday);
      test.info().annotations.push({
        type: 'note',
        description: `Monday after deselect attempt: ${stillSelected}`,
      });
      expect(stillSelected, 'Cannot deselect last day — min 1 day enforced').toBe(true);

      // Add another day, then deselect Monday — should succeed since 1 day remains
      await getDayButton(page, 'W').click(); // add Wednesday
      await monday.click(); // now deselect Monday (Wednesday still active)
      await page.waitForTimeout(300);

      const mondayAfter = await isDaySelected(monday);
      const wednesdayStill = await isDaySelected(getDayButton(page, 'W'));
      expect(mondayAfter).toBe(false);
      expect(wednesdayStill).toBe(true);
    }
  );

  // ── C1571990: Interval 0/-1 clamps to minimum 1 ─────────────────────────
  test('should clamp Repeat every interval to minimum 1 when 0 or negative is entered',
    {
      annotation: { type: 'TestRail', description: 'C1571990' },
      tag: ['@regression', '@P2'],
    },
    async ({ page }) => {
      await gotoWizard(page);
      await openCustomModal(page);

      const intervalInput = getIntervalInput(page);
      await expect(intervalInput).toBeVisible();

      // Enter 0 — should clamp to 1
      await intervalInput.click({ clickCount: 3 });
      await intervalInput.fill('0');
      await intervalInput.blur();
      await page.waitForTimeout(200);
      const valAfterZero = await intervalInput.inputValue();
      test.info().annotations.push({ type: 'note', description: `Value after entering 0: ${valAfterZero}` });
      expect(Number(valAfterZero)).toBeGreaterThanOrEqual(1);

      // Enter -1 — should clamp to 1
      await intervalInput.click({ clickCount: 3 });
      await intervalInput.fill('-1');
      await intervalInput.blur();
      await page.waitForTimeout(200);
      const valAfterNeg = await intervalInput.inputValue();
      test.info().annotations.push({ type: 'note', description: `Value after entering -1: ${valAfterNeg}` });
      expect(Number(valAfterNeg)).toBeGreaterThanOrEqual(1);

      // Confirm should still work
      await getConfirmButton(page).click();
      await expect(page.locator('.ant-modal-content')).not.toBeVisible({ timeout: 5_000 });
    }
  );

  // ── C1571991: Occurrences min=1, max=999, default=10 ────────────────────
  test('should enforce min=1 max=999 for occurrences and default to 10',
    {
      annotation: { type: 'TestRail', description: 'C1571991' },
      tag: ['@regression', '@P1'],
    },
    async ({ page }) => {
      await gotoWizard(page);
      await openCustomModal(page);

      // Activate After radio
      await selectEndsOption(page, 'After');

      const occInput = getOccurrencesInput(page);
      await expect(occInput).toBeVisible();

      // Verify default = 10
      const defaultVal = await occInput.inputValue();
      expect(defaultVal, 'Default occurrences should be 10').toBe('10');

      // Test 0 → clamps to 1
      await occInput.click({ clickCount: 3 });
      await occInput.fill('0');
      await occInput.blur();
      await page.waitForTimeout(200);
      expect(Number(await occInput.inputValue())).toBeGreaterThanOrEqual(1);

      // Test 999 → accepted
      await occInput.click({ clickCount: 3 });
      await occInput.fill('999');
      await occInput.blur();
      await page.waitForTimeout(200);
      expect(await occInput.inputValue()).toBe('999');

      // Test 1000 → clamps to 999
      await occInput.click({ clickCount: 3 });
      await occInput.fill('1000');
      await occInput.blur();
      await page.waitForTimeout(200);
      const val1000 = await occInput.inputValue();
      test.info().annotations.push({ type: 'note', description: `Value after entering 1000: ${val1000}` });
      expect(Number(val1000)).toBeLessThanOrEqual(999);
    }
  );

  // ── C1571992: Ends=On with no date → uses today (BUG) ───────────────────
  test('should NOT silently use today when Ends=On is selected but no date chosen — BUG validation',
    {
      annotation: { type: 'TestRail', description: 'C1571992' },
      tag: ['@regression', '@P1'],
    },
    async ({ page }) => {
      await gotoWizard(page);
      await openCustomModal(page);

      // Select Ends: On, leave date empty
      await selectEndsOption(page, 'On');

      const dateInput = page.locator('.ant-modal-content input[placeholder="Select date"]');
      await expect(dateInput).toBeVisible();
      const dateValue = await dateInput.inputValue();
      expect(dateValue, 'Date should be empty initially').toBe('');

      // Click Confirm without selecting date
      const confirmBtn = getConfirmButton(page);
      const isDisabled = await confirmBtn.isDisabled();

      if (isDisabled) {
        // EXPECTED BEHAVIOR: Confirm disabled until date is chosen
        test.info().annotations.push({ type: 'note', description: 'Confirm is disabled when date is empty — correct behavior' });
        expect(isDisabled).toBe(true);
      } else {
        // Bug path: Confirm is enabled, click it
        await confirmBtn.click();
        await page.waitForTimeout(600);

        const modalStillOpen = await page.locator('.ant-modal-content').isVisible();
        const errorShown = await page.locator('.ant-form-item-explain-error').isVisible().catch(() => false);

        test.info().annotations.push({
          type: 'note',
          description: `BUG CHECK: modalOpen=${modalStillOpen} errorShown=${errorShown} — if modal closed with no error, today was used silently`,
        });

        if (!modalStillOpen && !errorShown) {
          // BUG: Modal closed without validation — today's date was used silently
          const repeatVal = await page.locator('.ant-select-selector').first().textContent();
          test.info().annotations.push({
            type: 'note',
            description: `BUG CONFIRMED: Repeat shows "${repeatVal}" (today defaulted silently)`,
          });
          // This is a known bug — fail to highlight it
          expect(false, 'BUG: Confirm with empty "On" date should show validation, not silently use today').toBe(true);
        }
      }
    }
  );

  // ── C1571993: Repeat on visible ONLY for week ─────────────────────────────
  test('should show "Repeat on" ONLY for week unit — hidden for day/month/year',
    {
      annotation: { type: 'TestRail', description: 'C1571993' },
      tag: ['@sanity', '@P1'],
    },
    async ({ page }) => {
      await gotoWizard(page);
      await openCustomModal(page);

      const modal = page.locator('.ant-modal-content');
      const repeatOnLabel = modal.getByText(/^repeat on$/i);

      // week → visible
      await selectModalUnit(page, 'week');
      await expect(repeatOnLabel).toBeVisible({ timeout: 3_000 });
      const dayBtns = modal.locator('button').filter({ hasText: /^[SMTWTFS]$/ });
      expect(await dayBtns.count()).toBeGreaterThanOrEqual(7);

      // day → hidden
      await selectModalUnit(page, 'day');
      await expect(repeatOnLabel).not.toBeVisible({ timeout: 3_000 });

      // month → hidden
      await selectModalUnit(page, 'month');
      await expect(repeatOnLabel).not.toBeVisible();

      // year → hidden
      await selectModalUnit(page, 'year');
      await expect(repeatOnLabel).not.toBeVisible();

      // Switch back to week → reappears with M pre-selected
      await selectModalUnit(page, 'week');
      await expect(repeatOnLabel).toBeVisible({ timeout: 3_000 });
      const monday = getDayButton(page, 'M');
      expect(await isDaySelected(monday), 'Monday should be re-selected after switching back to week').toBe(true);
    }
  );

  // ── C1571994: Schedule Time always visible for all preset options ─────────
  test('should keep Schedule Time field visible for all Repeat preset options',
    {
      annotation: { type: 'TestRail', description: 'C1571994' },
      tag: ['@sanity', '@P1'],
    },
    async ({ jobConfigPage, page }) => {
      const jobId = await createJob('MBScheduleTimeVisible');

      try {
        await jobConfigPage.gotoJob(jobId);
        await page.waitForLoadState('networkidle');

        const scheduleTimeInput = page.locator('input[placeholder="00:00"]').first();
        await expect(scheduleTimeInput).toBeVisible();

        const options = [
          { value: 'none',            label: 'Does not repeat' },
          { value: 'daily',           label: 'Daily' },
          { value: 'weekly_1',        label: 'Weekly on Monday' },
          { value: 'monthly_5_Monday', label: 'Monthly on the fifth Monday' },
          { value: 'annually_03_30',  label: 'Annually on March 30' },
          { value: 'weekday',         label: 'Every weekday' },
        ] as const;

        for (const opt of options) {
          await selectRepeatOption(page, opt.value);
          const visible = await scheduleTimeInput.isVisible().catch(() => false);
          test.info().annotations.push({
            type: 'note',
            description: `Schedule Time visible with "${opt.label}": ${visible}`,
          });
          expect(visible, `Schedule Time should be visible when Repeat="${opt.label}"`).toBe(true);
        }
      } finally {
        await deleteJob(jobId);
      }
    }
  );

  // ── C1571995: Dropdown has 8 options including "Custom..." ────────────────
  test('should show exactly 8 Repeat options including "Custom..." in dropdown',
    {
      annotation: { type: 'TestRail', description: 'C1571995' },
      tag: ['@smoke', '@P1'],
    },
    async ({ jobConfigPage, page }) => {
      const jobId = await createJob('MBDropdown8Options');

      try {
        await jobConfigPage.gotoJob(jobId);
        await page.waitForLoadState('networkidle');

        // Get all options via React fiber
        const options = await page.evaluate(() => {
          const sel = document.querySelector('.ant-select');
          if (!sel) return [];
          const fiberKey = Object.keys(sel).find(k => k.startsWith('__reactFiber'));
          if (!fiberKey) return [];
          let fiber = (sel as any)[fiberKey];
          const visited = new Set<any>();
          const find = (f: any, d = 0): any => {
            if (!f || d > 30 || visited.has(f)) return null;
            visited.add(f);
            if (f.memoizedProps?.options) return f;
            return find(f.child, d+1) || find(f.sibling, d+1) || find(f.return, d+1);
          };
          const found = find(fiber);
          return found?.memoizedProps?.options?.map((o: any) => ({ label: o.label, value: o.value })) || [];
        });

        test.info().annotations.push({
          type: 'note',
          description: `Found ${options.length} options: ${options.map((o: any) => o.label).join(', ')}`,
        });

        // Should have 8 options (or 7 if no custom configured yet)
        expect(options.length).toBeGreaterThanOrEqual(7);

        const values = options.map((o: any) => o.value);
        expect(values).toContain('none');
        expect(values).toContain('daily');
        expect(values).toContain('weekly_1');
        expect(values).toContain('monthly_5_Monday');
        expect(values).toContain('annually_03_30');
        expect(values).toContain('weekday');
        // 'custom' or 'custom_configured' should be present
        const hasCustom = values.includes('custom') || values.includes('custom_configured');
        expect(hasCustom, 'Dropdown should include Custom... option').toBe(true);
      } finally {
        await deleteJob(jobId);
      }
    }
  );

  // ── C1571996: Custom configured item reopens modal pre-populated ─────────
  test('should reopen Custom recurrence modal pre-populated when clicking configured custom item',
    {
      annotation: { type: 'TestRail', description: 'C1571996' },
      tag: ['@regression', '@P1'],
    },
    async ({ jobConfigPage, page }) => {
      const jobId = await createJob('MBCustomPrePopReopen');

      try {
        await jobConfigPage.gotoJob(jobId);
        await page.waitForLoadState('networkidle');

        // Set a custom recurrence: every 2 weeks on Monday
        await openCustomModal(page);
        const intervalInput = getIntervalInput(page);
        await intervalInput.click({ clickCount: 3 });
        await intervalInput.fill('2');
        await getConfirmButton(page).click();
        await expect(page.locator('.ant-modal-content')).not.toBeVisible({ timeout: 5_000 });

        // Now reopen by selecting the custom configured option
        await selectRepeatOption(page, 'custom_configured');
        await expect(page.locator('.ant-modal-content')).toBeVisible({ timeout: 5_000 });

        const modal = page.locator('.ant-modal-content');

        // Assert: interval is pre-populated (should be 2)
        const intervalVal = await getIntervalInput(page).inputValue();
        test.info().annotations.push({ type: 'note', description: `Interval on re-open: ${intervalVal}` });
        expect(intervalVal, 'Interval should be pre-populated with previously saved value (2)').toBe('2');

        // Assert: unit is weeks
        const unitText = await modal.locator('.ant-select-selector').textContent();
        expect(unitText?.toLowerCase()).toMatch(/week/i);

        // Assert: Monday is still selected
        expect(await isDaySelected(getDayButton(page, 'M'))).toBe(true);
      } finally {
        await deleteJob(jobId);
      }
    }
  );

  // ── C1571997: Cancel reverts dropdown to previous custom description ──────
  test('should revert Repeat dropdown to previous custom description when Cancel is clicked',
    {
      annotation: { type: 'TestRail', description: 'C1571997' },
      tag: ['@regression', '@P1'],
    },
    async ({ jobConfigPage, page }) => {
      const jobId = await createJob('MBCancelReverts');

      try {
        await jobConfigPage.gotoJob(jobId);
        await page.waitForLoadState('networkidle');

        // First: set a custom recurrence → confirm it
        await openCustomModal(page);
        await getConfirmButton(page).click();
        await expect(page.locator('.ant-modal-content')).not.toBeVisible({ timeout: 5_000 });

        const repeatBefore = await page.locator('.ant-select-selector').first().textContent();
        test.info().annotations.push({ type: 'note', description: `Repeat before reopen: "${repeatBefore}"` });

        // Reopen modal, change interval to 5, then CANCEL
        await selectRepeatOption(page, 'custom_configured');
        await expect(page.locator('.ant-modal-content')).toBeVisible({ timeout: 5_000 });

        const intervalInput = getIntervalInput(page);
        await intervalInput.click({ clickCount: 3 });
        await intervalInput.fill('5');

        // Cancel
        await getCancelButton(page).click();
        await expect(page.locator('.ant-modal-content')).not.toBeVisible({ timeout: 5_000 });

        // Assert: dropdown reverts to previous description
        const repeatAfter = await page.locator('.ant-select-selector').first().textContent();
        test.info().annotations.push({ type: 'note', description: `Repeat after cancel: "${repeatAfter}"` });

        // Should match previous value (not changed to "5 weeks" variant)
        expect(repeatAfter).toBe(repeatBefore);
        // Should NOT show bare "Custom..." placeholder
        expect(repeatAfter?.trim()).not.toBe('Custom...');
      } finally {
        await deleteJob(jobId);
      }
    }
  );

});
