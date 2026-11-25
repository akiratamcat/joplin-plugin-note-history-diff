/* global webviewApi */
// Runs inside the panel webview.
(function() {
	let timer = null;

	function showWidth() {
		const width = window.innerWidth;
		const label = document.getElementById('nhd-width');
		if (label) label.textContent = width + 'px';
		webviewApi.postMessage({ type: 'width', width: width });
	}

	window.addEventListener('resize', function() {
		clearTimeout(timer);
		timer = setTimeout(showWidth, 300);
	});

	document.addEventListener('click', async function(event) {
		const target = event.target;
		if (!target) return;
		if (target.id === 'nhd-close') {
			webviewApi.postMessage({ type: 'close' });
			return;
		}
		if (target.id !== 'nhd-copy') return;
		const answer = await webviewApi.postMessage({ type: 'copy' });
		target.textContent = answer === 'copied' ? 'Copied' : 'Copy failed';
		setTimeout(function() { target.textContent = 'Copy summary'; }, 1500);
	});

	showWidth();
})();
