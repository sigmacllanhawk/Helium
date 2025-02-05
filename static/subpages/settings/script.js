const root = document.documentElement;
if (localStorage.getItem('theme')) root.style.setProperty('--background-color', localStorage.getItem('theme'));


document.addEventListener("DOMContentLoaded", function () {
    const menuItems = document.querySelectorAll(".side-menu li");
    const settingsPages = document.querySelectorAll(".settings-page");

    function showSettingsPage(pageId) {
        settingsPages.forEach(page => {
            page.style.display = "none";
        });
        document.getElementById(pageId).style.display = "flex";

        menuItems.forEach(item => {
            item.style.textDecoration = "none";
        });

        const selectedMenuItem = Array.from(menuItems).find(item => {
            return item.id === pageId.replace('-settings', '-menu');
        });

        if (selectedMenuItem) {
            selectedMenuItem.style.textDecoration = "underline";
        }
    }

    menuItems.forEach(item => {
        item.addEventListener("click", function () {
            const selectedPage = `${this.textContent.toLowerCase()}-settings`;
            showSettingsPage(selectedPage);
        });
    });

    showSettingsPage("general-settings");
});
function tabSwitch(e) {
    const a = e.value;
    if (a === 'Schoology') {
      cloakTitle("Home | Schoology");
      cloakFavicon("https://www.powerschool.com/favicon.ico");
    } else if (a === 'Google Classroom') {
      cloakTitle("Home");
      cloakFavicon("https://ssl.gstatic.com/classroom/favicon.ico");
    } else if (a === 'Google Docs') {
      cloakTitle("Google Docs");
      cloakFavicon("https://ssl.gstatic.com/docs/documents/images/kix-favicon-2023q4.ico");
    } else if (a === 'Google') {
      cloakTitle("Google");
      cloakFavicon("https://google.com/favicon.ico");
    } else if (a === 'Canvas') {
      cloakTitle("Dashboard");
      cloakFavicon("https://k12.instructure.com/favicon.ico");
    } else if (a === 'Khan Academy') {
      cloakTitle("Khan Academy | Free Online Courses, Lessons & Practice");
      cloakFavicon("https://cdn.kastatic.org/images/favicon.ico?size=48x48");
    } else if (a === 'Wikipedia') {
      cloakTitle("Wikipedia, the free encyclopedia");
      cloakFavicon("https://en.wikipedia.org/favicon.ico");
    } else if (a === 'Reset') {
      cloakTitle("reset");
      cloakFavicon("reset");
    }
  }

var autoLaunchCookie = localStorage.getItem("autolaunch") || "off";

