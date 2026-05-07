const config = {
  snippetMin: 4,
  snippetMax: 10,
  filmIntensity: 0.5,
};
const CROSSFADE_DURATION = 1500;
const SEEK_TIMEOUT = 15000;
const CANPLAY_TIMEOUT = 20000;
const LETTERBOX_STRETCH = 1.1; // letterbox when aspect ratios diverge by more than 10%

const root = document.querySelector("[data-bts-root]");
const script = document.querySelector("script[data-bts-manifest]");

if (!root || !script) {
  throw new Error("BTS stream root not found.");
}

const manifestUrl = script.dataset.btsManifest || "/bts/manifest.json";
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const videos = {
  A: root.querySelector('[data-bts-video="A"]'),
  B: root.querySelector('[data-bts-video="B"]'),
};
const canvas = root.querySelector("[data-bts-canvas]");
const skipButton = root.querySelector("[data-bts-skip]");
const volumeSlider = root.querySelector("[data-bts-volume]");
const startOverlay = root.querySelector("[data-bts-start-overlay]");
const startButton = root.querySelector("[data-bts-start-button]");
const statusEl = root.querySelector("[data-bts-status]");
const clipInfoEl   = root.querySelector("[data-bts-clip-info]");
const infoGroupEl  = root.querySelector("[data-bts-info-group]");
const miniCard     = root.querySelector("[data-bts-mini-card]");
const miniCardImg  = root.querySelector("[data-bts-mini-card-img]");
const miniCardTitle = root.querySelector("[data-bts-mini-card-title]");
const miniCardLink = root.querySelector("[data-bts-mini-card-link]");
const projectMap   = JSON.parse(root.dataset.btsProjects || "{}");

if (
  !(videos.A instanceof HTMLVideoElement) ||
  !(videos.B instanceof HTMLVideoElement) ||
  !(canvas instanceof HTMLCanvasElement) ||
  !(volumeSlider instanceof HTMLInputElement) ||
  !(startOverlay instanceof HTMLElement) ||
  !(startButton instanceof HTMLButtonElement) ||
  !(statusEl instanceof HTMLElement)
) {
  throw new Error("BTS stream elements are missing.");
}

const state = {
  manifest: [],
  activeKey: "A",
  activeClip: null,
  volume: 0,
  hasStarted: false,
  transitionTimer: null,
  lastClipId: null,
  forcedClipId: null,
  playedIds: new Set(),
  renderer: null,
  rendererFailed: false,
};

const pendingClears = new WeakMap();

function scheduleClear(video) {
  const existing = pendingClears.get(video);
  if (existing !== undefined) window.clearTimeout(existing);
  const id = window.setTimeout(() => {
    pendingClears.delete(video);
    video.pause();
    video.removeAttribute("src");
    video.load();
  }, CROSSFADE_DURATION + 120);
  pendingClears.set(video, id);
}

function syncVideoAudio(activeKey = state.activeKey) {
  const activeVideo = videos[activeKey];
  const inactiveVideo = videos[activeKey === "A" ? "B" : "A"];
  activeVideo.muted = state.volume === 0;
  activeVideo.volume = state.volume;
  inactiveVideo.muted = true;
  inactiveVideo.volume = 0;
}

function setStatus(message, visible = true) {
  statusEl.textContent = message;
  statusEl.classList.toggle("hidden", !visible || !message);
}

function showStartOverlay(visible) {
  startOverlay.classList.toggle("hidden", !visible);
  startOverlay.classList.toggle("flex", visible);
}


