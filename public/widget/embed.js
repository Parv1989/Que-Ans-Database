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
  launcher.innerHTML = '&#129302;';
  launcher.style.cssText =
    'position:fixed;bottom:22px;right:22px;width:58px;height:58px;border-radius:50%;' +
    'background:#126b78;color:#fff;border:none;font-size:25px;cursor:pointer;' +
    'box-shadow:0 8px 22px rgba(18,107,120,0.35);z-index:999998;';

  // Chat iframe, hidden by default
  var iframe = document.createElement('iframe');
  // Version query prevents a publisher browser from keeping an old widget UI.
  iframe.src = botUrl + '/widget/chat.html?v=2';
  iframe.title = 'Book help chat';
  iframe.style.cssText =
    'position:fixed;bottom:92px;right:22px;width:370px;height:540px;max-width:92vw;' +
    'max-height:75vh;border:none;border-radius:20px;box-shadow:0 16px 48px rgba(45,42,69,0.3);' +
    'z-index:999999;display:none;';

  var open = false;
  launcher.addEventListener('click', function () {
    open = !open;
    iframe.style.display = open ? 'block' : 'none';
    launcher.innerHTML = open ? '&#10005;' : '&#129302;';
  });

  document.body.appendChild(iframe);
  document.body.appendChild(launcher);
})();
