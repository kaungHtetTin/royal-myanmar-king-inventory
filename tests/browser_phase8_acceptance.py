"""Rendered Phase 8 acceptance checks for the local nested deployment.

Requires Chrome/Edge and Selenium 4. Run after ``npm run build`` with Apache and
MySQL running. Evidence is written below ``storage/app/phase8-browser``.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


ROOT = Path(__file__).resolve().parents[1]
BASE_URL = os.getenv("PHASE8_BASE_URL", "http://localhost/inventory/public").rstrip("/")
EVIDENCE = ROOT / "storage" / "app" / "phase8-browser"
AXE_SOURCE = (ROOT / "node_modules" / "axe-core" / "axe.min.js").read_text(encoding="utf-8")
OFFLINE_MESSAGE = "Internet connection is required to complete this transaction."


def driver_instance() -> webdriver.Chrome:
    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--allow-insecure-localhost")
    options.add_argument("--window-size=1440,900")
    return webdriver.Chrome(options=options)


def wait_for_app(driver: webdriver.Chrome, selector: str) -> None:
    WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.CSS_SELECTOR, selector)))
    WebDriverWait(driver, 15).until(
        lambda browser: browser.execute_script("return document.readyState") == "complete"
    )


def login(driver: webdriver.Chrome, portal: str, username: str, password: str) -> None:
    driver.get(f"{BASE_URL}/{portal}/login")
    wait_for_app(driver, ".login-root")
    driver.find_element(By.CSS_SELECTOR, 'input[autocomplete="username"]').send_keys(username)
    driver.find_element(By.CSS_SELECTOR, 'input[autocomplete="current-password"]').send_keys(password)
    driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]').click()
    WebDriverWait(driver, 15).until(lambda browser: f"/{portal}/dashboard" in browser.current_url)
    wait_for_app(driver, f".{portal}-root")


def set_viewport(driver: webdriver.Chrome, width: int, height: int) -> None:
    driver.execute_cdp_cmd(
        "Emulation.setDeviceMetricsOverride",
        {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": width <= 760},
    )
    time.sleep(0.15)


def configure_ui(driver: webdriver.Chrome, theme: str, density: str = "compact") -> None:
    driver.execute_script(
        "localStorage.setItem('inventory.theme', arguments[0]);"
        "localStorage.setItem('inventory.density', arguments[1]);",
        theme,
        density,
    )


def audit_page(driver: webdriver.Chrome, name: str, root_selector: str) -> dict:
    wait_for_app(driver, root_selector)
    WebDriverWait(driver, 15).until(
        lambda browser: all(not element.is_displayed() for element in browser.find_elements(By.CSS_SELECTOR, ".ui-loading"))
    )
    driver.execute_script(AXE_SOURCE)
    result = driver.execute_async_script(
        "const done = arguments[arguments.length - 1];"
        "axe.run(document, {resultTypes: ['violations']}).then(done).catch(error => done({error: String(error)}));"
    )
    if result.get("error"):
        raise AssertionError(f"axe failed on {name}: {result['error']}")

    severe = [item for item in result["violations"] if item.get("impact") in {"serious", "critical"}]
    overflow = driver.execute_script(
        "return {scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth};"
    )
    if overflow["scrollWidth"] > overflow["clientWidth"] + 1:
        raise AssertionError(f"{name} has horizontal overflow: {overflow}")
    if severe:
        summary = [
            {
                "id": item["id"],
                "impact": item["impact"],
                "nodes": [
                    {"target": node["target"], "html": node["html"], "summary": node["failureSummary"]}
                    for node in item["nodes"]
                ],
            }
            for item in severe
        ]
        raise AssertionError(f"{name} has serious accessibility violations: {summary}")

    return {
        "name": name,
        "url": driver.current_url,
        "violations": len(result["violations"]),
        "serious_or_critical": 0,
        "overflow": overflow,
    }


def capture(
    driver: webdriver.Chrome,
    results: list[dict],
    *,
    name: str,
    path: str,
    root: str,
    width: int,
    height: int,
    theme: str,
    density: str = "compact",
) -> None:
    set_viewport(driver, width, height)
    configure_ui(driver, theme, density)
    driver.get(f"{BASE_URL}{path}")
    results.append(audit_page(driver, name, root))
    shell = driver.find_element(By.CSS_SELECTOR, root)
    assert shell.get_attribute("data-theme") == theme, f"{name} did not apply {theme} theme"
    if root == ".admin-root":
        assert shell.get_attribute("data-density") == density, f"{name} did not apply {density} density"
    driver.save_screenshot(str(EVIDENCE / f"{name}.png"))


def wait_for_service_worker(driver: webdriver.Chrome) -> dict:
    return driver.execute_async_script(
        "const done = arguments[arguments.length - 1];"
        "Promise.race(["
        "navigator.serviceWorker.ready.then(reg => ({scope: reg.scope, active: Boolean(reg.active)})),"
        "new Promise(resolve => setTimeout(() => resolve({timeout: true}), 10000))"
        "]).then(done);"
    )


def main() -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    results: dict[str, object] = {"base_url": BASE_URL, "pages": []}
    driver = driver_instance()
    try:
        login(driver, "admin", "superadmin", os.getenv("PHASE8_ADMIN_PASSWORD", "password"))

        manifest = driver.execute_async_script(
            "const done = arguments[arguments.length - 1];"
            "fetch(document.querySelector('link[rel=manifest]').href).then(r => r.json()).then(done);"
        )
        assert manifest["display"] == "standalone"
        assert manifest["start_url"] == "./admin/dashboard"
        assert manifest["scope"] == "./"

        service_worker = wait_for_service_worker(driver)
        assert service_worker.get("active") is True, f"service worker was not active: {service_worker}"
        driver.refresh()
        wait_for_app(driver, ".admin-root")
        WebDriverWait(driver, 10).until(
            lambda browser: browser.execute_script("return Boolean(navigator.serviceWorker.controller)")
        )
        results["pwa"] = {"manifest": "valid", "service_worker": service_worker, "controlled": True}

        pages = results["pages"]
        assert isinstance(pages, list)
        capture(
            driver,
            pages,
            name="admin-dashboard-desktop-light",
            path="/admin/dashboard",
            root=".admin-root",
            width=1440,
            height=900,
            theme="light",
        )

        results["cache_entries"] = driver.execute_async_script(
            "const done = arguments[arguments.length - 1];"
            "caches.keys().then(async names => { const result = {}; for (const name of names) {"
            "result[name] = (await (await caches.open(name)).keys()).map(request => request.url); } done(result); });"
        )
        capture(
            driver,
            pages,
            name="admin-reports-desktop-dark",
            path="/admin/reports",
            root=".admin-root",
            width=1280,
            height=800,
            theme="dark",
            density="comfortable",
        )
        capture(
            driver,
            pages,
            name="admin-inventory-tablet-light",
            path="/admin/inventory",
            root=".admin-root",
            width=1024,
            height=768,
            theme="light",
        )

        offline_script = driver.execute_cdp_cmd(
            "Page.addScriptToEvaluateOnNewDocument",
            {
                "source": "Object.defineProperty(navigator, 'onLine', {configurable: true, get: () => false});"
                "window.addEventListener('DOMContentLoaded', () => window.dispatchEvent(new Event('offline')));"
            },
        )["identifier"]
        driver.execute_cdp_cmd("Network.enable", {})
        driver.execute_cdp_cmd(
            "Network.overrideNetworkState",
            {
                "offline": True,
                "latency": 0,
                "downloadThroughput": 0,
                "uploadThroughput": 0,
                "connectionType": "none",
            },
        )
        driver.execute_cdp_cmd(
            "Network.emulateNetworkConditions",
            {"offline": True, "latency": 0, "downloadThroughput": 0, "uploadThroughput": 0},
        )
        driver.execute_script(
            "Object.defineProperty(navigator, 'onLine', {configurable: true, get: () => false});"
            "window.dispatchEvent(new Event('offline'));"
        )
        WebDriverWait(driver, 10).until(
            lambda browser: OFFLINE_MESSAGE in browser.find_element(By.CSS_SELECTOR, ".offline-banner").text
        )
        disabled_mutations = driver.execute_script(
            "return [...document.querySelectorAll('button[disabled]')].filter(button => button.title === arguments[0]).length;",
            OFFLINE_MESSAGE,
        )
        if disabled_mutations == 0:
            new_import = driver.find_element(By.XPATH, "//button[contains(normalize-space(.), 'New import')]")
            new_import.click()
            WebDriverWait(driver, 5).until(EC.presence_of_element_located((By.CSS_SELECTOR, '[role="dialog"]')))
            disabled_mutations = driver.execute_script(
                "return [...document.querySelectorAll('button[disabled]')].filter(button => button.title === arguments[0]).length;",
                OFFLINE_MESSAGE,
            )
        assert disabled_mutations > 0, "offline inventory page exposed no explicitly blocked transaction action"
        assert driver.execute_script("return navigator.onLine") is False
        transport_blocked = driver.execute_async_script(
            "const done = arguments[arguments.length - 1];"
            "fetch(arguments[0]).then(() => done(false)).catch(() => done(true));",
            f"{BASE_URL}/api/health?offline_probe=1",
        )
        assert transport_blocked is True, "offline network unexpectedly completed a server request"
        driver.get(f"{BASE_URL}/admin/dashboard")
        wait_for_app(driver, ".admin-root")
        WebDriverWait(driver, 10).until(
            lambda browser: OFFLINE_MESSAGE in browser.find_element(By.CSS_SELECTOR, ".offline-banner").text
        )
        WebDriverWait(driver, 10).until(
            lambda browser: "Operations overview" in browser.find_element(By.CSS_SELECTOR, ".admin-content").text
        )
        driver.save_screenshot(str(EVIDENCE / "admin-shell-offline.png"))
        results["offline"] = {
            "cached_shell_opened": True,
            "banner": OFFLINE_MESSAGE,
            "disabled_mutation_actions": disabled_mutations,
            "navigator_online": False,
            "network_transport_blocked": transport_blocked,
        }
        driver.execute_cdp_cmd(
            "Network.emulateNetworkConditions",
            {"offline": False, "latency": 0, "downloadThroughput": -1, "uploadThroughput": -1},
        )
        driver.execute_cdp_cmd(
            "Network.overrideNetworkState",
            {
                "offline": False,
                "latency": 0,
                "downloadThroughput": -1,
                "uploadThroughput": -1,
                "connectionType": "wifi",
            },
        )
        driver.execute_cdp_cmd("Page.removeScriptToEvaluateOnNewDocument", {"identifier": offline_script})

        driver.delete_all_cookies()
        driver.execute_script("localStorage.clear(); sessionStorage.clear();")
        login(driver, "sales", "koaung", os.getenv("PHASE8_SALES_PASSWORD", "password1234"))
        capture(
            driver,
            pages,
            name="sales-dashboard-android-light",
            path="/sales/dashboard",
            root=".sales-root",
            width=412,
            height=915,
            theme="light",
        )
        capture(
            driver,
            pages,
            name="sales-new-sale-iphone-dark",
            path="/sales/new-sale",
            root=".sales-root",
            width=390,
            height=844,
            theme="dark",
        )
        touch = driver.execute_script(
            "const controls = [...document.querySelectorAll('.sales-bottom-nav a, .sales-content button')].filter(el => {"
            "const style = getComputedStyle(el); const rect = el.getBoundingClientRect();"
            "return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;});"
            "const small = controls.filter(el => { const rect = el.getBoundingClientRect(); return rect.width < 40 || rect.height < 40; });"
            "return {checked: controls.length, small: small.map(el => ({text: el.innerText.trim(), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height}))};"
        )
        assert not touch["small"], f"mobile touch targets below 40px: {touch['small']}"
        results["touch_targets"] = touch
    except (AssertionError, TimeoutException) as error:
        results["failure"] = str(error)
        results["failure_url"] = driver.current_url
        results["failure_title"] = driver.title
        driver.save_screenshot(str(EVIDENCE / "failure.png"))
        (EVIDENCE / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
        raise
    finally:
        driver.quit()

    (EVIDENCE / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
