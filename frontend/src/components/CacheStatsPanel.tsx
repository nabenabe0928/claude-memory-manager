import { useEffect, useRef, useState } from "react";
import type { CacheStats, CacheStatsAgent, CacheStatsTurn, ModelPricing, PricingTable } from "../types";
import {
  NO_VALUE,
  agentLabel,
  buildCacheStatsExport,
  cacheStatsFilename,
  downloadJson,
  formatCompactNumber,
  formatCost,
  formatPercent,
  representativeModel,
  turnCost,
} from "../utils";
import "./SessionDetail.css";

// Cause values that do not represent a cache miss (see backend/cache_stats.py contract).
const CAUSE_NORMAL = "-";
const CAUSE_SESSION_START = "session start";

type MarkerShape = "square" | "diamond" | "triangleUp" | "triangleDown" | "circle" | "cross";

// Identity is carried by SHAPE, not hue: six categorical colors fail colorblind-safety
// validation, so every miss marker is drawn in --danger and separated by its outline.
const CAUSE_SHAPES: Record<string, MarkerShape> = {
  "MODEL SWITCH": "square",
  "CC UPGRADE": "diamond",
  "EFFORT CHANGE": "triangleUp",
  COMPACT: "triangleDown",
  "TTL expiry": "circle",
  unexplained: "cross",
};
const FALLBACK_SHAPE: MarkerShape = "cross";

const VIEW_W = 960;
const VIEW_H = 200;
const PAD_TOP = 14;
const PAD_RIGHT = 14;
const PAD_BOTTOM = 30;
const PAD_LEFT = 42;
const PLOT_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM;
const MISS_R = 5;
const POINT_R = 3;
const AXIS_FONT = 11;
const MAX_DOT_TURNS = 60;
const X_TICK_TARGET = 6;

const GRID_LINES = [
  { ratio: 1, label: "100%" },
  { ratio: 0.5, label: "50%" },
  { ratio: 0, label: "0%" },
];

interface PlotPoint {
  turn: number;
  x: number;
  y: number;
  hitRate: number;
  cause: string;
}

function isMissCause(cause: string): boolean {
  return cause !== CAUSE_NORMAL && cause !== CAUSE_SESSION_START;
}

function shapeForCause(cause: string): MarkerShape {
  return CAUSE_SHAPES[cause] ?? FALLBACK_SHAPE;
}

function xForTurn(turn: number, turnCount: number): number {
  if (turnCount <= 1) return PAD_LEFT + PLOT_W / 2;
  return PAD_LEFT + ((turn - 1) / (turnCount - 1)) * PLOT_W;
}

function yForRatio(ratio: number): number {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  return PAD_TOP + (1 - clamped) * PLOT_H;
}

// Null hit rates are skipped entirely (never plotted as 0) — they break the line into segments.
function buildPoints(turns: CacheStatsTurn[]): PlotPoint[] {
  const points: PlotPoint[] = [];
  turns.forEach((turn, index) => {
    if (typeof turn.hitRate !== "number" || !Number.isFinite(turn.hitRate)) return;
    points.push({
      turn: index + 1,
      x: xForTurn(index + 1, turns.length),
      y: yForRatio(turn.hitRate),
      hitRate: turn.hitRate,
      cause: turn.cause,
    });
  });
  return points;
}

// Consecutive turns form one polyline; a skipped turn starts a new segment (a visible gap).
function toSegments(points: PlotPoint[]): PlotPoint[][] {
  const segments: PlotPoint[][] = [];
  for (const point of points) {
    const current = segments[segments.length - 1];
    if (current && current[current.length - 1].turn === point.turn - 1) current.push(point);
    else segments.push([point]);
  }
  return segments;
}

// A handful of tick labels, not one per turn.
function xTickTurns(turnCount: number): number[] {
  const step = Math.max(1, Math.ceil(turnCount / X_TICK_TARGET));
  const ticks: number[] = [];
  for (let turn = 1; turn <= turnCount; turn += step) ticks.push(turn);
  const last = ticks[ticks.length - 1];
  if (last !== turnCount && turnCount - last >= step / 2) ticks.push(turnCount);
  return ticks;
}

