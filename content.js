(() => {
  const COUPONS_PATH = "/savings/cl/coupons";
  const BUTTON_SELECTOR = 'button[data-testid^="CouponActionButton-"]';
  const CLIP_DELAY_MS = 1000;
  const SCROLL_DELAY_MS = 1500;
  const SCROLL_STABLE_CHECKS = 3;
  const CLIP_TIMEOUT_MS = 8000;
  const MAX_CONSECUTIVE_FAILURES = 3;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const label = (button) => button.innerText.trim().toLowerCase();
  const couponButtons = () => [...document.querySelectorAll(BUTTON_SELECTOR)];
  const byTestId = (id) => document.querySelector(`button[data-testid="${id}"]`);

  let running = false;
  let stopRequested = false;

  const panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:2147483647;display:none;" +
    "max-width:280px;padding:12px;border-radius:8px;background:#fff;color:#222;" +
    "box-shadow:0 2px 12px rgba(0,0,0,.35);font:14px/1.4 sans-serif";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Clip all";
  button.style.cssText =
    "width:100%;padding:8px 16px;border:0;border-radius:6px;background:#0b6e4f;" +
    "color:#fff;font:bold 15px sans-serif;cursor:pointer";

  const status = document.createElement("div");
  status.setAttribute("role", "status");
  status.style.cssText = "margin-top:8px";

  panel.append(button, status);
  document.documentElement.append(panel);

  const setStatus = (text) => {
    status.textContent = text;
  };

  const loadAllCoupons = async () => {
    let lastCount = -1;
    let stableChecks = 0;
    while (stableChecks < SCROLL_STABLE_CHECKS && !stopRequested) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(SCROLL_DELAY_MS);
      const count = couponButtons().length;
      stableChecks = count === lastCount ? stableChecks + 1 : 0;
      lastCount = count;
      setStatus(`Loading coupons: ${count} found`);
    }
    window.scrollTo(0, 0);
  };

  const waitForClip = async (id) => {
    const deadline = Date.now() + CLIP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(250);
      const current = byTestId(id);
      if (!current || label(current) !== "clip") return true;
    }
    return false;
  };

  const siteMessage = () => {
    const alert = document.querySelector('[role="alertdialog"], [role="dialog"], [role="alert"]');
    return alert ? alert.innerText.trim().slice(0, 200) : "";
  };

  const clipAll = async () => {
    await loadAllCoupons();
    if (stopRequested) return "Stopped.";

    const buttons = couponButtons();
    if (buttons.some((b) => label(b).startsWith("sign in"))) {
      return "Sign in to Harris Teeter first, then press Clip all again.";
    }

    const queue = buttons.filter((b) => label(b) === "clip").map((b) => b.dataset.testid);
    const skipped = buttons.length - queue.length;
    let clipped = 0;
    let failures = 0;

    for (const [index, id] of queue.entries()) {
      if (stopRequested) return `Stopped. Clipped ${clipped} of ${queue.length}.`;
      setStatus(`Clipping ${index + 1} of ${queue.length}`);

      const target = byTestId(id);
      if (!target || label(target) !== "clip") continue;
      target.click();

      if (await waitForClip(id)) {
        clipped += 1;
        failures = 0;
      } else if (++failures >= MAX_CONSECUTIVE_FAILURES) {
        const message = siteMessage();
        return `Stopped after ${clipped} of ${queue.length}: the site stopped accepting clips.${
          message ? ` It said: ${message}` : ""
        }`;
      }
      await sleep(CLIP_DELAY_MS);
    }

    return `Done. Clipped ${clipped} of ${queue.length}, ${skipped} skipped because they were already clipped or unavailable.`;
  };

  button.addEventListener("click", async () => {
    if (running) {
      stopRequested = true;
      button.textContent = "Stopping...";
      button.disabled = true;
      return;
    }
    running = true;
    stopRequested = false;
    button.textContent = "Stop";
    try {
      setStatus(await clipAll());
    } catch (error) {
      setStatus(`Something went wrong: ${error.message}`);
    } finally {
      running = false;
      button.textContent = "Clip all";
      button.disabled = false;
    }
  });

  // The site changes pages without a full reload, so the path has to be re-checked.
  setInterval(() => {
    panel.style.display = location.pathname.startsWith(COUPONS_PATH) ? "block" : "none";
  }, 1000);
})();
