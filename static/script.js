const root = document.documentElement;

if (localStorage.getItem('customTitle')) document.title = localStorage.getItem('customTitle');
if (localStorage.getItem('customFavicon')) document.querySelector("link[rel~='icon']").href = localStorage.getItem('customFavicon');
if (localStorage.getItem('backgroundUrl')) root.style.setProperty('--background', `url(${localStorage.getItem('backgroundUrl')})`);
if (localStorage.getItem('theme')) root.style.setProperty('--background-color', localStorage.getItem('theme'));

window.addEventListener('load', () => {
  window.panicKeys = JSON.parse(localStorage.getItem("panicKeys"));
  window.panicUrl = localStorage.getItem("panicURL") || "https://google.com";
  if (window.panicKeys && Array.isArray(window.panicKeys) && window.panicUrl) detectPanicKeys();
});

setTimeout(() => notification(`ChatGPT is now permanently available in the top-right menu! Give it a try.`, "#039dfc"), 2500);

function reloadPage() {
  if (document.getElementById("frame" + currentTab).src != "about:blank") document.getElementById("frame" + currentTab).src = document.getElementById("frame" + currentTab).src;
}

function openApps() {
	addTab();
  runService('helium://apps');
}

function openDev() {
	addTab();
  runService('helium://dev');
}
function erudaToggle() {
  const iframe = document.getElementById("frame" + currentTab);
  if (!iframe) return;
  const { contentWindow: erudaWindow, contentDocument: erudaDocument } = iframe;
  if (!erudaWindow || !erudaDocument) return;

  if (erudaWindow.eruda?._isInit) {
    erudaWindow.eruda.destroy();
  } else {
    const script = erudaDocument.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/eruda';
    script.onload = () => {
      if (!erudaWindow) return;
      erudaWindow.eruda.init();
      erudaWindow.eruda.show();
    };
    erudaDocument.head.appendChild(script);
  }
}

function detectPanicKeys() {
  let hitKeys = [];
  let hitKeyRetention = false;

  document.addEventListener("keydown", (e) => {
    if (!window.panicKeys) return;
    if (!hitKeyRetention) {
      hitKeyRetention = true;
      setTimeout(() => {
        hitKeyRetention = false;
        hitKeys = [];
      }, 750);
    }
    hitKeys.push(e.key);
    if (hitKeys.length >= window.panicKeys.length) {
      const hitKeysSet = new Set(hitKeys);
      const panicKeysSet = new Set(window.panicKeys);
      if (new Set([...hitKeysSet].filter((x) => panicKeysSet.has(x))).size === panicKeysSet.size) {
        window.open(window.panicUrl);
      }
    }
  });
}

window.setInterval(checkFocus, 15);

function checkFocus() {
  const iframe = document.getElementById("frame" + currentTab);
  const activeElement = document.activeElement;
  if (activeElement === iframe) {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    const iframeActiveElement = iframeDoc.activeElement;
    if (!["INPUT", "TEXTAREA", "SELECT"].includes(iframeActiveElement.tagName)) window.focus();
  }
}

let notificationCount = 0;

function notification(message, bgColor) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.style.backgroundColor = bgColor;

  const text = document.createElement('span');
  text.textContent = message;

  const closeBtn = document.createElement('img');
  closeBtn.className = 'close-btn';
  closeBtn.src = 'assets/closeTabBlack.svg';
  closeBtn.onclick = () => hideNotification(notification);

  notification.appendChild(text);
  notification.appendChild(closeBtn);
  document.body.appendChild(notification);

  notification.style.top = `${25 + (notificationCount * 60)}px`;
  notificationCount++;

  setTimeout(() => notification.classList.add('show'), 10);
  setTimeout(() => hideNotification(notification), 10000);
}

function hideNotification(notification) {
  notification.classList.add('hide');
  setTimeout(() => {
    notification.remove();
    notificationCount--;
    repositionNotifications();
  }, 500);
}

function repositionNotifications() {
  const notifications = document.querySelectorAll('.notification');
  notifications.forEach((notif, index) => notif.style.top = `${25 + (index * 60)}px`);
}

async function worker() {
  return await navigator.serviceWorker.register("/sw.js", { scope: "/class" });
}

document.addEventListener("DOMContentLoaded", async () => {
  await worker();
  workerLoaded = true;
});

let currentTab = 0;
let tabs = [{ url: 'about:blank', history: [], currentHistoryIndex: -1 }];
const searchBar = document.getElementById('searchBar');
const urlInput = document.getElementById('searchBar');
const contextMenu = document.getElementById('contextMenu');
const addTabButton = document.querySelector('.add-tab');

