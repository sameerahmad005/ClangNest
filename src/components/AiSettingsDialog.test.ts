import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AiSettingsDialog } from "./AiSettingsDialog";
import { AI_PROVIDERS, DEFAULT_AI_SETTINGS, listAvailableModels, providerPreset, testAiModel } from "../lib/ai-practice";
import type { AiModel, AiSettings } from "../types/practice";

vi.mock("../lib/ai-practice", async (original) => ({ ...await original<object>(), listAvailableModels: vi.fn(), testAiModel: vi.fn() }));

let host: HTMLDivElement;
let root: Root;
let mounted: boolean;
const onSave = vi.fn<(settings: AiSettings) => void>();
const onClose = vi.fn();
const configured = (): AiSettings => ({ ...DEFAULT_AI_SETTINGS, model: "saved-model", apiKey: "FAKE_DIALOG_TEST_KEY" });
const openRouterSettings = (): AiSettings => ({ ...configured(), provider: "openrouter", endpoint: providerPreset("openrouter").endpoint, model: "" });
const categorizedModels: AiModel[] = [
  { id: "lab/alpha-free", name: "Alpha Chat", pricingCategory: "free" },
  { id: "lab/alpha-paid", name: "Alpha Pro", pricingCategory: "paid" },
  { id: "lab/beta-free", name: "Beta Chat", pricingCategory: "free" },
  { id: "lab/alpha-missing", name: "Alpha Legacy" },
  { id: "lab/beta-unknown", name: "Beta Preview", pricingCategory: "unknown" },
];
const providerKeyLinks = [
  ["Google Gemini", "https://aistudio.google.com/apikey"],
  ["OpenAI", "https://platform.openai.com/api-keys"],
  ["Anthropic", "https://console.anthropic.com/settings/keys"],
  ["OpenRouter", "https://openrouter.ai/settings/keys"],
  ["Groq", "https://console.groq.com/keys"],
  ["DeepSeek", "https://platform.deepseek.com/api_keys"],
  ["Mistral", "https://console.mistral.ai/api-keys/"],
  ["Together AI", "https://api.together.ai/settings/api-keys"],
  ["xAI", "https://console.x.ai/"],
];

function field<T extends HTMLInputElement | HTMLSelectElement = HTMLInputElement>(suffix: string): T {
  const element = host.querySelector<T>(`[id$="-${suffix}"]`);
  expect(element, `field ${suffix}`).toBeTruthy();
  return element!;
}
function button(text: string): HTMLButtonElement {
  const element = [...host.querySelectorAll("button")].find((item) => item.textContent?.trim() === text || item.getAttribute("aria-label") === text);
  expect(element, `button ${text}`).toBeTruthy();
  return element!;
}
async function change(suffix: string, value: string) {
  await act(async () => { const element = field(suffix); element.value = value; Simulate.change(element); });
}
async function click(text: string) { await act(async () => button(text).click()); }
async function advance(milliseconds = 700) { await act(async () => vi.advanceTimersByTime(milliseconds)); }
async function check(suffix: string, checked: boolean) {
  await act(async () => { const checkbox = field(suffix); checkbox.checked = checked; Simulate.change(checkbox); });
}
async function mount(settings: AiSettings = configured(), strict = false) {
  const element = createElement(AiSettingsDialog, { settings, onSave, onClose });
  await act(async () => root.render(strict ? createElement(StrictMode, null, element) : element));
}
function deferred<T = AiModel[]>() {
  let resolve!: (models: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vi.mocked(listAvailableModels).mockReset();
  vi.mocked(testAiModel).mockReset();
  vi.mocked(testAiModel).mockResolvedValue({ durationMs: 123 });
  vi.mocked(listAvailableModels).mockResolvedValue([{ id: "discovered-one", name: "Discovered One" }, { id: "discovered-two", name: "Discovered Two" }]);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); mounted = true;
});
afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  vi.useRealTimers();
  host.remove(); vi.unstubAllGlobals();
});

it("starts without a provider selection, model, credential, or implicit discovery", async () => {
  await mount({ ...DEFAULT_AI_SETTINGS, model: "", apiKey: "", rememberKey: false });
  expect(field("provider").value).toBe("");
  expect(field("key").value).toBe("");
  expect(field("model").value).toBe("");
  expect(field("remember").checked).toBe(false);
  expect(button("Load available models").disabled).toBe(true);
  expect(button("Save settings").disabled).toBe(true);
  await advance(5000);
  expect(listAvailableModels).not.toHaveBeenCalled();
  await click("Forget key");
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "", model: "", rememberKey: false }));
});

it("offers every provider including Custom and resets credentials and consent on selection", async () => {
  await mount({ ...configured(), rememberKey: true });
  const options = [...field<HTMLSelectElement>("provider").options];
  expect(options.map((option) => option.value)).toEqual(["", "gemini", "openai", "anthropic", "openrouter", "groq", "deepseek", "mistral", "together", "xai", "openai-compatible"]);
  for (const provider of AI_PROVIDERS) {
    expect(options.find((option) => option.value === provider.id)?.textContent).toBe(provider.name);
    await change("provider", provider.id);
    expect(field("endpoint").value).toBe(providerPreset(provider.id).endpoint);
    expect(field("key").value).toBe("");
    expect(field("remember").checked).toBe(false);
    expect(field("model").value).toBe("");
  }
  expect(listAvailableModels).not.toHaveBeenCalled();
});

