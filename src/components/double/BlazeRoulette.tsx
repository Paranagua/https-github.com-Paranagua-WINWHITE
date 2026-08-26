import { useEffect, useRef, useState } from "react";
const BRANCO_IMG = "/images/branco.svg";
import { colorOf, type Color } from "./types";

type Result = { id: string; roll: number; color: Color; createdAt: string };
type Tile = { key: string; n: number; color: Color; real?: boolean };

const TILE_W = 96;
const GAP = 12;
const STEP = TILE_W + GAP;
const SPIN_MS = 4200;
const FILLER_COUNT = 28;
const TRAIL = 4;
const MAX_TILES = 220;
const AVG_CYCLE_SEC = 30; // used only for the progress bar cadence

function fillerTile(seed: number): Tile {
  const n = Math.floor(Math.random() * 15); // 0..14
  return {
    key: `f-${seed}-${Math.random().toString(36).slice(2, 8)}`,
    n,
    color: colorOf(n),
  };
}

export function BlazeRoulette({ results }: { results: Result[] }) {
  const latest = results[0];
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [pos, setPos] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [containerW, setContainerW] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      setContainerW(entries[0].contentRect.width);
    });
    ro.observe(el);
    setContainerW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // React to new latest result
  useEffect(() => {
    if (!latest) return;
    if (prevIdRef.current === latest.id) return;
    const isFirst = prevIdRef.current === null;
    prevIdRef.current = latest.id;

    const newTile: Tile = {
      key: `r-${latest.id}`,
      n: latest.roll,
      color: latest.color,
      real: true,
    };

    if (isFirst) {
      const left = Array.from({ length: 5 }, (_, i) => fillerTile(i));
      const right = Array.from({ length: 5 }, (_, i) => fillerTile(1000 + i));
      setTiles([...left, newTile, ...right]);
      setAnimate(false);
      setPos(5);
      return;
    }

    // Append fillers + real + trailing fillers, then animate pos to the new real index
    const seed = Date.now();
    const fillers = Array.from({ length: FILLER_COUNT }, (_, i) => fillerTile(seed + i));
    const trailing = Array.from({ length: TRAIL }, (_, i) => fillerTile(seed + 5000 + i));

    setTiles((prev) => {
      const newRealIndex = prev.length + FILLER_COUNT;
      // Kick off animation on the next frame so the browser commits the new DOM first.
      requestAnimationFrame(() => {
        setAnimate(true);
        setSpinning(true);
        setPos(newRealIndex);
      });
      return [...prev, ...fillers, newTile, ...trailing];
    });

    const t = window.setTimeout(() => {
      setSpinning(false);
      // Trim to keep memory bounded — done without animation once spin is over.
      setTiles((cur) => {
        if (cur.length <= MAX_TILES) return cur;
        const keepLast = 80;
        const trimAmt = cur.length - keepLast;
        setAnimate(false);
        setPos((p) => Math.max(0, p - trimAmt));
        return cur.slice(trimAmt);
      });
    }, SPIN_MS + 120);

    return () => window.clearTimeout(t);
  }, [latest]);

  const centerOffset = containerW / 2 - TILE_W / 2;
  const translateX = centerOffset - pos * STEP;

  return (
    <div className="glass-card px-4 pt-4 pb-5 sm:px-6 sm:pt-6 sm:pb-8">
      <RouletteHeader latestIso={latest?.createdAt} spinning={spinning} />

      <div
        ref={containerRef}
        className="relative mt-4 overflow-hidden rounded-2xl bg-[#090909] border border-white/[0.05]"
        style={{ height: TILE_W + 32 }}
      >
        {/* Center pointer */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 -translate-x-1/2">
          <div className="mx-auto h-full w-px bg-white/60" />
        </div>
        <div className="pointer-events-none absolute left-1/2 top-1 z-20 h-2 w-2 -translate-x-1/2 rotate-45 bg-white/80 rounded-[2px]" />
        <div className="pointer-events-none absolute left-1/2 bottom-1 z-20 h-2 w-2 -translate-x-1/2 rotate-45 bg-white/80 rounded-[2px]" />

        {/* Side fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-[#090909] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-[#090909] to-transparent" />

        <div
          className="absolute inset-y-0 flex items-center will-change-transform"
          style={{
            transform: `translate3d(${translateX}px, 0, 0)`,
            transition: animate
              ? `transform ${SPIN_MS}ms cubic-bezier(0.13, 0.66, 0.12, 1)`
              : "none",
            gap: `${GAP}px`,
            paddingLeft: 8,
            paddingRight: 8,
          }}
        >
          {tiles.map((t, i) => (
            <TileView key={t.key} tile={t} centered={!spinning && i === pos} />
          ))}
        </div>
      </div>

      <PreviousResults results={results} />
    </div>
  );
}

function TileView({ tile, centered }: { tile: Tile; centered?: boolean }) {
  const { n, color } = tile;
  const bgVar =
    color === "red"
      ? "linear-gradient(180deg, #FF3554 0%, #FF1F3D 100%)"
      : color === "black"
        ? "linear-gradient(180deg, #2A2A2A 0%, #1A1A1A 100%)"
        : "linear-gradient(180deg, #FFFFFF 0%, #D9D9D9 100%)";
  return (
    <div
      className={`relative shrink-0 grid place-items-center rounded-2xl border overflow-hidden ${
        centered ? "border-white/70 shadow-[0_0_32px_rgba(255,255,255,0.28)]" : "border-white/10"
      }`}
      style={{
        width: TILE_W,
        height: TILE_W,
        background: bgVar,
      }}
    >
      {color === "white" ? (
        <img
          src={BRANCO_IMG}
          alt="Branco"
          className="h-[62%] w-[62%] object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)] select-none pointer-events-none"
          draggable={false}
        />
      ) : (
        <div className="grid place-items-center h-[62%] w-[62%] rounded-full border-2 border-white/50 text-white font-black text-2xl tabular-nums font-outfit">
          {n}
        </div>
      )}
    </div>
  );
}

function PreviousResults({ results }: { results: Result[] }) {
  return (
    <div className="mt-5">
      <div className="text-[10px] tracking-[0.4em] text-[#FF1F3D] font-black font-outfit mb-3">
        GIROS ANTERIORES
      </div>
      <div className="flex flex-row-reverse items-center justify-end gap-1.5 overflow-hidden">
        {results.slice(0, 20).map((r) => (
          <SmallTile key={r.id} n={r.roll} color={r.color} />
        ))}
        {results.length === 0 && (
          <div className="text-xs text-muted-foreground">Aguardando resultados…</div>
        )}
      </div>
    </div>
  );
}

function SmallTile({ n, color }: { n: number; color: Color }) {
  const bg =
    color === "red"
      ? "linear-gradient(180deg, #FF3554 0%, #FF1F3D 100%)"
      : color === "black"
        ? "linear-gradient(180deg, #2A2A2A 0%, #1A1A1A 100%)"
        : "#FFFFFF";
  return (
    <div
      className="grid place-items-center h-7 w-7 rounded-md border border-white/10 text-white text-[11px] font-bold tabular-nums"
      style={{ background: bg }}
    >
      {color === "white" ? (
        <img
          src={BRANCO_IMG}
          alt="0"
          className="h-4 w-4 object-contain select-none pointer-events-none"
          draggable={false}
        />
      ) : (
        <span className="grid place-items-center h-5 w-5 rounded-full border border-white/50 font-outfit">
          {n}
        </span>
      )}
    </div>
  );
}

function RouletteHeader({ latestIso, spinning }: { latestIso?: string; spinning: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 400);
    return () => clearInterval(t);
  }, []);
  const elapsedSec = latestIso
    ? Math.max(0, Math.floor((now - new Date(latestIso).getTime()) / 1000))
    : 0;
  const mm = Math.floor(elapsedSec / 60);
  const ss = (elapsedSec % 60).toString().padStart(2, "0");
  const progress = spinning
    ? 100
    : Math.min(100, ((elapsedSec % AVG_CYCLE_SEC) / AVG_CYCLE_SEC) * 100);

  return (
    <div className="relative h-11 overflow-hidden rounded-xl border border-white/[0.05] bg-[#0C0C0C]">
      <div
        className="absolute inset-y-0 left-0 transition-[width] duration-300 ease-out"
        style={{
          width: `${progress}%`,
          background: "linear-gradient(90deg, #FF3554 0%, #FF1F3D 100%)",
          boxShadow: "0 0 15px rgba(255,31,61,0.3)",
        }}
      />
      <div className="relative flex h-full items-center justify-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-white font-outfit">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            spinning ? "bg-white shadow-[0_0_10px_white]" : "bg-[#FF1F3D] shadow-[0_0_10px_#FF1F3D]"
          } ${spinning ? "animate-pulse" : ""}`}
        />
        {spinning ? "Girando…" : `Girando Em ${mm}:${ss}`}
      </div>
    </div>
  );
}
