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

  if (document.getElementById("noova-widget-host")) return;

  var host = document.createElement("div");
  host.id = "noova-widget-host";
  host.style.cssText =
    "position:fixed;bottom:20px;right:20px;z-index:2147483647;font-family:system-ui,sans-serif;line-height:1";

  var panel = document.createElement("div");
  panel.id = "noova-widget-panel";
  panel.style.cssText =
    "display:none;position:absolute;bottom:72px;right:0;width:380px;height:600px;max-height:calc(100vh - 100px);border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.22);background:#fff";

  var iframe = document.createElement("iframe");
  iframe.src =
    base + "/widget/" + encodeURIComponent(slug) + (preview ? "?preview=1" : "");
  iframe.title = "Chat";
  iframe.setAttribute("allow", "clipboard-write");
  iframe.style.cssText = "width:100%;height:100%;border:none;display:block";

  panel.appendChild(iframe);

  var btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "Abrir chat");
  btn.style.cssText =
    "width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;background:" +
    color +
    ";color:#fff;transition:transform .2s";

  var iconChat =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var iconClose =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  btn.innerHTML = iconChat;

  function setOpen(next) {
    open = next;
    panel.style.display = open ? "block" : "none";
    btn.innerHTML = open ? iconClose : iconChat;
    btn.setAttribute("aria-label", open ? "Cerrar chat" : "Abrir chat");
  }

  btn.addEventListener("click", function () {
    setOpen(!open);
  });

  window.addEventListener("message", function (event) {
    if (event.data && event.data.type === "noova-widget-close") {
      setOpen(false);
    }
  });

  host.appendChild(panel);
  host.appendChild(btn);
  document.body.appendChild(host);
})();
