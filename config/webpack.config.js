const fs = require("fs");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

const DEFAULT_PROXY_TARGET = "http://localhost:8080";
const DEV_SERVER_WS_PATH = "/ws-hmr";

// Resolves a package entry inside the engine twin repo. Defaults to the sibling
// checkout; set VN_ENGINE_REPO when the engine lives in a worktree.
//
// Only a dev-time concern. When no checkout exists — a consumer, or a CI runner
// that installed the published engine packages — the aliases are left out and
// webpack resolves the installed packages instead. Aliasing to a directory that
// does not exist produced "Module not found" for every engine import.
const ENGINE_REPO = process.env.VN_ENGINE_REPO
  ? path.resolve(process.env.VN_ENGINE_REPO)
  : path.resolve(__dirname, "../../vninvestcharts-engine");
const ENGINE_REPO_EXISTS = fs.existsSync(
  path.join(ENGINE_REPO, "packages", "vn-kline-engine-drawing", "src/index.ts"),
);

function engineSource(packageName) {
  if (!ENGINE_REPO_EXISTS) return null;
  return path.join(ENGINE_REPO, "packages", packageName, "src/index.ts");
}

// Pro-only widget module (open-core split, Phase 2b). Resolves to the local
// checkout's source when present; otherwise webpack leaves it unresolved and
// the dynamic import in usePineScriptRestore.ts fails closed (Rule 15).
function widgetProSource() {
  const candidate = path.resolve(__dirname, "../packages/vn-kline-widget-pro/src/index.ts");
  if (fs.existsSync(candidate)) return candidate;
  const stub = path.resolve(__dirname, "../src/lib/pinescript/pro-stub.ts");
  return fs.existsSync(stub) ? stub : null;
}

function normalizeProxyTarget(rawTarget) {
  const candidate = rawTarget || DEFAULT_PROXY_TARGET;
  let parsedTarget;

  try {
    parsedTarget = new URL(candidate);
  } catch (error) {
    throw new Error(`VNI_PROXY_TARGET must be an absolute http(s) URL: ${candidate}`);
  }

  if (parsedTarget.protocol !== "http:" && parsedTarget.protocol !== "https:") {
    throw new Error(`VNI_PROXY_TARGET must use http or https: ${candidate}`);
  }

  return parsedTarget.origin;
}

function matchesProxyPath(prefix) {
  return function matchProxyPath(pathname) {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  };
}

// HPM logs `WebSocket error: read ECONNRESET` whenever the browser aborts a WS
// upgrade mid-handshake (page reload, HMR reconnect, React StrictMode
// double-mount, component unmount) or the upstream resets an idle socket.
// These are benign in dev — the app keeps serving.
//
// NOTE: a custom `onError` alone CANNOT silence that line. HPM v2
// (`_handlers.js` → `proxy.on('proxyReqWs', ... socket.on('error', ...)`) logs
// socket errors unconditionally, bypassing `onError`. The actual silencer is
// `hpmQuietWsLogs` below, passed as `logProvider` on the ws:true entries.
// `onError` is kept for real-error 502 handling; `logLevel: "warn"` hides the
// per-upgrade `[HPM] Upgrading to WebSocket` info spam.
const BENIGN_WS_PROXY_CODES = new Set(["ECONNRESET", "EPIPE", "ECANCELED", "ETIMEDOUT"]);

// True when HPM log args describe benign WS abort noise (socket-level reset
// during upgrade), as opposed to a real proxy failure (ENOTFOUND, ECONNREFUSED…).
function isBenignWsNoise(args) {
  let text = "";
  for (const arg of args) {
    if (typeof arg === "string") {
      text += ` ${arg}`;
    } else if (arg && typeof arg === "object") {
      text += ` ${arg.code || ""} ${arg.message || ""}`;
    } else {
      try {
        text += ` ${String(arg)}`;
      } catch (_) {
        // ignore unstringifiable arg
      }
    }
  }
  const isHpmWsLine = text.includes("[HPM]") && (text.includes("WebSocket error") || text.includes("ECONNRESET"));
  const hasBenignCode = [...BENIGN_WS_PROXY_CODES].some((code) => text.includes(code));
  return isHpmWsLine && hasBenignCode;
}