it("offers all nine official API-key links before choosing a provider without changing settings or making requests", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await mount({ ...DEFAULT_AI_SETTINGS, model: "", apiKey: "", rememberKey: false });
  const nav = host.querySelector('nav[aria-label="Provider API keys"]')!;
  expect(field("provider").closest("label")?.nextElementSibling).toBe(nav);
  expect(nav.textContent).toContain("opens in a new tab");
  const links = [...nav.querySelectorAll("a")];
  expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual(providerKeyLinks);
  const submit = vi.fn(); host.querySelector("form")!.addEventListener("submit", submit);
  for (const link of links) {
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(link.getAttribute("aria-label")).toBe(`Get ${link.textContent} API key (opens in a new tab)`);
    await act(async () => link.click());
  }
  await advance(5000);
  expect(field("provider").value).toBe("");
  expect(field("key").value).toBe("");
  expect(field("endpoint").value).toBe("");
  expect(field("model").value).toBe("");
  expect(field("remember").checked).toBe(false);
  expect(submit).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(listAvailableModels).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps key links static with a filled key and arbitrary Custom endpoint and gives administrator guidance", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const settings: AiSettings = { ...configured(), provider: "openai-compatible", endpoint: "https://arbitrary-server.test/private/v1/chat/completions", rememberKey: true };
  await mount(settings);
  await check("manual", true);
  await change("manual-model", "custom-manual-model");
  expect(host.querySelector('[id$="-key-help"]')?.textContent).toContain("For Custom, obtain an API key from your server administrator.");
  const links = [...host.querySelectorAll("a")];
  expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual(providerKeyLinks);
  expect(links.some((link) => /custom/i.test(link.textContent ?? ""))).toBe(false);
  const submit = vi.fn(); host.querySelector("form")!.addEventListener("submit", submit);
  for (const link of links) {
    expect(link.href).not.toContain(settings.apiKey);
    expect(link.href).not.toContain("arbitrary-server");
    await act(async () => link.click());
  }
  await advance(5000);
  expect(field("provider").value).toBe(settings.provider);
  expect(field("key").value).toBe(settings.apiKey);
  expect(field("endpoint").value).toBe(settings.endpoint);
  expect(field("manual-model").value).toBe("custom-manual-model");
  expect(field("remember").checked).toBe(true);
  expect(submit).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(listAvailableModels).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("does not reset or trigger the existing 700ms discovery timer when a key link is clicked", async () => {
  await mount();
  await advance(400);
  await act(async () => host.querySelector<HTMLAnchorElement>("a")!.click());
  await advance(299);
  expect(listAvailableModels).not.toHaveBeenCalled();
  expect(field("key").value).toBe(configured().apiKey);
  expect(field("model").value).toBe("");
  await advance(1);
  expect(listAvailableModels).toHaveBeenCalledOnce();
  expect(listAvailableModels).toHaveBeenCalledWith(configured(), expect.any(AbortSignal));
  expect(onSave).not.toHaveBeenCalled();
});

it("includes API-key links in both directions of the dialog focus trap", async () => {
  await mount({ ...DEFAULT_AI_SETTINGS, model: "", apiKey: "" });
  // Isolate the links as the focus boundaries; jsdom does not perform native Tab navigation.
  for (const control of host.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input, select, button")) control.disabled = true;
  const links = [...host.querySelectorAll("a")];
  const first = links[0]; const last = links[links.length - 1];
  first.focus();
  await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(last);
  await act(async () => last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(first);
});

it("automatically loads discovered names and IDs and saves only an explicitly selected model", async () => {
  await mount();
  expect(button("Save settings").disabled).toBe(true);
  await change("key", "FAKE_REPLACEMENT_KEY");
  expect(listAvailableModels).not.toHaveBeenCalled();
  await advance();
  expect(listAvailableModels).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "FAKE_REPLACEMENT_KEY", model: "" }), expect.any(AbortSignal));
  expect([...field<HTMLSelectElement>("model").options].map((option) => option.textContent)).toEqual(["Choose an available model…", "Discovered One — discovered-one", "Discovered Two — discovered-two"]);
  expect(field("model").value).toBe("");
  expect(button("Save settings").disabled).toBe(true);
  await change("model", "discovered-two");
  expect(button("Save settings").disabled).toBe(false);
  await act(async () => Simulate.submit(host.querySelector("form")!));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ model: "discovered-two", apiKey: "FAKE_REPLACEMENT_KEY", rememberKey: false }));
});

it("requires an existing model to be rediscovered and preserves only an exact normalized ID", async () => {
  vi.mocked(listAvailableModels).mockResolvedValue([{ id: "models/saved-model", name: "Saved Model" }, { id: "other-model", name: "Other" }]);
  await mount({ ...configured(), model: " models/saved-model " });
  expect(button("Save settings").disabled).toBe(true);
  await act(async () => Simulate.submit(host.querySelector("form")!));
  expect(onSave).not.toHaveBeenCalled();
  await advance();
  expect(field("model").value).toBe("saved-model");
  expect(button("Save settings").disabled).toBe(false);
});

it("combines case-insensitive name/ID search with OpenRouter categories locally and labels counts and pricing", async () => {
  vi.mocked(listAvailableModels).mockResolvedValue(categorizedModels);
  await mount(openRouterSettings()); await advance();
  expect([...field<HTMLSelectElement>("pricing-filter").options].map((option) => option.textContent)).toEqual(["All (5)", "Free (2)", "Paid (1)", "Unknown (2)"]);
  expect(field("model-search").labels?.[0]?.textContent).toContain("Search models by name or ID");
  expect(field<HTMLSelectElement>("pricing-filter").labels?.[0]?.textContent).toContain("Pricing category");
  expect(field<HTMLSelectElement>("model").textContent).toContain("Alpha Chat — lab/alpha-free (Free)");
  expect(field<HTMLSelectElement>("model").textContent).toContain("Alpha Pro — lab/alpha-paid (Paid)");
  expect(field<HTMLSelectElement>("model").textContent).toContain("Alpha Legacy — lab/alpha-missing (Unknown)");
  expect(host.textContent).toContain("reported text input and output prices are zero");
  expect(host.textContent).toContain("account quota or access, or guarantee zero future charges");
  await change("model-search", "  aLPHa  ");
  await change("pricing-filter", "free");
  expect([...field<HTMLSelectElement>("model").options].map((option) => option.value)).toEqual(["", "lab/alpha-free"]);
  expect(host.querySelector('[id$="-model-count"]')?.textContent).toBe("Showing 1 of 5 loaded models.");
  await change("pricing-filter", "paid");
  expect([...field<HTMLSelectElement>("model").options].map((option) => option.value)).toEqual(["", "lab/alpha-paid"]);
  await change("pricing-filter", "unknown");
  expect([...field<HTMLSelectElement>("model").options].map((option) => option.value)).toEqual(["", "lab/alpha-missing"]);
  await change("model-search", "LAB/BETA-UNKNOWN");
  expect([...field<HTMLSelectElement>("model").options].map((option) => option.value)).toEqual(["", "lab/beta-unknown"]);
  await check("remember", true);
  await advance(5000);
  expect(listAvailableModels).toHaveBeenCalledOnce();
});