document.getElementById("frame" + currentTab).addEventListener('load', () => {
  const currentURL = document.getElementById("frame" + currentTab).contentWindow.location.href;
  if (currentURL && currentURL !== 'about:blank') {
    tabs[currentTab].url = currentURL;
    if (tabs[currentTab].history[tabs[currentTab].currentHistoryIndex] !== currentURL) {
      tabs[currentTab].history.push(currentURL);
      tabs[currentTab].currentHistoryIndex = tabs[currentTab].history.length - 1;
    }
    const globalHistory = JSON.parse(localStorage.getItem('globalHistory')) || [];
    if (!globalHistory.includes(currentURL)) {
      globalHistory.push(currentURL);
      localStorage.setItem('globalHistory', JSON.stringify(globalHistory));
    }
  }
  document.getElementById(currentTab).querySelector('p').textContent = document.getElementById("frame" + currentTab).contentDocument.title;
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById("frame" + currentTab).style.display = 'block';
  logWebsiteVisit(document.getElementById("frame" + currentTab).contentWindow.location.href);
});

function fullscreen() {
  document.getElementById("frame" + currentTab).requestFullscreen();
}

function loadUrlFromHistory(url) {
  tabs[currentTab].url = url;
  tabs[currentTab].history.push(url);
  tabs[currentTab].currentHistoryIndex = tabs[currentTab].history.length - 1;
  iframe.src = url;
}

async function runService(url) {
    document.getElementById("quote").innerText = quoteText[Math.floor(Math.random() * quoteText.length)];
    document.getElementById('loadingScreen').style.display = 'flex';
    document.getElementById("frame" + currentTab).style.display = 'none';  
  const tab = tabs[currentTab];
  if (url) {
    tab.url = url;
  }
  if (tab.url === 'helium://settings' || tab.url.includes("/subpages/settings/s.html")) {
    urlInput.value = "helium://settings";
    document.getElementById("frame" + currentTab).src = '/subpages/settings/s.html';
  } else if (tab.url === 'helium://gpt' || tab.url.includes("/subpages/gpt/html/index.html")) {
    urlInput.value = "helium://gpt";
    document.getElementById("frame" + currentTab).src = '/subpages/gpt/html/index.html';
  }else if (tab.url === 'helium://apps' || tab.url.includes("/subpages/apps/a.html")) {
    urlInput.value = "helium://apps";
    document.getElementById("frame" + currentTab).src = '/subpages/apps/a.html';
  } else if (tab.url === 'helium://dev' || tab.url.includes("/subpages/apps/a.html")) {
    urlInput.value = "helium://dev";
    document.getElementById("frame" + currentTab).src = '/subpages/dev/d.html';
  }else if (tab.url === 'helium://landing' || tab.url.includes("/subpages/landing/l.html")) {
    urlInput.value = "";
    urlInput.placeholder = "Search or enter a URL";
    document.getElementById("frame" + currentTab).src = '/subpages/landing/l.html';
  }else if (!(tab.url) || tab.url == 'about:blank') {
    urlInput.value = "";
    urlInput.placeholder = "Search or enter a URL";
    document.getElementById("frame" + currentTab).src = '/subpages/landing/l.html';
  } else {
    const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
    const searchEngine = localStorage.getItem('searchEngine') || "https://www.google.com/search?q=";
    if (/\/class\//.test(tab.url)) {
      tabs[currentTab].currentHistoryIndex = tabs[currentTab].history.length - 1; 
      let wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
      if (await connection.getTransport() !== "/epoxy/index.mjs") {
        await connection.setTransport("/epoxy/index.mjs", [{ wisp: wispUrl }]);
      }
      document.getElementById("frame" + currentTab).src = tab.url;
      urlInput.value = tab.url.includes('/class/') ? __uv$config.decodeUrl(tab.url.split('/class/')[1]) : __uv$config.decodeUrl(tab.url);
    } else {
    if (!/^(https?:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,30}/i.test(tab.url)) {
      tab.url = searchEngine + tab.url;
  }
  else if (!/^(https?:\/\/)/i.test(tab.url)) {
      tab.url = "http://" + tab.url;
  }    
  
  document.getElementById('searchBar').value = tab.url;
tabs[currentTab].currentHistoryIndex = tabs[currentTab].history.length - 1;
    let wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
	  if (await connection.getTransport() !== "/epoxy/index.mjs") {
		  await connection.setTransport("/epoxy/index.mjs", [{ wisp: wispUrl }]);
	  }
	  document.getElementById("frame" + currentTab).src = __uv$config.prefix + __uv$config.encodeUrl(tab.url);
  }
}
}
searchBar.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    runService(searchBar.value);
    setTimeout(() => {
      suggestionsList.innerHTML = '';
      suggestionsList.style.display = 'none';
      document.getElementById('suggestionsBackground').style.display = 'none';
      searchBar.style.borderBottomLeftRadius = "3px";
      searchBar.style.borderBottomRightRadius = "3px";
      document.getElementById("searchbarbackground").style.borderBottomRightRadius = "3px";
      document.getElementById("searchbarbackground").style.borderBottomLeftRadius = "3px";
    }, 200);
  }
  
});

