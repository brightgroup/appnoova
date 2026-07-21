(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var slug = script.getAttribute("data-slug");
  if (!slug) {
    console.error("[Noova Widget] Falta data-slug en el script.");
    return;
  }

  var base = (script.getAttribute("data-base") || "https://app.noova360.com").replace(/\/$/, "");
  var color = script.getAttribute("data-color") || "#5b5bf6";
  var preview = script.getAttribute("data-preview") === "1";
  var open = false;
  var prevBodyOverflow = "";
  var prevHtmlOverflow = "";

  if (document.getElementById("noova-widget-host")) return;

  function isMobile() {
    return window.matchMedia("(max-width: 640px)").matches;
  }

  var host = document.createElement("div");
  host.id = "noova-widget-host";

  var panel = document.createElement("div");
  panel.id = "noova-widget-panel";

  var iframe = document.createElement("iframe");
  iframe.src =
    base + "/widget/" + encodeURIComponent(slug) + (preview ? "?preview=1" : "");
  iframe.title = "Chat";
  iframe.setAttribute("allow", "clipboard-write");
  iframe.style.cssText = "width:100%;height:100%;border:none;display:block;background:#fff";

  panel.appendChild(iframe);

  var btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "Abrir chat");
  btn.id = "noova-widget-launcher";

  var iconChat =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var iconClose =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  btn.innerHTML = iconChat;

  function lockPageScroll(lock) {
    var html = document.documentElement;
    var body = document.body;
    if (lock) {
      prevHtmlOverflow = html.style.overflow;
      prevBodyOverflow = body.style.overflow;
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
    } else {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    }
  }

  function applyLayout() {
    var mobile = isMobile();
    var fullscreen = open && mobile;

    if (fullscreen) {
      host.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;width:100%;height:100%;" +
        "font-family:system-ui,sans-serif;line-height:1";
      panel.style.cssText =
        "display:block;position:fixed;inset:0;width:100%;height:100%;" +
        "height:100dvh;max-height:100dvh;border-radius:0;overflow:hidden;" +
        "box-shadow:none;background:#fff;" +
        "padding:env(safe-area-inset-top,0) env(safe-area-inset-right,0) env(safe-area-inset-bottom,0) env(safe-area-inset-left,0);" +
        "box-sizing:border-box";
      btn.style.display = "none";
      lockPageScroll(true);
      return;
    }

    lockPageScroll(false);

    var bottomPad = mobile ? "max(16px, env(safe-area-inset-bottom, 0px))" : "20px";
    var rightPad = mobile ? "max(16px, env(safe-area-inset-right, 0px))" : "20px";

    host.style.cssText =
      "position:fixed;bottom:" +
      bottomPad +
      ";right:" +
      rightPad +
      ";z-index:2147483647;font-family:system-ui,sans-serif;line-height:1;" +
      "width:auto;height:auto";

    if (open) {
      panel.style.cssText =
        "display:block;position:absolute;bottom:72px;right:0;" +
        "width:min(380px, calc(100vw - 32px));height:min(600px, calc(100vh - 100px));" +
        "height:min(600px, calc(100dvh - 100px));max-height:calc(100dvh - 100px);" +
        "border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.22);background:#fff";
    } else {
      panel.style.cssText = "display:none";
    }

    btn.style.cssText =
      "display:flex;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;" +
      "box-shadow:0 4px 20px rgba(0,0,0,.25);align-items:center;justify-content:center;" +
      "background:" +
      color +
      ";color:#fff;transition:transform .2s;-webkit-tap-highlight-color:transparent";
  }

  function setOpen(next) {
    open = next;
    btn.innerHTML = open && !isMobile() ? iconClose : iconChat;
    btn.setAttribute("aria-label", open ? "Cerrar chat" : "Abrir chat");
    applyLayout();
  }

  btn.addEventListener("click", function () {
    setOpen(!open);
  });

  window.addEventListener("message", function (event) {
    if (event.data && event.data.type === "noova-widget-close") {
      setOpen(false);
    }
  });

  window.addEventListener("resize", function () {
    applyLayout();
  });

  window.addEventListener("orientationchange", function () {
    setTimeout(applyLayout, 150);
  });

  host.appendChild(panel);
  host.appendChild(btn);
  document.body.appendChild(host);
  applyLayout();
})();