it("shows helpful filtered empty results and cannot save or silently replace a hidden selection", async () => {
  vi.mocked(listAvailableModels).mockResolvedValue(categorizedModels);
  await mount(openRouterSettings()); await advance();
  await change("model", "lab/alpha-free");
  expect(button("Save settings").disabled).toBe(false);
  await change("pricing-filter", "paid");
  expect(field("model").value).toBe("");
  expect(button("Save settings").disabled).toBe(true);
  await act(async () => Simulate.submit(host.querySelector("form")!));
  expect(onSave).not.toHaveBeenCalled();
  await change("pricing-filter", "free");
  expect(field("model").value).toBe("");
  expect(button("Save settings").disabled).toBe(true);
  await change("model", "lab/alpha-free");
  await change("model-search", "Beta");
  expect(field("model").value).toBe("");
  expect(button("Save settings").disabled).toBe(true);
  await change("model-search", "no-such-model");
  expect(host.querySelector('[id$="-model-count"]')?.textContent).toBe("Showing 0 of 5 loaded models.");
  expect(host.textContent).toContain("No models match your search and pricing category");
  expect(host.textContent).toContain("Clear the search or choose All categories");
  expect(field<HTMLSelectElement>("model").disabled).toBe(true);
  await act(async () => Simulate.submit(host.querySelector("form")!));
  expect(onSave).not.toHaveBeenCalled();
  await change("model-search", ""); await change("pricing-filter", "all");
  expect(field("model").value).toBe("");
  expect(button("Save settings").disabled).toBe(true);
  expect(listAvailableModels).toHaveBeenCalledOnce();
});

it("preserves an explicitly chosen model while still visible and saves that exact ID", async () => {
  vi.mocked(listAvailableModels).mockResolvedValue(categorizedModels);
  await mount(openRouterSettings()); await advance();
  await change("model", "lab/alpha-free");
  await change("model-search", "ALPHA"); await change("pricing-filter", "free");
  expect(field("model").value).toBe("lab/alpha-free");
  expect(button("Save settings").disabled).toBe(false);
  await change("model-search", ""); await change("pricing-filter", "all");
  expect(field("model").value).toBe("lab/alpha-free");
  await act(async () => Simulate.submit(host.querySelector("form")!));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ model: "lab/alpha-free" }));
  expect(listAvailableModels).toHaveBeenCalledOnce();
});

it("resets search and category on explicit reload and verifies the existing selection again", async () => {
  vi.mocked(listAvailableModels).mockResolvedValue(categorizedModels);
  await mount(openRouterSettings()); await advance();
  await change("model", "lab/alpha-free");
  await change("model-search", "Alpha"); await change("pricing-filter", "free");
  const pending = deferred(); vi.mocked(listAvailableModels).mockReturnValueOnce(pending.promise);
  await click("Load available models");
  expect(button("Save settings").disabled).toBe(true);
  await act(async () => pending.resolve(categorizedModels));
  expect(field("model-search").value).toBe("");
  expect(field("pricing-filter").value).toBe("all");
  expect(host.querySelector('[id$="-model-count"]')?.textContent).toBe("Showing 5 of 5 loaded models.");
  expect(field("model").value).toBe("lab/alpha-free");
  expect(button("Save settings").disabled).toBe(false);
  expect(listAvailableModels).toHaveBeenCalledTimes(2);
});

it("resets filters immediately on connection edits and waits for debounce or manual refresh", async () => {
  vi.mocked(listAvailableModels).mockResolvedValue(categorizedModels);
  await mount(openRouterSettings()); await click("Load available models");
  for (const connection of ["key", "endpoint", "provider"]) {
    await change("model-search", "Alpha"); await change("pricing-filter", "free");
    await change("model", "lab/alpha-free");
    if (connection === "key") await change("key", "FAKE_CHANGED_KEY");
    else if (connection === "endpoint") await change("endpoint", "https://example.test/v1/chat/completions");
    else await change("provider", "openai");
    expect(host.querySelector('[id$="-model-search"]')).toBeNull();
    expect(field("model").value).toBe("");
    expect(button("Save settings").disabled).toBe(true);
    expect(listAvailableModels).toHaveBeenCalledTimes(connection === "key" ? 1 : connection === "endpoint" ? 2 : 3);
    await change("key", "FAKE_RELOAD_KEY");
    await click("Load available models");
    expect(field("model-search").value).toBe("");
    if (connection === "provider") expect(host.querySelector('[id$="-pricing-filter"]')).toBeNull();
    else expect(field("pricing-filter").value).toBe("all");
    expect(host.querySelector('[id$="-model-count"]')?.textContent).toBe("Showing 5 of 5 loaded models.");
  }
  expect(listAvailableModels).toHaveBeenCalledTimes(4);
});