function missCausesPresent(turns: CacheStatsTurn[]): string[] {
  const present = new Set(turns.filter((turn) => isMissCause(turn.cause)).map((turn) => turn.cause));
  const known = Object.keys(CAUSE_SHAPES).filter((cause) => present.has(cause));
  const unknown = [...present].filter((cause) => !(cause in CAUSE_SHAPES)).sort();
  return [...known, ...unknown];
}

function CauseMarker({ shape, cx, cy, r }: { shape: MarkerShape; cx: number; cy: number; r: number }) {
  const diamond = `${cx},${cy - r * 1.3} ${cx + r * 1.3},${cy} ${cx},${cy + r * 1.3} ${cx - r * 1.3},${cy}`;
  const triangleUp = `${cx},${cy - r * 1.25} ${cx + r * 1.2},${cy + r * 0.85} ${cx - r * 1.2},${cy + r * 0.85}`;
  const triangleDown = `${cx},${cy + r * 1.25} ${cx + r * 1.2},${cy - r * 0.85} ${cx - r * 1.2},${cy - r * 0.85}`;
  const cross = `M${cx - r},${cy - r} L${cx + r},${cy + r} M${cx - r},${cy + r} L${cx + r},${cy - r}`;
  switch (shape) {
    case "square":
      return (
        <rect
          x={cx - r}
          y={cy - r}
          width={r * 2}
          height={r * 2}
          fill="var(--danger)"
          stroke="var(--bg)"
          strokeWidth={2}
        />
      );
    case "diamond":
      return <polygon points={diamond} fill="var(--danger)" stroke="var(--bg)" strokeWidth={2} />;
    case "triangleUp":
      return <polygon points={triangleUp} fill="var(--danger)" stroke="var(--bg)" strokeWidth={2} />;
    case "triangleDown":
      return <polygon points={triangleDown} fill="var(--danger)" stroke="var(--bg)" strokeWidth={2} />;
    case "circle":
      return <circle cx={cx} cy={cy} r={r} fill="var(--danger)" stroke="var(--bg)" strokeWidth={2} />;
    default:
      return (
        <g>
          <path d={cross} stroke="var(--bg)" strokeWidth={r * 1.5} strokeLinecap="round" fill="none" />
          <path d={cross} stroke="var(--danger)" strokeWidth={r * 0.7} strokeLinecap="round" fill="none" />
        </g>
      );
  }
}

function CacheLegend({ causes }: { causes: string[] }) {
  if (causes.length === 0) return null;
  return (
    <ul className="cache-legend">
      {causes.map((cause) => (
        <li key={cause} className="cache-legend-item">
          <svg className="cache-legend-swatch" viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
            <CauseMarker shape={shapeForCause(cause)} cx={8} cy={8} r={5} />
          </svg>
          <span className="cache-legend-label">{cause}</span>
        </li>
      ))}
    </ul>
  );
}

