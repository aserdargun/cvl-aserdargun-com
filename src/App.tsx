import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, Cpu, Globe, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { layerContent, LAYER_CONTENT, readingLink } from "./content/experiments";
import { UI, localized, type Locale } from "./content/i18n";
import { LAYERS, runLayer } from "./engine/pipeline";
import { buildScene } from "./engine/scene";
import { cpuReport, selectEngine, type EngineReport } from "./engine/selectEngine";
import type { ExperimentRun, LayerId, Scene } from "./engine/types";

const SIZE = 320;

function paint(canvas: HTMLCanvasElement, values: Float64Array | Uint8Array | null, width: number, height: number, colour: (v: number) => [number, number, number, number]): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const image = context.createImageData(width, height);
  for (let i = 0; i < width * height; i += 1) {
    const [r, g, b, a] = colour(values ? values[i] : 0);
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = a;
  }
  context.putImageData(image, 0, 0);
}

function grey(value: number): [number, number, number, number] {
  const level = Math.round(Math.max(0, Math.min(1, value)) * 255);
  return [level, level, level, 255];
}

function ink(value: number): [number, number, number, number] {
  return value === 1 ? [183, 244, 93, 255] : [18, 20, 22, 255];
}

function Panel({ title, values, scene, tone }: { title: string; values: Float64Array | Uint8Array; scene: Scene; tone: "grey" | "ink" }): React.JSX.Element {
  const ref = useCallback((node: HTMLCanvasElement | null) => {
    if (node) paint(node, values, scene.size.width, scene.size.height, tone === "grey" ? grey : ink);
  }, [values, scene, tone]);
  return (
    <figure className="panel">
      <canvas ref={ref} width={scene.size.width} height={scene.size.height} style={{ width: SIZE, height: (SIZE * scene.size.height) / scene.size.width }} />
      <figcaption>{title}</figcaption>
    </figure>
  );
}

function metricRows(run: ExperimentRun, locale: Locale): { key: string; value: string }[] {
  return Object.entries(run.metrics).map(([key, value]) => ({
    key,
    value: value === null ? localized(locale, UI.notMeasured) : String(value),
  }));
}

export default function App(): React.JSX.Element {
  const [locale, setLocale] = useState<Locale>("tr");
  const [seed, setSeed] = useState(20261006);
  const [layer, setLayer] = useState<LayerId>("edges");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<ExperimentRun | null>(null);
  const [engine, setEngine] = useState<EngineReport>(cpuReport());

  const scene = useMemo(() => buildScene({ seed }), [seed]);

  useEffect(() => {
    setBusy(true);
    // Yield once so the interface can paint the "measuring" state before a
    // synchronous measurement blocks the thread.
    const timer = setTimeout(() => {
      setRun(runLayer(layer, scene));
      setBusy(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [layer, scene]);

  useEffect(() => {
    let cancelled = false;
    selectEngine().then((report) => {
      if (!cancelled) setEngine(report);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const content = layerContent(layer);
  const t = (text: typeof UI.title) => localized(locale, text);

  return (
    <div className="app">
      <header className="masthead">
        <div className="brand">
          <span className="mark">CVL</span>
          <div>
            <h1>{t(UI.title)}</h1>
            <p className="tagline">{t(UI.tagline)}</p>
          </div>
        </div>
        <button
          type="button"
          className="locale"
          onClick={() => setLocale(locale === "tr" ? "en" : "tr")}
          data-testid="locale-toggle"
        >
          {locale === "tr" ? UI.language.tr : UI.language.en}
        </button>
      </header>

      <p className="intro">{t(UI.intro)}</p>

      <section className="controls" aria-label={t(UI.layers)}>
        <nav className="layer-nav">
          {LAYERS.map((id) => {
            const entry = layerContent(id);
            return (
              <button
                type="button"
                key={id}
                className={id === layer ? "layer active" : "layer"}
                onClick={() => setLayer(id)}
                data-testid={`layer-${id}`}
              >
                <span className="index">{entry.index}</span>
                <span className="name">{localized(locale, entry.title)}</span>
              </button>
            );
          })}
        </nav>
        <div className="seed">
          <label htmlFor="seed">{t(UI.seed)}</label>
          <input
            id="seed"
            type="number"
            value={seed}
            min={1}
            onChange={(event) => setSeed(Math.max(1, Number(event.target.value) || 1))}
            data-testid="seed-input"
          />
          <button type="button" onClick={() => setRun(runLayer(layer, scene))} data-testid="rerun">
            {t(UI.rerun)}
          </button>
        </div>
      </section>

      <section className="stage" aria-live="polite">
        <Panel title={t(UI.scene)} values={scene.luminance} scene={scene} tone="grey" />
        <Panel title={t(UI.truth)} values={run ? run.truth.mask : scene.truth.foreground} scene={scene} tone="ink" />
        <Panel title={t(UI.measured)} values={run ? run.measured.mask : scene.truth.foreground} scene={scene} tone="ink" />
      </section>

      <section className="reading" data-testid="reading">
        <h2>
          <span className="index">{content.index}</span> {localized(locale, content.title)}
        </h2>
        <p className="reading-note">{t(UI.readingNote)}</p>
        <a
          className="read-in-vis"
          href={readingLink(content.readsIn)}
          target="_blank"
          rel="noreferrer"
          data-testid="read-in-vis"
        >
          <ExternalLink size={14} aria-hidden="true" />
          {t(UI.readInVis)}
        </a>
      </section>

      <section className="metrics" aria-label={t(UI.metrics)}>
        <h2>{t(UI.metrics)}</h2>
        {busy || !run ? (
          <p data-testid="busy">{t(UI.running)}</p>
        ) : (
          <table data-testid="metrics-table">
            <tbody>
              {metricRows(run, locale).map((row) => (
                <tr key={row.key} className={row.key === content.headlineMetric ? "headline" : undefined}>
                  <th scope="row">{row.key}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {run ? <p className="notes">{t(UI.notes)}: {run.notes}</p> : null}
      </section>

      <section className="engine" aria-label={t(UI.engine)}>
        <h2>{t(UI.engine)}</h2>
        <p data-testid="engine-summary">{engine.summary}</p>
        <ul>
          {engine.capabilities.map((capability) => (
            <li key={capability.layer} data-testid={`capability-${capability.layer}`}>
              {capability.gpu ? <Globe size={13} aria-hidden="true" /> : <Cpu size={13} aria-hidden="true" />}
              <strong>{capability.layer}</strong>
              <span>{capability.reason}</span>
            </li>
          ))}
        </ul>
        <p className="probe" data-testid="adapter-probe">
          {engine.probe.deviceFound ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
          secureContext={String(engine.probe.secureContext)} · navigator.gpu={String(engine.probe.hasNavigatorGpu)} ·
          adapter={String(engine.probe.adapterFound)} · device={String(engine.probe.deviceFound)}
          {engine.probe.vendor ? ` · vendor=${engine.probe.vendor}` : ""}
          {engine.probe.unavailableReason ? ` · ${engine.probe.unavailableReason}` : ""}
        </p>
      </section>

      <footer className="footer">
        <Layers size={14} aria-hidden="true" />
        {t(UI.footer)}
      </footer>
    </div>
  );
}

export { LAYER_CONTENT };