it("searches other providers without offering an OpenRouter category filter", async () => {
  await mount(); await advance();
  expect(host.querySelector('[id$="-pricing-filter"]')).toBeNull();
  await change("model-search", "DISCOVERED TWO");
  expect([...field<HTMLSelectElement>("model").options].map((option) => option.value)).toEqual(["", "discovered-two"]);
  await change("model-search", "not present");
  expect(host.textContent).toContain("No models match your search. Clear the search to see more models.");
  expect(listAvailableModels).toHaveBeenCalledOnce();
});

it("warns about a saved model absent from the returned list without choosing a replacement", async () => {
  await mount(); await advance();
  expect(host.textContent).toContain("saved model “saved-model” was not returned");
  expect(field("model").value).toBe("");
  expect(button("Save settings").disabled).toBe(true);
});

it("aborts and ignores an old provider's resolving request while keeping a newer list", async () => {
  const old = deferred();
  vi.mocked(listAvailableModels).mockReturnValueOnce(old.promise);
  await mount(); await advance();
  const signal = vi.mocked(listAvailableModels).mock.calls[0][1]!;
  expect(button("Save settings").disabled).toBe(true);
  await change("provider", "openai");
  expect(signal.aborted).toBe(true);
  await change("key", "FAKE_NEW_PROVIDER_KEY");
  await advance();
  await act(async () => old.resolve([{ id: "stale-provider-model", name: "Stale Provider" }]));
  expect(host.textContent).not.toContain("Stale Provider");
  expect(host.textContent).toContain("Discovered One");
});

it("aborts and ignores a list from a previous key and clears an already selected model", async () => {
  await mount(); await advance(); await change("model", "discovered-one");
  const old = deferred(); vi.mocked(listAvailableModels).mockReturnValueOnce(old.promise);
  await click("Load available models");
  const signal = vi.mocked(listAvailableModels).mock.calls[1][1]!;
  await change("key", "FAKE_NEW_KEY");
  expect(signal.aborted).toBe(true);
  await act(async () => old.resolve([{ id: "old-key-model", name: "Old Key Model" }]));
  expect(host.textContent).not.toContain("Old Key Model");
  expect(field("model").value).toBe("");
  expect(button("Save settings").disabled).toBe(true);
  expect(listAvailableModels).toHaveBeenCalledTimes(2);
});

it("invalidates connection discovery and clears credentials when changing endpoint URLs", async () => {
  await mount({ ...configured(), provider: "openai-compatible", endpoint: "https://example.test/v1/chat/completions", rememberKey: true });
  await click("Load available models"); await change("model", "discovered-one");
  await change("models-endpoint", "https://example.test/available-models");
  expect(field("key").value).toBe("");
  expect(field("remember").checked).toBe(false);
  expect(field("model").value).toBe("");
  expect(host.textContent).not.toContain("Discovered One");
  await change("key", "FAKE_OTHER_KEY");
  const pending = deferred(); vi.mocked(listAvailableModels).mockReturnValueOnce(pending.promise);
  await click("Load available models");
  expect(listAvailableModels).toHaveBeenLastCalledWith(expect.objectContaining({ modelsEndpoint: "https://example.test/available-models" }), expect.any(AbortSignal));
  const signal = vi.mocked(listAvailableModels).mock.calls[1][1]!;
  await change("endpoint", "https://example.test/v1/chat/completions");
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve([{ id: "old-endpoint", name: "Old Endpoint" }]));
  expect(host.textContent).not.toContain("Old Endpoint");
});

it("can cancel model loading and ignores a late success", async () => {
  const pending = deferred(); vi.mocked(listAvailableModels).mockReturnValueOnce(pending.promise);
  await mount(); await advance();
  const signal = vi.mocked(listAvailableModels).mock.calls[0][1]!;
  expect(host.textContent).toContain("Loading available models…");
  await click("Cancel model loading");
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve([{ id: "late-model", name: "Late Model" }]));
  expect(host.textContent).not.toContain("Late Model");
  expect(button("Load available models").disabled).toBe(false);
  expect(button("Save settings").disabled).toBe(true);
  await advance(5000);
  expect(listAvailableModels).toHaveBeenCalledOnce();
});

it("aborts on close and unmount and ignores resolving or rejecting requests afterward", async () => {
  const first = deferred(); const second = deferred();
  vi.mocked(listAvailableModels).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await mount(); await click("Load available models");
  const firstSignal = vi.mocked(listAvailableModels).mock.calls[0][1]!;
  await click("Close AI provider settings");
  expect(onClose).toHaveBeenCalledOnce();
  expect(firstSignal.aborted).toBe(true);
  await act(async () => first.resolve([{ id: "closed-model", name: "Closed Model" }]));
  expect(host.textContent).not.toContain("Closed Model");
  await click("Load available models");
  const secondSignal = vi.mocked(listAvailableModels).mock.calls[1][1]!;
  await act(async () => { root.unmount(); mounted = false; });
  expect(secondSignal.aborted).toBe(true);
  await act(async () => second.reject(new Error("Late provider failure")));
  expect(host.textContent).toBe("");
  expect(onSave).not.toHaveBeenCalled();
});

it("shows actionable 404 instructions without exposing provider response text or credentials", async () => {
  vi.mocked(listAvailableModels).mockRejectedValue(new Error("API 404: FAKE_DIALOG_TEST_KEY raw response"));
  await mount(); await advance();
  const message = host.querySelector('[role="alert"]')?.textContent;
  expect(message).toContain("404");
  expect(message).toContain("models-list URL");
  expect(message).toContain("manual model ID fallback");
  expect(message).not.toContain("FAKE_DIALOG_TEST_KEY");
  expect(message).not.toContain("raw response");
  expect(button("Save settings").disabled).toBe(true);
});

it("reports empty results and never enables saving without a discovered selection", async () => {
  vi.mocked(listAvailableModels).mockResolvedValue([]);
  await mount(); await advance();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("No available models were returned");
  expect(field<HTMLSelectElement>("model").disabled).toBe(true);
  expect(button("Save settings").disabled).toBe(true);
  await advance(5000);
  expect(listAvailableModels).toHaveBeenCalledOnce();
});