function popout() {
  if (tabs[currentTab].url.includes("subpages/landing/l.html") || tabs[currentTab].url.includes("subpages/apps/a.html") || tabs[currentTab].url.includes("subpages/settings/s.html")) {
    notification("You can't pop system pages out.", "#ff9999")
    return;
  }
  var win = window.open("about:blank", "_blank");
  const frame = document.createElement("iframe");
  frame.src = document.getElementById("frame" + currentTab).src;
  win.document.body.appendChild(frame);
  closeTab(currentTab)
  frame.style.cssText =
    "margin: 0; padding: 0; overflow: hidden; width: 100%; height: 100%; position: absolute; top: 0; left: 0; z-index: 1000000; border: none; border-radius: 0;";
}

function selectTab(tabIndex) {
  document.querySelectorAll("iframe").forEach(iframe => {
    iframe.style.display = "none";
  });
  currentTab = tabIndex;
  document.querySelectorAll('.tab').forEach((tab, index) => {
    tab.classList.toggle('active', index === tabIndex);
  });
  document.getElementById("frame" + currentTab).style.display = 'block';

  if (!document.getElementById("frame" + currentTab).contentWindow.location.href.includes('/subpages/')) {
    document.getElementById('searchBar').value = document.getElementById("frame" + currentTab).contentWindow.location.href.includes('/class/') ? __uv$config.decodeUrl(document.getElementById("frame" + currentTab).contentWindow.location.href.split('/class/')[1]) : __uv$config.decodeUrl(document.getElementById("frame" + currentTab).contentWindow.location.href);
  } else {
    if (document.getElementById("frame" + currentTab).contentWindow.location.href.includes("/subpages/settings/s.html")) {
      urlInput.value = "helium://settings";
    } else if (document.getElementById("frame" + currentTab).contentWindow.location.href.includes("/subpages/gpt/html/index.html")) {
      urlInput.value = "helium://gpt";
    }else if (document.getElementById("frame" + currentTab).contentWindow.location.href.includes("/subpages/apps/a.html")) {
      urlInput.value = "helium://apps";
    } else if (document.getElementById("frame" + currentTab).contentWindow.location.href.includes("/subpages/dev/d.html")) {
      urlInput.value = "helium://dev";
    } else if (document.getElementById("frame" + currentTab).contentWindow.location.href.includes("/subpages/landing/l.html")) {
      urlInput.value = "";
      urlInput.placeholder = "Search or enter a URL";
    }else if (!(document.getElementById("frame" + currentTab).contentWindow.location.href) || currentURL == 'about:blank') {
      urlInput.value = "";
      urlInput.placeholder = "Search or enter a URL";
      document.getElementById("frame" + currentTab).src = '/subpages/landing/l.html';
    }
  }
}

