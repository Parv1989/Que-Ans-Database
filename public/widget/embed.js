(function () {
  var currentScript = document.currentScript;
  var botUrl = (currentScript && currentScript.getAttribute('data-bot-url')) || '';
  if (!botUrl) {
    console.error('Publisher Bot: data-bot-url attribute is missing on the embed script tag.');
    return;
  }
  botUrl = botUrl.replace(/\/$/, '');

  // Floating launcher button
  var launcher = document.createElement('button');
  launcher.setAttribute('aria-label', 'Open help chat');
  launcher.innerHTML = '&#128214;';
  launcher.style.cssText =
    'position:fixed;bottom:22px;right:22px;width:56px;height:56px;border-radius:50%;' +
    'background:#b9862f;color:#fff;border:none;font-size:24px;cursor:pointer;' +
    'box-shadow:0 8px 24px rgba(0,0,0,0.25);z-index:999998;';

  // Chat iframe, hidden by default
  var iframe = document.createElement('iframe');
  iframe.src = botUrl + '/widget/chat.html';
  iframe.title = 'Book help chat';
  iframe.style.cssText =
    'position:fixed;bottom:90px;right:22px;width:360px;height:520px;max-width:92vw;' +
    'max-height:75vh;border:none;border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,0.3);' +
    'z-index:999999;display:none;';

  var open = false;
  launcher.addEventListener('click', function () {
    open = !open;
    iframe.style.display = open ? 'block' : 'none';
    launcher.innerHTML = open ? '&#10005;' : '&#128214;';
  });

  document.body.appendChild(iframe);
  document.body.appendChild(launcher);
})();