function CacheTrajectory({ turns }: { turns: CacheStatsTurn[] }) {
  const points = buildPoints(turns);
  const causes = missCausesPresent(turns);
  if (points.length === 0) {
    return (
      <div className="cache-figure">
        <p className="cache-figure-empty">No per-turn hit rate to plot.</p>
      </div>
    );
  }
  const segments = toSegments(points);
  const misses = points.filter((point) => isMissCause(point.cause));
  const showAllDots = turns.length <= MAX_DOT_TURNS;
  const dots = points.filter(
    (point) =>
      !isMissCause(point.cause) &&
      (showAllDots || segments.some((segment) => segment.length === 1 && segment[0].turn === point.turn)),
  );
  const missNoun = misses.length === 1 ? "turn" : "turns";
  const ariaLabel =
    `Cache hit rate by turn: ${points.length} of ${turns.length} turns plotted, ` +
    `${misses.length} cache-miss ${missNoun} marked.`;

  return (
    <div className="cache-figure">
      <p className="cache-figure-title">Cache hit rate by turn</p>
      <svg className="cache-figure-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={ariaLabel}>
        {GRID_LINES.map((grid) => (
          <g key={grid.label}>
            <line
              x1={PAD_LEFT}
              y1={yForRatio(grid.ratio)}
              x2={VIEW_W - PAD_RIGHT}
              y2={yForRatio(grid.ratio)}
              stroke="var(--border-light)"
              strokeWidth={1}
            />
            <text
              x={PAD_LEFT - 7}
              y={yForRatio(grid.ratio) + 4}
              textAnchor="end"
              fontSize={AXIS_FONT}
              fill="var(--text-muted)"
            >
              {grid.label}
            </text>
          </g>
        ))}
        {xTickTurns(turns.length).map((turn) => (
          <text
            key={turn}
            x={xForTurn(turn, turns.length)}
            y={VIEW_H - PAD_BOTTOM + 17}
            textAnchor="middle"
            fontSize={AXIS_FONT}
            fill="var(--text-muted)"
          >
            {turn}
          </text>
        ))}
        <text
          x={PAD_LEFT + PLOT_W / 2}
          y={VIEW_H - 4}
          textAnchor="middle"
          fontSize={AXIS_FONT}
          fill="var(--text-muted)"
        >
          turn
        </text>
        {segments.map((segment) =>
          segment.length > 1 ? (
            <polyline
              key={segment[0].turn}
              points={segment.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null,
        )}
        {dots.map((point) => (
          <circle key={point.turn} cx={point.x} cy={point.y} r={POINT_R} fill="var(--primary)" />
        ))}
        {misses.map((point) => (
          <g key={point.turn} className="cache-miss-marker">
            <title>{`Turn ${point.turn} — ${point.cause} — ${formatPercent(point.hitRate)}`}</title>
            <CauseMarker shape={shapeForCause(point.cause)} cx={point.x} cy={point.y} r={MISS_R} />
          </g>
        ))}
      </svg>
      <CacheLegend causes={causes} />
    </div>
  );
}

function CacheTurnsTable({ turns, pricing }: { turns: CacheStatsTurn[]; pricing: PricingTable }) {
  // Local to this render only: each CacheTurnsTable instance (main table, each subagent's table)
  // derives its own running total from `turns`/`pricing`, never shared via state/store.
  const rows = turns.map((turn, index) => ({
    turn,
    index,
    cumulativeCost: turns
      .slice(0, index + 1)
      .reduce((sum, priorTurn) => sum + turnCost(priorTurn, pricing), 0),
  }));
  return (
    <div className="cache-table-scroll">
      <table className="cache-turns-table">
        <thead>
          <tr>
            <th scope="col">Turn</th>
            <th scope="col">Hit rate</th>
            <th scope="col">Cache read</th>
            <th scope="col">Cache creation</th>
            <th scope="col">Gap (s)</th>
            <th scope="col">TTL (s)</th>
            <th scope="col">Cost</th>
            <th scope="col">Model</th>
            <th scope="col">Cause</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ turn, index, cumulativeCost: rowCost }) => (
            <tr
              key={index}
              className={isMissCause(turn.cause) ? "cache-turn-row cache-turn-miss" : "cache-turn-row"}
            >
              <td>{index + 1}</td>
              <td>{formatPercent(turn.hitRate)}</td>
              <td>{turn.cacheRead}</td>
              <td>{turn.cacheCreation}</td>
              <td>{turn.gapS ?? NO_VALUE}</td>
              <td>{turn.ttlS}</td>
              <td>{formatCost(rowCost)}</td>
              <td>{turn.model}</td>
              <td>{turn.cause}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PRICING_URL = "https://platform.claude.com/docs/en/about-claude/pricing";

function CacheSchemaHint() {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const bodyId = "cache-schema-hint-body";

  const handleCopy = () => {
    const text = detailRef.current?.innerText ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="cache-schema-hint">
      <button
        className="collapsible-toggle cache-schema-toggle"
        onClick={() => setExpanded((shown) => !shown)}
        aria-expanded={expanded}
        aria-controls={bodyId}
      >
        <span className="collapsible-arrow">{expanded ? "▼" : "▶"}</span>
        Schema hint
      </button>
      {expanded && (
        <div id={bodyId} className="collapsible-detail cache-schema-detail">
          <button className="action-btn cache-schema-copy-btn" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy"}
          </button>
          <div ref={detailRef}>
            <p>
              Each entry in the downloaded JSON is keyed <code>&lt;role&gt;-&lt;model&gt;</code> (e.g.{" "}
              <code>main-claude-sonnet-4</code>) and holds one array per field below, aligned by turn index:
            </p>
            <ul>
              <li>
                <code>task</code> — label for the entry: <code>&quot;main&quot;</code> for the session, or
                the subagent&apos;s type / description.
              </li>
              <li>
                <code>ttl</code> — the TTL information: it shows how long the cache lives.
              </li>
              <li>
                <code>hit_rate</code> — cache_read / (cache_read + cache_creation) for the turn;{" "}
                <code>null</code> when neither counter is set.
              </li>
              <li>
                <code>read</code> — <code>cache_read_input_tokens</code>: prompt tokens served from cache.
              </li>
              <li>
                <code>create</code> — <code>cache_creation_input_tokens</code>: prompt tokens written to
                cache.
              </li>
              <li>
                <code>input</code> — <code>input_tokens</code>: prompt tokens neither read from nor written
                to cache.
              </li>
              <li>
                <code>output</code> — <code>output_tokens</code> generated for the turn.
              </li>
              <li>
                <code>gap</code> — seconds since the previous turn; <code>null</code> for the first turn.
              </li>
            </ul>
            <p>
              Token counts follow Anthropic&apos;s usage fields; see the{" "}
              <a href={PRICING_URL} target="_blank" rel="noopener noreferrer">
                Claude pricing page
              </a>{" "}
              for per-token-type rates (cache writes and reads are priced differently from regular input
              and output).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_RATES: ModelPricing = {
  baseInputRate: 0,
  fiveMinWriteRate: 0,
  oneHourWriteRate: 0,
  cacheReadRate: 0,
  outputRate: 0,
};

const PRICING_FIELDS: { key: keyof ModelPricing; label: string }[] = [
  { key: "baseInputRate", label: "Base input tokens" },
  { key: "fiveMinWriteRate", label: "5m cache writes" },
  { key: "oneHourWriteRate", label: "1h cache writes" },
  { key: "cacheReadRate", label: "Cache reads" },
  { key: "outputRate", label: "Output tokens" },
];

interface CachePricingEditorProps {
  models: string[];
  pricing: PricingTable;
  onPricingUpdate: (pricing: PricingTable) => void;
  onToast?: (message: string) => void;
}

function CachePricingEditor({ models, pricing, onPricingUpdate, onToast }: CachePricingEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [model, setModel] = useState(models[0] ?? "");
  const [rates, setRates] = useState<ModelPricing>(pricing[models[0] ?? ""] ?? EMPTY_RATES);
  const bodyId = "cache-pricing-editor-body";

  const selectModel = (nextModel: string) => {
    setModel(nextModel);
    setRates(pricing[nextModel] ?? EMPTY_RATES);
  };

  const handleFieldChange = (key: keyof ModelPricing, value: string) => {
    setRates((current) => ({ ...current, [key]: Number(value) }));
  };

  const handleSave = () => {
    fetch(`/api/pricing/${model}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rates),
    })
      .then((r) => r.json())
      .then((updated) => {
        onPricingUpdate(updated);
        onToast?.("Pricing saved!");
      });
  };

  return (
    <div className="cache-pricing-editor">
      <button
        className="collapsible-toggle cache-pricing-toggle"
        onClick={() => setExpanded((shown) => !shown)}
        aria-expanded={expanded}
        aria-controls={bodyId}
      >
        <span className="collapsible-arrow">{expanded ? "▼" : "▶"}</span>
        Update Claude pricing
      </button>
      {expanded && (
        <div id={bodyId} className="collapsible-detail cache-pricing-detail">
          <label className="cache-pricing-field">
            Model
            <select value={model} onChange={(e) => selectModel(e.target.value)}>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          {PRICING_FIELDS.map(({ key, label }) => (
            <label key={key} className="cache-pricing-field">
              {label} (USD / MTok)
              <input
                type="number"
                value={rates[key]}
                onChange={(e) => handleFieldChange(key, e.target.value)}
              />
            </label>
          ))}
          <button className="action-btn cache-pricing-save-btn" onClick={handleSave} disabled={!model}>
            Save
          </button>
        </div>
      )}
    </div>
  );
}

function CacheAgentSection({ agent, pricing }: { agent: CacheStatsAgent; pricing: PricingTable }) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = `cache-agent-body-${agent.agentId}`;
  const model = representativeModel(agent);
  const totalCost = agent.turns.reduce((sum, turn) => sum + turnCost(turn, pricing), 0);
  return (
    <div className="cache-agent">
      <button
        className="collapsible-toggle cache-agent-toggle"
        onClick={() => setExpanded((shown) => !shown)}
        aria-expanded={expanded}
        aria-controls={bodyId}
      >
        <span className="collapsible-arrow">{expanded ? "▼" : "▶"}</span>
        <span className="cache-agent-label">{agentLabel(agent)}</span>
        {model && <span className="cache-agent-model">{model}</span>}
        <span className="cache-agent-totals" title="Cache read / cache creation, total">
          {formatCompactNumber(agent.session.cacheRead)} / {formatCompactNumber(agent.session.cacheCreation)}
        </span>
        <span className="cache-agent-rate">{formatPercent(agent.session.hitRate)}</span>
        <span className="cache-agent-cost">{formatCost(totalCost)}</span>
      </button>
      {expanded && (
        <div id={bodyId} className="cache-agent-body">
          {agent.turns.length === 0 ? (
            <p className="cache-figure-empty">No per-turn cache data for this subagent.</p>
          ) : (
            <>
              <CacheTrajectory turns={agent.turns} />
              <CacheTurnsTable turns={agent.turns} pricing={pricing} />
            </>
          )}
          {agent.skipped > 0 && (
            <p className="cache-panel-note">{agent.skipped} turn(s) skipped.</p>
          )}
        </div>
      )}
    </div>
  );
}

// Distinct models observed in this session only (main turns + every subagent's turns),
// deduplicated, in first-seen order.
function distinctModels(stats: CacheStats): string[] {
  const models = new Set<string>();
  for (const turn of stats.turns) models.add(turn.model);
  for (const agent of stats.subagents) {
    for (const turn of agent.turns) models.add(turn.model);
  }
  return [...models];
}

interface Props {
  stats: CacheStats;
  projectName: string;
  sessionSummary: string;
  onToast?: (message: string) => void;
}

export function CacheStatsPanel({ stats, projectName, sessionSummary, onToast }: Props) {
  const turns = stats.turns;
  const [pricing, setPricing] = useState<PricingTable>({});

  useEffect(() => {
    fetch("/api/pricing")
      .then((r) => r.json())
      .then((data) => setPricing(data))
      .catch(() => setPricing({}));
  }, []);

  const models = distinctModels(stats);
  const mainAgentCost = turns.reduce((sum, turn) => sum + turnCost(turn, pricing), 0);
  const subagentsCost = stats.subagents.reduce(
    (sum, agent) => sum + agent.turns.reduce((agentSum, turn) => agentSum + turnCost(turn, pricing), 0),
    0,
  );
  const sessionCost = mainAgentCost + subagentsCost;

  return (
    <section id="cache-stats-panel" className="cache-stats-panel" aria-label="Per-turn cache stats">
      <p className="cache-session-cost-headline">
        Total Cost: {formatCost(sessionCost)} (Session), {formatCost(mainAgentCost)} (Main Agent)
      </p>
      <div className="cache-panel-toolbar">
        <CacheSchemaHint />
        <CachePricingEditor
          models={models}
          pricing={pricing}
          onPricingUpdate={setPricing}
          onToast={onToast}
        />
        <button
          className="action-btn cache-download-btn"
          onClick={() =>
            downloadJson(cacheStatsFilename(projectName, sessionSummary), buildCacheStatsExport(stats))
          }
          title="Download per-turn cache stats as JSON"
        >
          Download JSON
        </button>
      </div>
      {turns.length === 0 ? (
        <p className="cache-figure-empty">No per-turn cache data for this session.</p>
      ) : (
        <>
          <CacheTrajectory turns={turns} />
          <CacheTurnsTable turns={turns} pricing={pricing} />
        </>
      )}
      {stats.subagents.length > 0 && (
        <div className="cache-agents">
          <h3 className="cache-agents-heading">Subagents ({stats.subagents.length})</h3>
          {stats.subagents.map((agent) => (
            <CacheAgentSection key={agent.agentId} agent={agent} pricing={pricing} />
          ))}
        </div>
      )}
      <p className="cache-panel-note">
        Markers flag turns whose cache was invalidated; shape encodes the cause. &quot;unexplained&quot; is
        expected to be non-empty — MCP connect/disconnect and permission changes invalidate the cache
        without leaving a JSONL trace. TTL is the observed value (300s or 3600s), not a configured one.
        {stats.skipped > 0 && ` ${stats.skipped} turn(s) skipped.`}
      </p>
    </section>
  );
}