function addTab() {
  if (tabs.length >= 27) {
    notification('The maximum amount of tabs have been reached.', "#ff9999");
    return;
  }
  const newTabIndex = tabs.length;
  tabs.push({ url: 'helium://landing', history: [], currentHistoryIndex: -1 });

  const newIframe = document.createElement('iframe');

const parentElement = document.getElementById('iframeOverlay');

if (parentElement) {
    newIframe.src = "/subpages/landing/l.html";
    newIframe.id = "frame" + newTabIndex;
    newIframe.style.display = "block";
    parentElement.appendChild(newIframe);
} else {
    console.error("Parent element 'iframeOverlay' not found.");
}
  
  document.getElementById("frame" + currentTab).style.display = "none";

  const tabBar = document.getElementById('tabBar');
  const newTabButton = document.createElement('button');
  newTabButton.classList.add('tab');
  newTabButton.id = tabs.length - 1;

  const newTabText = document.createElement('p');
  newTabText.id = 'tabText';
  newTabText.textContent = 'New Tab';
  newTabButton.appendChild(newTabText);

  const closeTabButton = document.createElement('img');
  closeTabButton.src = 'assets/closeTab.svg';
  closeTabButton.id = 'closeTab';
  closeTabButton.onclick = (event) => {
    event.stopPropagation();
    closeTab(newTabIndex);
  };
  newTabButton.appendChild(closeTabButton);
  newTabButton.onclick = () => selectTab(newTabIndex);
  tabBar.insertBefore(newTabButton, addTabButton);

  currentTab = newTabIndex;
  document.querySelectorAll('.tab').forEach((tab, index) => {
    tab.classList.toggle('active', index === newTabIndex);
  });

  document.getElementById("frame" + currentTab).addEventListener('load', () => {
    const currentURL = document.getElementById("frame" + currentTab).contentWindow.location.href;
    if (currentURL) {
      tabs[currentTab].url = currentURL;
      if (tabs[currentTab].history[tabs[currentTab].currentHistoryIndex] !== currentURL) {
        tabs[currentTab].history.push(currentURL);
        tabs[currentTab].currentHistoryIndex = tabs[currentTab].history.length - 1;
      }
      const globalHistory = JSON.parse(localStorage.getItem('globalHistory')) || [];
      if (!globalHistory.includes(currentURL)) {
        globalHistory.push(currentURL);
        localStorage.setItem('globalHistory', JSON.stringify(globalHistory));
      }
      if (!currentURL.includes('/subpages/')) {
        document.getElementById('searchBar').value = currentURL.includes('/class/') ? __uv$config.decodeUrl(currentURL.split('/class/')[1]) : __uv$config.decodeUrl(currentURL);
      } else {
        if (currentURL.includes("/subpages/settings/s.html")) {
          urlInput.value = "helium://settings";
        } else if (currentURL.includes("/subpages/gpt/html/index.html")) {
          urlInput.value = "helium://gpt";
        }else if (currentURL.includes("/subpages/apps/a.html")) {
          urlInput.value = "helium://apps";
        } else if (currentURL.includes("/subpages/dev/d.html")) {
          urlInput.value = "helium://dev";
        } else if (currentURL.includes("/subpages/landing/l.html")) {
          urlInput.value = "";
          urlInput.placeholder = "Search or enter a URL";
        }else if (!(currentURL) || currentURL == 'about:blank') {
          urlInput.value = "";
          urlInput.placeholder = "Search or enter a URL";
          document.getElementById("frame" + currentTab).src = '/subpages/landing/l.html';
        }
      }
    }
    document.getElementById(currentTab).querySelector('p').textContent = document.getElementById("frame" + currentTab).contentDocument.title;
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById("frame" + currentTab).style.display = 'block';
    logWebsiteVisit(document.getElementById("frame" + currentTab).contentWindow.location.href);
  });
  
}

function navigateBack() {
  const tab = tabs[currentTab];
  if (tab.currentHistoryIndex > 0) {
    tab.currentHistoryIndex--;
    runService(tab.history[tab.currentHistoryIndex]);
  }
}

function navigateForward() {
  const tab = tabs[currentTab];
  if (tab.currentHistoryIndex < tab.history.length - 1) {
    tab.currentHistoryIndex++;
    runService(tab.history[tab.currentHistoryIndex]);
  }
}

function closeTab(tabIndex) {
  const tabBar = document.getElementById('tabBar');
  const allTabs = document.querySelectorAll('.tab');
  const allFrames = document.querySelectorAll('iframe');

  if (allTabs.length === 1) {
    notification("You cannot destroy the last tab.", "#ff9999");
    return;
  }

  if (tabIndex < 0 || tabIndex >= allTabs.length) return;

  allTabs[tabIndex].remove();
  allFrames[tabIndex].remove();
  tabs.splice(tabIndex, 1);

  reassignTabIndices();

  if (currentTab >= tabs.length) {
    currentTab = tabs.length - 1;
  }
  selectTab(currentTab);
}

function reassignTabIndices() {
  const allTabs = document.querySelectorAll('.tab');
  const allFrames = document.querySelectorAll('iframe');

  allTabs.forEach((tab, index) => {
    tab.id = index;
    tab.onclick = () => selectTab(index);
    tab.querySelector('#closeTab').onclick = (event) => {
      event.stopPropagation();
      closeTab(index);
    };
  });

  allFrames.forEach((frame, index) => {
    frame.id = `frame${index}`;
  });
}


let ignoreClose = false;


function openHamburgerMenu() {
  const menu = document.getElementById("hamburgerbackground");
  const buttons = document.getElementById('hamburgermenu').querySelectorAll('button');

  if (!menu || !buttons.length) return;

  if (menu.style.display === 'none' || menu.style.display === '') {
      menu.style.display = 'block';
      ignoreClose = true; 

      setTimeout(() => {
          ignoreClose = false; 
          document.getElementById('iframeOverlay').addEventListener('click', closeOnClickOutside);
      }, 50);

      buttons.forEach(button => button.addEventListener('click', closeHamburgerMenu));
  } else {
      closeHamburgerMenu();
  }
}