it("allows an explicitly labeled unverified manual model fallback only for Custom", async () => {
  await mount();
  expect(host.querySelector('[id$="-manual"]')).toBeNull();
  await change("provider", "openai-compatible");
  await change("endpoint", "https://example.test/v1/chat/completions");
  await change("key", "FAKE_CUSTOM_KEY");
  expect(host.textContent).toContain("Manual model ID fallback (unsupported model-list API)");
  await act(async () => { const checkbox = field("manual"); checkbox.checked = true; Simulate.change(checkbox); });
  expect(host.querySelector('select[id$="-model"]')).toBeNull();
  expect(button("Save settings").disabled).toBe(true);
  await change("manual-model", "documented-server-model");
  await advance(5000);
  expect(host.textContent).toContain("not discovered or verified");
  expect(listAvailableModels).not.toHaveBeenCalled();
  expect(button("Save settings").disabled).toBe(false);
  await act(async () => Simulate.submit(host.querySelector("form")!));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ provider: "openai-compatible", model: "documented-server-model" }));
  await change("provider", "anthropic");
  expect(host.querySelector('[id$="-manual"]')).toBeNull();
  expect(button("Save settings").disabled).toBe(true);
});

it("traps focus, blocks underlying shortcuts, closes with Escape, and restores focus", async () => {
  const previous = document.createElement("button"); document.body.append(previous); previous.focus();
  const underlyingShortcut = vi.fn(); window.addEventListener("keydown", underlyingShortcut);
  try {
    await mount();
    const first = button("Close AI provider settings");
    expect(document.activeElement).toBe(first);
    const last = button("Cancel"); last.focus();
    await act(async () => last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(first);
    await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(last);
    await act(async () => field("key").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true })));
    expect(underlyingShortcut).not.toHaveBeenCalled();
    const pending = deferred(); vi.mocked(listAvailableModels).mockReturnValueOnce(pending.promise);
    await click("Load available models");
    const signal = vi.mocked(listAvailableModels).mock.calls[0][1]!;
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(signal.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    expect(underlyingShortcut).not.toHaveBeenCalled();
    await act(async () => { root.unmount(); mounted = false; });
    expect(document.activeElement).toBe(previous);
  } finally {
    window.removeEventListener("keydown", underlyingShortcut); previous.remove();
  }
});

it("debounces rapid connection edits for 700ms and sends only the final key", async () => {
  await mount({ ...DEFAULT_AI_SETTINGS });
  await change("provider", "openai");
  await advance(1000);
  expect(listAvailableModels).not.toHaveBeenCalled();
  await change("key", "FAKE_FIRST_KEY");
  await advance(400);
  await change("key", "FAKE_SECOND_KEY");
  await advance(600);
  await change("key", "FAKE_FINAL_KEY");
  await advance(699);
  expect(listAvailableModels).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Available models will load automatically");
  await advance(1);
  expect(listAvailableModels).toHaveBeenCalledOnce();
  expect(listAvailableModels).toHaveBeenLastCalledWith(expect.objectContaining({ provider: "openai", apiKey: "FAKE_FINAL_KEY" }), expect.any(AbortSignal));
  expect(field("model").value).toBe("");
  expect(onSave).not.toHaveBeenCalled();
  await advance(5000);
  expect(listAvailableModels).toHaveBeenCalledOnce();
});

it("auto-loads saved valid settings once and keeps consent changes made during the wait", async () => {
  vi.mocked(listAvailableModels).mockResolvedValue([{ id: "saved-model", name: "Saved model" }]);
  await mount({ ...configured(), rememberKey: true });
  await advance(400);
  await check("remember", false);
  await advance(299);
  expect(listAvailableModels).not.toHaveBeenCalled();
  await advance(1);
  expect(listAvailableModels).toHaveBeenCalledWith(expect.objectContaining({ model: "saved-model", rememberKey: false }), expect.any(AbortSignal));
  expect(field("model").value).toBe("saved-model");
  expect(field("remember").checked).toBe(false);
  await change("model", "saved-model");
  await advance(5000);
  expect(listAvailableModels).toHaveBeenCalledOnce();
});

it.each([
  { apiKey: "" },
  { apiKey: "   " },
  { apiKey: "FAKE\nINVALID_KEY" },
  { apiKey: "x".repeat(4097) },
  { endpoint: "not-a-url" },
  { endpoint: "http://remote.test/v1beta" },
  { endpoint: "https://example.test/v1beta?token=secret" },
  { modelsEndpoint: "not-a-models-url" },
  { provider: "openai-compatible" as const, endpoint: "" },
  { provider: "openai" as const, endpoint: "https://api.openai.com/v1" },
])("does not auto-load an invalid connection %#", async (invalid) => {
  await mount({ ...configured(), ...invalid });
  await advance(5000);
  expect(listAvailableModels).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(button("Save settings").disabled).toBe(true);
});

it("cancels a queued automatic request until the connection is edited", async () => {
  await mount();
  await advance(500);
  await click("Cancel model loading");
  await check("remember", true);
  await advance(5000);
  expect(listAvailableModels).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Model loading cancelled");
  await change("key", "FAKE_REARMED_KEY");
  await advance(699);
  expect(listAvailableModels).not.toHaveBeenCalled();
  await advance(1);
  expect(listAvailableModels).toHaveBeenCalledOnce();
});

it("manual refresh clears the queued automatic request without a second dispatch", async () => {
  const pending = deferred();
  vi.mocked(listAvailableModels).mockReturnValueOnce(pending.promise);
  await mount();
  await advance(400);
  await click("Load available models");
  await advance(5000);
  expect(listAvailableModels).toHaveBeenCalledOnce();
  await act(async () => pending.resolve([{ id: "manual-refresh", name: "Manual Refresh" }]));
  await advance(5000);
  expect(listAvailableModels).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Manual Refresh");
  await click("Load available models");
  await advance(5000);
  expect(listAvailableModels).toHaveBeenCalledTimes(2);
});