function waitForEvent(target, eventName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    function cleanup() {
      window.clearTimeout(timeoutId);
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener("error", onError);
    }

    function onEvent() {
      cleanup();
      resolve();
    }

    function onError() {
      cleanup();
      reject(new Error(`Media error while waiting for ${eventName}`));
    }

    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

async function ensureVideoReady(video, clip) {
  const pendingClear = pendingClears.get(video);
  if (pendingClear !== undefined) {
    window.clearTimeout(pendingClear);
    pendingClears.delete(video);
  }
  video.pause();
  video.src = clip.url;
  video.load();

  await waitForEvent(video, "loadedmetadata", CANPLAY_TIMEOUT);
  applyObjectFit(video);

  const dur = video.duration;
  let snippetLen, startTime;
  if (Number.isFinite(dur) && dur > 0) {
    snippetLen = Math.min(dur, config.snippetMin + Math.random() * (config.snippetMax - config.snippetMin));
    const maxStart = Math.max(0, dur - snippetLen - 0.25);
    startTime = maxStart > 0 ? Math.random() * maxStart : 0;
  } else {
    snippetLen = config.snippetMin;
    startTime = 0;
  }

  if (startTime > 0) {
    const seekPromise = waitForEvent(video, "seeked", SEEK_TIMEOUT);
    video.currentTime = startTime;
    await seekPromise;
  } else {
    video.currentTime = 0;
  }

  if (video.readyState < 3) {
    await waitForEvent(video, "canplay", CANPLAY_TIMEOUT);
  }

  return snippetLen;
}

async function ensurePlayback(video) {
  const tryPlay = async () => {
    await video.play();
  };

  try {
    await tryPlay();
    showStartOverlay(false);
    return;
  } catch (error) {
    if (state.hasStarted) {
      throw error;
    }
  }

  showStartOverlay(true);

  await new Promise((resolve) => {
    const onClick = async () => {
      try {
        await tryPlay();
        state.hasStarted = true;
        showStartOverlay(false);
        startButton.removeEventListener("click", onClick);
        resolve();
      } catch {
        setStatus("Playback blocked. Try again.", true);
      }
    };

    startButton.addEventListener("click", onClick);
  });
}

function pickClip() {
  if (state.manifest.length === 0) {
    throw new Error("No clips available.");
  }

  if (state.forcedClipId) {
    const forced = state.manifest.find((c) => c.id === state.forcedClipId);
    state.forcedClipId = null;
    if (forced) { state.playedIds.add(forced.id); return { ...forced }; }
  }

  let pool = state.manifest.filter((c) => !state.playedIds.has(c.id));
  if (pool.length === 0) {
    state.playedIds.clear();
    pool = state.manifest.slice();
  }

  const smoothPool = pool.length > 1
    ? pool.filter((c) => c.id !== state.lastClipId)
    : pool;

  const clip = { ...smoothPool[Math.floor(Math.random() * smoothPool.length)] };
  state.playedIds.add(clip.id);
  return clip;
}

function stopTransitionTimer() {
  if (state.transitionTimer) {
    window.clearTimeout(state.transitionTimer);
    state.transitionTimer = null;
  }
}

function fadeAudio(incoming, outgoing) {
  if (state.volume === 0) {
    incoming.muted = true;
    outgoing.muted = true;
    incoming.volume = 0;
    outgoing.volume = 0;
    return;
  }

  const start = performance.now();
  const target = state.volume;
  incoming.volume = 0;
  outgoing.volume = target;
  incoming.muted = false;
  outgoing.muted = false;

  const step = (now) => {
    const progress = Math.min(1, (now - start) / CROSSFADE_DURATION);
    incoming.volume = progress * target;
    outgoing.volume = (1 - progress) * target;

    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      outgoing.volume = 0;
      outgoing.muted = true;
      incoming.volume = target;
    }
  };

  window.requestAnimationFrame(step);
}

