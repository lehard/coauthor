import { useEffect, useRef, type CSSProperties } from "react";

import { ANSWER_CAPTION } from "../content/demo";
import { FRAMES, GARAGE, NOTES, type Phrase } from "../content/garage";
import { LAYERS, LINKS, TIP, WEB_SIZE, web } from "../content/layers";
import { observeOnce, useRevealInside } from "../motion/hooks";

// «Знания о драматургии — под рукой» in the theme «Вечер у лампы» (openspec/specs/web/site, «Подход к истории»,
// «Что стоит за одним ответом»; design D3, D6–D9).

const delay = (d: number) => ({ "--d": d }) as CSSProperties;

const WEBS = LAYERS.map((layer, index) => web(layer.dots, 4 + index * 7));

/** The lines from the answer down through what it used, measured after layout (design D6). */
function useRoots(
  deepRef: React.RefObject<HTMLDivElement | null>,
  rootsRef: React.RefObject<SVGSVGElement | null>,
) {
  useEffect(() => {
    const deepElement = deepRef.current;
    const roots = rootsRef.current;
    if (deepElement === null || roots === null)
      throw new Error("StoryApproach: the layers are not mounted");
    const deep: HTMLDivElement = deepElement;
    const nodeOf = (key: string) => {
      const node = deep.querySelector(`[data-node="${key}"]`);
      if (node === null) throw new Error(`StoryApproach: no node ${key}`);
      return node;
    };
    const layerOf = (key: string) => {
      const layer = nodeOf(key).closest<HTMLElement>(".layer");
      if (layer === null)
        throw new Error(`StoryApproach: ${key} is not in a layer`);
      return layer;
    };
    const paths = LINKS.map(([from, to]) => {
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      roots.append(path);
      return { path, from: nodeOf(from), to: nodeOf(to), layer: layerOf(to) };
    });
    function draw() {
      const box = deep.getBoundingClientRect();
      for (const { path, from, to, layer } of paths) {
        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        const x1 = a.left + a.width / 2 - box.left;
        const y1 = a.bottom - box.top;
        const x2 = b.left + b.width / 2 - box.left;
        const y2 = b.top - box.top;
        const k = (y2 - y1) / 2;
        path.setAttribute(
          "d",
          `M${x1} ${y1} C${x1} ${y1 + k} ${x2} ${y2 - k} ${x2} ${y2}`,
        );
        const length = path.getTotalLength();
        path.style.strokeDasharray = `${length}`;
        path.style.strokeDashoffset = layer.hasAttribute("data-in")
          ? "0"
          : `${length}`;
      }
    }
    const stop = observeOnce(
      [...deep.querySelectorAll(".layer")],
      { threshold: 0.6, rootMargin: "0px 0px -8% 0px" },
      (layer) => {
        layer.setAttribute("data-in", "");
        for (const line of paths)
          if (line.layer === layer) line.path.style.strokeDashoffset = "0";
      },
    );
    draw();
    const resize = new ResizeObserver(draw);
    resize.observe(deep);
    let alive = true;
    void document.fonts.ready.then(() => {
      if (alive) draw();
    });
    return () => {
      alive = false;
      stop();
      resize.disconnect();
      for (const { path } of paths) path.remove();
    };
  }, [deepRef, rootsRef]);
}