function closeHamburgerMenu() {
  const menu = document.getElementById("hamburgerbackground");
  if (menu) {
      menu.style.display = 'none';
      document.removeEventListener('click', closeOnClickOutside);
  }
}

function closeOnClickOutside(event) {
  const menu = document.getElementById("hamburgermenu");

  if (ignoreClose) return;

  if (menu && menu.offsetParent !== null && !menu.contains(event.target)) {
      closeHamburgerMenu();
  }
}

window.onload = () => runService();

const suggestionsList = document.getElementById('suggestions');
document.getElementById("searchBar").addEventListener("focus", () => {
  document.getElementById("searchBar").select();
  if (!(document.getElementById("searchBar").value.trim() === "")) {
    document.getElementById('suggestionsBackground').style.height = document.getElementById('suggestions').offsetHeight + 'px';
    suggestionsList.style.display = 'block';
    document.getElementById('suggestionsBackground').style.display = 'block';
    searchBar.style.borderBottomLeftRadius = "0px";
    searchBar.style.borderBottomRightRadius = "0px";
    document.getElementById("searchbarbackground").style.borderBottomRightRadius = "0px";
    document.getElementById("searchbarbackground").style.borderBottomLeftRadius = "0px";
    const script = document.createElement('script');
    script.src = `https://suggestqueries.google.com/complete/search?client=firefox&q=${document.getElementById("searchBar").value.trim()}&callback=handleSuggestions`;
    document.body.appendChild(script);
    setTimeout(() => script.remove(), 1000);
  }
});

document.getElementById("searchBar").addEventListener("blur", () => {
  setTimeout(() => {
    suggestionsList.innerHTML = '';
    suggestionsList.style.display = 'none';
    document.getElementById('suggestionsBackground').style.display = 'none';
    searchBar.style.borderBottomLeftRadius = "3px";
    searchBar.style.borderBottomRightRadius = "3px";
    document.getElementById("searchbarbackground").style.borderBottomRightRadius = "3px";
    document.getElementById("searchbarbackground").style.borderBottomLeftRadius = "3px";
  }, 200);
});

searchBar.addEventListener('input', () => {
  const query = document.getElementById("searchBar").value.trim();
  if (query == '') {
    suggestionsList.innerHTML = '';
    suggestionsList.style.display = "none";
    document.getElementById('suggestionsBackground').style.display = 'none';
    searchBar.style.borderBottomLeftRadius = "3px";
    searchBar.style.borderBottomRightRadius = "3px";
    document.getElementById("searchbarbackground").style.borderBottomRightRadius = "3px";
    document.getElementById("searchbarbackground").style.borderBottomLeftRadius = "3px";
    return;
  } else {
    document.getElementById('suggestionsBackground').style.height = document.getElementById('suggestions').offsetHeight + 'px';
    suggestionsList.style.display = 'block';
    document.getElementById('suggestionsBackground').style.display = 'block';
    searchBar.style.borderBottomLeftRadius = "0px";
    searchBar.style.borderBottomRightRadius = "0px";
    document.getElementById("searchbarbackground").style.borderBottomRightRadius = "0px";
    document.getElementById("searchbarbackground").style.borderBottomLeftRadius = "0px";
  }
  const script = document.createElement('script');
  script.src = `https://suggestqueries.google.com/complete/search?client=firefox&q=${query}&callback=handleSuggestions`;
  document.body.appendChild(script);
  setTimeout(() => script.remove(), 1000);
});

function handleSuggestions(data) {
  const suggestions = data[1];
  showSuggestions(suggestions);
}

function showSuggestions(suggestions) {
  let html = '';
  suggestions.forEach(suggestion => html += `<div>${suggestion}</div>`);
  suggestionsList.innerHTML = html;
}

suggestionsList.addEventListener('click', (event) => {
  if (event.target.tagName.toUpperCase() === 'DIV') {
    runService(event.target.textContent);
    suggestionsList.innerHTML = '';
  }
});

function openSettings() {
	addTab();
  runService('helium://settings');
}

function openGPT() {
  addTab();
  runService('helium://gpt')
}

