const config = {
  snippetMin: 4,
  snippetMax: 10,
};
const CROSSFADE_DURATION = 1500;
const MOSH_DECAY = 3000;
const SEEK_TIMEOUT = 8000;
const CANPLAY_TIMEOUT = 12000;

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
  previousClip: null,
  volume: 0,
  hasStarted: false,
  transitionTimer: null,
  lastCutTime: 0,
  lastClipId: null,
  previousVideoForEffect: null,
  renderer: null,
};

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
  video.pause();
  video.src = clip.url;
  video.load();

  if (video.readyState < 1) {
    await waitForEvent(video, "loadedmetadata", CANPLAY_TIMEOUT);
  }

  const maxStart = Math.max(0, clip.duration - clip.snippetLen - 0.25);
  const safeStart = Math.min(clip.startTime, maxStart);

  if (safeStart > 0) {
    const seekPromise = waitForEvent(video, "seeked", SEEK_TIMEOUT);
    video.currentTime = safeStart;
    await seekPromise;
  } else {
    video.currentTime = 0;
  }

  if (video.readyState < 3) {
    await waitForEvent(video, "canplay", CANPLAY_TIMEOUT);
  }
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

  const pool =
    state.manifest.length > 1
      ? state.manifest.filter((clip) => clip.id !== state.lastClipId)
      : state.manifest;
  const clip = pool[Math.floor(Math.random() * pool.length)];
  const snippetLen = Math.min(
    clip.duration,
    config.snippetMin + Math.random() * (config.snippetMax - config.snippetMin),
  );
  const maxStart = Math.max(0, clip.duration - snippetLen - 0.25);
  const startTime = maxStart > 0 ? Math.random() * maxStart : 0;

  return { ...clip, snippetLen, startTime };
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

function scheduleNext(clip) {
  stopTransitionTimer();
  const delay = Math.max(1000, clip.snippetLen * 1000 - CROSSFADE_DURATION);
  state.transitionTimer = window.setTimeout(() => {
    playNext(false).catch((error) => {
      console.error(error);
      setStatus("Unable to continue playback.", true);
    });
  }, delay);
}

async function playNext(immediate = false) {
  const incomingKey = state.activeClip ? (state.activeKey === "A" ? "B" : "A") : state.activeKey;
  const outgoingKey = incomingKey === "A" ? "B" : "A";
  const incoming = videos[incomingKey];
  const outgoing = videos[outgoingKey];
  const clip = pickClip();

  setStatus("Loading stream...", !state.hasStarted);
  await ensureVideoReady(incoming, clip);
  syncVideoAudio(incomingKey);
  await ensurePlayback(incoming);

  incoming.style.opacity = "1";

  if (state.activeClip && !immediate) {
    state.previousVideoForEffect = outgoing;
    state.lastCutTime = performance.now();
    outgoing.style.opacity = "0";
    fadeAudio(incoming, outgoing);
    window.setTimeout(() => {
      outgoing.pause();
      outgoing.removeAttribute("src");
      outgoing.load();
    }, CROSSFADE_DURATION + 120);
  } else {
    state.previousVideoForEffect = null;
    outgoing.style.opacity = "0";
    outgoing.pause();
    outgoing.removeAttribute("src");
    outgoing.load();
    incoming.muted = state.volume === 0;
    incoming.volume = state.volume;
  }

  state.previousClip = state.activeClip;
  state.activeClip = clip;
  state.activeKey = incomingKey;
  state.lastClipId = clip.id;
  state.hasStarted = true;

  state.renderer?.setSources(incoming, state.previousVideoForEffect);

  setStatus("", false);
  scheduleNext(clip);
}