function autoLaunch() {
  if (autoLaunchCookie === 'off') {
    localStorage.setItem("autolaunch", "on");
    autoLaunchCookie = "on";
    parent.notification('Autolaunch has been toggled to on.', "#95ff8a");
    document.getElementById("autoLaunch").classList.add("active");
  } else if (autoLaunchCookie === 'on') {
    localStorage.setItem("autolaunch", "off");
    autoLaunchCookie = "off";
    document.getElementById("autoLaunch").classList.remove("active");
    parent.notification('Autolaunch has been toggled to off.', "#95ff8a");
  }
}
function onetimeLaunch() {
  const script = parent.document.createElement("script");
  script.textContent = `
    const popup = open('about:blank', '_blank');
    if (!popup || popup.closed) {
      notification('Please allow popups and redirects.', "#ff9999");
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
      script.textContent = \`
        window.onbeforeunload = function (event) {
          const confirmationMessage = 'Do you really want to exit Helium?';
          (event || window.event).returnValue = confirmationMessage;
          return confirmationMessage;
        };
      \`;
      doc.head.appendChild(script);
    }
  `;
  parent.document.querySelector("head").appendChild(script);
}
switch (autoLaunchCookie) {
  case "on":
    document
      .getElementById("autoLaunch")
      .classList.add("active");
    break;
  case "off":
    document
      .getElementById("autoLaunch")
      .classList.remove("active");
    break;
  default:
    document
      .getElementById("autoLaunch")
      .classList.remove("active");
    break;
}

  function changeEngine(engineElement) {
    const engine = engineElement.value;
    if (engine === 'Google') {
      searchEngine = 'https://www.google.com/search?q=';
    } else if (engine === 'Bing') {
      searchEngine = 'https://www.bing.com/search?q=';
    } else if (engine === 'DuckDuckGo') {
      searchEngine = 'https://duckduckgo.com/?t=h_&q=';
    }
    parent.notification('Set the search engine.', "#95ff8a");
    localStorage.setItem('searchEngine', searchEngine);
  }
  
  function cloakFavicon(faviconUrl) {

    if (faviconUrl == `reset`) {
      const link = parent.document.querySelector("link[rel*='icon']") || parent.document.createElement('link');
      link.type = 'image/png';
      link.rel = 'icon';
      link.href = '../../assets/icon.png';
      parent.document.getElementsByTagName('head')[0].appendChild(link);
      localStorage.removeItem('customFavicon');
      document.getElementById('iconChange').placeholder = "Enter the favicon URL";
      parent.notification('The favicon URL has been reset.', "#95ff8a");
      return;
    }
    if (!/^(https?:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,30}/i.test(faviconUrl)) {
      parent.notification('Please put a valid URL in the URL box.', "#ff9999");
      return;
    } else if (!/^(https?:\/\/)/.test(faviconUrl)) {
      faviconUrl = "https://" + faviconUrl;
    }
    const link = parent.document.querySelector("link[rel*='icon']") || parent.document.createElement('link');
    link.type = 'image/png';
    link.rel = 'icon';
    link.href = faviconUrl;
    parent.document.getElementsByTagName('head')[0].appendChild(link);
    localStorage.setItem('customFavicon', faviconUrl);
    parent.notification('The favicon URL has been set.', "#95ff8a");
    if (localStorage.getItem('customFavicon') == '') {
      document.getElementById('iconChange').placeholder = "Enter the favicon URL";
    } else {
      document.getElementById('iconChange').placeholder = localStorage.getItem('customFavicon');
    }
  }
  
  
  function cloakTitle(newTitle) {
    if (newTitle == `reset`) {
      parent.document.title = "Helium";
      localStorage.removeItem('customTitle');
      document.getElementById('iconChange').placeholder = "Enter the favicon URL";
      parent.notification('The title has been reset.', "#95ff8a");
      return;
    }
    parent.document.title = newTitle;
    localStorage.setItem('customTitle', newTitle);
    parent.notification('The title has been set.', "#95ff8a");
    if (localStorage.getItem('customTitle') == '') {
      document.getElementById('titleChange').placeholder = "Enter the favicon URL";
    } else {
      document.getElementById('titleChange').placeholder = localStorage.getItem('customTitle');
    }
  }
  
  function recordKeys(elem, timeLimit) {
    if (!elem) return;
    elem.placeholder = "Press a key...";
    parent.window.panicKeys = null;
    let savePush = [];
    let firstKeyHit = false;
    let escCount = 0;  
    let panicReset = false; 
  
    const keydownHandler = (e) => {
      if (!firstKeyHit) {
        firstKeyHit = true;
        setTimeout(() => {
          document.removeEventListener("keydown", keydownHandler);
          if (!panicReset) {  
            parent.window.panicKeys = savePush;
            localStorage.setItem("panicKeys", JSON.stringify(savePush));
            parent.notification("Your panic keys have been set.", "#95ff8a"); 
            parent.detectPanicKeys();
          }
        }, timeLimit);
      }
  
      if (e.key === 'Escape') {
        escCount++;
        if (escCount >= 5) {
          localStorage.removeItem('panicKeys');
          parent.window.panicKeys = null;
          parent.notification("Your panic keys have been reset.", "#95ff8a");
          panicReset = true; 
          elem.placeholder = "Enter your panic key(s)";
        }
      } else {
        escCount = 0; 
      }
  
      if (!panicReset) {  
        savePush.push(e.key);
        elem.placeholder = "Selected Keys: " + savePush.join(" + ");
      }
    };
  
    document.addEventListener("keydown", keydownHandler);
  }
 
  function changePanicUrl (url) {
    if (!/^(https?:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,30}/i.test(url)) {
      parent.notification('Please put a valid URL in the URL box.', "#ff9999");
      url = "https://google.com/"
    } else if (!/^(https?:\/\/)/.test(url)) {
      url = "https://" + url;
    }
    if (url.trim() == "") {
      url = "https://google.com/";
    }
    parent.notification('Your panic URL has been set.', "#95ff8a");
    parent.window.panicURL = url;
    localStorage.setItem("panicURL", url);
    document.getElementById('panicURL').placeholder = url;
  }
  function changeBackground(imageUrl) {
    const root = parent.document.documentElement;
    if (imageUrl == 'reset') {
      root.style.setProperty('--background', `url('assets/defaultbackground.png')`);
      parent.notification(`Reset the background.`, "#95ff8a");
      localStorage.setItem("backgroundUrl", 'assets/defaultbackground.png');
      return;
    }
    if (!/^(https?:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,30}/i.test(imageUrl)) {
      parent.notification('Please put a valid URL in the URL box.', "#ff9999");
      imageUrl = '';
      return;
    } else if (!/^(https?:\/\/)/.test(imageUrl)) {
      imageUrl = "https://" + imageUrl;
    }
    if (imageUrl.trim() == "") {
      return;
    }
    
    const img = new Image();
    img.src = imageUrl;
    img.onload = function () {
      parent.notification('Your background has been set. If you broke the CSS, please clear your cache.', "#95ff8a");
      root.style.setProperty('--background', `url(${imageUrl})`);
      localStorage.setItem("backgroundUrl", imageUrl);
    };
    img.onerror = function () {
      parent.notification(`Your background wasn't able to load.`, "#ff9999");
      root.style.setProperty('--background', `url('assets/defaultbackground.png')`);
    };
  }
  
  function changeTheme(theme) {
    
    const root = parent.document.documentElement;
    const root2 = document.documentElement;
    function hexToRgb(hex) {
        hex = hex.replace(/^#/, '');
        if (hex.length === 3) {
            hex = hex.split('').map(function (h) {
                return h + h;
            }).join('');
        }

        const bigint = parseInt(hex, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;

        return `${r}, ${g}, ${b}`;
    }
    if (theme === 'light') {
        root.style.setProperty('--background-color', '255, 255, 255');
        root2.style.setProperty('--background-color', '255, 255, 255');
        parent.notification('Your theme has been set.', "#95ff8a");
        localStorage.setItem('theme', '255, 255, 255');
    } else if (theme === 'dark') {
        root.style.setProperty('--background-color', '0, 0, 0');
        root2.style.setProperty('--background-color', '0, 0, 0');
        parent.notification('Your theme has been set.', "#95ff8a");
        localStorage.setItem('theme', '0,0,0');
    } else {
        if (!/^#?([a-f0-9]{6}|[a-f0-9]{3})$/i.test(theme)) {
            parent.notification('Invalid Hex Color.', "#ff9999");
        } else {
            const rgbValue = hexToRgb(theme);
            root.style.setProperty('--background-color', `${rgbValue}`);
            root2.style.setProperty('--background-color', `${rgbValue}`);
            localStorage.setItem('theme', `${rgbValue}`);
            parent.notification('Your theme has been set. If you broke the CSS, please clear your cache.', "#95ff8a");
        }
    }
}
  
  function clearLocalStorage() {
    localStorage.clear();
    parent.notification(`Cleared the localStorage.`, "#95ff8a");
  }
  
  function unregisterServiceWorkers() {
    parent.notification(`Unregistered the ServiceWorkers.`, "#95ff8a");
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for(let registration of registrations) {
        registration.unregister();
      }
    });
  }
  
  function reRegisterServiceWorkers() {
    parent.notification(`Re-Registered the service workers.`, "#95ff8a");
    parent.worker();
  }
let searchEngine;
if (localStorage.getItem('searchEngine') == 'https://www.google.com/search?q=') searchEngine = "Google Search";
if (localStorage.getItem('searchEngine') == 'https://www.bing.com/search?q=') searchEngine = "Bing Search";
if (localStorage.getItem('searchEngine') == 'https://duckduckgo.com/?t=h_&q=') searchEngine = "DuckDuckGo Search";
if (localStorage.getItem('customFavicon')) document.getElementById('iconChange').placeholder = localStorage.getItem('customFavicon');
if (localStorage.getItem('customTitle')) document.getElementById('titleChange').placeholder = localStorage.getItem('customTitle');
if (parent.window.panicKeys !== null) document.getElementById("panic").placeholder = "Selected Key(s): " + parent.window.panicKeys.join(" + ");
if (parent.window.panicURL !== null) document.getElementById("panicURL").placeholder = parent.window.panicUrl;
if (localStorage.getItem('searchEngine')) document.getElementById('changeEngineFirst').innerHTML = "Selected: " + searchEngine;
