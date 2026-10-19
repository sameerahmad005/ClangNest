import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AI_PROVIDERS, providerPreset, listAvailableModels, testAiModel, validateAiConnection, validateAiSettings } from "../lib/ai-practice";
import type { AiModel, AiSettings } from "../types/practice";
import "./practice.css";

export interface AiSettingsDialogProps {
  settings: AiSettings;
  onSave(settings: AiSettings): void;
  onClose(): void;
}

function modelTestFailure(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "";
  if (/timed out/.test(message)) return "Model not verified: the test timed out after 20 seconds. Try again; this does not mean the model is unavailable.";
  if (/API key or permissions/.test(message)) return "Model not verified: the provider rejected the API key or permissions. Check your key and model access.";
  if (/rate limit or quota/.test(message)) return "Model not verified: the provider's rate limit or quota was reached. Check your quota or wait before trying again.";
  if (/HTTP 404/.test(message)) return "Model not verified: the model or generation route was not found (HTTP 404). Refresh the list and check the endpoint.";
  if (/HTTP 500/.test(message)) return "Model not verified: the provider request failed (HTTP 500). Try again later.";
  if (/blocked or refused/.test(message)) return "Model not verified: the provider blocked or refused the test request.";
  if (/incomplete/.test(message)) return "Model not verified: the provider response was incomplete.";
  if (/exceeded 64 KiB/.test(message)) return "Model not verified: the provider response exceeded 64 KiB.";
  if (/expected JSON reply/.test(message)) return "Model not verified: the provider did not return the expected JSON reply.";
  return "Model not verified: could not complete the JSON test. Check the endpoint, API key, model access, and browser CORS support.";
}