function validateManifest(payload) {
  if (!Array.isArray(payload)) {
    throw new Error("Manifest must be an array.");
  }

  return payload
    .map((item) => ({
      id: String(item.id || "").trim(),
      url: String(item.url || "").trim(),
      duration: Number(item.duration),
      title: typeof item.title === "string" ? item.title : undefined,
      year: Number.isFinite(Number(item.year)) ? Number(item.year) : undefined,
    }))
    .filter((item) => item.id && item.url && Number.isFinite(item.duration) && item.duration > 0);
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
    uniform sampler2D uPrevFrame;
    uniform float uBlendFactor;
    uniform float uTime;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
      vec2 disp = vec2(
        sin(uTime * 0.7 + uv.y * 11.0) * 0.006,
        cos(uTime * 0.5 + uv.x * 8.0) * 0.003
      ) * uBlendFactor;

      vec4 curr = texture2D(uCurrentFrame, uv + disp);
      vec4 prev = texture2D(uPrevFrame, uv);
      vec4 color = mix(curr, prev, uBlendFactor * 0.7);

      float ca = 0.002;
      color.r = texture2D(uCurrentFrame, uv + vec2(ca, 0.0)).r;
      color.b = texture2D(uCurrentFrame, uv - vec2(ca, 0.0)).b;

      float scan = sin(gl_FragCoord.y * 1.8) * 0.025;
      color.rgb -= scan;

      float grain = rand(gl_FragCoord.xy + uTime) - 0.5;
      color.rgb += grain * 0.035;

      gl_FragColor = vec4(color.rgb, 0.45);
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

  let currentVideo = null;
  let previousVideo = null;
  let failed = false;

  const program = createProgram();
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );

  const currentTexture = gl.createTexture();
  const prevTexture = gl.createTexture();

  [currentTexture, prevTexture].forEach((texture) => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]),
    );
  });

  const positionLocation = gl.getAttribLocation(program, "aPosition");
  const currentLocation = gl.getUniformLocation(program, "uCurrentFrame");
  const prevLocation = gl.getUniformLocation(program, "uPrevFrame");
  const blendLocation = gl.getUniformLocation(program, "uBlendFactor");
  const timeLocation = gl.getUniformLocation(program, "uTime");

  function disableRenderer(error) {
    failed = true;
    canvasEl.classList.add("hidden");
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

    try {
      const hasCurrent = uploadTexture(currentTexture, currentVideo);
      const hasPrev = uploadTexture(prevTexture, previousVideo || currentVideo);

      if (!hasCurrent || !hasPrev) {
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
    gl.bindTexture(gl.TEXTURE_2D, prevTexture);
    gl.uniform1i(prevLocation, 1);

    const elapsed = Math.max(0, now - state.lastCutTime);
    const blend = state.lastCutTime ? Math.max(0, 1 - elapsed / MOSH_DECAY) : 0;

    gl.uniform1f(blendLocation, blend);
    gl.uniform1f(timeLocation, now * 0.001);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    window.requestAnimationFrame(render);
  }

  window.addEventListener("resize", resize);
  resize();
  window.requestAnimationFrame(render);

  return {
    setSources(nextCurrent, nextPrevious) {
      currentVideo = nextCurrent;
      previousVideo = nextPrevious;
    },
  };
}

async function initGui() {
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
  } catch {
    // lil-gui unavailable (offline, CSP, etc.) — skip silently
  }
}

async function init() {
  setStatus("Loading stream...", true);

  skipButton?.addEventListener("click", () => {
    if (!state.hasStarted) return;
    stopTransitionTimer();
    playNext(false).catch((error) => {
      console.error(error);
      setStatus("Unable to continue playback.", true);
    });
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

  const response = await fetch(manifestUrl, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load manifest: ${response.status}`);
  }

  state.manifest = validateManifest(await response.json());
  if (state.manifest.length === 0) {
    setStatus("No BTS clips available yet.", true);
    return;
  }

  initGui();
  await playNext(true);
}

init().catch((error) => {
  console.error(error);
  showStartOverlay(false);
  setStatus("Unable to load the BTS stream.", true);
});