async function playNextWithRetry(immediate = false, maxRetries = 4) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await playNext(attempt === 0 ? immediate : false);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`BTS clip failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
    }
  }
  console.error(lastError);
  setStatus("Unable to continue playback.", true);
}

function scheduleNext(snippetLen) {
  stopTransitionTimer();
  const delay = Math.max(1000, snippetLen * 1000 - CROSSFADE_DURATION);
  state.transitionTimer = window.setTimeout(() => {
    playNextWithRetry(false);
  }, delay);
}

async function playNext(immediate = false) {
  const incomingKey = state.activeClip ? (state.activeKey === "A" ? "B" : "A") : state.activeKey;
  const outgoingKey = incomingKey === "A" ? "B" : "A";
  const incoming = videos[incomingKey];
  const outgoing = videos[outgoingKey];
  const clip = pickClip();
  state.lastClipId = clip.id;

  setStatus("Loading stream...", !state.hasStarted);
  const snippetLen = await ensureVideoReady(incoming, clip);
  syncVideoAudio(incomingKey);
  await ensurePlayback(incoming);

  if (state.renderer && !state.rendererFailed) {
    if (state.activeClip && !immediate) {
      state.renderer.startCrossfade(incoming, outgoing);
      fadeAudio(incoming, outgoing);
      scheduleClear(outgoing);
    } else {
      state.renderer.setCurrentOnly(incoming);
      outgoing.pause();
      outgoing.removeAttribute("src");
      outgoing.load();
      incoming.muted = state.volume === 0;
      incoming.volume = state.volume;
    }
  } else {
    // CSS fallback when WebGL is unavailable or failed
    incoming.style.opacity = "1";
    if (state.activeClip && !immediate) {
      outgoing.style.opacity = "0";
      fadeAudio(incoming, outgoing);
      scheduleClear(outgoing);
    } else {
      outgoing.style.opacity = "0";
      outgoing.pause();
      outgoing.removeAttribute("src");
      outgoing.load();
      incoming.muted = state.volume === 0;
      incoming.volume = state.volume;
    }
  }

  hideMiniCard();

  state.activeClip = clip;
  state.activeKey = incomingKey;
  state.hasStarted = true;

  const idx = state.manifest.findIndex((c) => c.id === clip.id);
  if (idx !== -1) history.replaceState(null, "", `?clip=${idx + 1}`);

  if (clipInfoEl) {
    const proj = projectMap[clip.project];
    const projectHtml = clip.project
      ? (proj
          ? `<span data-bts-project-trigger class="underline-offset-2 hover:underline cursor-pointer">${clip.project}</span>`
          : clip.project)
      : "";
    const yearHtml = clip.year ? String(clip.year) : "";
    const meta = [projectHtml, yearHtml].filter(Boolean).join(" · ");
    const counter = idx !== -1 ? `(${idx + 1}/${state.manifest.length})` : "";
    clipInfoEl.innerHTML = [meta, counter].filter(Boolean).join(" ");
  }

  showClipInfo();

  setStatus("", false);
  scheduleNext(snippetLen);
}

function validateManifest(payload) {
  if (!Array.isArray(payload)) {
    throw new Error("Manifest must be an array.");
  }

  return payload
    .map((item) => ({
      id: String(item.id || "").trim(),
      url: String(item.url || "").trim(),
      title: typeof item.title === "string" ? item.title : undefined,
      year: Number.isFinite(Number(item.year)) ? Number(item.year) : undefined,
      project: typeof item.project === "string" ? item.project : undefined,
    }))
    .filter((item) => item.id && item.url);
}

function createRenderer(canvasEl) {
  if (prefersReducedMotion) {
    canvasEl.classList.add("hidden");
    return null;
  }

  const gl =
    canvasEl.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: false }) ||
    canvasEl.getContext("experimental-webgl");

  if (!gl) {
    canvasEl.classList.add("hidden");
    return null;
  }

  const vertexShaderSource = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
      vUv = (aPosition + 1.0) * 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;

    uniform sampler2D uCurrentFrame;
    uniform sampler2D uOutgoingFrame;
    uniform float uBlendFactor;
    uniform float uCurrentVideoAspect;
    uniform int   uCurrentIsContain;
    uniform float uOutgoingVideoAspect;
    uniform int   uOutgoingIsContain;
    uniform float uCanvasAspect;
    uniform float uFilmIntensity;
    uniform float uTime;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    vec2 fitUV(vec2 uv, float vAspect, int contain) {
      if (contain == 1) {
        vec2 s = uCanvasAspect > vAspect
          ? vec2(vAspect / uCanvasAspect, 1.0)
          : vec2(1.0, uCanvasAspect / vAspect);
        return (uv - 0.5) / s + 0.5;
      } else {
        vec2 s = uCanvasAspect > vAspect
          ? vec2(1.0, vAspect / uCanvasAspect)
          : vec2(uCanvasAspect / vAspect, 1.0);
        return (uv - 0.5) * s + 0.5;
      }
    }

    bool inArea(vec2 t) {
      return t.x >= 0.0 && t.x <= 1.0 && t.y >= 0.0 && t.y <= 1.0;
    }

    vec4 sampleFrame(sampler2D tex, vec2 t) {
      return inArea(t) ? texture2D(tex, t) : vec4(0.0);
    }

    void main() {
      vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
      float ca = 0.003 * uFilmIntensity;

      vec2 tC = fitUV(uv, uCurrentVideoAspect,  uCurrentIsContain);
      vec2 tO = fitUV(uv, uOutgoingVideoAspect, uOutgoingIsContain);

      float r = mix(sampleFrame(uOutgoingFrame, tO + vec2(ca, 0.0)).r,
                    sampleFrame(uCurrentFrame,  tC + vec2(ca, 0.0)).r, uBlendFactor);
      float g = mix(sampleFrame(uOutgoingFrame, tO).g,
                    sampleFrame(uCurrentFrame,  tC).g, uBlendFactor);
      float b = mix(sampleFrame(uOutgoingFrame, tO - vec2(ca, 0.0)).b,
                    sampleFrame(uCurrentFrame,  tC - vec2(ca, 0.0)).b, uBlendFactor);

      vec3 color = vec3(r, g, b);

      float scan = sin(gl_FragCoord.y * 1.8) * 0.04 * uFilmIntensity;
      color -= scan;

      float grain = rand(gl_FragCoord.xy + uTime) - 0.5;
      color += grain * 0.08 * uFilmIntensity;

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) || "Unknown shader error";
      gl.deleteShader(shader);
      throw new Error(log);
    }
    return shader;
  }

  function createProgram() {
    const program = gl.createProgram();
    const vertex = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragment = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) || "Unknown program error";
      gl.deleteProgram(program);
      throw new Error(log);
    }
    return program;
  }

  let currentVideo  = null;
  let outgoingVideo = null;
  let blendFactor   = 1.0;
  let crossfadeStart = null;
  let filmIntensity = 0.5;
  let failed = false;

  const program = createProgram();
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );

  const blackPixel = new Uint8Array([0, 0, 0, 0]);

  const currentTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, currentTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, blackPixel);

  const outgoingTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, outgoingTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, blackPixel);

  const positionLocation      = gl.getAttribLocation(program, "aPosition");
  const currentLocation       = gl.getUniformLocation(program, "uCurrentFrame");
  const outgoingLocation      = gl.getUniformLocation(program, "uOutgoingFrame");
  const blendFactorLocation   = gl.getUniformLocation(program, "uBlendFactor");
  const timeLocation          = gl.getUniformLocation(program, "uTime");
  const currentVideoAspectLoc = gl.getUniformLocation(program, "uCurrentVideoAspect");
  const currentIsContainLoc   = gl.getUniformLocation(program, "uCurrentIsContain");
  const outgoingVideoAspectLoc = gl.getUniformLocation(program, "uOutgoingVideoAspect");
  const outgoingIsContainLoc  = gl.getUniformLocation(program, "uOutgoingIsContain");
  const canvasAspectLocation  = gl.getUniformLocation(program, "uCanvasAspect");
  const filmIntensityLocation = gl.getUniformLocation(program, "uFilmIntensity");

  function disableRenderer(error) {
    failed = true;
    state.rendererFailed = true;
    canvasEl.classList.add("hidden");
    for (const v of Object.values(videos)) {
      v.classList.remove("opacity-0");
      v.classList.add("transition-opacity", "duration-[1500ms]", "ease-linear");
    }
    console.warn("Disabling BTS WebGL overlay.", error);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(canvasEl.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvasEl.clientHeight * dpr));
    if (canvasEl.width !== width || canvasEl.height !== height) {
      canvasEl.width = width;
      canvasEl.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function uploadTexture(texture, video) {
    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return false;
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    return true;
  }

  function render(now) {
    if (failed) {
      return;
    }

    resize();

    if (crossfadeStart !== null) {
      blendFactor = Math.min(1.0, (now - crossfadeStart) / CROSSFADE_DURATION);
      if (blendFactor >= 1.0) crossfadeStart = null;
    }

    try {
      const hasCurrent  = uploadTexture(currentTexture,  currentVideo);
      const hasOutgoing = uploadTexture(outgoingTexture, outgoingVideo);
      if (!hasCurrent && !hasOutgoing) {
        window.requestAnimationFrame(render);
        return;
      }
    } catch (error) {
      disableRenderer(error);
      return;
    }

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    gl.uniform1i(currentLocation, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, outgoingTexture);
    gl.uniform1i(outgoingLocation, 1);

    gl.uniform1f(timeLocation, now * 0.001);
    gl.uniform1f(filmIntensityLocation, filmIntensity);
    gl.uniform1f(blendFactorLocation, blendFactor);

    const curAspect = (currentVideo?.videoWidth && currentVideo?.videoHeight)
      ? currentVideo.videoWidth / currentVideo.videoHeight : 16 / 9;
    const outAspect = (outgoingVideo?.videoWidth && outgoingVideo?.videoHeight)
      ? outgoingVideo.videoWidth / outgoingVideo.videoHeight : 16 / 9;

    gl.uniform1f(currentVideoAspectLoc,  curAspect);
    gl.uniform1i(currentIsContainLoc,    currentVideo?.style.objectFit === "contain" ? 1 : 0);
    gl.uniform1f(outgoingVideoAspectLoc, outAspect);
    gl.uniform1i(outgoingIsContainLoc,   outgoingVideo?.style.objectFit === "contain" ? 1 : 0);
    gl.uniform1f(canvasAspectLocation,   canvasEl.clientWidth / canvasEl.clientHeight);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    window.requestAnimationFrame(render);
  }

  window.addEventListener("resize", resize);
  resize();
  window.requestAnimationFrame(render);

  return {
    startCrossfade(incoming, outgoing) {
      currentVideo   = incoming;
      outgoingVideo  = outgoing;
      blendFactor    = 0.0;
      crossfadeStart = performance.now();
    },
    setCurrentOnly(video) {
      currentVideo   = video;
      outgoingVideo  = null;
      blendFactor    = 1.0;
      crossfadeStart = null;
    },
    setFilmIntensity(v) {
      filmIntensity = v;
    },
  };
}

let infoFadeTimer = null;

function showClipInfo() {
  clearTimeout(infoFadeTimer);
  infoGroupEl?.classList.add("opacity-100");
  infoFadeTimer = setTimeout(() => {
    infoGroupEl?.classList.remove("opacity-100");
  }, 4000);
}

let miniCardTimer = null;

function showMiniCard(proj) {
  if (!miniCard || !proj) return;
  miniCardImg.src = proj.coverImage;
  miniCardImg.alt = proj.title;
  miniCardTitle.textContent = proj.title;
  miniCardLink.href = `/projects/${proj.slug}`;
  miniCard.classList.add("opacity-100");
  miniCard.style.pointerEvents = "auto";
  miniCard.setAttribute("aria-hidden", "false");
  clearTimeout(miniCardTimer);
  miniCardTimer = setTimeout(hideMiniCard, 4000);
}

function hideMiniCard() {
  clearTimeout(miniCardTimer);
  if (!miniCard) return;
  miniCard.classList.remove("opacity-100");
  miniCard.style.pointerEvents = "none";
  miniCard.setAttribute("aria-hidden", "true");
}

function applyObjectFit(videoEl) {
  const { videoWidth, videoHeight } = videoEl;
  if (!videoWidth || !videoHeight) return;
  const Rv = videoWidth / videoHeight;
  const Rc = window.innerWidth / window.innerHeight;
  const stretch = Math.max(Rv / Rc, Rc / Rv);
  videoEl.style.objectFit = stretch > LETTERBOX_STRETCH ? "contain" : "cover";
}

function initPortraitModal(root) {
  const modal = root.querySelector("[data-bts-portrait-modal]");
  if (!modal) return;

  let dismissTimer = null;

  function show() {
    modal.classList.add("opacity-100");
    dismissTimer = setTimeout(hide, 3500);
  }

  function hide() {
    clearTimeout(dismissTimer);
    modal.classList.remove("opacity-100");
  }

  function isPortraitMobile() {
    return window.innerWidth < 768 && window.innerHeight > window.innerWidth;
  }

  if (isPortraitMobile()) show();

  window.matchMedia("(orientation: portrait)").addEventListener("change", (e) => {
    if (e.matches) {
      show();
    } else {
      hide();
    }
  });
}

async function initGui() {
  if (window.innerWidth < 768) return;
  try {
    const { GUI } = await import("https://cdn.jsdelivr.net/npm/lil-gui@0.20/+esm");
    const gui = new GUI({ title: "BTS Controls", width: 220 });
    gui.close();
    gui.add(config, "snippetMin", 1, 120, 1).name("Min clip (s)").onChange((v) => {
      if (v > config.snippetMax) config.snippetMax = v;
    });
    gui.add(config, "snippetMax", 1, 120, 1).name("Max clip (s)").onChange((v) => {
      if (v < config.snippetMin) config.snippetMin = v;
    });
    gui.add(config, "filmIntensity", 0, 5, 0.01).name("Film").onChange((v) => {
      state.renderer?.setFilmIntensity(v);
    });
  } catch {
    // lil-gui unavailable (offline, CSP, etc.) — skip silently
  }
}

async function init() {
  setStatus("Loading stream...", true);

  skipButton?.addEventListener("click", () => {
    if (!state.hasStarted) return;
    stopTransitionTimer();
    playNextWithRetry(false);
  });

  volumeSlider.addEventListener("input", async () => {
    state.volume = Number(volumeSlider.value);
    syncVideoAudio();

    if (state.volume > 0 && state.hasStarted) {
      const activeVideo = videos[state.activeKey];
      activeVideo.muted = false;
      try {
        await activeVideo.play();
      } catch {
        state.volume = 0;
        volumeSlider.value = "0";
        syncVideoAudio();
      }
    }
  });

  state.renderer = createRenderer(canvas);

  if (!state.renderer) {
    // WebGL unavailable — restore CSS transitions so video elements can cross-fade
    for (const v of Object.values(videos)) {
      v.classList.remove("opacity-0");
      v.classList.add("opacity-0", "transition-opacity", "duration-[1500ms]", "ease-linear");
    }
  }

  const response = await fetch(manifestUrl, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load manifest: ${response.status}`);
  }

  state.manifest = validateManifest(await response.json());
  if (state.manifest.length === 0) {
    setStatus("No BTS clips available yet.", true);
    return;
  }

  // Feature 3: start at ?clip=N
  const startParam = new URLSearchParams(location.search).get("clip");
  const startIdx = startParam ? parseInt(startParam, 10) - 1 : -1;
  if (startIdx >= 0 && state.manifest[startIdx]) {
    state.forcedClipId = state.manifest[startIdx].id;
  }

  // Feature 10: mini-card click via delegation
  clipInfoEl?.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-bts-project-trigger]");
    if (!trigger || !state.activeClip) return;
    const proj = projectMap[state.activeClip.project];
    if (proj) showMiniCard(proj);
  });

  // Features 4 & 5: swipe to skip, tap to play rest
  let touchStartX = 0, touchStartY = 0;
  root.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
  }, { passive: true });
  root.addEventListener("touchend", (e) => {
    if (!state.hasStarted) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      stopTransitionTimer();
      playNextWithRetry(false);
    } else if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
      stopTransitionTimer();
      videos[state.activeKey].addEventListener("ended", () => playNextWithRetry(false), { once: true });
    }
  }, { passive: true });

  window.addEventListener("resize", () => {
    for (const video of Object.values(videos)) {
      if (video.videoWidth) applyObjectFit(video);
    }
  });

  initGui();
  initPortraitModal(root);
  await playNextWithRetry(true);
}

init().catch((error) => {
  console.error(error);
  showStartOverlay(false);
  setStatus("Unable to load the BTS stream.", true);
});
