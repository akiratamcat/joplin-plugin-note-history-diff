/* global webviewApi */
// Runs inside the Note History Diff view. Buttons carry a data-action
// attribute ("refresh", "close"); the plugin handles the action.
//
// It also tells the plugin when the view becomes visible ("shown"): Joplin
// does not always send an update when the user shows the view with its
// "toggle editor" button (v0.3.4 test), and a hidden view has no size.
(function() {
	// F7: the first line of each block of changes in the layout on screen.
	function visibleHunks() {
		const selectors = ['.view-sbs', '.view-unified'];
		for (let i = 0; i < selectors.length; i++) {
			const view = document.querySelector(selectors[i]);
			if (view && view.offsetParent !== null) return Array.prototype.slice.call(view.querySelectorAll('.hunk'));
		}
		return [];
	}

	// Scrolls to the next or previous block of changes, leaving a few lines of
	// context above it, and flashes it. Near the end (or the start) the view
	// cannot scroll any further, so the block jumped to last is remembered:
	// while it is on screen, the next press moves on from it even though the
	// view does not move (v0.7.1 test).
	const JUMP_MARGIN = 48;
	let lastTarget = null;
	function jump(direction) {
		const scroller = document.querySelector('.nhd > .body');
		const hunks = visibleHunks();
		if (!scroller || !hunks.length) return;
		const top = scroller.getBoundingClientRect().top;
		const offset = function(hunk) { return hunk.getBoundingClientRect().top - top - JUMP_MARGIN; };
		let index = -1;
		const lastIndex = lastTarget ? hunks.indexOf(lastTarget) : -1;
		const lastOnScreen = lastIndex >= 0 && offset(lastTarget) + JUMP_MARGIN >= 0 && offset(lastTarget) + JUMP_MARGIN < scroller.clientHeight;
		if (lastOnScreen) {
			index = direction === 'next' ? lastIndex + 1 : lastIndex - 1;
		} else if (direction === 'next') {
			index = hunks.findIndex(function(hunk) { return offset(hunk) > 2; });
		} else {
			for (let i = hunks.length - 1; i >= 0; i--) {
				if (offset(hunks[i]) < -2) {
					index = i;
					break;
				}
			}
		}
		if (index < 0 || index >= hunks.length) return;
		const target = hunks[index];
		scroller.scrollTop += offset(target);
		target.classList.remove('jump-target');
		void target.offsetWidth;
		target.classList.add('jump-target');
		lastTarget = target;
	}

	document.addEventListener('click', function(event) {
		const jumpButton = event.target && event.target.closest ? event.target.closest('[data-jump]') : null;
		if (jumpButton) {
			jump(jumpButton.getAttribute('data-jump'));
			return;
		}
		// F3: switch the layout at once; the plugin remembers the choice.
		const modeButton = event.target && event.target.closest ? event.target.closest('[data-mode]') : null;
		if (modeButton) {
			const mode = modeButton.getAttribute('data-mode');
			const root = document.querySelector('.nhd');
			if (root) {
				root.classList.remove('mode-side', 'mode-unified');
				root.classList.add('mode-' + mode);
				scheduleAlign();
			}
			document.querySelectorAll('[data-mode]').forEach(function(button) {
				button.classList.toggle('active', button === modeButton);
			});
			webviewApi.postMessage({ type: 'mode', mode: mode });
			return;
		}
		const target = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
		if (!target) return;
		webviewApi.postMessage({ type: target.getAttribute('data-action') });
	});

	// F2: picking another version sends both sides; the plugin recomputes the diff.
	document.addEventListener('change', function(event) {
		const target = event.target;
		// F9: the plugin recomputes the diff with or without whitespace differences.
		if (target && target.matches && target.matches('input[data-toggle="whitespace"]')) {
			webviewApi.postMessage({ type: 'whitespace', ignore: !!target.checked });
			return;
		}
		if (!target || !target.matches || !target.matches('select[data-select]')) return;
		const from = document.querySelector('select[data-select="from"]');
		const to = document.querySelector('select[data-select="to"]');
		if (!from || !to) return;
		webviewApi.postMessage({ type: 'select', from: from.value, to: to.value });
	});

	// Issue #1: in the side-by-side layout every row holds a left cell then a
	// right cell, so a selection over several rows takes both sides, and the
	// copied text mixed the two versions. The side where the mouse is pressed
	// becomes the only selectable one (CSS: .select-left / .select-right), and a
	// copy takes the selected text of that side only: one line per cell, without
	// the line numbers, the cells of lines missing on that side, or the folded
	// lines ("… n unchanged lines …", skipped).
	function sideOf(node) {
		const element = node && (node.nodeType === 1 ? node : node.parentElement);
		const cell = element && element.closest ? element.closest('.sbs .cell, .sbs .no') : null;
		if (!cell) return null;
		return cell.classList.contains('right') ? 'right' : cell.classList.contains('left') ? 'left' : null;
	}

	document.addEventListener('mousedown', function(event) {
		if (event.button !== 0) return;
		const side = sideOf(event.target);
		document.querySelectorAll('.sbs').forEach(function(sbs) {
			sbs.classList.toggle('select-left', side === 'left');
			sbs.classList.toggle('select-right', side === 'right');
		});
	});

	// The selected text of the side-by-side view, from the side the selection
	// was made on, or null when the selection is not there.
	function selectedSideText() {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
		const sbs = document.querySelector('.view-sbs .sbs');
		if (!sbs || sbs.offsetParent === null) return null;
		const side = sbs.classList.contains('select-right') ? 'right' : sbs.classList.contains('select-left') ? 'left' : null;
		if (!side) return null;
		const range = selection.getRangeAt(0);
		const lines = [];
		sbs.querySelectorAll('.cell.' + side).forEach(function(cell) {
			if (cell.classList.contains('empty') || !range.intersectsNode(cell)) return;
			const part = document.createRange();
			part.selectNodeContents(cell);
			// The first and the last cell may be selected only in part.
			if (cell.contains(range.startContainer) && range.compareBoundaryPoints(Range.START_TO_START, part) > 0) {
				part.setStart(range.startContainer, range.startOffset);
			}
			if (cell.contains(range.endContainer) && range.compareBoundaryPoints(Range.END_TO_END, part) < 0) {
				part.setEnd(range.endContainer, range.endOffset);
			}
			lines.push(part.toString());
		});
		return lines.length ? lines.join('\n') : null;
	}

	document.addEventListener('copy', function(event) {
		const text = selectedSideText();
		if (text === null || !event.clipboardData) return;
		event.clipboardData.setData('text/plain', text);
		event.preventDefault();
	});

	// Issue #3: Joplin's editor view shows no right-click menu, so the view
	// shows its own with "Copy" (disabled without a selection). Copy goes
	// through the browser's copy command, and so through the handler above;
	// if the webview may not copy by itself, the plugin writes the text.
	function contextMenu() {
		return document.querySelector('.nhd .ctxmenu');
	}

	function hideContextMenu() {
		const menu = contextMenu();
		if (menu) menu.hidden = true;
	}

	document.addEventListener('contextmenu', function(event) {
		const menu = contextMenu();
		if (!menu || !event.target || !event.target.closest || !event.target.closest('.nhd > .body')) return;
		event.preventDefault();
		const selection = window.getSelection();
		const hasSelection = !!selection && !selection.isCollapsed && selection.toString().length > 0;
		const copyButton = menu.querySelector('[data-ctx="copy"]');
		if (copyButton) copyButton.disabled = !hasSelection;
		menu.hidden = false;
		const width = menu.offsetWidth;
		const height = menu.offsetHeight;
		menu.style.left = Math.max(0, Math.min(event.clientX, window.innerWidth - width - 4)) + 'px';
		menu.style.top = Math.max(0, Math.min(event.clientY, window.innerHeight - height - 4)) + 'px';
	});

	document.addEventListener('mousedown', function(event) {
		// A right-click keeps the selection; a press outside the menu closes it.
		if (event.target && event.target.closest && event.target.closest('.nhd .ctxmenu')) {
			event.preventDefault();
			return;
		}
		hideContextMenu();
	}, true);

	document.addEventListener('keydown', function(event) {
		if (event.key === 'Escape') hideContextMenu();
	});

	document.addEventListener('scroll', hideContextMenu, true);
	window.addEventListener('blur', hideContextMenu);

	document.addEventListener('click', function(event) {
		const item = event.target && event.target.closest ? event.target.closest('.nhd .ctxmenu [data-ctx="copy"]') : null;
		if (!item || item.disabled) return;
		hideContextMenu();
		let copied = false;
		try {
			copied = document.execCommand('copy');
		} catch (error) {
			copied = false;
		}
		if (!copied) {
			const selection = window.getSelection();
			const text = selectedSideText() || (selection ? selection.toString() : '');
			if (text) webviewApi.postMessage({ type: 'copyText', text: text });
		}
	});

	// F14: with long lines not wrapped, both text columns of the side-by-side
	// view get the width of the widest line on their side, so that the rows
	// (one grid each) stay aligned while the diff scrolls sideways.
	function alignColumns() {
		const root = document.querySelector('.nhd');
		const sbs = document.querySelector('.view-sbs .sbs');
		if (!root || !sbs) return;
		sbs.style.removeProperty('--nhd-col-left');
		sbs.style.removeProperty('--nhd-col-right');
		if (!root.classList.contains('nowrap') || sbs.offsetParent === null) return;
		['left', 'right'].forEach(function(side) {
			let widest = 0;
			sbs.querySelectorAll('.cell.' + side).forEach(function(cell) {
				widest = Math.max(widest, cell.scrollWidth);
			});
			if (widest > 0) sbs.style.setProperty('--nhd-col-' + side, Math.ceil(widest) + 'px');
		});
	}

	let alignPending = false;
	function scheduleAlign() {
		if (alignPending) return;
		alignPending = true;
		requestAnimationFrame(function() {
			alignPending = false;
			alignColumns();
		});
	}

	// Marks a dark Joplin theme on <html>, from the brightness of Joplin's
	// background colour, so that the stylesheet can use stronger colours.
	function updateTheme() {
		const probe = document.createElement('div');
		probe.style.backgroundColor = 'var(--joplin-background-color, #ffffff)';
		document.body.appendChild(probe);
		const match = getComputedStyle(probe).backgroundColor.match(/[0-9.]+/g);
		probe.remove();
		if (!match || match.length < 3) return;
		const luminance = 0.2126 * Number(match[0]) + 0.7152 * Number(match[1]) + 0.0722 * Number(match[2]);
		document.documentElement.classList.toggle('nhd-dark', luminance < 128);
	}

	let visible = false;
	function setVisible(now) {
		if (now && !visible) {
			// The theme may have changed while the view was hidden.
			updateTheme();
			scheduleAlign();
			webviewApi.postMessage({ type: 'shown' });
		}
		visible = now;
	}
	function checkSize() {
		const root = document.documentElement;
		setVisible(root.clientWidth > 0 && root.clientHeight > 0);
	}
	function start() {
		updateTheme();
		// The plugin replaces the view's content on every update.
		if (typeof MutationObserver !== 'undefined') {
			new MutationObserver(scheduleAlign).observe(document.body, { childList: true, subtree: true });
		}
		window.addEventListener('resize', scheduleAlign);
		scheduleAlign();
		if (typeof ResizeObserver !== 'undefined') new ResizeObserver(checkSize).observe(document.documentElement);
		if (typeof IntersectionObserver !== 'undefined') {
			new IntersectionObserver(function(entries) {
				setVisible(entries.some(function(entry) { return entry.isIntersecting; }));
			}).observe(document.body);
		}
		checkSize();
	}
	if (document.body) start();
	else document.addEventListener('DOMContentLoaded', start);
})();