it("does not automatically retry failures but permits manual retry and later connection edits", async () => {
  vi.mocked(listAvailableModels).mockRejectedValueOnce(new Error("Failure containing FAKE_DIALOG_TEST_KEY"));
  await mount();
  await advance();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Could not load available models");
  expect(host.textContent).not.toContain("FAKE_DIALOG_TEST_KEY");
  await check("remember", true);
  await advance(5000);
  expect(listAvailableModels).toHaveBeenCalledOnce();
  await click("Load available models");
  expect(host.textContent).toContain("Discovered One");
  await advance(5000);
  expect(listAvailableModels).toHaveBeenCalledTimes(2);
  await change("key", "FAKE_NEW_RETRY_KEY");
  await advance();
  expect(listAvailableModels).toHaveBeenCalledTimes(3);
});

it("does not duplicate automatic discovery in StrictMode", async () => {
  const pending = deferred();
  vi.mocked(listAvailableModels).mockReturnValueOnce(pending.promise);
  await mount(configured(), true);
  await advance(699);
  expect(listAvailableModels).not.toHaveBeenCalled();
  await advance(1);
  expect(listAvailableModels).toHaveBeenCalledOnce();
  expect(vi.mocked(listAvailableModels).mock.calls[0][1]?.aborted).toBe(false);
  await check("remember", true);
  await advance(5000);
  expect(listAvailableModels).toHaveBeenCalledOnce();
  await act(async () => pending.resolve([{ id: "strict-model", name: "Strict Model" }]));
  await advance(5000);
  expect(listAvailableModels).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Strict Model");
});

it.each(["Close AI provider settings", "Cancel", "Forget key", "Escape", "unmount"])("clears queued discovery on %s", async (action) => {
  await mount();
  await advance(400);
  if (action === "unmount") await act(async () => { root.unmount(); mounted = false; });
  else if (action === "Escape") await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  else await click(action);
  await advance(5000);
  expect(listAvailableModels).not.toHaveBeenCalled();
  if (action === "Forget key") {
    expect(field("key").value).toBe("");
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "", rememberKey: false }));
  }
});

it("aborts automatic discovery on Forget and cannot repopulate the forgotten connection", async () => {
  const pending = deferred();
  vi.mocked(listAvailableModels).mockReturnValueOnce(pending.promise);
  await mount(); await advance();
  const signal = vi.mocked(listAvailableModels).mock.calls[0][1]!;
  await click("Forget key");
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve([{ id: "forgotten-model", name: "Forgotten Model" }]));
  await advance(5000);
  expect(host.textContent).not.toContain("Forgotten Model");
  expect(field("key").value).toBe("");
  expect(listAvailableModels).toHaveBeenCalledOnce();
});

it("ignores old automatic failures while the replacement connection is queued and loading", async () => {
  const old = deferred(); const next = deferred();
  vi.mocked(listAvailableModels).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  await mount(); await advance();
  const signal = vi.mocked(listAvailableModels).mock.calls[0][1]!;
  await change("key", "FAKE_REPLACEMENT_CONNECTION");
  expect(signal.aborted).toBe(true);
  await advance();
  await act(async () => old.reject(new Error("404 old request")));
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.textContent).toContain("Loading available models…");
  await act(async () => next.resolve([{ id: "new-connection-model", name: "New Connection Model" }]));
  expect(host.textContent).toContain("New Connection Model");
  await advance(5000);
  expect(listAvailableModels).toHaveBeenCalledTimes(2);
});

it("clears queued discovery on endpoint and provider changes until a fresh key is entered", async () => {
  await mount(); await advance(400);
  await change("endpoint", "https://example.test/v1beta");
  await advance(5000);
  expect(listAvailableModels).not.toHaveBeenCalled();
  await change("key", "FAKE_ENDPOINT_KEY");
  await advance(400);
  await change("provider", "openrouter");
  await advance(5000);
  expect(listAvailableModels).not.toHaveBeenCalled();
  await change("key", "FAKE_PROVIDER_KEY"); await advance();
  expect(listAvailableModels).toHaveBeenCalledOnce();
  expect(listAvailableModels).toHaveBeenCalledWith(expect.objectContaining({ provider: "openrouter", apiKey: "FAKE_PROVIDER_KEY" }), expect.any(AbortSignal));
});

it("manual fallback aborts automatic discovery and connection edits never load while it is enabled", async () => {
  const pending = deferred();
  vi.mocked(listAvailableModels).mockReturnValueOnce(pending.promise);
  await mount({ ...configured(), provider: "openai-compatible", endpoint: "https://example.test/v1/chat/completions" });
  await advance();
  const signal = vi.mocked(listAvailableModels).mock.calls[0][1]!;
  await check("manual", true);
  expect(signal.aborted).toBe(true);
  await change("key", "FAKE_MANUAL_KEY");
  await change("manual-model", "manual-only-model");
  await act(async () => pending.resolve([{ id: "stale-auto-model", name: "Stale Automatic Model" }]));
  await advance(5000);
  expect(host.textContent).not.toContain("Stale Automatic Model");
  expect(listAvailableModels).toHaveBeenCalledOnce();
  expect(button("Load available models").disabled).toBe(true);
  expect(button("Save settings").disabled).toBe(false);
});

it("explains automatic request cost and scope before any selected-model test", async () => {
  await mount();
  expect(host.querySelector('[id$="-description"]')?.textContent).toContain("consume quota and may cost tokens");
  expect(host.textContent).toContain("not remaining quota, correctness, streaming, or full DSA generation");
  expect(host.textContent).toContain("Saving does not require a successful test");
  expect(host.textContent).toContain("Model not verified.");
  expect(button("Test model").disabled).toBe(true);
  await advance(5000);
  expect(testAiModel).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("Model responded");
});