function Deep() {
  const deep = useRef<HTMLDivElement>(null);
  const roots = useRef<SVGSVGElement>(null);
  useRoots(deep, roots);
  return (
    <div className="deep" ref={deep}>
      <p className="title deep-title" data-reveal>
        {TIP.title}
      </p>
      <div className="tip" data-node="answer">
        <div className="msg msg-author">
          <p className="who">Автор</p>
          <p className="bubble">{TIP.question}</p>
        </div>
        <div className="msg msg-ai">
          <p className="who who-ai">
            <span className="dot" aria-hidden="true" />
            Соавтор
          </p>
          <p className="reply">{TIP.answer}</p>
          <p className="small muted tip-eg">{ANSWER_CAPTION}</p>
        </div>
      </div>
      <p className="waterline small">
        <span>{TIP.waterline}</span>
      </p>
      <ol className="layers" aria-label={TIP.listLabel}>
        {LAYERS.map((layer, index) => (
          <li
            key={layer.name}
            className="layer"
            style={{ "--w": `${layer.width}%` } as CSSProperties}
          >
            <svg
              className="web"
              viewBox={`0 0 ${WEB_SIZE.width} ${WEB_SIZE.height}`}
              preserveAspectRatio="xMidYMid slice"
              aria-hidden="true"
              focusable="false"
            >
              {WEBS[index].lines.map(([a, b]) => (
                <line
                  key={`${a}-${b}`}
                  x1={WEBS[index].dots[a].x}
                  y1={WEBS[index].dots[a].y}
                  x2={WEBS[index].dots[b].x}
                  y2={WEBS[index].dots[b].y}
                />
              ))}
              {WEBS[index].dots.map((dot, dotIndex) => (
                <circle key={dotIndex} cx={dot.x} cy={dot.y} r={dot.r} />
              ))}
            </svg>
            <p className="layer-name">{layer.name}</p>
            <div className="layer-row">
              <ul className="faint faint-l">
                {layer.left.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
              <ul className="nodes">
                {layer.lit.map(({ key, name }) => (
                  <li key={key} className="node" data-node={key}>
                    {name}
                  </li>
                ))}
              </ul>
              <ul className="faint faint-r">
                {layer.right.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
      <p className="deep-sum body-lg" data-reveal>
        {TIP.summary}
      </p>
      <svg className="roots" ref={roots} aria-hidden="true" focusable="false" />
    </div>
  );
}

function Phrases({ runs }: { runs: Phrase[] }) {
  return runs.map((run, index) =>
    typeof run === "string" ? (
      run
    ) : (
      <a key={index} className="ph" href={`#note-${run.n}`} data-n={run.n}>
        {run.text}
      </a>
    ),
  );
}

/** The floor of the garage that every frame shares: the car on the younger brother's side. */
function Car({ body }: { body: boolean }) {
  return (
    <>
      <g fill="currentColor" stroke="none">
        <rect x="348" y="58" width="7" height="24" rx="3" />
        <rect x="429" y="58" width="7" height="24" rx="3" />
        <rect x="348" y="124" width="7" height="24" rx="3" />
        <rect x="429" y="124" width="7" height="24" rx="3" />
      </g>
      {body ? <CarBody /> : null}
    </>
  );
}

function CarBody() {
  return (
    <>
      <rect
        x="354"
        y="40"
        width="76"
        height="126"
        rx="20"
        fill="var(--floor)"
      />
      <path d="M367 72 Q392 62 417 72" />
      <path d="M369 144 Q392 150 415 144" />
    </>
  );
}

const LINE = "M240 10 C237 62 243 104 240 135 S237 210 240 260";

function Sides({ time }: { time: string }) {
  return (
    <g className="f-el" style={delay(0)}>
      <text className="f-side" x="120" y="27">
        сторона старшего
      </text>
      <text className="f-side" x="350" y="27">
        сторона младшего
      </text>
      <text className="f-time" x="18" y="252">
        {time}
      </text>
    </g>
  );
}

const STROKE = {
  filter: "url(#chalk)",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function FrameStart() {
  return (
    <svg
      className="frame-svg"
      viewBox="0 0 480 270"
      role="img"
      aria-label={FRAMES.start}
    >
      <g {...STROKE}>
        <g className="f-el" style={delay(0)}>
          <Car body />
        </g>
        <path
          className="f-line f-draw"
          pathLength={100}
          d={LINE}
          strokeWidth="5"
        />
        <g className="f-el" style={delay(4)}>
          <g transform="translate(264 228) rotate(40)">
            <rect
              x="-15"
              y="-5"
              width="30"
              height="10"
              rx="3"
              fill="currentColor"
              stroke="none"
            />
          </g>
          <g fill="currentColor" stroke="none">
            <circle cx="249" cy="243" r="1.6" />
            <circle cx="254" cy="250" r="1.2" />
            <circle cx="246" cy="254" r="1" />
          </g>
        </g>
        <g className="f-el" style={delay(5)}>
          <circle cx="120" cy="124" r="22" />
          <circle cx="300" cy="124" r="22" />
        </g>
      </g>
      <g className="f-el" style={delay(5)}>
        <text className="f-mark" x="120" y="124">
          С
        </text>
        <text className="f-mark" x="300" y="124">
          М
        </text>
        <text className="f-name" x="120" y="170">
          старший
        </text>
        <text className="f-name" x="300" y="170">
          младший
        </text>
      </g>
      <Sides time="в начале" />
    </svg>
  );
}

function FrameQuarrel() {
  return (
    <svg
      className="frame-svg"
      viewBox="0 0 480 270"
      role="img"
      aria-label={FRAMES.quarrel}
    >
      <g {...STROKE}>
        <g className="f-el" style={delay(0)}>
          <Car body />
          <path className="f-line" d={LINE} strokeWidth="5" />
        </g>
        <g className="f-el" style={delay(1)}>
          <circle cx="92" cy="96" r="22" />
          <circle cx="300" cy="190" r="22" />
        </g>
        <g transform="translate(240 138) rotate(-28)">
          <g className="f-el f-drop" style={delay(3)} fill="var(--floor)">
            <path d="M-28 -5 H16 V-12 H38 V-5 H27 V5 H38 V12 H16 V5 H-28 Z" />
            <circle cx="-36" cy="0" r="10" />
            <circle cx="-36" cy="0" r="3.5" fill="none" />
          </g>
        </g>
      </g>
      <g className="f-el" style={delay(1)}>
        <text className="f-mark" x="92" y="96">
          С
        </text>
        <text className="f-mark" x="300" y="190">
          М
        </text>
      </g>
      <Sides time="после ссоры" />
    </svg>
  );
}

function FrameFinale() {
  return (
    <svg
      className="frame-svg"
      viewBox="0 0 480 270"
      role="img"
      aria-label={FRAMES.finale}
    >
      <g {...STROKE}>
        <g className="f-el" style={delay(0)}>
          <Car body={false} />
          <path className="f-line" d={LINE} strokeWidth="5" />
        </g>
        {/* The hand is drawn before the body of the car, so it comes out from under it. */}
        <path
          className="f-el f-hand"
          style={delay(4)}
          d="M385 158 v22 a7 7 0 0 0 14 0 v-22"
          fill="var(--floor)"
        />
        <g className="f-el" style={delay(0)}>
          <CarBody />
        </g>
        <g className="f-el" style={delay(1)}>
          <circle
            cx="120"
            cy="124"
            r="22"
            strokeDasharray="2 7"
            opacity="0.6"
          />
        </g>
        <g className="f-el" style={delay(2)}>
          <path
            d="M146 116 C 200 64, 280 58, 346 94"
            strokeWidth="3.2"
            strokeDasharray="0.1 9"
          />
          <path d="M340.6 84.9 L347 95 L335 94.7" />
        </g>
        <g className="f-el" style={delay(3)}>
          <circle cx="392" cy="103" r="20" strokeDasharray="3 6" />
        </g>
        <g className="f-el" style={delay(5)}>
          <circle cx="444" cy="226" r="20" />
        </g>
      </g>
      <g className="f-el" style={delay(3)}>
        <text className="f-mark" x="392" y="103">
          С
        </text>
      </g>
      <g className="f-el" style={delay(5)}>
        <text className="f-mark" x="444" y="226">
          М
        </text>
      </g>
      <Sides time="финал" />
      {[
        [456, 62],
        [214, 104],
        [362, 186],
      ].map(([cx, cy], index) => (
        <g key={index} className="f-el f-num" style={delay(7 + index)}>
          <circle cx={cx} cy={cy} r="12" />
          <text x={cx} y={cy}>
            {index + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Frames draw once in view; the note across the middle of the screen marks its phrase in the dialogue (design D8). */
function useStoryboard(boardRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const board = boardRef.current;
    if (board === null)
      throw new Error("StoryApproach: the board is not mounted");
    const phrases = [...board.querySelectorAll<HTMLElement>(".ph")];
    const noted = [...board.querySelectorAll<HTMLElement>("[data-note]")];
    const mark = (n: number, className: string) => {
      for (const element of [...phrases, ...noted])
        element.classList.toggle(className, Number(element.dataset.n) === n);
    };
    const stopDraw = observeOnce(
      [...board.querySelectorAll(".frame-pic")],
      { threshold: 0.55 },
      (picture) => {
        const frame = picture.closest(".frame");
        if (frame === null)
          throw new Error("StoryApproach: a picture outside a frame");
        frame.setAttribute("data-in", "");
      },
    );
    const middle = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting)
            mark(Number((entry.target as HTMLElement).dataset.n), "is-on");
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    noted.forEach((element) => middle.observe(element));
    const listeners = phrases.map((phrase) => {
      const on = () => mark(Number(phrase.dataset.n), "is-hot");
      const off = () => mark(0, "is-hot");
      phrase.addEventListener("mouseenter", on);
      phrase.addEventListener("focus", on);
      phrase.addEventListener("mouseleave", off);
      phrase.addEventListener("blur", off);
      return () => {
        phrase.removeEventListener("mouseenter", on);
        phrase.removeEventListener("focus", on);
        phrase.removeEventListener("mouseleave", off);
        phrase.removeEventListener("blur", off);
      };
    });
    return () => {
      stopDraw();
      middle.disconnect();
      listeners.forEach((remove) => remove());
    };
  }, [boardRef]);
}

function Note({ title, text }: { title: string; text: string }) {
  return (
    <div className="note">
      <p className="note-title">{title}</p>
      <p className="note-text">{text}</p>
    </div>
  );
}

function Garage() {
  const board = useRef<HTMLDivElement>(null);
  useStoryboard(board);
  return (
    <>
      <p className="h3 know-next" data-reveal>
        {GARAGE.next}
      </p>
      <div className="board" ref={board}>
        {/* The chalk of the three frames, declared once. */}
        <svg
          className="chalk-defs"
          width="0"
          height="0"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <filter
              id="chalk"
              filterUnits="userSpaceOnUse"
              x="-20"
              y="-20"
              width="520"
              height="310"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.55"
                numOctaves="2"
                seed="4"
                result="n"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="n"
                scale="3.2"
                xChannelSelector="R"
                yChannelSelector="G"
                result="d"
              />
              <feTurbulence
                type="fractalNoise"
                baseFrequency="1.1"
                numOctaves="2"
                seed="11"
                result="g"
              />
              <feColorMatrix
                in="g"
                type="matrix"
                values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2.2 1.75"
                result="mask"
              />
              <feComposite in="d" in2="mask" operator="in" />
            </filter>
          </defs>
        </svg>

        <div className="talk" data-reveal>
          <p className="small muted">{GARAGE.label}</p>
          <div className="msg msg-author">
            <p className="who">Автор</p>
            <p className="bubble">
              <Phrases runs={GARAGE.author} />
            </p>
          </div>
          <div className="msg msg-ai">
            <p className="who who-ai">
              <span className="dot" aria-hidden="true" />
              Соавтор
            </p>
            <p className="reply">
              <Phrases runs={GARAGE.reply} />
            </p>
            <p className="punch">
              <Phrases runs={[GARAGE.line]} />
            </p>
          </div>
        </div>

        <div className="story">
          <p className="title">{GARAGE.storyTitle}</p>
          <ol className="frames">
            <li
              className="frame"
              id={`note-${NOTES.start.n}`}
              data-n={NOTES.start.n}
              data-note
            >
              <div className="frame-pic">
                <FrameStart />
              </div>
              <Note {...NOTES.start} />
            </li>
            <li
              className="frame"
              id={`note-${NOTES.quarrel.n}`}
              data-n={NOTES.quarrel.n}
              data-note
            >
              <div className="frame-pic">
                <FrameQuarrel />
              </div>
              <Note {...NOTES.quarrel} />
            </li>
            <li className="frame">
              <div className="frame-pic">
                <FrameFinale />
              </div>
              <ol className="reasons">
                {NOTES.reasons.map((reason, index) => (
                  <li
                    key={reason.n}
                    className="reason"
                    id={`note-${reason.n}`}
                    data-n={reason.n}
                    data-note
                  >
                    <span className="num" aria-hidden="true">
                      {index + 1}
                    </span>
                    <div>
                      <p className="note-title">{reason.title}</p>
                      <p className="note-text">{reason.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </li>
          </ol>
        </div>
      </div>
      <p className="small muted board-cap">{GARAGE.caption}</p>
    </>
  );
}

export function StoryApproach() {
  const ref = useRef<HTMLElement>(null);
  useRevealInside(ref);
  return (
    <section
      ref={ref}
      aria-labelledby="story-approach-title"
      className="sec know"
      data-theme="dark"
    >
      <div className="wrap">
        <div className="know-head" data-reveal>
          <h2 className="h2" id="story-approach-title">
            {GARAGE.title}
          </h2>
          <p className="muted body-lg">{GARAGE.lead}</p>
        </div>
        <Deep />
        <Garage />
      </div>
    </section>
  );
}
