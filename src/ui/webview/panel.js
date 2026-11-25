/* global webviewApi */
// Runs inside the Note History Diff panel. Buttons carry a data-action
// attribute ("refresh", "close"); the plugin handles the action.
(function() {
	document.addEventListener('click', function(event) {
		const target = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
		if (!target) return;
		webviewApi.postMessage({ type: target.getAttribute('data-action') });
	});
})();