it("debounces an explicit selection for 500ms and shows success only after genuine completion", async () => {
  const pending = deferred<{ durationMs: number }>();
  vi.mocked(testAiModel).mockReturnValueOnce(pending.promise);
  await mount(); await advance(); await change("model", "discovered-one");
  expect(host.textContent).toContain("Model test queued…");
  expect(button("Save settings").disabled).toBe(false);
  await advance(499);
  expect(testAiModel).not.toHaveBeenCalled();
  await advance(1);
  expect(testAiModel).toHaveBeenCalledOnce();
  expect(testAiModel).toHaveBeenCalledWith(expect.objectContaining({ model: "discovered-one", apiKey: configured().apiKey, endpoint: configured().endpoint }), expect.any(AbortSignal));
  expect(host.textContent).toContain("Testing model JSON reply…");
  expect(host.textContent).not.toContain("Model responded");
  expect(button("Test model").disabled).toBe(true);
  expect(button("Save settings").disabled).toBe(false);
  await act(async () => pending.resolve({ durationMs: 42 }));
  expect(host.textContent).toContain("Model responded (42 ms)");
  await advance(5000);
  expect(testAiModel).toHaveBeenCalledOnce();
});

it("tests a saved model only after rediscovery completes and never while the list loads", async () => {
  const pending = deferred(); vi.mocked(listAvailableModels).mockReturnValueOnce(pending.promise);
  await mount(); await advance(5000);
  expect(testAiModel).not.toHaveBeenCalled();
  expect(button("Test model").disabled).toBe(true);
  await act(async () => pending.resolve([{ id: "models/saved-model", name: "Saved" }]));
  expect(host.textContent).toContain("Model test queued…");
  await advance(500);
  expect(testAiModel).toHaveBeenCalledOnce();
  expect(testAiModel).toHaveBeenCalledWith(expect.objectContaining({ model: "saved-model" }), expect.any(AbortSignal));
});

it("debounces rapid model changes and ignores an older in-flight success or failure", async () => {
  const old = deferred<{ durationMs: number }>(); const next = deferred<{ durationMs: number }>();
  vi.mocked(testAiModel).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  await mount(); await advance();
  await change("model", "discovered-one"); await advance(400);
  await change("model", "discovered-two"); await advance(499);
  expect(testAiModel).not.toHaveBeenCalled();
  await advance(1);
  expect(testAiModel).toHaveBeenLastCalledWith(expect.objectContaining({ model: "discovered-two" }), expect.any(AbortSignal));
  const oldSignal = vi.mocked(testAiModel).mock.calls[0][1]!;
  await change("model", "discovered-one");
  expect(oldSignal.aborted).toBe(true);
  await advance(500);
  await act(async () => old.resolve({ durationMs: 999 }));
  expect(host.textContent).toContain("Testing model JSON reply…");
  expect(host.textContent).not.toContain("999 ms");
  await act(async () => next.reject(new Error("provider raw FAKE_DIALOG_TEST_KEY")));
  expect(host.textContent).toContain("Model not verified: could not complete the JSON test");
  expect(host.textContent).not.toContain("provider raw");
  await advance(5000);
  expect(testAiModel).toHaveBeenCalledTimes(2);
});

it("does not repeat probes for consent/search/category changes, same-model selection, or parent rerenders", async () => {
  vi.mocked(listAvailableModels).mockResolvedValue(categorizedModels);
  const pending = deferred<{ durationMs: number }>(); vi.mocked(testAiModel).mockReturnValueOnce(pending.promise);
  await mount(openRouterSettings(), true); await advance();
  await change("model", "lab/alpha-free"); await advance(250);
  await check("remember", true); await change("model-search", "Alpha"); await change("pricing-filter", "free");
  await change("model", "lab/alpha-free");
  await mount(openRouterSettings(), true);
  await advance(249); expect(testAiModel).not.toHaveBeenCalled();
  await advance(1); expect(testAiModel).toHaveBeenCalledOnce();
  const signal = vi.mocked(testAiModel).mock.calls[0][1]!;
  await change("model-search", ""); await change("pricing-filter", "all"); await check("remember", false);
  expect(signal.aborted).toBe(false);
  await act(async () => pending.resolve({ durationMs: 17 }));
  await change("model", "lab/alpha-free"); await advance(5000);
  expect(testAiModel).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Model responded (17 ms)");
});

it("manual Test model replaces the queued probe without duplicates and Cancel prevents automatic retry", async () => {
  const pending = deferred<{ durationMs: number }>(); vi.mocked(testAiModel).mockReturnValueOnce(pending.promise);
  await mount(); await advance(); await change("model", "discovered-one"); await advance(200);
  await click("Test model");
  const signal = vi.mocked(testAiModel).mock.calls[0][1]!;
  await advance(5000); expect(testAiModel).toHaveBeenCalledOnce();
  await click("Cancel model test"); expect(signal.aborted).toBe(true);
  expect(host.textContent).toContain("Model test cancelled. Model not verified.");
  await act(async () => pending.resolve({ durationMs: 77 }));
  expect(host.textContent).not.toContain("Model responded");
  await check("remember", true); await change("model-search", "Discovered"); await advance(5000);
  expect(testAiModel).toHaveBeenCalledOnce();
  await click("Test model"); expect(testAiModel).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("Model responded (123 ms)");
});

it("can cancel a queued test, then save without making a test request", async () => {
  await mount(); await advance(); await change("model", "discovered-one");
  await click("Cancel model test"); await advance(5000);
  expect(testAiModel).not.toHaveBeenCalled();
  await act(async () => Simulate.submit(host.querySelector("form")!));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ model: "discovered-one" }));
});