setTimeout(() => {
  try {
    inFrame = window !== top;
  } catch (e) {
    inFrame = true;
  }

  if (!inFrame && localStorage.getItem("autolaunch") === 'on' && !navigator.userAgent.includes('Firefox')) {
    const popup = open('about:blank', '_blank');
    if (!popup || popup.closed) {
      alert('Please allow popups and redirects.');
    } else {
      const doc = popup.document;
      const iframe = doc.createElement('iframe');
      const style = iframe.style;
      const link = doc.createElement('link');

      const name = localStorage.getItem('title') || 'My Drive - Google Drive';
      const icon = localStorage.getItem('favicon') || 'https://ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png';

      doc.title = name;
      link.rel = 'icon';
      link.href = icon;

      iframe.src = location.href;
      style.position = 'fixed';
      style.top = style.bottom = style.left = style.right = 0;
      style.border = style.outline = 'none';
      style.width = style.height = '100%';

      doc.head.appendChild(link);
      doc.body.appendChild(iframe);
      location.replace('https://canvas.com/');

      const script = doc.createElement('script');
      script.textContent = `
        window.onbeforeunload = function (event) {
          const confirmationMessage = 'Do you really want to exit Helium?';
          (event || window.event).returnValue = confirmationMessage;
          return confirmationMessage;
        };
      `;
      doc.head.appendChild(script);
    }
  }
}, 200);

if (window.innerWidth <= 600) notification("Some features may not work on smaller screen sizes.", "#db8cff");


const online = navigator.onLine;
const userAgent = navigator.userAgent;
let browserName;
const diagnosticDomain = window.location.href;

if (userAgent.match(/chrome|chromium|crios/i)) {
  browserName = "Chrome";
} else if (userAgent.match(/firefox|fxios/i)) {
  browserName = "Firefox";
} else if (userAgent.match(/safari/i)) {
  browserName = "Safari";
} else if (userAgent.match(/opr\//i)) {
  browserName = "Opera";
} else if (userAgent.match(/edg/i)) {
  browserName = "Edge";
} else {
  browserName = "Browser not detected!";
}

let quoteText = [
  'Loading...'
]

document.getElementById("quote").innerText = quoteText[Math.floor(Math.random() * quoteText.length)];



document.addEventListener("DOMContentLoaded", function () {
  function applyIframeFix(iframe) {
      if (!iframe) return;

      iframe.addEventListener("load", function () {
          try {
              const iframeWindow = iframe.contentWindow;
              const iframeDoc = iframe.contentDocument || (iframeWindow ? iframeWindow.document : null);

              if (!iframeWindow || !iframeDoc) return;

              iframeDoc.querySelectorAll("a[target='_blank'], a[target='_top']").forEach(link => {
                  link.addEventListener("click", function (event) {
                      event.preventDefault();
                      addTab();
                      runService(link.href);
                  });
              });

              iframeWindow.open = function (url) {
                  addTab();
                  runService(url);
                  return { focus() {}, close() {} }; 
              };

          } catch (error) {
              alert("Cross-origin iframe detected. Cannot modify its content.");
          }
      });
  }

  document.querySelectorAll("iframe").forEach(applyIframeFix);

  new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
              if (node.tagName === "IFRAME") applyIframeFix(node);
          });
      });
  }).observe(document.body, { childList: true, subtree: true });
});

async function logWebsiteVisit(url) {
  const sessionId = localStorage.getItem("session_id") || generateSessionId();
  localStorage.setItem("session_id", sessionId);
  if (url.includes("/class/")) {
    url = __uv$config.decodeUrl(url.split('/class/')[1]);
  }

  try {
      const response = await fetch("/log", {
          method: "POST",
          headers: {
              "Content-Type": "application/json",
              "X-Session-ID": sessionId
          },
          body: JSON.stringify({ url })
      });

      const data = await response.json();
      if (data.status === "banned") {
          window.location.href = "/banned";
      }
  } catch (error) {
      console.error("Error logging website visit:", error);
  }
}

function generateSessionId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });  
}

async function sendHeartbeat() {
  const sessionId = localStorage.getItem("session_id") || generateSessionId();
  localStorage.setItem("session_id", sessionId);
  
  try {
      const response = await fetch("/heartbeat", {
          method: "POST",
          headers: {
              "Content-Type": "application/json",
              "X-Session-ID": sessionId,
              "X-User-Online": "true"
          },
          body: JSON.stringify({})
      });

      const data = await response.json();
      if (data.status === "banned") {
          window.location.href = "/banned";
      }
  } catch (error) {
      console.error("Error sending heartbeat:", error);
  }
}

setTimeout(sendHeartbeat, 1000);
setInterval(sendHeartbeat, 10000);

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
}