export function AiSettingsDialog({ settings, onSave, onClose }: AiSettingsDialogProps) {
  const [draft, setDraft] = useState<AiSettings>(() => ({ ...settings }));
  const [providerChosen, setProviderChosen] = useState(() => Boolean(settings.model.trim() || settings.apiKey.trim()));
  const [models, setModels] = useState<AiModel[] | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [pricingFilter, setPricingFilter] = useState<"all" | NonNullable<AiModel["pricingCategory"]>>("all");
  const [loading, setLoading] = useState(false);
  const [queued, setQueued] = useState(false);
  const [manualModel, setManualModel] = useState(false);
  const [missingModel, setMissingModel] = useState("");
  const [modelDiscovery, setModelDiscovery] = useState(0);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoAttempted = useRef(false);
  const [modelTest, setModelTest] = useState<{ phase: "idle" | "queued" | "testing" | "success" | "failure" | "cancelled"; message?: string }>({ phase: "idle" });
  const modelTestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelTestRequest = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const id = useId();

  const abortModelTest = () => {
    if (modelTestTimer.current !== null) clearTimeout(modelTestTimer.current);
    modelTestTimer.current = null;
    modelTestRequest.current?.abort();
    modelTestRequest.current = null;
    setModelTest({ phase: "idle" });
  };
  const abortRequest = () => {
    abortModelTest();
    if (autoTimer.current !== null) clearTimeout(autoTimer.current);
    autoTimer.current = null;
    setQueued(false);
    request.current?.abort();
    request.current = null;
    setLoading(false);
  };
  const dismiss = () => {
    autoAttempted.current = true;
    abortRequest();
    close.current();
  };

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    if (!element) return;
    const controls = () => Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]'));
    controls()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      } else if (event.key === "Tab") {
        const items = controls();
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    const keepFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !element.contains(event.target)) controls()[0]?.focus();
    };
    document.addEventListener("keydown", handleKey, true);
    document.addEventListener("focusin", keepFocus);
    return () => {
      if (autoTimer.current !== null) clearTimeout(autoTimer.current);
      autoTimer.current = null;
      request.current?.abort();
      request.current = null;
      if (modelTestTimer.current !== null) clearTimeout(modelTestTimer.current);
      modelTestTimer.current = null;
      modelTestRequest.current?.abort();
      modelTestRequest.current = null;
      document.removeEventListener("keydown", handleKey, true);
      document.removeEventListener("focusin", keepFocus);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const resetFilters = () => {
    setModelSearch("");
    setPricingFilter("all");
  };
  const matchesFilters = (model: AiModel, search: string, category: typeof pricingFilter) => {
    const query = search.trim().toLowerCase();
    return (model.name.toLowerCase().includes(query) || model.id.toLowerCase().includes(query))
      && (draft.provider !== "openrouter" || category === "all" || (model.pricingCategory ?? "unknown") === category);
  };
  const visibleModels = models?.filter((model) => matchesFilters(model, modelSearch, pricingFilter));
  const changeFilters = (search: string, category: typeof pricingFilter) => {
    setModelSearch(search);
    setPricingFilter(category);
    if (!models?.some((model) => model.id === draft.model && matchesFilters(model, search, category))) {
      abortModelTest();
      setDraft({ ...draft, model: "" });
    }
  };

  const changeProvider = (provider: AiSettings["provider"]) => {
    abortRequest();
    autoAttempted.current = false;
    resetFilters();
    setProviderChosen(true);
    setDraft({ provider, endpoint: providerPreset(provider).endpoint, model: "", apiKey: "", rememberKey: false });
    setModels(null);
    setManualModel(false);
    setMissingModel("");
    setError("");
  };

  const changeConnection = (changes: Partial<AiSettings>) => {
    abortRequest();
    autoAttempted.current = false;
    resetFilters();
    setDraft({ ...draft, ...changes, model: "" });
    setModels(null);
    setMissingModel("");
    setError("");
  };

  const loadModels = async () => {
    autoAttempted.current = true;
    abortRequest();
    resetFilters();
    setError("");
    try {
      validateAiConnection(draft);
    } catch {
      setError("Check your provider, endpoint URL, models-list URL, and API key before loading models.");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const normalize = (model: string) => draft.provider === "gemini" ? model.trim().replace(/^(?:models\/)+/, "") : model.trim();
    const previousModel = normalize(draft.model);
    setDraft({ ...draft, model: "" });
    setModels(null);
    setMissingModel("");
    setLoading(true);
    try {
      const available = await listAvailableModels(draft, controller.signal);
      if (request.current !== controller || controller.signal.aborted) return;
      const discovered = available.map((model) => ({ ...model, id: normalize(model.id) })).filter((model) => model.id);
      setModels(discovered);
      if (!discovered.length) {
        setError("No available models were returned. Check this key's model access and the models-list endpoint, then try again.");
      }
      const found = discovered.some((model) => model.id === previousModel);
      setDraft((current) => ({ ...current, model: found ? previousModel : "" }));
      if (found) setModelDiscovery((current) => current + 1);
      if (previousModel && !found) setMissingModel(previousModel);
    } catch (cause) {
      if (request.current !== controller || controller.signal.aborted) return;
      // Provider response bodies can contain credentials; show only fixed diagnostic text.
      const message = cause instanceof Error ? cause.message : "";
      setError(/404|not found/i.test(message)
        ? "Model-list API returned 404 (not found). Check the provider and endpoint path. For a nonstandard server, choose Custom and enter its models-list URL, or explicitly enable the manual model ID fallback if it has no model-list API."
        : "Could not load available models. Check the endpoint, API key, model-list permissions, and browser CORS support, then try again.");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  };

  // Read the latest model/consent without restarting the connection debounce.
  const latestLoadModels = useRef(loadModels);
  latestLoadModels.current = loadModels;
  useEffect(() => {
    if (!providerChosen || manualModel || autoAttempted.current) return;
    try {
      validateAiConnection(draft);
    } catch {
      return;
    }
    setQueued(true);
    autoTimer.current = setTimeout(() => {
      autoTimer.current = null;
      void latestLoadModels.current();
    }, 700);
    return () => {
      if (autoTimer.current !== null) clearTimeout(autoTimer.current);
      autoTimer.current = null;
    };
  }, [providerChosen, draft.provider, draft.endpoint, draft.modelsEndpoint, draft.apiKey, manualModel]);

  const canSave = providerChosen && !loading && Boolean(draft.apiKey.trim() && draft.model.trim())
    && (manualModel && draft.provider === "openai-compatible" || Boolean(visibleModels?.some((model) => model.id === draft.model)));
  let canTest = canSave;
  try { validateAiSettings(draft); } catch { canTest = false; }

  const runModelTest = async () => {
    abortModelTest();
    if (!canTest) return;
    const controller = new AbortController();
    modelTestRequest.current = controller;
    setModelTest({ phase: "testing" });
    try {
      const result = await testAiModel({ ...draft }, controller.signal);
      if (modelTestRequest.current !== controller || controller.signal.aborted) return;
      if (!result || !Number.isFinite(result.durationMs) || result.durationMs < 0) throw new Error("Invalid test result");
      setModelTest({ phase: "success", message: `Model responded (${Math.round(result.durationMs)} ms)` });
    } catch (cause) {
      if (modelTestRequest.current !== controller || controller.signal.aborted) return;
      setModelTest({ phase: "failure", message: modelTestFailure(cause) });
    } finally {
      if (modelTestRequest.current === controller) modelTestRequest.current = null;
    }
  };
  const latestModelTest = useRef(runModelTest);
  latestModelTest.current = runModelTest;
  useEffect(() => {
    abortModelTest();
    if (!canTest) return;
    setModelTest({ phase: "queued" });
    modelTestTimer.current = setTimeout(() => {
      modelTestTimer.current = null;
      void latestModelTest.current();
    }, 500);
    return () => {
      if (modelTestTimer.current !== null) clearTimeout(modelTestTimer.current);
      modelTestTimer.current = null;
      modelTestRequest.current?.abort();
      modelTestRequest.current = null;
    };
  }, [canTest, draft.provider, draft.endpoint, draft.modelsEndpoint, draft.apiKey, draft.model, manualModel, modelDiscovery]);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    setError("");
    try {
      validateAiSettings(draft);
      abortModelTest();
      onSave({ ...draft });
    } catch {
      // Keep credentials and provider responses out of validation messages.
      setError("Could not save settings. Check the endpoint URL, model, and API key, then try again.");
    }
  };

  return <div className="ai-dialog-backdrop">
    <div className="ai-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} ref={dialog} onKeyDown={(event) => event.stopPropagation()}>
      <header className="ai-dialog-header"><div><span className="ai-eyebrow">DSA PRACTICE</span><h2 id={`${id}-title`}>AI provider settings</h2></div><button type="button" className="ai-close" aria-label="Close AI provider settings" onClick={dismiss}>×</button></header>
      <form className="ai-form" onSubmit={save}>
        <p className="ai-description" id={`${id}-description`}>Choose a provider and add your key. Available models load automatically after you finish editing the connection. Use Load available models to refresh or retry, then choose a model. A selected model is tested automatically after a short pause. These tiny requests consume quota and may cost tokens. The test checks only a small JSON reply, not remaining quota, correctness, streaming, or full DSA generation. Saving does not require a successful test.</p>
        <h3 className="ai-step">1. Choose provider</h3>
        <label className="ai-field" htmlFor={`${id}-provider`}>Provider
          <select id={`${id}-provider`} required value={providerChosen ? draft.provider : ""} onChange={(event) => changeProvider(event.target.value as AiSettings["provider"])}>
            <option value="" disabled>Choose a provider…</option>
            {AI_PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select>
        </label>
        <nav className="ai-key-links" aria-label="Provider API keys" aria-describedby={`${id}-key-links-help`}>
          <p className="ai-help" id={`${id}-key-links-help`}>Get an API key (opens in a new tab):</p>
          {AI_PROVIDERS.filter((provider) => provider.apiKeyUrl).map((provider) => <a key={provider.id} href={provider.apiKeyUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Get ${provider.name} API key (opens in a new tab)`}>{provider.name}</a>)}
        </nav>
        <h3 className="ai-step">2. Add your API key and endpoint</h3>
        <label className="ai-field" htmlFor={`${id}-key`}>API key
          <input id={`${id}-key`} type="password" required disabled={!providerChosen} value={draft.apiKey} autoComplete="off" spellCheck={false} autoCapitalize="none" aria-describedby={`${id}-key-help`} onChange={(event) => changeConnection({ apiKey: event.target.value })} />
        </label>
        <p className="ai-help" id={`${id}-key-help`}>{providerChosen && draft.provider === "openai-compatible" && <>For Custom, obtain an API key from your server administrator. </>}Session-only by default. Changing providers clears the key and resets device storage consent. Editing the connection clears the model selection.</p>
        <label className="ai-field" htmlFor={`${id}-endpoint`}>{draft.provider === "gemini" ? "Gemini API base URL" : draft.provider === "anthropic" ? "Anthropic messages endpoint URL" : "Full chat completions endpoint URL"}
          <input id={`${id}-endpoint`} type="url" required disabled={!providerChosen} value={providerChosen ? draft.endpoint : ""} spellCheck={false} autoComplete="off" aria-describedby={`${id}-endpoint-help`} onChange={(event) => changeConnection({ endpoint: event.target.value, apiKey: "", rememberKey: false })} />
        </label>
        <p className="ai-help" id={`${id}-endpoint-help`}>{draft.provider === "gemini" ? "Use the Gemini base URL; generation adds the model and generateContent route." : draft.provider === "anthropic" ? "Use the complete Anthropic messages URL, including /v1/messages." : "Use the complete chat completions URL, including its full path."} Changing this URL clears your key.</p>
        {providerChosen && draft.provider === "openai-compatible" && <label className="ai-field" htmlFor={`${id}-models-endpoint`}>Models-list URL (optional, for nonstandard servers)
          <input id={`${id}-models-endpoint`} type="url" value={draft.modelsEndpoint ?? ""} spellCheck={false} autoComplete="off" onChange={(event) => changeConnection({ modelsEndpoint: event.target.value, apiKey: "", rememberKey: false })} />
        </label>}
        <label className="ai-checkbox" htmlFor={`${id}-remember`}><input id={`${id}-remember`} type="checkbox" checked={draft.rememberKey} aria-describedby={`${id}-storage-help`} onChange={(event) => setDraft({ ...draft, rememberKey: event.target.checked })} /><span>Remember on this device</span></label>
        <p className="ai-warning" id={`${id}-storage-help`}>Remembering saves your API key in readable localStorage, not encrypted storage. Scripts on this site and anyone with access to your browser profile may read it.</p>
        <h3 className="ai-step">3. Load and choose an available model</h3>
        <div className="ai-model-actions"><button type="button" className="ai-button" disabled={!providerChosen || !draft.apiKey.trim() || loading || manualModel} onClick={() => { void loadModels(); }}>Load available models</button>{(loading || queued) && <><span role="status">{loading ? "Loading available models…" : "Available models will load automatically…"}</span><button type="button" className="ai-button" onClick={() => { autoAttempted.current = true; abortRequest(); setError("Model loading cancelled. Load again when ready."); }}>Cancel model loading</button></>}</div>
        {!manualModel && models !== null && <>
          <label className="ai-field" htmlFor={`${id}-model-search`}>Search models by name or ID
            <input id={`${id}-model-search`} type="search" value={modelSearch} autoComplete="off" spellCheck={false} aria-describedby={`${id}-model-count`} onChange={(event) => changeFilters(event.target.value, pricingFilter)} />
          </label>
          {draft.provider === "openrouter" && <>
            <label className="ai-field" htmlFor={`${id}-pricing-filter`}>Pricing category
              <select id={`${id}-pricing-filter`} value={pricingFilter} aria-describedby={`${id}-pricing-help ${id}-model-count`} onChange={(event) => changeFilters(modelSearch, event.target.value as typeof pricingFilter)}>
                <option value="all">All ({models.length})</option>
                <option value="free">Free ({models.filter((model) => model.pricingCategory === "free").length})</option>
                <option value="paid">Paid ({models.filter((model) => model.pricingCategory === "paid").length})</option>
                <option value="unknown">Unknown ({models.filter((model) => !model.pricingCategory || model.pricingCategory === "unknown").length})</option>
              </select>
            </label>
            <p className="ai-help" id={`${id}-pricing-help`}>Free means the reported text input and output prices are zero. Categories do not describe your account quota or access, or guarantee zero future charges. Unknown means pricing could not be determined.</p>
          </>}
          <p className="ai-help" id={`${id}-model-count`} role="status">Showing {visibleModels?.length ?? 0} of {models.length} loaded models.</p>
          {models.length > 0 && !visibleModels?.length && <p className="ai-help">No models match your search{draft.provider === "openrouter" ? " and pricing category" : ""}. Clear the search{draft.provider === "openrouter" ? " or choose All categories" : ""} to see more models.</p>}
        </>}
        {!manualModel && <label className="ai-field" htmlFor={`${id}-model`}>Available model
          <select id={`${id}-model`} required disabled={loading || !visibleModels?.length} value={visibleModels?.some((model) => model.id === draft.model) ? draft.model : ""} onChange={(event) => { if (event.target.value !== draft.model) abortModelTest(); setDraft({ ...draft, model: event.target.value }); setMissingModel(""); }}>
            <option value="" disabled>{visibleModels?.length ? "Choose an available model…" : models?.length ? "No matching models" : "Load models to choose…"}</option>
            {visibleModels?.map((model) => <option key={model.id} value={model.id}>{model.name} — {model.id}{draft.provider === "openrouter" ? ` (${model.pricingCategory === "free" ? "Free" : model.pricingCategory === "paid" ? "Paid" : "Unknown"})` : ""}</option>)}
          </select>
        </label>}
        {!manualModel && models === null && !loading && draft.model && <p className="ai-help">Saved model: {draft.model}. Load available models to verify this model before saving.</p>}
        {missingModel && <p className="ai-warning" role="status">The saved model “{missingModel}” was not returned for this key. Choose a listed model; no replacement has been selected.</p>}
        {providerChosen && draft.provider === "openai-compatible" && <>
          <label className="ai-checkbox" htmlFor={`${id}-manual`}><input id={`${id}-manual`} type="checkbox" checked={manualModel} onChange={(event) => { autoAttempted.current = true; abortRequest(); resetFilters(); setManualModel(event.target.checked); setDraft({ ...draft, model: "" }); setMissingModel(""); setError(""); }} /><span>Manual model ID fallback (unsupported model-list API)</span></label>
          {manualModel && <><label className="ai-field" htmlFor={`${id}-manual-model`}>Manual model ID
            <input id={`${id}-manual-model`} required value={draft.model} spellCheck={false} autoComplete="off" onChange={(event) => { if (event.target.value !== draft.model) abortModelTest(); setDraft({ ...draft, model: event.target.value }); }} />
          </label><p className="ai-warning">This ID is entered manually, not discovered or verified by a model list. Check the server documentation for an exact supported model ID; the JSON test below checks only a tiny reply.</p></>}
        </>}
        <div className="ai-model-actions"><button type="button" className="ai-button" disabled={!canTest || modelTest.phase === "testing"} onClick={() => { void runModelTest(); }}>Test model</button>{(modelTest.phase === "queued" || modelTest.phase === "testing") && <button type="button" className="ai-button" onClick={() => { abortModelTest(); setModelTest({ phase: "cancelled", message: "Model test cancelled. Model not verified." }); }}>Cancel model test</button>}</div>
        <p className={modelTest.phase === "failure" ? "ai-error" : "ai-help"} role="status" aria-live="polite">{modelTest.phase === "queued" ? "Model test queued…" : modelTest.phase === "testing" ? "Testing model JSON reply…" : modelTest.message ?? "Model not verified."}</p>
        <div className="ai-request-note"><strong>Direct browser requests</strong><p>Requests go directly from this browser to your generation endpoint and, if provided, your models-list endpoint. Both receive your API key; use only endpoints you trust. Their servers must allow browser requests through CORS. Some providers block these requests.</p></div>
        <p className="ai-help">Being listed does not guarantee that a model supports chat, structured JSON output, or access with your key. Generation may still report a provider error.</p>
        {error && <p className="ai-error" role="alert">{error}</p>}
        <footer className="ai-dialog-footer"><button type="button" className="ai-button" onClick={() => {
          autoAttempted.current = true;
          abortRequest();
          resetFilters();
          setDraft({ ...draft, apiKey: "", model: "", rememberKey: false });
          setModels(null);
          setMissingModel("");
          try { onSave({ ...settings, apiKey: "", rememberKey: false }); }
          catch { setError("Could not remove the stored key. Check browser storage permissions."); }
        }}>Forget key</button><button type="button" className="ai-button" onClick={dismiss}>Cancel</button><button type="submit" className="ai-button ai-primary" disabled={!canSave}>Save settings</button></footer>
      </form>
    </div>
  </div>;
}

export default AiSettingsDialog;