const resetActions = ["key", "provider", "endpoint", "filter", "reload", "Forget key", "Close AI provider settings", "Cancel", "Escape", "unmount"];
async function resetSelection(action: string) {
  if (action === "key") await change("key", "FAKE_RESET_KEY");
  else if (action === "provider") await change("provider", "openai");
  else if (action === "endpoint") await change("endpoint", "https://example.test/v1beta");
  else if (action === "filter") await change("model-search", "Discovered Two");
  else if (action === "reload") await click("Load available models");
  else if (action === "Escape") await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  else if (action === "unmount") await act(async () => { root.unmount(); mounted = false; });
  else await click(action);
}

it.each(resetActions)("clears a queued probe on %s", async action => {
  await mount(); await advance(); await change("model", "discovered-one"); await advance(300);
  if (action === "reload") vi.mocked(listAvailableModels).mockReturnValueOnce(new Promise(() => {}));
  await resetSelection(action); await advance(5000);
  expect(testAiModel).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("Model responded");
});

it.each(resetActions)("aborts an active probe on %s and ignores late results", async action => {
  const pending = deferred<{ durationMs: number }>(); vi.mocked(testAiModel).mockReturnValueOnce(pending.promise);
  await mount(); await advance(); await change("model", "discovered-one"); await advance(500);
  const signal = vi.mocked(testAiModel).mock.calls[0][1]!;
  if (action === "reload") vi.mocked(listAvailableModels).mockReturnValueOnce(new Promise(() => {}));
  await resetSelection(action);
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve({ durationMs: 888 })); await advance(5000);
  expect(host.textContent).not.toContain("Model responded");
  expect(testAiModel).toHaveBeenCalledOnce();
});

it("reload rechecks the exact rediscovered model but not the stale test", async () => {
  const old = deferred<{ durationMs: number }>(); vi.mocked(testAiModel).mockReturnValueOnce(old.promise);
  await mount(); await advance(); await change("model", "discovered-one"); await advance(500);
  const signal = vi.mocked(testAiModel).mock.calls[0][1]!;
  await click("Load available models"); expect(signal.aborted).toBe(true);
  await act(async () => old.reject(new Error("HTTP 404 OLD_PRIVATE_KEY")));
  expect(host.textContent).toContain("Model test queued…");
  await advance(500);
  expect(testAiModel).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("Model responded (123 ms)");
  expect(host.textContent).not.toContain("HTTP 404");
});

it("tests debounced manual IDs and clears probes for manual ID, models URL, and fallback changes", async () => {
  const pending = deferred<{ durationMs: number }>(); vi.mocked(testAiModel).mockReturnValueOnce(pending.promise);
  await mount({ ...configured(), provider: "openai-compatible", endpoint: "https://custom.test/v1/chat/completions" });
  await check("manual", true); await change("manual-model", "first-id"); await advance(400);
  await change("manual-model", "final-id"); await advance(500);
  expect(testAiModel).toHaveBeenCalledOnce();
  expect(testAiModel).toHaveBeenCalledWith(expect.objectContaining({ model: "final-id" }), expect.any(AbortSignal));
  const signal = vi.mocked(testAiModel).mock.calls[0][1]!;
  await change("manual-model", "replacement-id"); expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve({ durationMs: 999 }));
  expect(host.textContent).not.toContain("999 ms");
  await change("models-endpoint", "https://custom.test/models"); await advance(5000);
  expect(testAiModel).toHaveBeenCalledOnce();
  expect(field("key").value).toBe("");
  await change("key", "FAKE_MANUAL_REPLACEMENT"); await change("manual-model", "another-id");
  await check("manual", false); await advance(5000);
  expect(testAiModel).toHaveBeenCalledOnce();
  expect(listAvailableModels).not.toHaveBeenCalled();
});

it.each([
  ["Model test timed out after 20 seconds. SECRET", "test timed out after 20 seconds"],
  ["The provider rejected the API key or permissions. SECRET", "rejected the API key or permissions"],
  ["rate limit or quota SECRET", "rate limit or quota was reached"],
  ["HTTP 404 SECRET", "route was not found (HTTP 404)"],
  ["HTTP 500 SECRET", "request failed (HTTP 500)"],
  ["blocked or refused SECRET", "blocked or refused the test request"],
  ["incomplete SECRET", "response was incomplete"],
  ["exceeded 64 KiB SECRET", "response exceeded 64 KiB"],
  ["expected JSON reply SECRET", "expected JSON reply"],
  ["raw provider response SECRET", "could not complete the JSON test"],
])("sanitizes test failure %s, never retries, and permits saving", async (message, expected) => {
  vi.mocked(testAiModel).mockRejectedValueOnce(new Error(message));
  await mount(); await advance(); await change("model", "discovered-one"); await advance(500);
  expect(host.textContent).toContain(`Model not verified: `);
  expect(host.textContent).toContain(expected);
  expect(host.textContent).not.toContain("SECRET");
  expect(host.textContent).not.toContain("Model responded");
  if (message.includes("timed out")) expect(host.textContent).toContain("does not mean the model is unavailable");
  await check("remember", true); await advance(5000);
  expect(testAiModel).toHaveBeenCalledOnce();
  expect(button("Save settings").disabled).toBe(false);
  await act(async () => Simulate.submit(host.querySelector("form")!));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ model: "discovered-one" }));
});

it.each([{}, { durationMs: NaN }, { durationMs: -1 }])("never fabricates success from an invalid test result", async result => {
  vi.mocked(testAiModel).mockResolvedValueOnce(result as { durationMs: number });
  await mount(); await advance(); await change("model", "discovered-one"); await advance(500);
  expect(host.textContent).toContain("Model not verified");
  expect(host.textContent).not.toContain("Model responded");
});

it("never probes invalid manual settings", async () => {
  await mount({ ...configured(), provider: "openai-compatible", endpoint: "https://custom.test/v1/chat/completions" });
  await check("manual", true);
  await change("manual-model", "x".repeat(201)); await advance(5000);
  expect(button("Test model").disabled).toBe(true);
  expect(testAiModel).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("Model responded");
});