async function createAccount(username, password, vpassword) {
  const errorElement = document.getElementById('createAccountError');
  errorElement.style.display = "none";
  errorElement.textContent = "";

  if (vpassword !== password) {
      errorElement.style.display = "block";
      errorElement.textContent = "Passwords do not match.";
      console.log("hi");
      return;
  }

  const hasMinLength = password.length >= 8;
  const hasMinNumbers = (password.match(/\d/g) || []).length >= 2;

  if (!hasMinLength || !hasMinNumbers) {
      errorElement.style.display = "block";
      errorElement.textContent = "Password must have at least 8 characters with 2 numbers.";
      return;
  }

  const hashedPassword = await hashPassword(password);
  console.log(`Hashed password for ${username}: ${hashedPassword}`); 

  const response = await fetch('/acc/create-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: hashedPassword })
  });

  const data = await response.json();
  if (response.ok) {
      console.log(data.message);
      login(username, password); 
  } else {
      errorElement.style.display = "block";
      errorElement.textContent = data.error;
  }
}

async function login(username, password) {
  const hashedPassword = await hashPassword(password);
  console.log(`Logging in with hashed password: ${hashedPassword}`); // DEBUGGING

  const response = await fetch('/acc/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: hashedPassword })
  });

  const data = await response.json();
  if (response.ok) {
      localStorage.setItem("acc_username", username);

      document.cookie = `session=${username}; path=/; max-age=86400`; // 1-day session
      location.reload();
    } else {
      document.getElementById('loginError').style.display = "block";
      document.getElementById('loginError').textContent = data.error;
  }
}


function logout() {
  localStorage.removeItem("acc_username");
  document.cookie = "session=; path=/; max-age=0";
  location.reload()
}

function generateReferralCode() {
  return Math.random().toString(36).substr(2, 7);
}

async function createReferralLink() {
  const username = localStorage.getItem("acc_username");
  if (!username) {
      console.error("You must be logged in to create a referral link.");
      return;
  }
  function thingy () {
    document.querySelectorAll('.loginButton')[1].innerHTML = "<center><p>Copied</p></center>"
    setTimeout(() => { 
      document.querySelectorAll('.loginButton')[1].innerHTML = "<center><p>Generate Invite Code</p></center>";
  }, 2000);
    }
  const referralCode = generateReferralCode();
  const referralLink = `${window.location.origin}/share/${referralCode}`;

  const response = await fetch('/acc/store-referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, referralCode })
  });

  const data = await response.json();
  if (response.ok) {
      await navigator.clipboard.writeText(referralLink);
      thingy();

  } else {
      console.error(data.error);
  }

  return referralLink;
}

async function getReferralStats(username) {
  try {
      const response = await fetch("/acc/get-referral-stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username })
      });

      if (!response.ok) {
          if (response.status === 404) {
              return { referralLinks: [], referredCount: 0, perkStatus: 0 };
          }
          const data = await response.json().catch(() => ({}));
          console.error("Failed to fetch referral stats:", data.error || "Unknown error");
          return { referralLinks: [], referredCount: 0, perkStatus: 0 };
      }

      return await response.json();
  } catch (error) {
      console.error("Error fetching referral stats:", error);
  }
}

function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'block';
}

function hideLoginScreen() {
  document.getElementById('loginScreen').style.display = 'none';
}

window.onload = async function () {
  const user = localStorage.getItem("acc_username");
  const loginScreen = document.getElementById('loginScreen');
  const loginArea = document.getElementById('loginArea');

  loginScreen.style.display = "none";

  if (user) {
      try {
          const stats = await getReferralStats(user);
          const { perkStatus, referredCount } = stats;
          document.getElementById('utilities2').querySelectorAll('p')[0].remove();
          document.getElementById('utilities2').style = "width: 40px;"
          document.getElementById('utilities2').querySelectorAll('img')[0].style = "margin-right:3.5px;";
          loginArea.innerHTML = `
              <div class="page-header">
                  <h2 class="login-title">👋 Hello, ${user}!</h2>
                  <button class="close-page" onclick="closePage()">✖</button>
              </div>
              <p class="login-subtext">Current Tier: ${perkStatus}/3</p>
              <p class="login-subtext">People Referred: ${referredCount}</p>

              <div class="popup-features">
                  <div class="popup-feature">5 Invites (Tier 1): Adblocking, immunity from bans, fast speeds</div>
                  <div class="popup-feature">10 Invites (Tier 2): All previous features, faster speeds, change locations, 1 new domain when needed</div>
                  <div class="popup-feature">20 Invites (Tier 3): All previous features, instant support from owner, unlimited new domains when needed</div>
              </div>

              <div class="buttonContainer">
                  <div class="loginButton" onclick="logout()">
                      <p>Logout</p>
                  </div>              
                  <div class="loginButton" onclick="createReferralLink()">
                      <p>Generate Invite Code</p>
                  </div>
              </div>
          `;
      } catch (error) {
          console.error("Error fetching referral stats:", error);
      }
  } else {
      loginArea.innerHTML = `
          <div class="page-header">
              <h2 class="login-title">Accounts</h2>
              <button class="close-page" onclick="closePage()">✖</button>
          </div>
          <div class="form-container">
              <div class="form-box">
                  <h3>Login</h3>
                  <input type="text" id="loginUsername" placeholder="Username">
                  <input type="password" id="loginPassword" placeholder="Password">
                  <button onclick="login(document.getElementById('loginUsername').value, document.getElementById('loginPassword').value)">Login</button>
                  <p id="loginError" class="error-message">Invalid credentials.</p>
              </div>

              <div class="form-box">
                  <h3>Create Account</h3>
                  <input type="text" id="createUsername" placeholder="Username">
                  <input type="password" id="createPassword" placeholder="Password">
                  <input type="password" id="verifyPassword" placeholder="Verify Password">
                  <button onclick="createAccount(document.getElementById('createUsername').value, document.getElementById('createPassword').value, document.getElementById('verifyPassword').value)">Sign Up</button>
                  <p id="createAccountError" class="error-message">Passwords do not match.</p>
              </div>
          </div>
      `;
  }
};