// logProvider factory for the ws:true proxies: drops benign WS-abort noise,
// passes everything else through to the default (console) provider.
function hpmQuietWsLogs(defaultProvider) {
  const passthrough = (key) => (...args) => {
    if (isBenignWsNoise(args)) {
      return;
    }
    const fn = defaultProvider[key] || defaultProvider.log;
    fn(...args);
  };
  return {
    log: passthrough("log"),
    debug: passthrough("debug"),
    info: passthrough("info"),
    warn: passthrough("warn"),
    error: passthrough("error"),
  };
}

function handleWsProxyError(proxyName) {
  return function onWsProxyError(err, req, res) {
    const code = (err && err.code) || "";
    if (BENIGN_WS_PROXY_CODES.has(code)) {
      // eslint-disable-next-line no-console
      console.warn(`[HPM:${proxyName}] benign WS proxy abort (${code}) — client reload/unmount or upstream reset`);
      return;
    }
    // eslint-disable-next-line no-console
    console.error(`[HPM:${proxyName}] WS proxy error:`, err);
    try {
      if (res && !res.headersSent && typeof res.writeHead === "function") {
        res.writeHead(502, { "Content-Type": "text/plain" });
      }
      if (res && typeof res.end === "function") {
        res.end("Bad gateway");
      }
    } catch (_) {
      // ignore — socket already gone
    }
  };
}

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";
  const proxyTarget = normalizeProxyTarget(process.env.VNI_PROXY_TARGET);
  const proxyUsesTls = /^https:\/\//i.test(proxyTarget);

  return {
    entry: {
      "vninvestcharts-widget-demo": "./src/demo/index.tsx",
    },
    output: {
      path: path.resolve(__dirname, "../build"),
      filename: "[name].[contenthash].js",
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      // Alias entries whose value is null are dropped, so the installed engine
      // packages are used when no checkout is present.
      alias: Object.fromEntries(
        Object.entries({
          "vninvestcharts-widget": path.resolve(__dirname, "../src"),
          react: path.resolve(__dirname, "../node_modules/react"),
          "react-dom": path.resolve(__dirname, "../node_modules/react-dom"),
          // The engine twin repo defaults to the sibling checkout, but a worktree
          // must be able to point the dev server at itself; otherwise the bundle
          // silently mixes one engine's types with another's runtime.
          "@vninvestcharts/engine-core": engineSource("vn-kline-engine-core"),
          "@vninvestcharts/engine-react": engineSource("vn-kline-engine-react"),
          "@vninvestcharts/vn-kline-engine-react": engineSource("vn-kline-engine-react"),
          "@vninvestcharts/engine-drawing": engineSource("vn-kline-engine-drawing"),
          "@vninvestcharts/widget-pro": widgetProSource(),
        }).filter(([, value]) => Boolean(value)),
      ),
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          use: {
            loader: "ts-loader",
            options: {
              transpileOnly: true,
            },
          },
          exclude: /node_modules/,
        },
        {
          test: /\.csv$/i,
          type: "asset/source",
        },
        {
          test: /\.(js|jsx)$/,
          use: "babel-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"],
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i,
          type: "asset/resource",
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./src/demo/index.html",
        filename: "index.html",
      }),
      // Inject the Binance proxy base URL so BinanceAdapter never hits
      // api.binance.com from the browser.
      //
      // PRODUCTION USED TO BE "" HERE, and that was a real defect, not a style choice.
      // `deploy/nginx-app.conf` ships a `/binance-proxy/` location that proxies to
      // api.binance.com and adds `Access-Control-Allow-Origin` — so the empty
      // production value made that shipped route DEAD CODE, and every deployed browser
      // talked straight to Binance.
      //
      // Measured 2026-10-13 against https://charts.edusuccess.vn (the test env):
      //   /binance-proxy/api/v3/klines  -> HTTP 200 + real BTC klines
      //   https://api.binance.com/...   -> HTTP 451 (geo-blocked)
      //   browser fetch direct           -> CORS failure
      // The adapter's 451 fallback cannot save the browser: a CORS rejection surfaces as
      // an opaque TypeError, not an HTTP status, so `fetchFrom` never throws
      // BinanceHttpError and the mirror is never tried (BinanceAdapter.ts:138-150).
      // Result: E2E scored 4/13 with an empty chart and zero data rows.
      //
      // `/binance-ws-proxy` stays dev-only: the deployed nginx conf has no websocket
      // upstream, and streaming degrades on its own. Changing that needs the nginx side.
      // 2026-10-13: the deployed conf NOW has that upstream (location /binance-ws-proxy/ in
      // deploy/nginx-app.conf), so production gets the proxy too. Same reasoning as REST:
      // same-origin keeps CSP on `'self'` and moves the upstream call to the server, so the
      // stream works for a client in any region. The library's own fallback
      // (wss://stream.binance.com:9443) is untouched — BinanceAdapter.test.ts still covers
      // it, because that is what an npm consumer without a proxy needs.
      //
      // VNI_API_BASE configures the VNInvest core API the demo talks to. Injecting it at
      // build time keeps a deployment hostname out of `src/**`. Falls back to same-origin,
      // which is what a reverse-proxied deployment wants.
      // VNI_DEMO_LICENSE — license pro demo (2026-10-17, src/demo/demoLicense.ts).
      // CHỈ build demo (webpack này) nhận define; tsup/library không define biến này
      // và module installer không nằm trong entry thư viện ⇒ blob không thể vào
      // dist/. Blob mint ngoài repo bằng private key production, bind domain
      // charts.edusuccess.vn; truyền qua env lúc build:docs như VNI_API_BASE:
      //   cross-env VNI_DEMO_LICENSE=<blob> npm run build:docs  (blob đọc từ file
      //   ngoài repo — không bao giờ commit).
      new webpack.DefinePlugin({
        VN_BINANCE_BASE: JSON.stringify("/binance-proxy"),
        VN_BINANCE_WS_BASE: JSON.stringify("/binance-ws-proxy"),
        VNI_API_BASE: JSON.stringify(process.env.VNI_API_BASE || ""),
        VNI_DEMO_LICENSE: JSON.stringify(process.env.VNI_DEMO_LICENSE || ""),
        'process.env.VNI_INVEST_DEFAULT_PAT': JSON.stringify(process.env.VNI_INVEST_DEFAULT_PAT || ''),
      }),
    ],
    devServer: {
      static: {
        directory: path.join(__dirname, "../build"),
      },
      proxy: [
        {
          context: matchesProxyPath("/api/drawings"),
          target: "http://localhost:5001",
          changeOrigin: true,
          secure: false,
        },
        {
          context: matchesProxyPath("/api"),
          target: proxyTarget,
          changeOrigin: true,
          secure: proxyUsesTls,
        },
        {
          context: matchesProxyPath("/core/v1"),
          target: proxyTarget,
          changeOrigin: true,
          secure: proxyUsesTls,
        },
        {
          context: matchesProxyPath("/ws"),
          target: proxyTarget,
          changeOrigin: true,
          secure: proxyUsesTls,
          ws: true,
          logLevel: "warn",
          logProvider: hpmQuietWsLogs,
          onError: handleWsProxyError("ws"),
        },
        // Proxy Binance API via dev server so the browser never hits api.binance.com directly.
        // Path /binance-proxy/api/v3/klines → https://api.binance.com/api/v3/klines
        {
          context: matchesProxyPath("/binance-proxy"),
          target: "https://api.binance.com",
          changeOrigin: true,
          secure: true,
          pathRewrite: { "^/binance-proxy": "" },
        },
        // Proxy Binance WebSocket stream via dev server (ws:true) so the browser
        // never hits stream.binance.com directly (avoids regional blocks).
        // Path /binance-ws-proxy/ws/<symbol>@kline_<interval>
        //   -> wss://stream.binance.com:9443/ws/<symbol>@kline_<interval>
        {
          context: matchesProxyPath("/binance-ws-proxy"),
          target: "wss://stream.binance.com:9443",
          changeOrigin: true,
          secure: true,
          ws: true,
          logLevel: "warn",
          logProvider: hpmQuietWsLogs,
          onError: handleWsProxyError("binance-ws-proxy"),
          pathRewrite: { "^/binance-ws-proxy": "" },
        },
      ],
      compress: true,
      port: 3000,
      hot: true,
      webSocketServer: {
        type: "ws",
        options: {
          path: DEV_SERVER_WS_PATH,
        },
      },
      client: {
        overlay: false,
        webSocketURL: {
          pathname: DEV_SERVER_WS_PATH,
        },
      },
    },
    mode: isProduction ? "production" : "development",
    devtool: isProduction ? "source-map" : "eval-cheap-module-source-map",
  };
};