function openPage() {
    const loginScreen = document.getElementById('loginScreen');
    loginScreen.style.display = "block";
    setTimeout(() => {
        loginScreen.style.opacity = "1";
    }, 10);
}

function closePage() {
    const loginScreen = document.getElementById('loginScreen');
    loginScreen.style.opacity = "0";
    setTimeout(() => {
        loginScreen.style.display = "none";
    }, 500);
}



function hideonLoadpopup() {
  const popup = document.getElementById("onLoadPopup");
  popup.classList.remove("show");
  popup.classList.add("hide");
}
document.addEventListener("DOMContentLoaded", function () {
  const popup = document.getElementById("onLoadPopup");

  setTimeout(() => {
      popup.classList.add("show");
  }, 100);

  document.addEventListener("click", function (event) {
      if (!popup.contains(event.target)) {
          popup.classList.remove("show");
          popup.classList.add("hide");
      }
  });
});
async function checkForGlobalMessages() {
  const sessionId = localStorage.getItem("session_id");

  if (!sessionId) return;

  try {
      const response = await fetch(`/get-broadcasts/${sessionId}`);
      const data = await response.json();

      if (data.message) {
          notification(data.message, data.bgColor);
      }
  } catch (error) {
      console.error("Error fetching global messages:", error);
  }
}
async function checkForIndividualMessages() {
  const sessionId = localStorage.getItem("session_id");

  if (!sessionId) return;

  try {
      const response = await fetch(`/get-message/${sessionId}`);
      const data = await response.json();

      if (data.message) {
          notification(data.message, data.bgColor);
      }
  } catch (error) {
      console.error("Error fetching messages:", error);
  }
}

setInterval(checkForIndividualMessages, 5000);
setInterval(checkForGlobalMessages, 5000);

const backgroundPool = [
  'assets/otherBackground1.png',
  'assets/otherBackground2.png',
  'assets/otherBackground3.png',
  'assets/otherBackground4.png',
  'assets/otherBackground5.png',
  'assets/otherBackground6.png',
  'assets/otherBackground7.png',
  'assets/otherBackground8.png',
  'assets/otherBackground9.png',
  'assets/defaultBackground.png',
];

let currentBackgroundIndex = 0;

function changeBackground() {
  if (localStorage.getItem('backgroundUrl')) return;
  const root = document.documentElement;
  const nextBackground = backgroundPool[currentBackgroundIndex];

  root.style.setProperty('--background', `url(${nextBackground})`);

  currentBackgroundIndex = (currentBackgroundIndex + 1) % backgroundPool.length;
}

setInterval(changeBackground, 300000); 

const accountName = localStorage.getItem("acc_username") || "Not logged in";
setTimeout(console.log.bind(console, "%cHelium", "background: #6C3BAA;color:#FFF;padding:5px;border-radius: 5px;line-height: 26px; font-size:25px;"));
setTimeout(console.log.bind(console, "%cIf you are seeing this, the main script system has loaded.", "background: #6C3BAA;color:#FFF;padding:5px;border-radius: 5px;line-height: 20px; font-size:18px;"));
setTimeout(console.log.bind(console, "%cIf you encounter an error, contact Paxton.", "background: #6C3BAA;color:#FFF;padding:5px;border-radius: 5px;line-height: 20px; font-size:13px;"));
setTimeout(console.log.bind(console, `%cInformation:\nOnline: ${online}\nURL: ${diagnosticDomain}\nBrowser: ${browserName}\nUA: ${userAgent}\nAccount Username: ${accountName}`, "background: grey;color:white;padding:5px;line-height: 15px; border-radius: 5px;font-size:12px;"));
